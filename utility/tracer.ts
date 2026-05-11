import * as fs from 'node:fs';
import * as path from 'node:path';

type Level = 'debug' | 'trace' | 'info' | 'warn' | 'error';

const PRIORITY: Record<Level, number> = { debug: 0, trace: 1, info: 2, warn: 3, error: 4 };
const LABEL: Record<Level, string> = { debug: 'DEBUG', trace: 'TRACE', info: 'INFO ', warn: 'WARN ', error: 'ERROR' };

const COLOR: Record<Level, (s: string) => string> = {
  debug: (s) => `\x1b[90m${s}\x1b[0m`,
  trace: (s) => `\x1b[35m${s}\x1b[0m`,
  info: (s) => `\x1b[36m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  error: (s) => `\x1b[31m${s}\x1b[0m`,
};
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;

let minPriority = PRIORITY.info;
let logDir: string | null = null;
let currentDay = '';
let currentStream: fs.WriteStream | null = null;

export function configureTracer(opts: { level?: string; fileDir?: string }): void {
  const lvl = (opts.level || 'info').toLowerCase() as Level;
  if (PRIORITY[lvl] !== undefined) minPriority = PRIORITY[lvl];
  if (opts.fileDir) {
    logDir = path.resolve(process.cwd(), opts.fileDir);
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function rotated(): fs.WriteStream | null {
  if (!logDir) return null;
  const day = new Date().toISOString().slice(0, 10);
  if (day !== currentDay || !currentStream) {
    currentStream?.end();
    currentDay = day;
    currentStream = fs.createWriteStream(path.join(logDir, `bot-${day}.log`), { flags: 'a' });
  }
  return currentStream;
}

function serialize(meta: unknown): string {
  if (meta === undefined) return '';
  if (meta instanceof Error) return meta.stack || meta.message;
  if (typeof meta === 'object') {
    try {
      return JSON.stringify(meta);
    } catch {
      return String(meta);
    }
  }
  return String(meta);
}

function emit(level: Level, context: string, message: string, meta?: unknown): void {
  if (PRIORITY[level] < minPriority) return;
  const ts = new Date().toISOString();
  const detail = serialize(meta);

  const consoleLine = `${dim(ts)} ${COLOR[level](`${LABEL[level]} │ ${bold(`[${context}]`)} ${message}`)}${detail ? '\n' + dim(detail) : ''}`;
  const target = level === 'warn' ? console.warn : level === 'error' ? console.error : console.log;
  target(consoleLine);

  const stream = rotated();
  if (stream) {
    stream.write(`${ts} ${LABEL[level]} [${context}] ${message}${detail ? ' ' + detail : ''}\n`);
  }
}

export interface Span {
  debug(msg: string, meta?: unknown): void;
  trace(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
  end(msg?: string, meta?: unknown): void;
}

export const tracer = {
  debug(ctx: string, msg: string, meta?: unknown): void { emit('debug', ctx, msg, meta); },
  trace(ctx: string, msg: string, meta?: unknown): void { emit('trace', ctx, msg, meta); },
  info(ctx: string, msg: string, meta?: unknown): void { emit('info', ctx, msg, meta); },
  warn(ctx: string, msg: string, meta?: unknown): void { emit('warn', ctx, msg, meta); },
  error(ctx: string, msg: string, meta?: unknown): void { emit('error', ctx, msg, meta); },

  start(context: string, meta?: unknown): Span {
    const t0 = Date.now();
    emit('trace', context, 'started', meta);
    return {
      debug: (m, x) => emit('debug', context, m, x),
      trace: (m, x) => emit('trace', context, m, x),
      info: (m, x) => emit('info', context, m, x),
      warn: (m, x) => emit('warn', context, m, x),
      error: (m, x) => emit('error', context, m, x),
      end: (m = 'finished', x) => emit('trace', context, `${m} (${Date.now() - t0}ms)`, x),
    };
  },
};
