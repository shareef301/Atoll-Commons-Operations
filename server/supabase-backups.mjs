import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {rpc,supabaseConfig,SupabaseEvidenceStore} from './supabase-admin.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const references=records=>[...new Map(records.workspaces.flatMap(row=>row.data.files||[]).map(file=>[file.key,file])).values()];

export async function createSupabaseBackup(destination) {
  const target=resolve(destination),temporary=target+'.partial-'+randomUUID();
  if(existsSync(target))throw new Error('Backup destination already exists. Choose a new directory.');
  await mkdir(join(temporary,'files'),{recursive:true,mode:0o700});
  try {
    // One PostgreSQL statement captures all app tables at one snapshot.
    const records=await rpc('ops_export_records',{}),store=new SupabaseEvidenceStore();
    const manifest={format:'atoll-supabase-1',projectUrl:supabaseConfig().url,createdAt:new Date().toISOString(),files:[]};
    const retain=async(name,bytes)=>{await writeFile(join(temporary,name),bytes,{mode:0o600});manifest.files.push({name,size:bytes.length,sha256:digest(bytes)});};
    for(const file of references(records)){
      const object=await store.get(file.key);if(!object)throw new Error('Referenced evidence is unavailable.');
      const bytes=new Uint8Array(await object.arrayBuffer());
      if(bytes.length!==file.size||digest(bytes)!==file.sha256)throw new Error('Evidence checksum does not match its record.');
      await retain('files/'+digest(file.key),bytes);
    }
    await retain('records.json',Buffer.from(JSON.stringify(records)));
    await writeFile(join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
    await rename(temporary,target);
    return {destination:target,evidenceFiles:manifest.files.length-1,workspaces:records.workspaces.length};
  }catch(error){await rm(temporary,{recursive:true,force:true});throw error;}
}

export async function validateSupabaseBackup(directory) {
  const source=resolve(directory),manifest=JSON.parse(await readFile(join(source,'manifest.json'),'utf8'));
  if(manifest.format!=='atoll-supabase-1'||manifest.projectUrl!==supabaseConfig().url||!Array.isArray(manifest.files))throw new Error('Backup format or Supabase project does not match.');
  const entries=new Map();
  for(const file of manifest.files){
    if(!/^(records\.json|files\/[a-f0-9]{64})$/.test(file.name)||entries.has(file.name))throw new Error('Invalid backup path.');
    const bytes=await readFile(join(source,file.name));
    if(bytes.length!==file.size||digest(bytes)!==file.sha256)throw new Error('Backup checksum mismatch.');
    entries.set(file.name,bytes);
  }
  const records=JSON.parse(entries.get('records.json')?.toString()||'null');
  if(!records||!['workspaces','memberships','identities'].every(key=>Array.isArray(records[key])))throw new Error('Invalid backup records.');
  for(const file of references(records)){
    const bytes=entries.get('files/'+digest(file.key));
    if(!bytes||bytes.length!==file.size||digest(bytes)!==file.sha256)throw new Error('Backup is missing valid referenced evidence.');
  }
  return {records,entries};
}
export async function restoreSupabaseBackup(directory) {
  const {records,entries}=await validateSupabaseBackup(directory);
  const existing=await rpc('ops_export_records',{});
  if(Object.values(existing).some(rows=>rows.length))throw new Error('Restore requires empty application tables. Keep existing records as a rollback copy.');
  const store=new SupabaseEvidenceStore();
  for(const file of references(records)){
    const bytes=entries.get('files/'+digest(file.key));
    const prior=await store.get(file.key);
    if(prior){if(digest(new Uint8Array(await prior.arrayBuffer()))!==file.sha256)throw new Error('An existing evidence object has a different checksum.');}
    else await store.put(file.key,bytes,{httpMetadata:{contentType:file.mime||'application/octet-stream'}});
  }
  // On failure retain the private uploaded objects so recovery can resume;
  // never delete evidence after an uncertain transaction response.
  await rpc('ops_restore_records',{p_records:records});
  return {restored:true,workspaces:records.workspaces.length,evidenceFiles:references(records).length};
}
