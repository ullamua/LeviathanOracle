import type { BotConfig } from '../config/load';
import type { DBAdapter } from './adapter';
import { createSqliteAdapter } from './sqlite';
import { createPostgresAdapter } from './postgres';
import { runMigrations } from './migrate';
import { tracer } from '../observability/tracer';

let adapter: DBAdapter | null = null;

export async function initializeDatabase(config: BotConfig): Promise<DBAdapter> {
  if (adapter) return adapter;
  const pg = config.database.postgresql;
  if (pg.enabled && (pg.url || (pg.host && pg.user && pg.database))) {
    adapter = createPostgresAdapter(pg);
    tracer.info('DATABASE', 'Using PostgreSQL');
  } else {
    adapter = createSqliteAdapter();
    tracer.info('DATABASE', 'Using SQLite');
  }
  await runMigrations(adapter);
  return adapter;
}

export function getDatabase(): DBAdapter {
  if (!adapter) throw new Error('Database not initialized - call initializeDatabase first');
  return adapter;
}
