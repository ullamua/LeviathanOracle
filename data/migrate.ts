import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DBAdapter } from './adapter';
import { tracer } from '../observability/tracer';

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

interface MigrationRow {
  id: number;
}

function translateForDialect(sql: string, type: DBAdapter['type']): string {
  if (type === 'postgres') return sql;
  return sql
    .replace(/SERIAL\s+PRIMARY\s+KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/\bBIGINT\b/gi, 'INTEGER')
    .replace(/\bVARCHAR\(\d+\)/gi, 'TEXT')
    .replace(/\bTIMESTAMP\b/gi, 'TEXT');
}

/**
 * SQLite has no IF NOT EXISTS for ALTER TABLE ADD COLUMN. Detect & skip
 * if the column already exists so re-running the migration is idempotent
 * across forks or partially-applied DBs.
 */
async function safeAddColumn(db: DBAdapter, stmt: string): Promise<void> {
  if (db.type !== 'sqlite') {
    await db.query(stmt);
    return;
  }
  const m = stmt.match(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/i);
  if (!m) {
    await db.query(stmt);
    return;
  }
  const [, table, column] = m;
  const { rows } = await db.query<{ name: string }>(`PRAGMA table_info(${table})`);
  if (rows.some((r) => r.name === column)) {
    tracer.debug('MIGRATIONS', `Column ${table}.${column} already present — skipping`);
    return;
  }
  await db.query(stmt);
}

export async function runMigrations(db: DBAdapter): Promise<void> {
  const t = tracer.start('MIGRATIONS', { dialect: db.type });

  await db.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at ${db.type === 'postgres' ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'TEXT DEFAULT CURRENT_TIMESTAMP'}
    )
  `);

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const { rows } = await db.query<MigrationRow>('SELECT id FROM migrations');
  const applied = new Set(rows.map((r) => Number(r.id)));

  let appliedCount = 0;
  for (const file of files) {
    const idMatch = file.match(/^(\d+)/);
    if (!idMatch) continue;
    const id = Number(idMatch[1]);
    if (applied.has(id)) continue;

    const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const sql = translateForDialect(raw, db.type);

    // Strip line-comments first so a chunk like "-- note\nALTER ..." is kept.
    const stripped = sql.replace(/^\s*--.*$/gm, '');
    const statements = stripped
      .split(/;\s*(?:\n|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    t.info(`Applying ${file}`);
    for (const stmt of statements) {
      if (/^ALTER\s+TABLE\s+\w+\s+ADD\s+COLUMN/i.test(stmt)) {
        await safeAddColumn(db, stmt);
      } else {
        await db.query(stmt);
      }
    }
    await db.query('INSERT INTO migrations (id, name) VALUES ($1, $2)', [id, file]);
    appliedCount += 1;
  }

  t.end(`Applied ${appliedCount} new migration(s); ${applied.size} already in place`);
}
