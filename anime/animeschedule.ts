import axios from 'axios';
import { cached } from '../cache/redis-client';
import { tracer } from '../observability/tracer';
import type { AnimeScheduleEntry } from './anime-types';
import { loadConfig } from '../config/load';

const ANIMESCHEDULE = 'https://animeschedule.net/api/v3';
const TTL_SCHEDULE = 900;

async function fetchTimetable(type: string): Promise<AnimeScheduleEntry[]> {
  const t = tracer.start('API: AnimeSchedule', { type });
  const token = loadConfig().apitokens.animeschedule;
  try {
    const res = await axios.get<AnimeScheduleEntry[]>(`${ANIMESCHEDULE}/timetables/${type}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
    });
    t.end('ok');
    return res.data || [];
  } catch (err) {
    t.error('failed', err);
    throw err;
  }
}

export const getScheduleByType = (type = 'all'): Promise<AnimeScheduleEntry[]> =>
  cached(`svc:animeschedule:timetable:${type}`, TTL_SCHEDULE, () =>
    fetchTimetable(type).catch((err) => {
      tracer.warn('API: AnimeSchedule', `Failed to fetch timetable: ${type}`, err);
      return [];
    }),
  );

export async function getDailyScheduleByDay(day: string, airType = 'all'): Promise<AnimeScheduleEntry[]> {
  const list = await getScheduleByType(airType);
  const target = String(day || '').toLowerCase();
  return list.filter((entry) => {
    const weekday = new Date(entry.episodeDate)
      .toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
      .toLowerCase();
    return weekday === target;
  });
}

export async function pingAnimeScheduleToken(): Promise<boolean> {
  try {
    const list = await fetchTimetable('all');
    return Array.isArray(list);
  } catch {
    return false;
  }
}
