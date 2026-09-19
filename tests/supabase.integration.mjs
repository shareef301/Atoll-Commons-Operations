// Real Supabase integration using isolated generated users/records. No emails
// are sent; fixture users and evidence are removed in finally, by exact IDs.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createServerClient,createChunks} from '@supabase/ssr';
import {mkdtemp,cp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {randomUUID,randomBytes} from 'node:crypto';
import {rest,rpc,SupabaseEvidenceStore} from '../server/supabase-admin.mjs';
import {runWorkflow} from './integration.mjs';

assert.equal(process.env.SUPABASE_TEST_PROJECT_REF,new URL(process.env.SUPABASE_URL).hostname.split('.')[0],'Set SUPABASE_TEST_PROJECT_REF to explicitly select the test destination.');
const admin=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const root=await mkdtemp(join(tmpdir(),'atoll-supabase-test-')),app=join(root,'app'),origin='https://ops.atollcommons.org';
const reserve=createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
const base='http://127.0.0.1:'+port,actors=[];
let server,logs='',checks=0;
async function actor(){
  const email='atoll-test-'+randomUUID()+'@example.test',password=randomBytes(32).toString('base64url');
  const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;
  const item={id:data.user.id,email,cookie:''};actors.push(item);
  let cookies=[];
  const client=createServerClient(process.env.SUPABASE_URL,process.env.SUPABASE_PUBLISHABLE_KEY,{cookies:{getAll:()=>cookies,setAll:values=>{for(const value of values){cookies=cookies.filter(c=>c.name!==value.name);cookies.push(value);}}}});
  const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;
  item.session=login.data.session;item.cookie=cookies.map(c=>c.name+'='+c.value).join('; ');item.jwt=login.data.session.access_token;
  return item;
}
async function start(owner){
  server=spawn(process.execPath,['scripts/start.mjs'],{cwd:app,env:{...process.env,NODE_ENV:'production',STORAGE_BACKEND:'supabase',AUTH_MODE:'supabase',OWNER_EMAIL:owner.email,APP_URL:origin,PORT:String(port),HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){if(server.exitCode!==null)throw new Error('Server exited: '+logs.slice(-2000));try{if((await fetch(base+'/api/health')).status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
  throw new Error('Server did not become healthy: '+logs.slice(-2000));
}
async function stop(){if(server&&server.exitCode===null){const done=once(server,'exit');server.kill('SIGTERM');const timer=setTimeout(()=>server.kill('SIGKILL'),5000);await done;clearTimeout(timer);}}
try {
  await mkdir(join(app,'dist'),{recursive:true});await cp(resolve('dist/standalone'),join(app,'dist/standalone'),{recursive:true});
  for(const path of ['server','scripts','drizzle'])await cp(resolve(path),join(app,path),{recursive:true});
  await cp(resolve('package.json'),join(app,'package.json'));
  const owner=await actor(),peer=await actor();await start(owner);checks++;
  assert.equal((await fetch(base+'/api/workspace')).status,401);checks++;
  assert.equal((await fetch(base+'/api/workspace',{headers:{Cookie:peer.cookie}})).status,401);checks++;
  const signin=await fetch(base+'/signin');assert.equal(signin.status,200);assert.match(await signin.text(),/Email me a sign-in link/);checks++;
  for(const jwt of [null,owner.jwt]){
    const headers={apikey:process.env.SUPABASE_PUBLISHABLE_KEY,...(jwt?{Authorization:'Bearer '+jwt}:{})};
    for(const table of ['ops_workspaces','ops_memberships','ops_identities']){
      const denied=await fetch(process.env.SUPABASE_URL+'/rest/v1/'+table+'?select=*',{headers});assert.ok([401,403].includes(denied.status));checks++;
    }
    const denied=await fetch(process.env.SUPABASE_URL+'/rest/v1/rpc/ops_save_workspace',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({p_id:owner.id,p_revision:0,p_data:{}})});assert.ok([401,403,404].includes(denied.status));checks++;
  }
  const cookieRoot=owner.cookie.split('=')[0].replace(/\.\d+$/,'');
  const staleSession={...owner.session,expires_at:Math.floor(Date.now()/1000)-60};
  const staleCookie=createChunks(cookieRoot,'base64-'+Buffer.from(JSON.stringify(staleSession)).toString('base64url')).map(c=>c.name+'='+c.value).join('; ');
  const refreshed=await fetch(base+'/api/workspace',{headers:{Cookie:staleCookie}});
  assert.equal(refreshed.status,200);const refreshedCookies=refreshed.headers.getSetCookie();
  assert.ok(refreshedCookies.length>0);assert.ok(refreshedCookies.every(c=>/HttpOnly/i.test(c)&&/Secure/i.test(c)));
  assert.match(refreshed.headers.get('cache-control'),/no-store/);
  owner.cookie=refreshedCookies.filter(c=>!/Max-Age=0/i.test(c)).map(c=>c.split(';')[0]).join('; ');checks++;
  console.log('Supabase authentication, session refresh and direct-access checks passed.');
  const result=await runWorkflow({base,origin,actor:owner,scopedActor:peer});checks+=result.checks;
  const row=(await rest('ops_workspaces?id=eq.'+owner.id))[0];
  const writes=await Promise.all([rpc('ops_save_workspace',{p_id:owner.id,p_revision:row.revision,p_data:row.data}),rpc('ops_save_workspace',{p_id:owner.id,p_revision:row.revision,p_data:row.data})]);
  assert.deepEqual(writes.sort(),[false,true]);checks++;
  const staleAccess=await rpc('ops_assign_access',{p_id:owner.id,p_revision:row.revision,p_data:row.data,p_member:{email:peer.email,name:'Should not be applied',role:'System owner',projects:[],governance:0,authority_ref:''}});
  assert.equal(staleAccess,false);assert.notEqual((await rest('ops_memberships?email=eq.'+encodeURIComponent(peer.email)))[0].role,'System owner');checks++;
  const key=row.data.files.find(f=>f.id===result.fileId).key,store=new SupabaseEvidenceStore();
  const publicFile=await fetch(process.env.SUPABASE_URL+store.objectPath(key).replace('/object/','/object/public/'));assert.notEqual(publicFile.status,200);checks++;
  const staleSwitch=await rpc('ops_switch_workspace',{p_id:owner.id,p_revision:row.revision,p_data:{...row.data,mode:'live'}});assert.equal(staleSwitch,false);checks++;
  const activeState=await (await fetch(base+'/api/workspace',{headers:{Cookie:owner.cookie}})).json();
  for(const mode of ['live','sample']){const response=await fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:owner.cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({type:'mode_switch',mode,revision:activeState.revision,operationId:randomUUID()})});assert.equal(response.status,200);const next=await response.json();activeState.revision=next.revision;assert.equal(next.data.mode,mode);}
  checks++;
  await stop();await start(owner);
  assert.equal(await (await fetch(base+'/api/files/'+result.fileId,{headers:{Cookie:owner.cookie}})).text(),'Atoll integration evidence');checks++;
  assert.equal((await fetch(base+'/auth/development',{method:'POST',headers:{Origin:origin}})).status,404);checks++;
  assert.equal((await fetch(base+'/api/workspace',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:'{}'})).status,403);checks++;
  const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{Cookie:owner.cookie,Origin:origin},redirect:'manual'});assert.equal(logout.status,303);checks++;
  assert.equal((await fetch(base+'/api/workspace',{headers:{Cookie:owner.cookie}})).status,401);checks++;
  console.log(JSON.stringify({passed:checks,scope:'standalone app + real Supabase Auth, Postgres and private Storage',emailDelivery:'not exercised'}));
}catch(error){console.error('Supabase integration failed:',error);throw error;}finally{
  await stop();
  const store=new SupabaseEvidenceStore(),keys=new Set();
  for(const actor of actors){
    const rows=await rest('ops_workspaces?id=like.'+actor.id+'*');
    for(const row of rows)for(const file of row.data.files||[])keys.add(file.key);
  }
  for(const key of keys)await store.delete(key);
  for(const actor of actors){
    await rest('ops_memberships?workspace_id=eq.'+actor.id,undefined,'DELETE');
    await rest('ops_memberships?email=eq.'+encodeURIComponent(actor.email),undefined,'DELETE');
    await rest('ops_identities?user_id=eq.'+actor.id,undefined,'DELETE');
  }
  for(const actor of actors){await rest('ops_workspaces?id=like.'+actor.id+'*',undefined,'DELETE');await admin.auth.admin.deleteUser(actor.id);}
  await rm(root,{recursive:true,force:true});
}
