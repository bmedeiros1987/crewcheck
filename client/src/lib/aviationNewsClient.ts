export type AviationNewsSourceKind = 'official' | 'aggregated';

export interface AviationNewsItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
  source: string;
  sourceKind: AviationNewsSourceKind;
  relevance: number;
}

type FeedConfig = {
  id: string;
  label: string;
  rssUrl: string;
  sourceKind: AviationNewsSourceKind;
};

type Rss2JsonItem = {
  title?: string;
  link?: string;
  pubDate?: string;
  guid?: string;
};

type Rss2JsonResponse = {
  status?: string;
  items?: Rss2JsonItem[];
};

const RSS2JSON_ENDPOINT = 'https://api.rss2json.com/v1/api.json';
const CACHE_KEY = 'crewcheck_aviation_news_v1';
const CACHE_TTL_MS = 15 * 60_000;
const MAX_ITEM_AGE_MS = 21 * 24 * 60 * 60_000;

function brazilOfficialFeedUrl() {
  const query = '(site:gov.br/anac OR site:decea.mil.br OR site:embraer.com) aviação';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
}

const FEEDS: FeedConfig[] = [
  {
    id: 'brazil-official',
    label: 'Aviação Brasil',
    rssUrl: brazilOfficialFeedUrl(),
    sourceKind: 'aggregated',
  },
  {
    id: 'airbus',
    label: 'Airbus',
    rssUrl: 'https://www.airbus.com/en/generate-rss-feeds',
    sourceKind: 'official',
  },
  {
    id: 'boeing',
    label: 'Boeing',
    rssUrl: 'https://investors.boeing.com/rss/pressrelease.aspx',
    sourceKind: 'official',
  },
];

function normalizeText(value: unknown) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDate(value?: string): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const candidates = [raw, raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z'];
  for (const candidate of candidates) {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

function baseRelevanceFor(title: string, source: FeedConfig) {
  const upper = title.toUpperCase();
  let score = source.id === 'brazil-official' ? 3 : source.sourceKind === 'official' ? 2 : 0;
  if (/ANAC|DECEA|INFRAERO|EMBRAER|LATAM|AEROPORTO|AVIATION|AVIAÇÃO/.test(upper)) score += 2;
  return score;
}

async function fetchFeed(feed: FeedConfig): Promise<AviationNewsItem[]> {
  const requestUrl = `${RSS2JSON_ENDPOINT}?rss_url=${encodeURIComponent(feed.rssUrl)}`;
  const response = await fetch(requestUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Feed ${feed.label} indisponível.`);
  const payload = await response.json().catch(() => null) as Rss2JsonResponse | null;
  if (!payload || payload.status !== 'ok' || !Array.isArray(payload.items)) return [];
  const now = Date.now();
  return payload.items
    .map((item, index) => {
      const title = normalizeText(item.title);
      const date = parseDate(item.pubDate);
      if (!title || !item.link) return null;
      if (date && now - date.getTime() > MAX_ITEM_AGE_MS) return null;
      const relevance = baseRelevanceFor(title, feed) + (date ? Math.max(0, 4 - Math.floor((now - date.getTime()) / 86_400_000)) : 0);
      return {
        id: String(item.guid || item.link || `${feed.id}-${index}`),
        title,
        url: String(item.link),
        publishedAt: date ? date.toISOString() : null,
        source: feed.label,
        sourceKind: feed.sourceKind,
        relevance,
      } satisfies AviationNewsItem;
    })
    .filter((item): item is AviationNewsItem => Boolean(item));
}

function dedupe(items: AviationNewsItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9áàâãéêíóôõúç]+/gi, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readCache(): { savedAt: number; items: AviationNewsItem[] } | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.items) || !Number.isFinite(Number(parsed.savedAt))) return null;
    return { savedAt: Number(parsed.savedAt), items: parsed.items as AviationNewsItem[] };
  } catch {
    return null;
  }
}

function writeCache(items: AviationNewsItem[]) {
  try {
    // Cache only source/recency relevance. Route/base boosts are applied at read time,
    // so one user's previous route cannot bias a later airport context.
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: items.slice(0, 18) }));
  } catch {}
}

function rescore(items: AviationNewsItem[], airports: string[]) {
  return items.map((item) => {
    const upper = item.title.toUpperCase();
    let extra = 0;
    for (const airport of airports) {
      const code = String(airport || '').trim().toUpperCase();
      if (code && upper.includes(code)) extra += 7;
    }
    return { ...item, relevance: Number(item.relevance || 0) + extra };
  });
}

function sortContextual(items: AviationNewsItem[], airports: string[], limit: number) {
  return rescore(items, airports)
    .sort((a, b) => b.relevance - a.relevance || String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    .slice(0, limit);
}

export async function loadAviationNews(airports: string[] = [], limit = 6): Promise<{ items: AviationNewsItem[]; stale: boolean }> {
  const cleanAirports = [...new Set(airports.map((item) => String(item || '').trim().toUpperCase()).filter(Boolean))];
  const cached = readCache();
  if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) {
    return { items: sortContextual(cached.items, cleanAirports, limit), stale: false };
  }

  const settled = await Promise.allSettled(FEEDS.map((feed) => fetchFeed(feed)));
  const fresh = dedupe(settled.flatMap((result) => result.status === 'fulfilled' ? result.value : []));

  if (fresh.length) {
    writeCache(fresh);
    return { items: sortContextual(fresh, cleanAirports, limit), stale: false };
  }

  if (cached?.items?.length) {
    return { items: sortContextual(cached.items, cleanAirports, limit), stale: true };
  }

  return { items: [], stale: true };
}

export const AVIATION_NEWS_SOURCE_NOTE = 'Notícias informativas. Fontes externas não substituem comunicações operacionais oficiais.';
