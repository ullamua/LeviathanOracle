import axios, { AxiosError } from "axios";
import { cached, type CacheOptions } from "../cache/redis-client";
import { tracer } from "../observability/tracer";
import type { Anime } from "./anime-types";

const ANILIST = "https://graphql.anilist.co";

const TTL = {
  search: 1800,
  details: 21600,
  schedule: 900,
  profile: 3600,
  list: 600,
};

const ANIME_FIELDS = `
  id
  idMal
  title { romaji english native }
  status
  format
  episodes
  duration
  description
  averageScore
  popularity
  favourites
  genres
  coverImage { large }
  bannerImage
  nextAiringEpisode { airingAt timeUntilAiring episode }
`;

const USER_FIELDS = `
  id
  name
  about
  avatar { large }
  statistics {
    anime { count meanScore minutesWatched episodesWatched }
    manga { count meanScore chaptersRead volumesRead }
  }
  favourites {
    anime { nodes { id title { romaji english native } averageScore coverImage { large } } }
    manga { nodes { id title { romaji english native } averageScore coverImage { large } } }
  }
`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

interface MediaResponse {
  Media?: AniListMedia | null;
  Page?: { media: AniListMedia[] };
  User?: AniListUser | null;
  MediaListCollection?: {
    lists: Array<{ entries: Array<{ status: string; media: AniListMedia }> }>;
  };
}

interface AniListMedia {
  id: number;
  idMal: number | null;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  } | null;
  status: string | null;
  format: string | null;
  episodes: number | null;
  duration: number | null;
  description: string | null;
  averageScore: number | null;
  popularity: number | null;
  favourites: number | null;
  genres: string[] | null;
  coverImage: { large: string | null } | null;
  bannerImage: string | null;
  nextAiringEpisode: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  } | null;
  airingSchedule?: {
    nodes: Array<{ airingAt: number; episode: number }>;
    pageInfo?: unknown;
  } | null;
}

export interface AniListUser {
  id: number;
  name: string;
  about: string | null;
  avatar: { large: string | null };
  statistics: {
    anime: {
      count: number;
      meanScore: number;
      minutesWatched: number;
      episodesWatched: number;
    };
    manga: {
      count: number;
      meanScore: number;
      chaptersRead: number;
      volumesRead: number;
    };
  };
  favourites: {
    anime: {
      nodes: Array<{
        id: number;
        title: {
          english: string | null;
          romaji: string | null;
          native: string | null;
        };
        averageScore: number | null;
        coverImage: { large: string | null };
      }>;
    };
    manga: {
      nodes: Array<{
        id: number;
        title: {
          english: string | null;
          romaji: string | null;
          native: string | null;
        };
        averageScore: number | null;
        coverImage: { large: string | null };
      }>;
    };
  };
}

export interface AniListListEntry {
  status: string;
  media: {
    id: number;
    idMal: number | null;
    title: string;
    cover_image: string | null;
  };
}

const stripHtml = (text: string | null | undefined): string =>
  String(text || "")
    .replace(/<[^>]*>/g, "")
    .trim();

const safeLower = (value: string): string => String(value || "").toLowerCase();

async function post<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T | null> {
  const t = tracer.start("API: AniList", { keys: Object.keys(variables) });
  try {
    const res = await axios.post<GraphQLResponse<T>>(
      ANILIST,
      { query, variables },
      { timeout: 10_000 },
    );
    if (res.data.errors?.length) {
      throw new Error(res.data.errors.map((e) => e.message).join("; "));
    }
    t.end("ok");
    return res.data.data ?? null;
  } catch (err) {
    if ((err as AxiosError).response?.status === 404) return null;
    t.error("post failed", err);
    throw err;
  }
}

function mapAnime(media: AniListMedia | null | undefined): Anime | null {
  if (!media) return null;
  const next = media.nextAiringEpisode;
  return {
    anilist_id: media.id,
    mal_id: media.idMal ?? null,
    title:
      media.title?.english ||
      media.title?.romaji ||
      media.title?.native ||
      null,
    title_english: media.title?.english || null,
    title_romaji: media.title?.romaji || null,
    title_native: media.title?.native || null,
    status: media.status || null,
    format: media.format || null,
    episodes: media.episodes ?? null,
    duration: media.duration ?? null,
    genres: media.genres || [],
    average_score: media.averageScore ?? null,
    popularity: media.popularity ?? null,
    favourites: media.favourites ?? null,
    description: stripHtml(media.description),
    cover_image: media.coverImage?.large || null,
    banner_image: media.bannerImage || null,
    next_airing: next
      ? {
          airing_at: next.airingAt,
          episode: next.episode,
          time_until_airing: next.timeUntilAiring,
          airing_date_iso: new Date(next.airingAt * 1000).toISOString(),
        }
      : null,
    url: `https://anilist.co/anime/${media.id}`,
    source: "anilist",
  };
}

