import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RecordStore,EvidenceStore} from '../server/storage.mjs';
import {validateDeployment} from '../server/config.mjs';

test('failed batches roll back every record and migrations survive reopening',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'atoll-storage-'));let db;
 try {
  db=new RecordStore(join(directory,'test.sqlite'));
  await assert.rejects(()=>db!.batch([db!.prepare("INSERT INTO workspaces VALUES ('w','owner@example.test','{}',0,'now')"),db!.prepare("INSERT INTO memberships VALUES ('m','missing','a@example.test','A','Observer','[]',0,'')")]));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM workspaces').first<{n:number}>())!.n,0);
  db.close();db=new RecordStore(join(directory,'test.sqlite'));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM app_migrations').first<{n:number}>())!.n,2);
 }finally{db?.close();await rm(directory,{recursive:true,force:true})}
});
test('opaque evidence keys cannot escape storage and retain exact bytes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'atoll-evidence-'));
 try{const store=new EvidenceStore(directory);await store.put('../../outside',new TextEncoder().encode('evidence'));assert.equal(new TextDecoder().decode((await store.get('../../outside'))!.body),'evidence');assert.equal(store.path('../../outside').split('/').slice(0,-1).join('/'),directory)}finally{await rm(directory,{recursive:true,force:true})}
});
test('production refuses missing credentials, development authentication and missing Railway volume',()=>{
 const prior={...process.env};
 try{
  Object.assign(process.env,{NODE_ENV:'production'});process.env.APP_URL='https://ops.atollcommons.org';process.env.DATA_DIR='/data';process.env.OWNER_EMAIL='owner@example.test';delete process.env.GOOGLE_CLIENT_ID;delete process.env.GOOGLE_CLIENT_SECRET;delete process.env.AUTH_MODE;delete process.env.RAILWAY_ENVIRONMENT_ID;
  assert.throws(()=>validateDeployment(),/GOOGLE_CLIENT/);
  process.env.GOOGLE_CLIENT_ID='test';process.env.GOOGLE_CLIENT_SECRET='test';process.env.AUTH_MODE='development';assert.throws(()=>validateDeployment(),/Development/);
  delete process.env.AUTH_MODE;process.env.RAILWAY_ENVIRONMENT_ID='test';delete process.env.RAILWAY_VOLUME_MOUNT_PATH;assert.throws(()=>validateDeployment(),/volume/);
  process.env.RAILWAY_VOLUME_MOUNT_PATH='/data';assert.equal(validateDeployment().origin,'https://ops.atollcommons.org');
 }finally{for(const key of Object.keys(process.env))if(!(key in prior))delete process.env[key];Object.assign(process.env,prior)}
});
