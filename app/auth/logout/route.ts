import { sameOrigin, revokeSession, authCookie } from '@/server/sessions.mjs';
import { runtimeConfig } from '@/server/config.mjs';
import {authClient} from '@/server/supabase-auth';
export const dynamic = 'force-dynamic';
export async function POST(request:Request) {
  if (!sameOrigin(request)) return new Response('Forbidden',{status:403});
  if(process.env.AUTH_MODE==='supabase'){
    const client=await authClient();
    const {error}=await client.auth.signOut({scope:'local'});
    if(error)return new Response('Sign-out could not be completed. Please try again.',{status:503});
    return new Response(null,{status:303,headers:{Location:runtimeConfig().origin+'/signin','Cache-Control':'no-store'}});
  }
  revokeSession(request.headers);
  return new Response(null,{status:303,headers:{Location:runtimeConfig().origin+'/signin','Set-Cookie':authCookie('','session',0),'Cache-Control':'no-store'}});
}
