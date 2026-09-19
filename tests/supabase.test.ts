import test from 'node:test';
import assert from 'node:assert/strict';
import {canDiscardEvidence} from '../server/evidence-cleanup.mjs';
import {runtimeConfig} from '../server/config.mjs';
import {SupabaseEvidenceStore} from '../server/supabase-admin.mjs';

test('uncertain remote writes never delete evidence that may have committed',()=>{
  const previous=process.env.STORAGE_BACKEND;
  try {
    process.env.STORAGE_BACKEND='supabase';
    assert.equal(canDiscardEvidence(new Error('response lost')),false);
    assert.equal(canDiscardEvidence({status:409}),false);
    assert.equal(canDiscardEvidence({name:'AppError',status:409}),true);
    process.env.STORAGE_BACKEND='sqlite';assert.equal(canDiscardEvidence(new Error('local write failed')),true);
  }finally{if(previous===undefined)delete process.env.STORAGE_BACKEND;else process.env.STORAGE_BACKEND=previous;}
});
test('cloud preview refuses an unspecified administrator and development bypass',()=>{
  const keys=['NODE_ENV','STORAGE_BACKEND','AUTH_MODE','OWNER_EMAIL'],prior=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  try{
    Object.assign(process.env,{NODE_ENV:'development'});process.env.STORAGE_BACKEND='supabase';process.env.AUTH_MODE='supabase';delete process.env.OWNER_EMAIL;
    assert.throws(()=>runtimeConfig(),/OWNER_EMAIL/);
    process.env.OWNER_EMAIL='test@example.test';process.env.AUTH_MODE='development';assert.throws(()=>runtimeConfig(),/AUTH_MODE=supabase/);
  }finally{for(const key of keys){if(prior[key]===undefined)delete process.env[key];else process.env[key]=prior[key];}}
});
test('private object absence is distinct from a Supabase outage',async()=>{
  const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
  try{
    process.env.SUPABASE_URL='https://test-project.supabase.co';process.env.SUPABASE_SECRET_KEY='sb_secret_disposable_test_fixture';
    const store=new SupabaseEvidenceStore();
    globalThis.fetch=async()=>Response.json({statusCode:'404',error:'not_found'},{status:400});
    assert.equal(await store.get('workspace/file'),null);
    globalThis.fetch=async()=>Response.json({error:'server_error'},{status:503});
    await assert.rejects(()=>store.get('workspace/file'),/HTTP 503/);
  }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
