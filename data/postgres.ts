import { Pool } from 'pg';
import { tracer } from '../observability/tracer';
import type { BotConfig } from '../config/load';
import type { DBAdapter, QueryResult } from './adapter';

export function createPostgresAdapter(cfg: BotConfig['database']['postgresql']): DBAdapter {
  const pool = cfg.url
    ? new Pool({ connectionString: cfg.url, max: 20, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
    : new Pool({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        max: 20,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });

  pool.on('error', (err) => tracer.error('DATABASE: PostgreSQL', 'Pool error', err));
  tracer.info('DATABASE: PostgreSQL', `Pool initialized (${cfg.url ? 'url' : `${cfg.host}:${cfg.port}`})`);

  return {
    type: 'postgres',

    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
      try {
        const result = await pool.query<Record<string, unknown>>({ text: sql, values: params });
        return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
      } catch (err) {
        const compact = sql.replace(/\s+/g, ' ').trim().slice(0, 220);
        tracer.error('DATABASE: PostgreSQL', `Query failed: ${compact}`, err);
        throw err;
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };
}
