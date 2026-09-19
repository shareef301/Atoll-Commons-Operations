import * as oidc from 'openid-client';
let discovery;
export function googleConfig() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new Error('Google sign-in is not configured.');
  // The issuer is fixed, never controlled by request parameters or headers.
  return discovery ??= oidc.discovery(new URL('https://accounts.google.com'), process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET).catch(error => { discovery = undefined; throw error; });
}
