export interface NextAiring {
  airing_at: number;
  episode: number;
  time_until_airing: number;
  airing_date_iso: string;
}

export interface Anime {
  anilist_id: number;
  mal_id: number | null;
  title: string | null;
  title_english: string | null;
  title_romaji: string | null;
  title_native: string | null;
  status: string | null;
  format: string | null;
  episodes: number | null;
  duration: number | null;
  genres: string[];
  average_score: number | null;
  popularity: number | null;
  favourites: number | null;
  description: string;
  cover_image: string | null;
  banner_image: string | null;
  next_airing: NextAiring | null;
  url: string;
  source: 'anilist';
}

export interface ScheduleEntry {
  anime_id: number;
  anime_title: string;
  next_airing_at: number;
  sent_at?: number | null;
}

export interface AnimeScheduleEntry {
  anime_id?: number;
  anilist_id?: number;
  anilistId?: number;
  id?: number;
  title?: string;
  english?: string;
  route?: string;
  title_english?: string;
  title_romaji?: string;
  episodeDate: string;
  episodeNumber?: number;
  episode?: number;
}
