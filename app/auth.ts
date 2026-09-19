import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sessionUser } from '@/server/sessions.mjs';
export async function getUser() { return sessionUser(await headers()); }
export async function requireUser() {
  const user = await getUser();
  if (user) return user;
  redirect('/signin');
}
