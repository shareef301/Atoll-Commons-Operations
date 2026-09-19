import { createHash } from 'node:crypto';

export function supabaseConfig() {
  const url = new URL(process.env.SUPABASE_URL || '');
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error('SUPABASE_URL must be your hosted Supabase HTTPS origin.');
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key || (!key.startsWith('sb_secret_') && !key.startsWith('eyJ'))) throw new Error('Set the server-only SUPABASE_SECRET_KEY.');
  return { url: url.origin, key, bucket: 'operations-evidence' };
}

// Never forward a caller's Authorization header to this privileged client.
export async function supabaseRequest(path, {method='GET', body, headers={}}={}) {
  const {url,key}=supabaseConfig();
  const response=await fetch(url+path, {method, headers:{apikey:key, ...(key.startsWith('eyJ')?{Authorization:'Bearer '+key}:{}), ...headers}, body, cache:'no-store', signal:AbortSignal.timeout(20000)});
  if (!response.ok) {
    const detail=await response.json().catch(()=>({}));
    const code=String(detail.code||detail.error||detail.statusCode||'');
    throw Object.assign(new Error(`Supabase operation failed (HTTP ${response.status}).`),{status:response.status,code:/^[a-zA-Z0-9_]{1,80}$/.test(code)?code:''});
  }
  return response;
}
export async function rest(path, body, method=body===undefined?'GET':'POST') {
  const response=await supabaseRequest('/rest/v1/'+path,{method,body:body===undefined?undefined:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
  return response.status===204?null:response.json();
}
export const rpc=(name,params)=>rest('rpc/'+name,params);

export class SupabaseEvidenceStore {
  objectPath(key) {
    if(typeof key!=='string'||!key||key.length>1000)throw new Error('Invalid evidence key.');
    return '/storage/v1/object/'+supabaseConfig().bucket+'/'+createHash('sha256').update(key).digest('hex');
  }
  async put(key,bytes,options={}) {
    await supabaseRequest(this.objectPath(key),{method:'POST',body:new Uint8Array(bytes),headers:{'Content-Type':options.httpMetadata?.contentType||'application/octet-stream','x-upsert':'false'}});
  }
  async get(key) {
    try {
      const response=await supabaseRequest(this.objectPath(key));
      const bytes=await response.arrayBuffer();
      return {body:new Uint8Array(bytes),arrayBuffer:async()=>bytes};
    }catch(error){if(error.status===404||['not_found','NoSuchKey','404'].includes(error.code))return null;throw error;}
  }
  async delete(key) {
    const prefix=this.objectPath(key).split('/').at(-1);
    await supabaseRequest('/storage/v1/object/'+supabaseConfig().bucket,{method:'DELETE',body:JSON.stringify({prefixes:[prefix]}),headers:{'Content-Type':'application/json'}});
  }
}

export async function supabaseReady() {
  await rest('ops_workspaces?select=id&limit=1');
  const response=await supabaseRequest('/storage/v1/bucket/'+supabaseConfig().bucket);
  const bucket=await response.json();
  if(bucket.public || Number(bucket.file_size_limit)<30*1024*1024)throw new Error('The private evidence bucket is not configured correctly.');
  return true;
}
