import { backup, DatabaseSync } from 'node:sqlite';
import { mkdir, copyFile, readFile, writeFile, rename, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { EvidenceStore } from './storage.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function evidenceReferences(sql) {
  const files = new Map();
  for (const row of sql.prepare('SELECT data FROM workspaces').all()) {
    for (const file of JSON.parse(row.data).files || []) files.set(file.key,file);
  }
  return [...files.values()];
}

export async function createBackup(dataDirectory, destination) {
  const source = resolve(dataDirectory), target = resolve(destination);
  if (!existsSync(join(source,'atoll.sqlite'))) throw new Error('No database exists at the source.');
  if (existsSync(target)) throw new Error('Backup destination already exists. Choose a new directory.');
  const temporary=target+'.partial-'+randomUUID();
  await mkdir(join(temporary,'files'),{recursive:true,mode:0o700});
  let snapshot;
  try {
    const live=new DatabaseSync(join(source,'atoll.sqlite'),{readOnly:true});
    try { await backup(live,join(temporary,'atoll.sqlite')); } finally {live.close()}
    snapshot=new DatabaseSync(join(temporary,'atoll.sqlite'));
    // Restores always require a fresh sign-in; no active sessions are exported.
    snapshot.exec('DELETE FROM auth_sessions; DELETE FROM auth_flows; PRAGMA journal_mode=DELETE;');
    const manifest={format:1,createdAt:new Date().toISOString(),files:[]};
    const sourceFiles=new EvidenceStore(join(source,'files'));
    for (const file of evidenceReferences(snapshot)) {
      const bytes=await readFile(sourceFiles.path(file.key));
      if (file.sha256 && digest(bytes)!==file.sha256) throw new Error('An evidence checksum does not match its record.');
      const filename=digest(file.key);
      await writeFile(join(temporary,'files',filename),bytes,{mode:0o600});
      manifest.files.push({name:'files/'+filename,size:bytes.length,sha256:digest(bytes)});
    }
    snapshot.close();snapshot=undefined;
    await chmod(join(temporary,'atoll.sqlite'),0o600);
    const bytes=await readFile(join(temporary,'atoll.sqlite'));
    manifest.files.push({name:'atoll.sqlite',size:bytes.length,sha256:digest(bytes)});
    await writeFile(join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
    await rename(temporary,target);
    return {destination:target,evidenceFiles:manifest.files.length-1};
  } catch(error) {snapshot?.close();await rm(temporary,{recursive:true,force:true});throw error}
}

export async function restoreBackup(sourceDirectory, destination) {
  const source=resolve(sourceDirectory),target=resolve(destination);
  if (existsSync(join(target,'atoll.sqlite')) || existsSync(join(target,'files'))) throw new Error('Restore requires an empty data directory. Keep the current data as a rollback copy.');
  const manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
  if (manifest.format!==1 || !Array.isArray(manifest.files) || !manifest.files.some(f=>f.name==='atoll.sqlite')) throw new Error('Unsupported backup manifest.');
  for (const file of manifest.files) {
    if (!/^(atoll\.sqlite|files\/[a-f0-9]{64})$/.test(file.name)) throw new Error('Invalid backup path.');
    const bytes=await readFile(join(source,file.name));
    if (bytes.length!==file.size || digest(bytes)!==file.sha256) throw new Error('Backup checksum mismatch.');
  }
  const check=new DatabaseSync(join(source,'atoll.sqlite'),{readOnly:true});
  try {
    if (check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok' || check.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database integrity check failed.');
    for(const file of evidenceReferences(check)) if(!manifest.files.some(f=>f.name==='files/'+digest(file.key))) throw new Error('Backup is missing referenced evidence.');
  } finally {check.close()}
  await mkdir(join(target,'files'),{recursive:true,mode:0o700});
  for (const file of manifest.files) await copyFile(join(source,file.name),join(target,file.name));
  const restored=new DatabaseSync(join(target,'atoll.sqlite'));
  try {restored.exec('DELETE FROM auth_sessions; DELETE FROM auth_flows;')} finally {restored.close()}
  return {destination:target,evidenceFiles:manifest.files.length-1};
}
