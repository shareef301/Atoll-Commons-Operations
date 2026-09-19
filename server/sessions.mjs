import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { database } from './storage.mjs';
import { runtimeConfig } from './config.mjs';

export const SESSION_SECONDS = 8 * 60 * 60;
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export function cookieName(kind = 'session') { return (runtimeConfig().secure ? '__Host-' : '') + 'atoll-' + kind; }
export function cookieValue(headers, kind = 'session') {
  const name = cookieName(kind);
  const value = (headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
export function authCookie(token, kind = 'session', age = SESSION_SECONDS) {
  return `${cookieName(kind)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${runtimeConfig().secure ? '; Secure' : ''}`;
}
export function authorizedEmail(email) {
  return email === runtimeConfig().ownerEmail || !!database().connection.prepare('SELECT 1 FROM memberships WHERE email = ?').get(email);
}
export function registerIdentity({ issuer, subject, email, name, verified }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (verified !== true || !subject || !authorizedEmail(normalized)) throw new Error('This account does not have workspace access.');
  const sql = database().connection;
  // Bind each allowed email to the verified provider identity on first sign-in.
  const prior = sql.prepare('SELECT * FROM auth_identities WHERE email = ? OR (issuer = ? AND subject = ?)').all(normalized, issuer, subject);
  if (prior.some(row => row.email !== normalized || row.issuer !== issuer || row.subject !== subject)) throw new Error('This sign-in does not match the registered account.');
  const id = prior[0]?.id || randomUUID();
  sql.prepare('INSERT INTO auth_identities (id,issuer,subject,email,name,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name').run(id, issuer, subject, normalized, String(name || normalized).slice(0,200), Date.now());
  return id;
}
export function createSession(identityId) {
  const sql = database().connection, token = newToken();
  sql.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Date.now());
  sql.prepare('INSERT INTO auth_sessions VALUES (?,?,?)').run(tokenHash(token), identityId, Date.now() + SESSION_SECONDS * 1000);
  return token;
}
export function sessionUser(headers) {
  const token = cookieValue(headers);
  if (!token) return null;
  const identity = database().connection.prepare('SELECT i.* FROM auth_sessions s JOIN auth_identities i ON i.id = s.identity_id WHERE s.token_hash = ? AND s.expires_at > ?').get(tokenHash(token), Date.now());
  if (!identity || !authorizedEmail(identity.email)) return null;
  return { userId: String(identity.id), email: String(identity.email), displayName: String(identity.name), fullName: String(identity.name) };
}
export function revokeSession(headers) {
  const token = cookieValue(headers);
  if (token) database().connection.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(tokenHash(token));
}
export function sameOrigin(request) {
  return request.headers.get('origin') === runtimeConfig().origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}
