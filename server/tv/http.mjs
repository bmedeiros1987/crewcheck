import { createHash, randomUUID } from "node:crypto";
import { createDeviceService } from "./devices.mjs";
import { createMysqlTvStore } from "./mysql-store.mjs";
import { createTvHandler } from "./routes.mjs";
import { createNewsGateway } from "./news.mjs";
import { fetchRssItems } from "./rss.mjs";
import { createTvWeatherProvider, enrichTvSnapshotWeather } from "./weather.mjs";

export function createTvHttpBridge({
  getDatabase,
  authenticateAccount,
  loadActiveRoster,
  readBody,
}) {
  let handler;
  const readWeather = createTvWeatherProvider();
  const readNews = createNewsGateway({
    fetchItems: fetchRssItems,
    sources: [
      {
        id: "aeroflap",
        label: "Aeroflap",
        kind: "syndicated",
        url: "https://www.aeroflap.com.br/feed/",
        hosts: ["www.aeroflap.com.br", "aeroflap.com.br"],
        maxArticleAgeMs: 3 * 86400000,
      },
      {
        id: "aeroin",
        label: "AEROIN",
        kind: "syndicated",
        url: "https://aeroin.net/feed/",
        hosts: ["aeroin.net", "www.aeroin.net"],
        maxArticleAgeMs: 3 * 86400000,
      },
    ],
  });
  return async (req, res, url) => {
    if (!url.pathname.startsWith("/api/tv/")) return false;
    const send = (status, body) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Vary: "Origin",
      });
      res.end(JSON.stringify(body));
    };
    if (process.env.CREWCHECK_TV_ENABLED !== "true") {
      send(404, { error: "unavailable" });
      return true;
    }
    const origin = String(req.headers.origin || "");
    const accountRoute = [
      "/api/tv/approve",
      "/api/tv/revoke",
      "/api/tv/devices",
    ].includes(url.pathname);
    const allowed = accountRoute
      ? ["https://crewcheck.online"]
      : [
          "https://crewcheck.online",
          "https://appassets.androidplatform.net",
          "null",
        ];
    if (origin && !allowed.includes(origin)) {
      send(403, { error: "origin_not_allowed" });
      return true;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization,Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      send(204, null);
      return true;
    }
    try {
      if (!handler) {
        const { projectRoster } = await import("../../dist/tv-server/core.mjs");
        const store = createMysqlTvStore(getDatabase);
        const devices = createDeviceService({
          store,
          pairingOrigin: "https://crewcheck.online",
        });
        handler = createTvHandler({
          enabled: true,
          devices,
          authenticateAccount,
          rateLimit: async (ip, path) =>
            store.transaction((state) => {
              state.limits ??= {};
              const now = Date.now();
              for (const [k, v] of Object.entries(state.limits))
                if (v.until <= now) delete state.limits[k];
              const key = createHash("sha256")
                .update(`${ip}:${path}`)
                .digest("hex");
              if (
                !state.limits[key] &&
                Object.keys(state.limits).length >= 10000
              )
                return false;
              const bucket = (state.limits[key] ??= {
                count: 0,
                until: now + 60000,
              });
              return (
                ++bucket.count <=
                (path.endsWith("/pair") || path.endsWith("/approve") ? 10 : 60)
              );
            }),
          loadProjection: async (auth) => {
            const data = await loadActiveRoster(auth.userId);
            if (!data?.roster) return null;
            const now = new Date();
            const snapshot = projectRoster(data.roster, {
              deviceId: auth.deviceId,
              snapshotId: randomUUID(),
              sourceVersion: data.sourceVersion,
              month: `${data.roster.year}-${String(data.roster.month).padStart(2, "0")}`,
              privacy: auth.privacy,
              generatedAt: now.toISOString(),
              expiresAt: new Date(now.getTime() + 60000).toISOString(),
              now,
            });
            return enrichTvSnapshotWeather(snapshot, readWeather, { now: now.getTime() });
          },
          // Editorial only: headlines come from a source-provided RSS feed,
          // remain isolated from operational truth, and fail closed when unavailable.
          news: async () => readNews(),
        });
      }
      const token =
        String(req.headers.authorization || "").match(
          /^Bearer\s+(.+)$/i,
        )?.[1] || "";
      const body = req.method === "POST" ? await readBody(req, 4096) : {};
      const result = await handler({
        method: req.method,
        path: url.pathname,
        token,
        body,
        ip: req.socket.remoteAddress || "unknown",
      });
      send(result.status, result.body);
    } catch {
      send(503, { error: "temporarily_unavailable" });
    }
    return true;
  };
}
