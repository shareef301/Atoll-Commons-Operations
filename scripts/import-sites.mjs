// Offline, non-destructive migration from the original local D1 database.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { RecordStore, EvidenceStore } from '../server/storage.mjs';

const options=new Map();for(let i=2;i<process.argv.length;i+=2)options.set(process.argv[i],process.argv[i+1]);
const source=options.get('--source'),output=options.get('--output'),owner=options.get('--owner-email')?.toLowerCase();
if(!source||!output||!owner||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)){
  console.error('Usage: node scripts/import-sites.mjs --source /path/to/original.sqlite --output /new/data-directory --owner-email owner@domain [--files /exported-evidence-by-id]');process.exit(1);
}
if(existsSync(resolve(output))){console.error('Destination already exists. Choose a new directory.');process.exit(1)}
const temporary=resolve(output)+'.import-'+randomUUID();let original,target;
try {
  original=new DatabaseSync(resolve(source),{readOnly:true});
  const memberships=original.prepare('SELECT * FROM memberships').all();
  const owners=memberships.filter(m=>m.role==='System owner');
  if(owners.length!==1)throw new Error('Import requires one original system owner; review multiple-owner migrations individually.');
  if(memberships.some(m=>m.email===owner&&m.id!==owners[0].id))throw new Error('The new owner email is already assigned to another member.');
  const rows=original.prepare('SELECT * FROM workspaces').all(),references=new Map();
  for(const row of rows)for(const file of JSON.parse(row.data).files||[])references.set(file.key,file);
  if(references.size&&!options.get('--files'))throw new Error('Export all retained evidence before migrating; pass --files with files named by their record ID.');
  await mkdir(temporary,{mode:0o700});target=new RecordStore(join(temporary,'atoll.sqlite'));
  const evidence=new EvidenceStore(join(temporary,'files'));
  for(const file of references.values()){
    if(!/^[a-zA-Z0-9_-]+$/.test(file.id))throw new Error('Invalid evidence ID.');
    const bytes=await readFile(join(resolve(options.get('--files')),file.id));
    if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('Exported evidence does not match its retained checksum.');
    await evidence.put(file.key,bytes);
  }
  const commands=[];
  for(const row of rows)commands.push(target.prepare('INSERT INTO workspaces VALUES (?,?,?,?,?)').bind(row.id,row.owner_email===owners[0].email?owner:row.owner_email,row.data,row.revision,row.created_at));
  for(const member of memberships)commands.push(target.prepare('INSERT INTO memberships VALUES (?,?,?,?,?,?,?,?)').bind(member.id,member.workspace_id,member.id===owners[0].id?owner:member.email,member.name,member.role,member.projects,member.governance,member.authority_ref));
  await target.batch(commands);target.connection.exec('PRAGMA wal_checkpoint(TRUNCATE)');target.close();target=undefined;original.close();original=undefined;
  await rename(temporary,resolve(output));
  console.log(JSON.stringify({destination:resolve(output),workspaces:rows.length,evidenceFiles:references.size,originalUnchanged:true}));
}catch(error){target?.close();original?.close();await rm(temporary,{recursive:true,force:true});console.error('Import failed:',error.message);process.exit(1)}
