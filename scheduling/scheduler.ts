import { Client, TextChannel, User } from 'discord.js';
import cron from 'node-cron';
import type { BotConfig } from '../config/load';
import { getDatabase } from '../data/database';
import { tracer } from '../observability/tracer';
import { getNextAiringByTitles } from '../anime/anilist';
import { getDailyScheduleByDay } from '../anime/animeschedule';
import { getAllDailyScheduleGuilds, getGuildSettings } from '../guild/guild-store';
import { v2 } from '../ui/components-v2';

interface ScheduleRow {
  anime_id: number;
  anime_title: string;
  next_airing_at: number | null;
  sent_at: number | null;
}

const NOTIFY_WINDOW_MS = 5 * 60 * 1000; // notify if within 5 min of airing

async function refreshSchedules(): Promise<void> {
  const db = getDatabase();
  const { rows } = await db.query<ScheduleRow>('SELECT anime_id, anime_title FROM schedules');
  for (const row of rows) {
    try {
      const next = await getNextAiringByTitles([row.anime_title]);
      if (next) {
        await db.query(
          'UPDATE schedules SET next_airing_at = $1, sent_at = NULL WHERE anime_id = $2 AND (next_airing_at IS NULL OR next_airing_at <> $1)',
          [next.timeUntilAiring + Math.floor(Date.now() / 1000), row.anime_id],
        );
      }
    } catch (err) {
      tracer.warn('SCHEDULER', `Refresh failed for ${row.anime_title}`, err);
    }
  }
}

async function notifyDueAirings(client: Client): Promise<void> {
  const db = getDatabase();
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now + Math.floor(NOTIFY_WINDOW_MS / 1000);
  const { rows } = await db.query<ScheduleRow>(
    'SELECT * FROM schedules WHERE next_airing_at IS NOT NULL AND next_airing_at <= $1 AND (sent_at IS NULL OR sent_at < next_airing_at)',
    [cutoff],
  );
  for (const row of rows) {
    try {
      await dispatchAnimeNotification(client, row);
      await db.query('UPDATE schedules SET sent_at = $1 WHERE anime_id = $2', [now, row.anime_id]);
    } catch (err) {
      tracer.error('SCHEDULER', `Notify failed for ${row.anime_title}`, err);
    }
  }
}

async function dispatchAnimeNotification(client: Client, schedule: ScheduleRow): Promise<void> {
  const db = getDatabase();
  // Look up cover image + episode for the original-style card.
  let coverImage: string | undefined;
  try {
    const meta = await db.query<{ cover_image: string | null }>(
      'SELECT cover_image FROM schedules WHERE anime_id = $1',
      [schedule.anime_id],
    );
    coverImage = meta.rows[0]?.cover_image ?? undefined;
  } catch { /* cover_image column may not exist on older installs */ }

  const airedAt = schedule.next_airing_at
    ? new Date(schedule.next_airing_at * 1000).toUTCString()
    : new Date().toUTCString();
  const epNum = (schedule as ScheduleRow & { episode_number?: number }).episode_number ?? '?';
  const cardOpts = {
    title: `New Episode of ${schedule.anime_title} Released!`,
    description:
      `**Episode ${epNum} is now available!**\n` +
      `Aired at: ${airedAt}. Remember that the episode might take some time depending on which platform you are watching on.`,
    thumbnail: coverImage,
    color: '#0099ff',
    footer: 'Episode just released!',
  } as const;

  // user watchlists → DM or channel based on preference
  const { rows: users } = await db.query<{ user_id: string; notification_type: string | null; notification_channel_id: string | null }>(
    `SELECT w.user_id, p.notification_type, p.notification_channel_id
     FROM watchlists w
     LEFT JOIN user_preferences p ON p.user_id = w.user_id
     WHERE w.anime_id = $1`,
    [schedule.anime_id],
  );
  for (const u of users) {
    try {
      const card = v2(cardOpts);
      if (u.notification_type === 'channel' && u.notification_channel_id) {
        const ch = await client.channels.fetch(u.notification_channel_id).catch(() => null);
        if (ch instanceof TextChannel) {
          await ch.send({ flags: 1 << 15, content: `<@${u.user_id}>`, components: [card] });
        }
      } else {
        const user: User | null = await client.users.fetch(u.user_id).catch(() => null);
        if (user) await user.send({ flags: 1 << 15, components: [card] }).catch(() => null);
      }
    } catch (err) {
      tracer.warn('SCHEDULER', `Failed to notify user ${u.user_id}`, err);
    }
  }

  // role notifications
  const { rows: roles } = await db.query<{ role_id: string; guild_id: string; role_notification_channel_id: string | null }>(
    'SELECT role_id, guild_id, role_notification_channel_id FROM role_notifications WHERE anime_id = $1',
    [schedule.anime_id],
  );
  for (const r of roles) {
    try {
      const settings = await getGuildSettings(r.guild_id);
      const channelId = r.role_notification_channel_id || settings?.notification_channel_id;
      if (!channelId) continue;
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (ch instanceof TextChannel) {
        await ch.send({
          flags: 1 << 15,
          content: `<@&${r.role_id}>`,
          components: [v2(cardOpts)],
        });
      }
    } catch (err) {
      tracer.warn('SCHEDULER', `Role notify failed for ${r.role_id}`, err);
    }
  }
}

