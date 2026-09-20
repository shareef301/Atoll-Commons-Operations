// Runs the exact standalone artifact in a temporary Docker-like filesystem.
// Identities are seeded offline in this disposable database, never via a bypass route.
import assert from 'node:assert/strict';
import { mkdtemp, cp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { RecordStore } from '../server/storage.mjs';
import { createBackup, restoreBackup } from '../server/backups.mjs';
import { newToken, tokenHash, authCookie } from '../server/sessions.mjs';
import { runWorkflow } from './integration.mjs';

const root=await mkdtemp(join(tmpdir(),'atoll-railway-test-'));
const source=resolve('.'), app=join(root,'app'), data=join(root,'data');
const origin='https://ops.atollcommons.org';
const owner='integration-owner@example.test';
process.env.APP_URL=origin;process.env.OWNER_EMAIL=owner;
const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');
const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const base='http://127.0.0.1:'+port;
let server,logs='',sql,checks=0;
async function start() {
  server=spawn(process.execPath,['scripts/start.mjs'],{cwd:app,env:{...process.env,NODE_ENV:'production',AUTH_MODE:'google',APP_URL:origin,DATA_DIR:data,OWNER_EMAIL:owner,GOOGLE_CLIENT_ID:'integration-test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'disposable-test-placeholder',PORT:String(port),HOST:'127.0.0.1',RAILWAY_ENVIRONMENT_ID:'test',RAILWAY_VOLUME_MOUNT_PATH:data},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',chunk=>{logs+=chunk});server.stderr.on('data',chunk=>{logs+=chunk});
  const deadline=Date.now()+20000;
  while(Date.now()<deadline){
    if(server.exitCode!==null)throw new Error('Standalone server exited: '+logs.slice(-4000));
    try {if((await fetch(base+'/api/health')).status===200)return} catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Standalone server did not become healthy: '+logs.slice(-4000));
}
async function stop(){if(server&&server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');const timeout=setTimeout(()=>server.kill('SIGKILL'),5000);await exited;clearTimeout(timeout)}}
function actor(email){
  const id=randomUUID(),token=newToken();
  sql.connection.prepare('INSERT INTO auth_identities VALUES (?,?,?,?,?,?)').run(id,'https://accounts.google.com',id,email,email,Date.now());
  sql.connection.prepare('INSERT INTO auth_sessions VALUES (?,?,?)').run(tokenHash(token),id,Date.now()+3600000);
  return {id,email,token,cookie:authCookie(token).split(';')[0]};
}
try {
  await mkdir(join(app,'dist'),{recursive:true});
  await cp(join(source,'dist/standalone'),join(app,'dist/standalone'),{recursive:true});
  for(const path of ['server','scripts','drizzle','lib'])await cp(join(source,path),join(app,path),{recursive:true});
  await cp(join(source,'package.json'),join(app,'package.json'));
  sql=new RecordStore(join(data,'atoll.sqlite'),join(app,'drizzle'));
  const ownerActor=actor(owner),peer=actor('scoped-lead@example.test'),general=actor('general-member@example.test');
  await start();checks++;
  const health=await fetch(base+'/api/health');assert.equal((await health.json()).status,'ok');checks++;
  const signin=await fetch(base+'/signin');assert.equal(signin.status,200);assert.match(await signin.text(),/Continue with Google/);assert.equal(signin.headers.get('x-frame-options'),'DENY');checks++;
  const denied=await fetch(base+'/api/workspace',{headers:{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':owner}});assert.equal(denied.status,401);checks++;
  const dev=await fetch(base+'/auth/development',{method:'POST',headers:{Origin:origin},redirect:'manual'});assert.equal(dev.status,404);checks++;
  const forged=await fetch(base+'/auth/callback?code=fake&state=fake',{redirect:'manual'});assert.equal(forged.status,303);assert.equal(forged.headers.get('location'),origin+'/signin?error=signin');checks++;
  const flow=await runWorkflow({base,origin,actor:ownerActor,scopedActor:peer});checks+=flow.checks;
  async function command(payload,who=ownerActor,expected=200){
    const response=await fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:who.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({...payload,revision:flow.state.revision,operationId:randomUUID()})});
    const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));if(expected===200)flow.state=result;return result;
  }
  await command({type:'create',collection:'members',values:{title:'Private general member fixture',email:general.email}});const memberId=flow.state.id;
  await command({type:'dues_account',memberId,startMonth:'2026-09',opening:50,reason:'Synthetic opening used only in an isolated test',confirm:true});
  await command({type:'member_access',values:{name:'General member fixture',email:general.email,role:'General member',memberId,governance:true,projects:['ac-01','report1']}});
  const memberView=await fetch(base+'/api/workspace',{headers:{Cookie:general.cookie}});assert.equal(memberView.status,200);const memberState=await memberView.json();
  assert.equal(memberState.permissions.memberOnly,true);assert.equal(memberState.user.governance,false);assert.deepEqual(memberState.data.duesAccounts,[]);assert.deepEqual(memberState.data.members,[]);assert.deepEqual(memberState.data.reports,[]);assert.deepEqual(memberState.members,[]);checks++;
  for(const id of [flow.fileId,flow.exportId])assert.equal((await fetch(base+'/api/files/'+id,{headers:{Cookie:general.cookie}})).status,403);checks++;
  await command({type:'dues_note',id:flow.state.data.duesAccounts[0].id,reason:'Unauthorized',date:'2099-01-01'},general,400);checks++;
  assert.equal((await fetch(base+'/api/export/report1',{method:'POST',headers:{Cookie:general.cookie,Origin:origin}})).status,403);checks++;
  const blockedUpload=new FormData();blockedUpload.set('file',new File(['Private'], 'private.txt',{type:'text/plain'}));blockedUpload.set('scope','dues');
  assert.equal((await fetch(base+'/api/files',{method:'POST',headers:{Cookie:general.cookie,Origin:origin},body:blockedUpload})).status,403);checks++;
  const deepLink=await fetch(base+'/open?kind=decisions&id=test-record',{redirect:'manual'});assert.equal(deepLink.status,303);assert.equal(deepLink.headers.get('location'),origin+'/signin');assert.match(deepLink.headers.get('set-cookie'),/HttpOnly/);assert.match(deepLink.headers.get('set-cookie'),/Secure/);
  assert.equal((await fetch(base+'/open?kind=https://evil.example&id=bad',{redirect:'manual'})).status,404);
  assert.equal(signin.headers.get('referrer-policy'),'same-origin');checks++;
  const noOrigin=await fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:ownerActor.cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(noOrigin.status,403);checks++;
  const tooLarge=await fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:ownerActor.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({text:'a'.repeat(100001)})});assert.equal(tooLarge.status,413);checks++;
  const badJson=await fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:ownerActor.cookie,Origin:origin,'Content-Type':'application/json'},body:'broken'});assert.equal(badJson.status,400);checks++;
  await stop();await start();
  const persisted=await fetch(base+'/api/workspace',{headers:{Cookie:ownerActor.cookie}});assert.equal(persisted.status,200);const state=await persisted.json();assert.equal(state.revision,flow.state.revision);assert.equal(state.data.reports[0].status,'Filed');
  const evidence=await fetch(base+'/api/files/'+flow.fileId,{headers:{Cookie:ownerActor.cookie}});assert.equal(await evidence.text(),'Atoll integration evidence');checks++;
  const backup=join(root,'backup'),restored=join(root,'restored');await createBackup(data,backup);await restoreBackup(backup,restored);
  const restoredDb=new RecordStore(join(restored,'atoll.sqlite'),join(app,'drizzle'));
  assert.equal(restoredDb.connection.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n,0);
  assert.equal(restoredDb.connection.prepare('SELECT revision FROM workspaces WHERE id = ?').get(ownerActor.id).revision,state.revision);
  const manifest=JSON.parse(await readFile(join(backup,'manifest.json'),'utf8'));assert.ok(manifest.files.length>=3);restoredDb.close();checks++;
  await assert.rejects(()=>restoreBackup(backup,restored),/empty data directory/);checks++;
  sql.connection.prepare('UPDATE auth_sessions SET expires_at=0 WHERE identity_id=?').run(peer.id);
  assert.equal((await fetch(base+'/api/workspace',{headers:{Cookie:peer.cookie}})).status,401);checks++;
  const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{Cookie:ownerActor.cookie,Origin:origin},redirect:'manual'});assert.equal(logout.status,303);assert.match(logout.headers.get('set-cookie'),/Secure/);assert.match(logout.headers.get('set-cookie'),/HttpOnly/);assert.equal((await fetch(base+'/api/workspace',{headers:{Cookie:ownerActor.cookie}})).status,401);checks++;
  console.log(JSON.stringify({passed:checks,scope:'isolated Railway standalone artifact',realGoogleLogin:'requires configured OAuth credentials'}));
} finally {await stop();sql?.close();await rm(root,{recursive:true,force:true})}
