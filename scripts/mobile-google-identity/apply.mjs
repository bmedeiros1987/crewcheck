import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('[mobile-google-identity] server.mjs não localizado.');
let server = fs.readFileSync(serverPath, 'utf8');
const importLine = "import { handleGoogleIdentityRoute } from './server/mobile/google-identity-oidc.mjs';";
if (!server.includes(importLine)) {
  const anchor = "import { handleGoogleCalendarOAuthRoute, googleCalendarOAuthReliability } from './server/v1405/google-calendar-oauth.mjs';";
  if (!server.includes(anchor)) throw new Error('[mobile-google-identity] import Calendar canônico não localizado após preparação v14.0.5.');
  server = server.replace(anchor, `${anchor}\n${importLine}`);
}
if (!server.includes('handleGoogleIdentityRoute(req, res, url)')) {
  const routeAnchor = '  if (await handleGoogleCalendarOAuthRoute(req, res, url, { identity: cc1371Verify(cc1371RequestToken(req)), authRequired: cc1371AuthRequired() })) return;';
  if (!server.includes(routeAnchor)) throw new Error('[mobile-google-identity] rota Calendar canônica não localizada.');
  server = server.replace(routeAnchor, `${routeAnchor}\n  if (await handleGoogleIdentityRoute(req, res, url)) return;`);
}
fs.writeFileSync(serverPath, server, 'utf8');

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (path === 'package.json') {
    data.scripts ||= {};
    data.scripts['regression:mobile:google-identity'] = 'node scripts/v139/apply.mjs && node scripts/regression-mobile-google-identity.mjs';
  }
  fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

console.log('[mobile-google-identity] contrato OIDC Google separado do Calendar aplicado.');
