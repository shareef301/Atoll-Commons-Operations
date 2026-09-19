import { runtimeConfig } from '@/server/config.mjs';
import { sameOrigin, registerIdentity, createSession, authCookie } from '@/server/sessions.mjs';
export async function POST(request:Request) {
  if (process.env.NODE_ENV === 'production' || process.env.AUTH_MODE !== 'development') return new Response('Not found',{status:404});
  if (!sameOrigin(request)) return new Response('Forbidden',{status:403});
  const email = runtimeConfig().ownerEmail;
  const id = registerIdentity({issuer:'local-development',subject:email,email,name:'Local owner',verified:true});
  return new Response(null,{status:303,headers:{Location:runtimeConfig().origin+'/','Set-Cookie':authCookie(createSession(id)),'Cache-Control':'no-store'}});
}