async function postDailySchedule(client: Client): Promise<void> {
  const guilds = await getAllDailyScheduleGuilds();
  if (!guilds.length) return;
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const items = await getDailyScheduleByDay(today, 'sub');

  const lines = items.slice(0, 25).map((it) => {
    const title = it.title || it.title_english || it.title_romaji || it.english || '(unknown)';
    const ep = it.episodeNumber ?? it.episode ?? '?';
    const ts = Math.floor(new Date(it.episodeDate).getTime() / 1000);
    return `• **${title}** — Ep ${ep} · <t:${ts}:t>`;
  });
  const description = lines.length ? lines.join('\n') : '_No scheduled episodes today._';

  for (const g of guilds) {
    if (!g.daily_schedule_channel_id) continue;
    try {
      const ch = await client.channels.fetch(g.daily_schedule_channel_id).catch(() => null);
      if (ch instanceof TextChannel) {
        await ch.send({
          flags: 1 << 15,
          components: [v2({ title: `📅 Today's anime — ${today}`, description, color: 'blue' })],
        });
      }
    } catch (err) {
      tracer.warn('SCHEDULER', `Daily post failed for guild ${g.guild_id}`, err);
    }
  }
}

export async function initializeScheduler(client: Client, _cfg: BotConfig): Promise<void> {
  tracer.info('SCHEDULER', 'Initializing in-memory scheduler');

  // catch-up immediately on boot (Bug fix: dedup via sent_at)
  await refreshSchedules().catch((e) => tracer.error('SCHEDULER', 'Initial refresh failed', e));
  await notifyDueAirings(client).catch((e) => tracer.error('SCHEDULER', 'Catch-up notify failed', e));

  // refresh airing data every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    void refreshSchedules();
  });

  // check for due notifications every 60 seconds
  cron.schedule('* * * * *', () => {
    void notifyDueAirings(client);
  });

  // daily schedule poster (fires every minute, gates per-guild on configured time)
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;
    const guilds = await getAllDailyScheduleGuilds();
    if (guilds.some((g) => (g.daily_schedule_time || '05:00') === hhmm)) {
      await postDailySchedule(client);
    }
  });

  tracer.info('SCHEDULER', 'Scheduler running (refresh 30m, notify 1m, daily 1m gate)');
}

export async function ensureScheduleEntry(animeId: number, animeTitle: string): Promise<void> {
  const db = getDatabase();
  const next = await getNextAiringByTitles([animeTitle]);
  const nextAt = next ? Math.floor(Date.now() / 1000) + next.timeUntilAiring : null;
  if (db.type === 'postgres') {
    await db.query(
      `INSERT INTO schedules (anime_id, anime_title, next_airing_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (anime_id) DO UPDATE SET anime_title = EXCLUDED.anime_title, next_airing_at = EXCLUDED.next_airing_at`,
      [animeId, animeTitle, nextAt],
    );
  } else {
    await db.query(
      `INSERT INTO schedules (anime_id, anime_title, next_airing_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(anime_id) DO UPDATE SET anime_title = excluded.anime_title, next_airing_at = excluded.next_airing_at`,
      [animeId, animeTitle, nextAt],
    );
  }
}
