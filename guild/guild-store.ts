import { getDatabase } from '../data/database';

export interface GuildSettings {
  guild_id: string;
  notification_channel_id: string | null;
  daily_schedule_channel_id: string | null;
  daily_schedule_enabled: string | null;
  daily_schedule_time: string | null;
  level_role_id: string | null;
}

export async function getGuildSettings(guildId: string): Promise<GuildSettings | null> {
  const { rows } = await getDatabase().query<GuildSettings>(
    'SELECT * FROM guild_settings WHERE guild_id = $1',
    [guildId],
  );
  return rows[0] ?? null;
}

async function upsert(guildId: string, column: string, value: unknown): Promise<void> {
  const db = getDatabase();
  if (db.type === 'postgres') {
    await db.query(
      `INSERT INTO guild_settings (guild_id, ${column}) VALUES ($1, $2)
       ON CONFLICT (guild_id) DO UPDATE SET ${column} = EXCLUDED.${column}, updated_at = CURRENT_TIMESTAMP`,
      [guildId, value],
    );
  } else {
    await db.query(
      `INSERT INTO guild_settings (guild_id, ${column}) VALUES ($1, $2)
       ON CONFLICT(guild_id) DO UPDATE SET ${column} = excluded.${column}, updated_at = CURRENT_TIMESTAMP`,
      [guildId, value],
    );
  }
}

export const setLevelRole = (guildId: string, roleId: string | null): Promise<void> => upsert(guildId, 'level_role_id', roleId);
export const setNotificationChannel = (guildId: string, channelId: string | null): Promise<void> => upsert(guildId, 'notification_channel_id', channelId);
export const setDailyScheduleChannel = (guildId: string, channelId: string | null): Promise<void> => upsert(guildId, 'daily_schedule_channel_id', channelId);
export const setDailyScheduleEnabled = (guildId: string, enabled: boolean): Promise<void> => upsert(guildId, 'daily_schedule_enabled', enabled ? 'true' : 'false');
export const setDailyScheduleTime = (guildId: string, time: string): Promise<void> => upsert(guildId, 'daily_schedule_time', time);

export async function getAllDailyScheduleGuilds(): Promise<GuildSettings[]> {
  const { rows } = await getDatabase().query<GuildSettings>(
    "SELECT * FROM guild_settings WHERE daily_schedule_enabled = 'true' AND daily_schedule_channel_id IS NOT NULL",
  );
  return rows;
}
