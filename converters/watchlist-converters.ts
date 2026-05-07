/**
 * Watchlist export / import.
 */

export interface WatchlistRow {
  anime_id: number | null;
  anime_title: string;
  kind?: 'anime' | 'manga';
  status?: string | null;
}

export interface ImportEntry {
  id: number;
  title: string | null;
  type: 'mal' | 'ani';
  kind: 'anime' | 'manga';
  status?: string | null;
}

const MAL_STATUS: Record<string, string> = {
  watching: 'Watching',
  completed: 'Completed',
  plan_to_watch: 'Plan to Watch',
  plantowatch: 'Plan to Watch',
  on_hold: 'On-Hold',
  onhold: 'On-Hold',
  dropped: 'Dropped',
  reading: 'Reading',
  plan_to_read: 'Plan to Read',
};

const malStatus = (s: string | null | undefined, kind: 'anime' | 'manga'): string => {
  const norm = String(s || '').toLowerCase().replace(/[\s-]+/g, '_');
  return MAL_STATUS[norm] ?? (kind === 'anime' ? 'Plan to Watch' : 'Plan to Read');
};

const escapeCdata = (raw: string): string => raw.replace(/]]>/g, ']]]]><![CDATA[>');

export function toMalXML(rows: WatchlistRow[]): string {
  const animeRows = rows.filter((r) => (r.kind ?? 'anime') === 'anime');
  const mangaRows = rows.filter((r) => r.kind === 'manga');

  const animeBlocks = animeRows
    .map(
      (r) => `
  <anime>
    <series_animedb_id>${r.anime_id || 0}</series_animedb_id>
    <series_title><![CDATA[${escapeCdata(r.anime_title)}]]></series_title>
    <my_status>${malStatus(r.status, 'anime')}</my_status>
    <update_on_import>1</update_on_import>
  </anime>`,
    )
    .join('');

  const mangaBlocks = mangaRows
    .map(
      (r) => `
  <manga>
    <manga_mangadb_id>${r.anime_id || 0}</manga_mangadb_id>
    <manga_title><![CDATA[${escapeCdata(r.anime_title)}]]></manga_title>
    <my_status>${malStatus(r.status, 'manga')}</my_status>
    <update_on_import>1</update_on_import>
  </manga>`,
    )
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<myanimelist>',
    '<myinfo>',
    `  <user_total_anime>${animeRows.length}</user_total_anime>`,
    `  <user_total_manga>${mangaRows.length}</user_total_manga>`,
    '  <user_export_type>1</user_export_type>',
    '</myinfo>',
    animeBlocks,
    mangaBlocks,
    '</myanimelist>',
  ]
    .filter(Boolean)
    .join('\n');
}

export function toAniListJSON(rows: WatchlistRow[]): string {
  return JSON.stringify(
    {
      version: 1,
      exportedAt: new Date().toISOString(),
      anime: rows
        .filter((r) => (r.kind ?? 'anime') === 'anime')
        .map((r) => ({ anilistId: r.anime_id, title: r.anime_title, status: r.status ?? null })),
      manga: rows
        .filter((r) => r.kind === 'manga')
        .map((r) => ({ malId: r.anime_id, title: r.anime_title, status: r.status ?? null })),
    },
    null,
    2,
  );
}

const decodeCdata = (raw: string | undefined): string =>
  String(raw ?? '')
    .replace(/^<!\[CDATA\[/, '')
    .replace(/\]\]>$/, '')
    .trim();

const tag = (block: string, name: string): string | null => {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? decodeCdata(m[1]) : null;
};

export function parseMalXml(data: string): ImportEntry[] {
  const out: ImportEntry[] = [];
  const animeBlocks = data.match(/<anime>[\s\S]*?<\/anime>/gi) || [];
  for (const block of animeBlocks) {
    const id = Number(tag(block, 'series_animedb_id') || tag(block, 'animedb_id') || 0);
    const title = tag(block, 'series_title') || tag(block, 'series_title_eng') || tag(block, 'title');
    const status = tag(block, 'my_status');
    if (!id && !title) continue;
    out.push({ id, title, type: 'mal', kind: 'anime', status });
  }
  const mangaBlocks = data.match(/<manga>[\s\S]*?<\/manga>/gi) || [];
  for (const block of mangaBlocks) {
    const id = Number(tag(block, 'manga_mangadb_id') || tag(block, 'mangadb_id') || 0);
    const title = tag(block, 'manga_title') || tag(block, 'title');
    const status = tag(block, 'my_status');
    if (!id && !title) continue;
    out.push({ id, title, type: 'mal', kind: 'manga', status });
  }
  return out;
}

export function parseAniListJson(data: string): ImportEntry[] | null {
  try {
    const json = JSON.parse(data) as {
      entries?: Array<{ anilistId?: number; title?: string; status?: string }>;
      anime?: Array<{ anilistId?: number; title?: string; status?: string }>;
      manga?: Array<{ malId?: number; anilistId?: number; title?: string; status?: string }>;
    };
    const out: ImportEntry[] = [];
    const legacy = json.entries || [];
    for (const e of legacy) {
      out.push({ id: Number(e.anilistId ?? 0), title: e.title ?? null, type: 'ani', kind: 'anime', status: e.status ?? null });
    }
    for (const e of json.anime || []) {
      out.push({ id: Number(e.anilistId ?? 0), title: e.title ?? null, type: 'ani', kind: 'anime', status: e.status ?? null });
    }
    for (const e of json.manga || []) {
      out.push({ id: Number(e.malId ?? e.anilistId ?? 0), title: e.title ?? null, type: 'mal', kind: 'manga', status: e.status ?? null });
    }
    return out;
  } catch {
    return null;
  }
}

export function parseImport(format: 'mal' | 'anilist', data: string): ImportEntry[] | null {
  if (format === 'mal') return parseMalXml(data);
  return parseAniListJson(data);
}
