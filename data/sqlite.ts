import Database from 'better-sqlite3';
import * as path from 'node:path';
import { tracer } from '../observability/tracer';
import type { DBAdapter, QueryResult } from './adapter';

const TABLE_RETURNING = /INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)/i;

export function createSqliteAdapter(): DBAdapter {
  const file = path.resolve(process.cwd(), 'localdb.db');
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  tracer.info('DATABASE: SQLite', `Opened ${file}`);

  return {
    type: 'sqlite',

    async query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
      try {
        const refs: number[] = [];
        const sqlNoPlaceholders = text.replace(/\$(\d+)/g, (_m, d: string) => {
          refs.push(parseInt(d, 10) - 1);
          return '?';
        });
        const expanded = refs.length ? refs.map((i) => params[i]) : params;

        const trimmed = sqlNoPlaceholders.trim();
        const isSelect = /^SELECT/i.test(trimmed) || /^WITH\s/i.test(trimmed) || /^PRAGMA\s/i.test(trimmed);
        const hasReturning = /\sRETURNING\s+/i.test(trimmed);
        const sql = trimmed.replace(/\s+RETURNING\s+.+$/i, '');
        const stmt = db.prepare(sql);

        if (isSelect) {
          const rows = stmt.all(...(expanded as unknown[])) as T[];
          return { rows, rowCount: rows.length };
        }

        const info = stmt.run(...(expanded as unknown[]));

        if (hasReturning) {
          const tableMatch = trimmed.match(TABLE_RETURNING);
          if (tableMatch && info.lastInsertRowid) {
            const tbl = tableMatch[1];
            const fullRow = db.prepare(`SELECT * FROM ${tbl} WHERE rowid = ?`).get(info.lastInsertRowid) as T | undefined;
            return { rows: fullRow ? [fullRow] : [], rowCount: info.changes };
          }
          return { rows: [{ id: info.lastInsertRowid } as unknown as T], rowCount: info.changes };
        }

        return { rows: [], rowCount: info.changes };
      } catch (err) {
        const compact = String(text).replace(/\s+/g, ' ').trim().slice(0, 220);
        tracer.error('DATABASE: SQLite', `Query failed: ${compact}`, err);
        throw err;
      }
    },

    async close(): Promise<void> {
      db.close();
    },
  };
}
