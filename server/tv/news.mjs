// Provider adapters return normalized editorial items. URLs are constrained on
// both collection and article output; personalized context never leaves gateway.
function categoryFor(title=''){
  const text=String(title).toLowerCase();
  if(/chuva|temporal|tempest|vento|clima|meteor|nevoa|névoa/.test(text))return 'weather';
  if(/anac|rbac|regula|norma|decea|icao|oaci|faa|easa/.test(text))return 'regulation';
  if(/acidente|incidente|segurança|seguranca|safety|cenipa/.test(text))return 'safety';
  if(/aeroporto|terminal|pista|slot|gate|portão|portao/.test(text))return 'airport';
  if(/latam|gol|azul|companhia|airline|rota|voo|flight/.test(text))return 'airline';
  return 'industry';
}
export function createNewsGateway({ sources, fetchItems, now = Date.now }) {
  const cache = new Map();
  const ttl = 900000,
    maxAge = 86400000;
  let inFlight;
  async function collect() {
    await Promise.allSettled(
      sources.map(async (source) => {
        const previous = cache.get(source.id);
        if (previous && now() - previous.at < ttl) return;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        try {
          const feed = new URL(source.url);
          if (
            feed.protocol !== "https:" ||
            !source.hosts.includes(feed.hostname)
          )
            throw new Error("Disallowed source");
          const raw = await Promise.race([
            fetchItems(source, {
              signal: controller.signal,
              redirect: "error",
            }),
            new Promise((_, reject) =>
              controller.signal.addEventListener(
                "abort",
                () => reject(new Error("timeout")),
                { once: true },
              ),
            ),
          ]);
          const items = raw.slice(0, 100).flatMap((item) => {
            try {
              const url = new URL(item.url),
                date = Date.parse(item.publishedAt);
              if (
                url.protocol !== "https:" ||
                !source.hosts.includes(url.hostname) ||
                !Number.isFinite(date) ||
                date > now() ||
                now() - date > Number(source.maxArticleAgeMs || 3 * 86400000)
              )
                return [];
              url.hash = "";
              for (const key of [...url.searchParams.keys()])
                if (key.startsWith("utm_")) url.searchParams.delete(key);
              const title = String(item.title ?? "")
                .replace(/<[^>]*>/g, "")
                .trim()
                .slice(0, 240);
              if (!title) return [];
              return [
                {
                  id: url.href,
                  url: url.href,
                  title,
                  publishedAt: new Date(date).toISOString(),
                  source: source.label || source.id,
                  sourceId: source.id,
                  sourceKind: source.kind || "syndicated",
                  category: categoryFor(title),
                },
              ];
            } catch {
              return [];
            }
          });
          cache.set(source.id, { at: now(), items });
        } finally {
          clearTimeout(timer);
        }
      }),
    );
  }
  return async function read() {
    if (!inFlight)
      inFlight = collect().finally(() => {
        inFlight = null;
      });
    await inFlight;
    const seen = new Set();
    const items = [];
    for (const source of sources) {
      const entry = cache.get(source.id);
      if (!entry || now() - entry.at > maxAge) continue;
      for (const item of entry.items) {
        const key = item.title.toLocaleLowerCase().replace(/\s+/g, " ");
        if (seen.has(item.url) || seen.has(key)) continue;
        seen.add(item.url);
        seen.add(key);
        items.push({
          ...item,
          freshness: now() - entry.at >= ttl ? "stale" : "current",
        });
      }
    }
    return {
      generatedAt: new Date(now()).toISOString(),
      stale: !items.length || items.some((x) => x.freshness === "stale"),
      items: items.slice(0, 6),
    };
  };
}
