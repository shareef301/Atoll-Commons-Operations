import * as oidc from 'openid-client';
import { googleConfig } from '@/server/google.mjs';
import { database } from '@/server/storage.mjs';
import { runtimeConfig } from '@/server/config.mjs';
import { authCookie, cookieValue, tokenHash, registerIdentity, createSession, revokeSession } from '@/server/sessions.mjs';
import {authClient,supabaseUser} from '@/server/supabase-auth';
export const dynamic = 'force-dynamic';
export async function GET(request:Request) {
  if(process.env.AUTH_MODE==='supabase'){
    const client=await authClient();
    const code=new URL(request.url).searchParams.get('code');
    let path='/signin?error=signin';
    if(code){
      const {error}=await client.auth.exchangeCodeForSession(code);
      if(!error){
        if(await supabaseUser())path='/';
        else {await client.auth.signOut({scope:'local'});path='/signin?error=access';}
      }
    }
    return new Response(null,{status:303,headers:{Location:runtimeConfig().origin+path,'Cache-Control':'no-store'}});
  }
  const headers = new Headers({'Cache-Control':'no-store'});
  headers.append('Set-Cookie',authCookie('','flow',0));
  try {
    const token = cookieValue(request.headers,'flow');
    if (!token) throw new Error('Missing sign-in flow.');
    const flow = database().connection.prepare('DELETE FROM auth_flows WHERE token_hash = ? AND expires_at > ? RETURNING *').get(tokenHash(token),Date.now());
    if (!flow) throw new Error('Sign-in expired.');
    // Use the configured public origin, not forwarded host/protocol headers.
    const callback = new URL('/auth/callback',runtimeConfig().origin);
    callback.search = new URL(request.url).search;
    const tokens = await oidc.authorizationCodeGrant(await googleConfig(), callback, {pkceCodeVerifier:String(flow.verifier),expectedState:String(flow.state),expectedNonce:String(flow.nonce),idTokenExpected:true});
    const claims = tokens.claims();
    if (!claims) throw new Error('Missing verified identity.');
    let id;
    try { id = registerIdentity({issuer:'https://accounts.google.com',subject:claims.sub,email:claims.email,name:claims.name,verified:claims.email_verified}); }
    catch { headers.set('Location',runtimeConfig().origin+'/signin?error=access'); return new Response(null,{status:303,headers}); }
    revokeSession(request.headers);
    headers.append('Set-Cookie',authCookie(createSession(id)));
    headers.set('Location',runtimeConfig().origin+'/');
  } catch { headers.set('Location',runtimeConfig().origin+'/signin?error=signin'); }
  return new Response(null,{status:303,headers});
}
