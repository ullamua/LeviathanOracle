import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';

const csv = (raw: string | undefined): string[] =>
  String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const truthy = (raw: unknown): boolean =>
  raw === true || raw === 'true' || raw === '1' || raw === 1;

const PostgresConfig = z.object({
  enabled: z.boolean(),
  host: z.string().optional(),
  port: z.number().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  url: z.string().optional(),
});

const RedisConfig = z.object({
  enabled: z.boolean(),
  host: z.string().optional(),
  port: z.number().optional(),
  password: z.string().optional(),
  url: z.string().optional(),
});

const BotConfigSchema = z.object({
  bot: z.object({
    token: z.string().min(1, 'DISCORD_TOKEN is required'),
    id: z.string().min(1, 'BOT_ID is required'),
    ownerIds: z.array(z.string()).min(1, 'At least one OWNER_ID is required'),
    adminIds: z.array(z.string()),
    reportChannelId: z.string().optional(),
    devGuildIds: z.array(z.string()),
  }),
  apitokens: z.object({
    animeschedule: z.string().min(1, 'ANIMESCHEDULE_TOKEN is required'),
  }),
  logging: z.object({
    guildJoinLogsId: z.string().optional(),
    guildLeaveLogsId: z.string().optional(),
    commandLogsChannelId: z.string().optional(),
    errorLogsChannelId: z.string().optional(),
    level: z.string().default('info'),
    fileDir: z.string().default('logs'),
  }),
  database: z.object({
    postgresql: PostgresConfig,
    redis: RedisConfig,
    mongoUrl: z.string().optional(),
  }),
});

export type BotConfig = z.infer<typeof BotConfigSchema>;

interface JsonShape {
  bot?: { token?: string; id?: string; ownerId?: string | string[]; admins?: string[]; reportChannelId?: string; developerCommandsServerIds?: string[] };
  apitokens?: { animeschedule?: string };
  logging?: Record<string, string>;
  database?: {
    postgresql?: { enabled?: boolean; config?: Record<string, unknown> };
    redis?: { enabled?: boolean; config?: Record<string, unknown> };
    mongodbUrl?: string;
  };
}

function fromJsonFile(file: string): JsonShape | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as JsonShape;
  } catch {
    return null;
  }
}

function buildRaw(): unknown {
  const json = fromJsonFile(path.resolve(process.cwd(), 'config.json'));

  const ownerFromJson = Array.isArray(json?.bot?.ownerId)
    ? json!.bot!.ownerId
    : json?.bot?.ownerId
      ? [json.bot.ownerId]
      : [];

  return {
    bot: {
      token: process.env.DISCORD_TOKEN || json?.bot?.token || '',
      id: process.env.BOT_ID || json?.bot?.id || '',
      ownerIds: csv(process.env.OWNER_IDS).length ? csv(process.env.OWNER_IDS) : ownerFromJson.filter(Boolean),
      adminIds: csv(process.env.ADMIN_IDS).length ? csv(process.env.ADMIN_IDS) : (json?.bot?.admins || []).filter(Boolean),
      reportChannelId: process.env.REPORT_CHANNEL_ID || json?.bot?.reportChannelId || undefined,
      devGuildIds: csv(process.env.DEV_GUILD_IDS).length ? csv(process.env.DEV_GUILD_IDS) : (json?.bot?.developerCommandsServerIds || []).filter(Boolean),
    },
    apitokens: {
      animeschedule: process.env.ANIMESCHEDULE_TOKEN || json?.apitokens?.animeschedule || '',
    },
    logging: {
      guildJoinLogsId: process.env.GUILD_JOIN_LOGS_ID || json?.logging?.guildJoinLogsId || undefined,
      guildLeaveLogsId: process.env.GUILD_LEAVE_LOGS_ID || json?.logging?.guildLeaveLogsId || undefined,
      commandLogsChannelId: process.env.COMMAND_LOGS_CHANNEL_ID || json?.logging?.commandLogsChannelId || undefined,
      errorLogsChannelId: process.env.ERROR_LOGS_CHANNEL_ID || json?.logging?.errorLogs || undefined,
      level: process.env.LOG_LEVEL || 'info',
      fileDir: process.env.LOG_FILE_DIR || 'logs',
    },
    database: {
      postgresql: {
        enabled: truthy(process.env.POSTGRES_ENABLED) || Boolean(process.env.DATABASE_URL) || Boolean(json?.database?.postgresql?.enabled),
        host: process.env.POSTGRES_HOST || (json?.database?.postgresql?.config?.host as string) || undefined,
        port: process.env.POSTGRES_PORT ? Number(process.env.POSTGRES_PORT) : (json?.database?.postgresql?.config?.port as number) || undefined,
        user: process.env.POSTGRES_USER || (json?.database?.postgresql?.config?.user as string) || undefined,
        password: process.env.POSTGRES_PASSWORD || (json?.database?.postgresql?.config?.password as string) || undefined,
        database: process.env.POSTGRES_DATABASE || (json?.database?.postgresql?.config?.database as string) || undefined,
        url: process.env.DATABASE_URL || undefined,
      },
      redis: {
        enabled: truthy(process.env.REDIS_ENABLED) || Boolean(process.env.REDIS_URL) || Boolean(json?.database?.redis?.enabled),
        host: process.env.REDIS_HOST || (json?.database?.redis?.config?.host as string) || undefined,
        port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : (json?.database?.redis?.config?.port as number) || undefined,
        password: process.env.REDIS_PASSWORD || (json?.database?.redis?.config?.password as string) || undefined,
        url: process.env.REDIS_URL || undefined,
      },
      mongoUrl: process.env.MONGO_URL || json?.database?.mongodbUrl || undefined,
    },
  };
}

let cached: BotConfig | null = null;

export function loadConfig(): BotConfig {
  if (cached) return cached;
  const raw = buildRaw();
  const parsed = BotConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.errors.map((e) => `  • ${e.path.join('.')}: ${e.message}`).join('\n');
    const message =
      'LeviathanOracle config is invalid. Fix the following before starting:\n' +
      missing +
      '\n\nSee .env.example for the full list of supported variables.';
    throw new Error(message);
  }
  cached = parsed.data;
  return cached;
}
