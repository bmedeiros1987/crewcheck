import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('[v1427] server.mjs não encontrado.');
let server = fs.readFileSync(serverPath, 'utf8');

const releasePayload = "{ ok: true, app: 'CrewCheck', version: '14.2.7', release: String(process.env.RENDER_GIT_COMMIT || process.env.COMMIT_REF || process.env.SOURCE_VERSION || 'local'), floatingShortcuts: false, reliability: true, platform: true, encoding: 'UTF-8', defaultTimezone: 'America/Sao_Paulo' }";

if (!server.includes("url.pathname === '/api/release'")) {
  const anchor = "  if (url.pathname === '/api/health') return sendJson(res, 200,";
  if (!server.includes(anchor)) throw new Error('[v1427] rota /api/health não encontrada.');
  server = server.replace(anchor, `  if (url.pathname === '/api/release') return sendJson(res, 200, ${releasePayload});\n${anchor}`);
}

server = server.replace(
  /  if \(url\.pathname === '\/api\/health'\) return sendJson\(res, 200, \{[^\n]*\}\);/,
  `  if (url.pathname === '/api/health') return sendJson(res, 200, ${releasePayload});`,
);

if (!server.includes("version: '14.2.7'")) throw new Error('[v1427] versão pública não foi atualizada.');
if (!server.includes("floatingShortcuts: false")) throw new Error('[v1427] indicador dos atalhos não foi aplicado.');
fs.writeFileSync(serverPath, server, 'utf8');

const appPath = 'client/src/App.tsx';
if (fs.existsSync(appPath)) {
  let app = fs.readFileSync(appPath, 'utf8');
  app = app.replace(/crewcheck_last_loaded_version', '[^']+'/g, "crewcheck_last_loaded_version', '14.2.7'");
  fs.writeFileSync(appPath, app, 'utf8');
}

console.log('[v1427] Release 14.2.7 identificável por /api/release e /api/health.');
await import('../v1428/apply.mjs');
