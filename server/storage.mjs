import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, existsSync, chmodSync } from 'node:fs';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { runtimeConfig } from './config.mjs';
import { SupabaseEvidenceStore, supabaseReady } from './supabase-admin.mjs';

// The small SQL interface preserves the existing bound queries and atomic batches.
// No database or uploads are created during the build; initialization is lazy.
export class RecordStore {
  constructor(filename, migrations = process.env.MIGRATIONS_DIR || resolve('drizzle')) {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.connection = new DatabaseSync(filename, { timeout: 5000, enableForeignKeyConstraints: true });
    chmodSync(filename, 0o600);
    this.connection.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
    this.connection.exec('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
    for (const name of readdirSync(migrations).filter(x => /^\d+.*\.sql$/.test(x)).sort()) {
      const sql = readFileSync(join(migrations, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      this.connection.exec('BEGIN IMMEDIATE');
      try {
        const prior = this.connection.prepare('SELECT checksum FROM app_migrations WHERE name = ?').get(name);
        if (prior && prior.checksum !== checksum) throw new Error(`Applied migration was modified: ${name}`);
        if (!prior) {
          this.connection.exec(sql);
          this.connection.prepare('INSERT INTO app_migrations VALUES (?,?,?)').run(name, checksum, new Date().toISOString());
        }
        this.connection.exec('COMMIT');
      } catch (error) {
        this.connection.exec('ROLLBACK');
        throw error;
      }
    }
  }
  prepare(sql) { return new BoundStatement(this.connection, sql); }
  async batch(statements) {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => statement.execute());
      this.connection.exec('COMMIT');
      return results;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }
  close() { this.connection.close(); }
}

class BoundStatement {
  constructor(connection, sql, values = []) { this.connection = connection; this.sql = sql; this.values = values; }
  bind(...values) { return new BoundStatement(this.connection, this.sql, values); }
  /** @template T @returns {Promise<T | null>} */
  async first() { return this.connection.prepare(this.sql).get(...this.values) || null; }
  /** @template T @returns {Promise<{results: T[]}>} */
  async all() { return { results: this.connection.prepare(this.sql).all(...this.values) }; }
  execute() { const result = this.connection.prepare(this.sql).run(...this.values); return { meta: { changes: Number(result.changes) } }; }
  async run() { return this.execute(); }
}

export class EvidenceStore {
  constructor(directory) { this.directory = directory; mkdirSync(directory, { recursive: true, mode: 0o700 }); }
  path(key) {
    if (typeof key !== 'string' || !key || key.length > 1000) throw new Error('Invalid evidence key.');
    // Hash opaque keys: imported keys and Unicode IDs cannot escape the volume.
    return join(this.directory, createHash('sha256').update(key).digest('hex'));
  }
  async put(key, bytes, _options = {}) {
    const target = this.path(key), temporary = target + '.' + randomUUID() + '.tmp';
    try { await writeFile(temporary, new Uint8Array(bytes), { flag: 'wx', mode: 0o600 }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async get(key) {
    let bytes;
    try { bytes = await readFile(this.path(key)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    return { body: new Uint8Array(bytes), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }
  async delete(key) { await unlink(this.path(key)).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

/** @type {RecordStore | undefined} */
let records;
/** @type {EvidenceStore | undefined} */
let evidence;
let cloudEvidence;
/** @returns {RecordStore} */
export function database() { return records ??= new RecordStore(join(runtimeConfig().dataDir, 'atoll.sqlite')); }
/** @returns {EvidenceStore} */
export function files() {
  if(process.env.STORAGE_BACKEND==='supabase')return cloudEvidence??=new SupabaseEvidenceStore();
  return evidence ??= new EvidenceStore(join(runtimeConfig().dataDir, 'files'));
}
export async function storageReady() {
  if(process.env.STORAGE_BACKEND==='supabase')return supabaseReady();
  const config = runtimeConfig();
  database().connection.prepare('SELECT 1').get();
  const store = evidence ??= new EvidenceStore(join(config.dataDir,'files'));
  const probe = join(store.directory, '.health-' + randomUUID());
  try { await writeFile(probe, '', { flag: 'wx', mode: 0o600 }); } finally { await unlink(probe).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  return existsSync(join(config.dataDir, 'atoll.sqlite'));
}
