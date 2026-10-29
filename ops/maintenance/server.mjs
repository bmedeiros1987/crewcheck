// Maintenance entry for an outage of the main service. Independent of server.mjs: no secrets,
// no database, no timers, no outbound calls, no dependencies. Every route answers 503 with
// no-store, so nothing (browsers, the PWA service worker, the Android WebView, monitors) treats
// it as the app or keeps it after the service is restored. /api/* answers JSON; the platform
// health check uses /__maintenance/health (200) while /api/health stays an honest 503.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const page = fs.readFileSync(new URL('./index.html', import.meta.url));
const message = 'Sistema em manutenção. Estamos trabalhando para restabelecer o acesso.';
const common = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Content-Type-Options': 'nosniff' };

export function handle(req, res) {
  const route = new URL(req.url || '/', 'http://maintenance.invalid').pathname;
  const body = route === '/__maintenance/health' ? JSON.stringify({ ok: true, maintenance: true })
    : route.startsWith('/api/') ? JSON.stringify({ ok: false, maintenance: true, message })
    : page;
  const json = typeof body === 'string';
  res.writeHead(route === '/__maintenance/health' ? 200 : 503, { ...common, 'Content-Type': json ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(req.method === 'HEAD' ? undefined : body);
}

export function start(port = Number(process.env.PORT || 10000)) {
  const server = http.createServer(handle);
  server.listen(port, () => console.log(`[maintenance] listening on ${port}`));
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) start();
