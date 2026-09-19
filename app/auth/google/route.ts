import * as oidc from 'openid-client';
import { database } from '@/server/storage.mjs';
import { runtimeConfig } from '@/server/config.mjs';
import { authCookie, newToken, tokenHash } from '@/server/sessions.mjs';
import { googleConfig } from '@/server/google.mjs';
import {authClient} from '@/server/supabase-auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  if(process.env.AUTH_MODE==='supabase'){
    if(process.env.SUPABASE_GOOGLE_ENABLED!=='true')return new Response('Google sign-in is not enabled.',{status:404});
    const client=await authClient();
    const {data,error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:runtimeConfig().origin+'/auth/callback',skipBrowserRedirect:true}});
    if(error||!data.url)return new Response('Sign-in could not be started.',{status:503});
    return new Response(null,{status:302,headers:{Location:data.url,'Cache-Control':'no-store'}});
  }
  try {
    const config = await googleConfig(), token = newToken();
    const state = oidc.randomState(), nonce = oidc.randomNonce(), verifier = oidc.randomPKCECodeVerifier();
    const url = oidc.buildAuthorizationUrl(config, { redirect_uri:runtimeConfig().origin+'/auth/callback', scope:'openid email profile', state, nonce, code_challenge:await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method:'S256', prompt:'select_account' });
    const sql = database().connection;
    sql.prepare('DELETE FROM auth_flows WHERE expires_at <= ?').run(Date.now());
    sql.prepare('INSERT INTO auth_flows VALUES (?,?,?,?,?)').run(tokenHash(token), state, nonce, verifier, Date.now()+600000);
    return new Response(null, { status:302, headers:{Location:url.href, 'Set-Cookie':authCookie(token,'flow',600), 'Cache-Control':'no-store'} });
  } catch { return new Response('Sign-in is not configured. Please contact the administrator.',{status:503,headers:{'Cache-Control':'no-store'}}); }
}