export function searchAnime(
  query: string,
  limit = 10,
  opts: CacheOptions = {},
): Promise<Anime[]> {
  return cached(
    `svc:anilist:anime:search:${safeLower(query)}:${limit}`,
    TTL.search,
    async () => {
      const data = await post<MediaResponse>(
        `query($search:String,$limit:Int){Page(perPage:$limit){media(search:$search,type:ANIME){${ANIME_FIELDS}}}}`,
        { search: query, limit },
      );
      return (data?.Page?.media || [])
        .map(mapAnime)
        .filter((a): a is Anime => a != null);
    },
    opts,
  );
}

export function getAnimeByAniListId(
  id: number | string,
  opts: CacheOptions = {},
): Promise<Anime | null> {
  return cached(
    `svc:anilist:anime:id:${id}`,
    TTL.details,
    async () => {
      const data = await post<MediaResponse>(
        `query($id:Int){Media(id:$id,type:ANIME){${ANIME_FIELDS}}}`,
        { id: Number(id) },
      );
      return mapAnime(data?.Media);
    },
    opts,
  );
}

export function getAnimeByMalId(
  malId: number | string,
  opts: CacheOptions = {},
): Promise<Anime | null> {
  return cached(
    `svc:anilist:anime:mal:${malId}`,
    TTL.details,
    async () => {
      const data = await post<MediaResponse>(
        `query($idMal:Int){Media(idMal:$idMal,type:ANIME){${ANIME_FIELDS}}}`,
        { idMal: Number(malId) },
      );
      return mapAnime(data?.Media);
    },
    opts,
  );
}

export function getAniListUserProfile(
  name: string,
  opts: CacheOptions = {},
): Promise<AniListUser | null> {
  return cached(
    `svc:anilist:user:${safeLower(name)}`,
    TTL.profile,
    async () => {
      const data = await post<MediaResponse>(
        `query($name:String){User(name:$name){${USER_FIELDS}}}`,
        { name },
      );
      return data?.User || null;
    },
    opts,
  );
}

export async function anilistVerification(name: string): Promise<string> {
  const user = await getAniListUserProfile(name, { fresh: true });
  return String(user?.about || "");
}

export interface NextAiringByTitle {
  anilistId: number;
  title: string;
  episodeDate: string;
  episodeNumber: number;
  timeUntilAiring: number;
}

export async function getNextAiringByTitles(
  titles: Array<string | null | undefined>,
): Promise<NextAiringByTitle | null> {
  for (const raw of titles) {
    const title = String(raw || "").trim();
    if (!title) continue;
    try {
      const data = await post<MediaResponse>(
        `query($search:String){Media(search:$search,type:ANIME,status:RELEASING){id title{romaji english native} nextAiringEpisode{airingAt timeUntilAiring episode}}}`,
        { search: title },
      );
      const m = data?.Media;
      const next = m?.nextAiringEpisode;
      if (m && next) {
        return {
          anilistId: m.id,
          title:
            m.title?.english || m.title?.romaji || m.title?.native || title,
          episodeDate: new Date(next.airingAt * 1000).toISOString(),
          episodeNumber: next.episode,
          timeUntilAiring: next.timeUntilAiring,
        };
      }
    } catch {
      // try next title
    }
  }
  return null;
}

/**
 * Fetch every entry on a public AniList user's anime or manga list.
 * Used by `/watchlist sync` so users can pull from a linked account
 * without uploading a file.
 */
export async function getAniListMediaList(
  username: string,
  type: "ANIME" | "MANGA",
): Promise<AniListListEntry[]> {
  const out: AniListListEntry[] = [];
  const data = await post<MediaResponse>(
    `query($name:String,$type:MediaType){
      MediaListCollection(userName:$name,type:$type){
        lists{ entries{
          status
          media{ id idMal title{romaji english native} coverImage{large} }
        } }
      }
    }`,
    { name: username, type },
  );
  for (const list of data?.MediaListCollection?.lists ?? []) {
    for (const e of list.entries) {
      const m = e.media;
      out.push({
        status: e.status,
        media: {
          id: m.id,
          idMal: m.idMal ?? null,
          title:
            m.title?.english ||
            m.title?.romaji ||
            m.title?.native ||
            `AniList #${m.id}`,
          cover_image: m.coverImage?.large || null,
        },
      });
    }
  }
  return out;
}
