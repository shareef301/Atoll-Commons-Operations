import { Leaf, LockKeyhole } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getUser } from '../auth';
import { runtimeConfig } from '@/server/config.mjs';
export const dynamic = 'force-dynamic';
export default async function SignIn({searchParams}:{searchParams:Promise<{error?:string}>}) {
  if (await getUser()) redirect('/');
  const {error} = await searchParams;
  const local = !runtimeConfig().production && process.env.AUTH_MODE === 'development';
  return <main className="signin-page"><section className="signin-card">
    <span className="brand-symbol"><Leaf size={28}/></span>
    <p className="eyebrow">ATOLL COMMONS</p><h1>Operations</h1>
    <p className="subtitle">Sign in to your organization’s workspace.</p>
    {error && <p className="form-error" role="alert">{error==='access'?'This account does not have workspace access. Ask your administrator to assign access to your email.':'Sign-in could not be completed. Please try again.'}</p>}
    {local ? <form action="/auth/development" method="post"><button className="button primary" type="submit">Open local preview</button><p className="metadata">Local development only · sample workspace</p></form> : <a className="button primary" href="/auth/google">Continue with Google</a>}
    <p className="signin-note"><LockKeyhole size={16}/> Access is limited to authorized people.</p>
  </section></main>;
}
