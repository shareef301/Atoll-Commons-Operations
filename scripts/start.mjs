import { validateDeployment } from '../server/config.mjs';
import { storageReady } from '../server/storage.mjs';
import { resolve } from 'node:path';

try {
  process.env.NODE_ENV = 'production';
  process.env.MIGRATIONS_DIR = resolve('drizzle');
  validateDeployment();
  await storageReady();
  await import('../dist/standalone/server.js');
} catch (error) {
  console.error('Atoll Commons could not start:', error.message);
  process.exit(1);
}
