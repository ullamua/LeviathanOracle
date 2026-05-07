import Parser from 'rss-parser';

const parser = new Parser();

export interface NyaaItem {
  title: string;
  link: string;
}

export function filterEnglishAnimeItems(items: Array<{ title?: string; link?: string }>): NyaaItem[] {
  const englishKeywords = ['eng', 'english', 'sub', 'dub', 'subtitled'];
  const out: NyaaItem[] = [];
  for (const item of items) {
    const title = String(item.title || '').toLowerCase();
    if (!item.link) continue;
    if (englishKeywords.some((k) => title.includes(k))) {
      out.push({ title: item.title || '', link: item.link });
    }
  }
  return out;
}

export async function fetchRSSFeedWithRetries(url: string, retries = 3, delay = 2_000): Promise<{ items: Array<{ title?: string; link?: string }> }> {
  let lastErr: unknown = null;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await parser.parseURL(url);
    } catch (err) {
      lastErr = err;
      if (i === retries - 1) break;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Nyaa RSS request failed');
}
