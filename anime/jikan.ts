import axios, { AxiosError } from "axios";
import { cached, type CacheOptions } from "../cache/redis-client";
import { tracer } from "../observability/tracer";

const JIKAN = "https://api.jikan.moe/v4";
const TTL = { search: 1800, details: 21600, profile: 3600 };

export class MalScrapeError extends Error {}

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  url: string;
  synopsis: string | null;
  status: string | null;
  episodes: number | null;
  score: number | null;
  year?: number;
  images: {
    jpg: { large_image_url?: string; image_url?: string };
    webp?: { large_image_url?: string; image_url?: string };
  };
}

export interface JikanManga {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  url: string;
  synopsis: string | null;
  status: string | null;
  volumes: number | null;
  score: number | null;
  published?: { prop?: { from?: { year?: number } } };
  images: {
    jpg: { large_image_url?: string; image_url?: string };
    webp?: { large_image_url?: string; image_url?: string };
  };
}

export interface JikanUser {
  username: string;
  url: string;
  about: string | null;
  images: { jpg: { image_url: string } };
  statistics?: JikanUserStats;
  favorites?: {
    anime: Array<{ mal_id: number; title: string }>;
    manga: Array<{ mal_id: number; title: string }>;
  };
}

export interface JikanUserStats {
  anime: { total_entries: number; mean_score: number; days_watched: number };
  manga: { total_entries: number; mean_score: number };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

async function get<T>(
  path: string,
  params: Record<string, unknown> = {},
): Promise<T | null> {
  const t = tracer.start("API: Jikan", { path });
  let attempt = 0;
  let lastErr: unknown = null;
  while (attempt < 5) {
    try {
      const res = await axios.get<{ data: T }>(`${JIKAN}/${path}`, {
        params,
        timeout: 8_000,
      });
      t.end("ok");
      return res.data?.data ?? null;
    } catch (err) {
      lastErr = err;
      const status = (err as AxiosError).response?.status;
      if (status === 404) return null;
      if (status === 429 || (status && status >= 500)) {
        const wait = Math.min(2 ** attempt * 400, 5_000);
        t.warn(`Rate limited or 5xx (${status}); retrying in ${wait}ms`);
        await sleep(wait);
        attempt += 1;
        continue;
      }
      t.error("failed", err);
      throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Jikan request failed after retries");
}

export const safeLower = (v: string): string => v.toLowerCase();

export const searchManga = (query: string, limit = 10): Promise<JikanManga[]> =>
  cached(
    `svc:jikan:manga:search:${safeLower(query)}:${limit}`,
    TTL.search,
    async () => (await get<JikanManga[]>("manga", { q: query, limit })) || [],
  );

export const getMangaDetailsByMalId = (
  id: string | number,
): Promise<JikanManga | null> =>
  cached(`svc:jikan:manga:details:${id}`, TTL.details, () =>
    get<JikanManga>(`manga/${id}/full`),
  );

export const searchAnimeJikan = (
  query: string,
  limit = 10,
): Promise<JikanAnime[]> =>
  cached(
    `svc:jikan:anime:search:${safeLower(query)}:${limit}`,
    TTL.search,
    async () => (await get<JikanAnime[]>("anime", { q: query, limit })) || [],
  );

export const getAnimeDetailsByMalId = (
  id: string | number,
): Promise<JikanAnime | null> =>
  cached(`svc:jikan:anime:details:${id}`, TTL.details, () =>
    get<JikanAnime>(`anime/${id}/full`),
  );

export const getMalUserProfile = (
  username: string,
  opts: CacheOptions = {},
): Promise<JikanUser | null> =>
  cached(
    `svc:jikan:user:full:${safeLower(username)}`,
    TTL.profile,
    () => get<JikanUser>(`users/${username}/full`),
    opts,
  );

export const getMalUserStats = async (
  username: string,
  opts: CacheOptions = {},
): Promise<JikanUserStats | null> => {
  const profile = await getMalUserProfile(username, opts);
  return profile?.statistics ?? null;
};

export const getMalUserFavorites = async (
  username: string,
  opts: CacheOptions = {},
): Promise<JikanUser["favorites"] | null> => {
  const profile = await getMalUserProfile(username, opts);
  return profile?.favorites ?? null;
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([\da-fA-F]+);/g, (_, n: string) =>
      String.fromCharCode(parseInt(n, 16)),
    );

const stripHtml = (text: string): string => text.replace(/<[^>]*>/g, "").trim();

async function fetchMalAboutFromHtml(username: string): Promise<string> {
  const t = tracer.start("API: MAL Profile Fallback", { username });
  try {
    const res = await axios.get<string>(
      `https://myanimelist.net/profile/${encodeURIComponent(username)}`,
      {
        timeout: 8_000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      },
    );
    const html = res.data;
    const block = html.match(/<div class="word-break">([\s\S]*?)<\/td>/i);
    if (!block) {
      t.warn("No about block in MAL HTML — page layout may have changed");
      throw new MalScrapeError(
        "MAL profile HTML did not contain an about block. Please try again.",
      );
    }
    const plain = stripHtml(
      decodeEntities(block[1].replace(/<br\s*\/?>/gi, "\n")),
    );
    t.end("ok");
    return plain;
  } catch (err) {
    if (err instanceof MalScrapeError) throw err;
    t.error("MAL HTML fallback failed", err);
    throw new MalScrapeError(
      "MAL profile page could not be reached. Please try again later.",
    );
  }
}

export async function malVerification(username: string): Promise<string> {
  const profile = await getMalUserProfile(username, { fresh: true });
  const about = String(profile?.about || "").trim();
  if (about) return about;
  return fetchMalAboutFromHtml(username);
}

/**
 *  Jikan user-list endpoints (used by /watchlist sync to pull from a linked
 *  MyAnimeList account directly, no upload required).
 */

export interface JikanListEntry {
  mal_id: number;
  title: string;
  status: string | null;
  cover_image: string | null;
}

interface JikanListNode<TKey extends "anime" | "manga"> {
  [k: string]: unknown;
  list_status?: { status?: string };
  node: {
    id: number;
    title: string;
    main_picture?: { large?: string; medium?: string };
  };
}

async function fetchPaged<TKey extends "anime" | "manga">(
  username: string,
  resource: TKey,
): Promise<JikanListEntry[]> {
  const out: JikanListEntry[] = [];
  let page = 1;
  // Jikan returns 25/page by default; cap at 40 pages = 1000 entries to be safe.
  while (page <= 40) {
    const data = await get<JikanListNode<TKey>[]>(
      `users/${username}/${resource}list`,
      { page },
    );
    if (!data || !data.length) break;
    for (const item of data) {
      const node =
        (item as unknown as { node: JikanListNode<TKey>["node"] }).node ||
        (item as unknown as JikanListNode<TKey>["node"]);
      const id = (node?.id ??
        (item as unknown as { mal_id?: number }).mal_id) as number | undefined;
      const title =
        node?.title ?? (item as unknown as { title?: string }).title;
      if (!id || !title) continue;
      out.push({
        mal_id: Number(id),
        title: String(title),
        status:
          (item as unknown as { list_status?: { status?: string } }).list_status
            ?.status ?? null,
        cover_image:
          node?.main_picture?.large || node?.main_picture?.medium || null,
      });
    }
    if (data.length < 25) break;
    page += 1;
    await sleep(250);
  }
  return out;
}

export const getMalAnimeList = (username: string): Promise<JikanListEntry[]> =>
  fetchPaged(username, "anime");
export const getMalMangaList = (username: string): Promise<JikanListEntry[]> =>
  fetchPaged(username, "manga");
