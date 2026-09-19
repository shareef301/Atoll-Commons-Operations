import { resolve, isAbsolute } from 'node:path';

export function runtimeConfig() {
  const production = process.env.NODE_ENV === 'production';
  const appUrl = new URL(process.env.APP_URL || 'http://localhost:3000');
  const ownerEmail = (process.env.OWNER_EMAIL || (production ? '' : 'owner@example.test')).trim().toLowerCase();
  const dataDir = resolve(process.env.DATA_DIR || '.data');
  if (production) {
    if (!process.env.APP_URL || appUrl.protocol !== 'https:') throw new Error('APP_URL must be the public HTTPS origin.');
    if (!process.env.DATA_DIR || !isAbsolute(process.env.DATA_DIR)) throw new Error('DATA_DIR must be an absolute persistent-volume path.');
    if (process.env.RAILWAY_ENVIRONMENT_ID && process.env.RAILWAY_VOLUME_MOUNT_PATH !== dataDir) throw new Error('Attach a Railway volume at DATA_DIR before starting.');
    if (process.env.AUTH_MODE === 'development') throw new Error('Development sign-in cannot run in production.');
  }
  if (appUrl.username || appUrl.password || appUrl.pathname !== '/' || appUrl.search || appUrl.hash) throw new Error('APP_URL must contain only the origin.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new Error('Set OWNER_EMAIL to the initial administrator’s email.');
  return { production, origin: appUrl.origin, secure: appUrl.protocol === 'https:', dataDir, ownerEmail };
}

export function validateDeployment() {
  const config = runtimeConfig();
  if (config.production && (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)) {
    throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before starting.');
  }
  return config;
}
