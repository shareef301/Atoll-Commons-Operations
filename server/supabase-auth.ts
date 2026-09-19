import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {runtimeConfig} from './config.mjs';
import {membership} from './records.mjs';
import {rpc} from './supabase-admin.mjs';

export async function authClient() {
  const jar=await cookies();
  return createServerClient(process.env.SUPABASE_URL!,process.env.SUPABASE_PUBLISHABLE_KEY!,{
    cookieOptions:{httpOnly:true,secure:runtimeConfig().secure,sameSite:'lax',path:'/'},
    cookies:{getAll:()=>jar.getAll(),setAll:values=>{
      try {for(const {name,value,options} of values)jar.set(name,value,options);}
      catch {/* The proxy refreshes cookies before rendering Server Components. */}
    }},
  });
}
export async function allowedEmail(email:string) {
  return email===runtimeConfig().ownerEmail || !!(await membership(email));
}
export async function supabaseUser() {
  const client=await authClient();
  // getUser verifies the token with Auth and catches deleted/banned users.
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user?.email||!user.email_confirmed_at||user.is_anonymous)return null;
  const email=user.email.trim().toLowerCase();
  if(!await allowedEmail(email))return null;
  const {data:claims,error:claimError}=await client.auth.getClaims();
  if(claimError||!claims?.claims.session_id)return null;
  if(!await rpc('ops_session_active',{p_session_id:claims.claims.session_id,p_user_id:user.id}))return null;
  if(!await rpc('ops_bind_identity',{p_email:email,p_user_id:user.id}))return null;
  // Display metadata is never used for authorization.
  const name=String(user.user_metadata?.full_name||email).slice(0,200);
  return {userId:user.id,email,displayName:name,fullName:name};
}
