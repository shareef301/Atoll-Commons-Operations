import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionUser } from '@/server/sessions.mjs';
import {supabaseUser} from '@/server/supabase-auth';
export async function getUser() {
  if(process.env.AUTH_MODE==='supabase')return supabaseUser();
  return sessionUser(await headers());
}
export async function requireUser() {
  const user = await getUser();
  if (user) return user;
  redirect('/signin');
}
