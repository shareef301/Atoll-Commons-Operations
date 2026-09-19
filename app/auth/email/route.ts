import {authClient,allowedEmail} from '@/server/supabase-auth';
import {runtimeConfig} from '@/server/config.mjs';
import {sameOrigin} from '@/server/sessions.mjs';
import {boundedRequest} from '@/server/http';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  if(process.env.AUTH_MODE!=='supabase')return new Response('Not found',{status:404});
  if(!sameOrigin(request))return new Response('Forbidden',{status:403});
  try {
    const form=await (await boundedRequest(request,4096)).formData();
    const email=String(form.get('email')||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return Response.json({error:'Enter a valid email address.'},{status:400});
    if(await allowedEmail(email)){
      const client=await authClient();
      const {error}=await client.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:runtimeConfig().origin+'/auth/callback'}});
      if(error)return Response.json({error:'Sign-in email could not be sent. Please try later or contact your administrator.'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
    return Response.json({message:'If this email has workspace access, a sign-in link is on its way. Open it in this browser.'},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Sign-in could not be started. Please try again.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
