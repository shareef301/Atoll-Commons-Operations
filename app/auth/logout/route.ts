import { sameOrigin, revokeSession, authCookie } from '@/server/sessions.mjs';
import { runtimeConfig } from '@/server/config.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request:Request) {
  if (!sameOrigin(request)) return new Response('Forbidden',{status:403});
  revokeSession(request.headers);
  return new Response(null,{status:303,headers:{Location:runtimeConfig().origin+'/signin','Set-Cookie':authCookie('','session',0),'Cache-Control':'no-store'}});
}
