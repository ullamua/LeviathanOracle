import { getDatabase } from '../data/database';
import { tracer } from '../observability/tracer';
import { anilistVerification } from '../anime/anilist';
import { malVerification, MalScrapeError } from '../anime/jikan';

export interface UserProfile {
  user_id: string;
  mal_username: string | null;
  anilist_username: string | null;
}

const tokens = new Map<string, { token: string; platform: 'mal' | 'anilist'; username: string; expires: number }>();

function generateToken(): string {
  return 'LORA-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

export function startVerification(userId: string, platform: 'mal' | 'anilist', username: string): string {
  const token = generateToken();
  tokens.set(userId, { token, platform, username, expires: Date.now() + 15 * 60 * 1000 });
  return token;
}

export async function completeVerification(userId: string): Promise<{ ok: true; platform: 'mal' | 'anilist'; username: string } | { ok: false; reason: string }> {
  const pending = tokens.get(userId);
  if (!pending) return { ok: false, reason: 'No pending verification. Run /linkprofile again.' };
  if (Date.now() > pending.expires) {
    tokens.delete(userId);
    return { ok: false, reason: 'Verification expired. Run /linkprofile again.' };
  }
  let about = '';
  try {
    about = pending.platform === 'anilist'
      ? await anilistVerification(pending.username)
      : await malVerification(pending.username);
  } catch (err) {
    if (err instanceof MalScrapeError) return { ok: false, reason: err.message };
    tracer.error('PROFILES', 'Verification fetch failed', err);
    return { ok: false, reason: 'Could not fetch your profile. Try again in a minute.' };
  }
  if (!about.includes(pending.token)) {
    return { ok: false, reason: `Token \`${pending.token}\` not found in your ${pending.platform} bio. Add it and try again.` };
  }
  await saveProfile(userId, pending.platform, pending.username);
  tokens.delete(userId);
  return { ok: true, platform: pending.platform, username: pending.username };
}

export async function saveProfile(userId: string, platform: 'mal' | 'anilist', username: string): Promise<void> {
  const db = getDatabase();
  const column = platform === 'mal' ? 'mal_username' : 'anilist_username';
  if (db.type === 'postgres') {
    await db.query(
      `INSERT INTO user_profiles (user_id, ${column}) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET ${column} = EXCLUDED.${column}`,
      [userId, username],
    );
  } else {
    await db.query(
      `INSERT INTO user_profiles (user_id, ${column}) VALUES ($1, $2)
       ON CONFLICT(user_id) DO UPDATE SET ${column} = excluded.${column}`,
      [userId, username],
    );
  }
}

export async function getProfile(userId: string): Promise<UserProfile | null> {
  const { rows } = await getDatabase().query<UserProfile>(
    'SELECT * FROM user_profiles WHERE user_id = $1',
    [userId],
  );
  return rows[0] ?? null;
}

export async function unlinkProfile(userId: string, platform: 'mal' | 'anilist'): Promise<void> {
  const column = platform === 'mal' ? 'mal_username' : 'anilist_username';
  await getDatabase().query(`UPDATE user_profiles SET ${column} = NULL WHERE user_id = $1`, [userId]);
}
