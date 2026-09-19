import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {rpc,rest,SupabaseEvidenceStore} from '../server/supabase-admin.mjs';
import {createSupabaseBackup,restoreSupabaseBackup,validateSupabaseBackup} from '../server/supabase-backups.mjs';

assert.equal(process.env.SUPABASE_TEST_PROJECT_REF,new URL(process.env.SUPABASE_URL).hostname.split('.')[0]);
const before=await rpc('ops_export_records',{});
assert.ok(Object.values(before).every(rows=>rows.length===0),'Backup round-trip test requires empty application tables.');
const id=randomUUID(),key=id+'/'+randomUUID(),bytes=Buffer.from('Disposable backup recovery evidence.');
const root=await mkdtemp(join(tmpdir(),'atoll-cloud-backup-test-')),directory=join(root,'snapshot'),store=new SupabaseEvidenceStore();
const digest=value=>createHash('sha256').update(value).digest('hex');
let checks=0;
try {
  await store.put(key,bytes);
  await rpc('ops_bootstrap',{p_id:id,p_email:'atoll-backup-test-'+id+'@example.test',p_name:'Disposable backup test',p_data:{mode:'sample',files:[{key,size:bytes.length,sha256:digest(bytes),mime:'text/plain'}]}});
  const result=await createSupabaseBackup(directory);assert.equal(result.evidenceFiles,1);checks++;
  assert.equal((await validateSupabaseBackup(directory)).records.workspaces[0].id,id);checks++;
  await assert.rejects(()=>restoreSupabaseBackup(directory),/empty application tables/);checks++;
  const path=join(directory,'files',digest(key)),original=await readFile(path);await writeFile(path,'corrupt');
  await assert.rejects(()=>validateSupabaseBackup(directory),/checksum mismatch/);await writeFile(path,original);checks++;
  await rest('ops_memberships?workspace_id=eq.'+id,undefined,'DELETE');await rest('ops_workspaces?id=eq.'+id,undefined,'DELETE');
  await store.delete(key);
  await restoreSupabaseBackup(directory);
  assert.equal((await rest('ops_workspaces?id=eq.'+id))[0].data.files[0].sha256,digest(bytes));
  assert.deepEqual(Buffer.from(await (await store.get(key)).arrayBuffer()),bytes);checks++;
  console.log(JSON.stringify({passed:checks,scope:'real Supabase evidence backup and empty-table restore'}));
}finally{
  await rest('ops_memberships?workspace_id=eq.'+id,undefined,'DELETE');
  await rest('ops_workspaces?id=eq.'+id,undefined,'DELETE');
  await store.delete(key);await rm(root,{recursive:true,force:true});
}
