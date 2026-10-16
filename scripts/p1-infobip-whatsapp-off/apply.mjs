import fs from 'node:fs';

export function composeHeldInfobipRoute(source) {
  const imported = "import { createHeldInfobipWhatsAppRuntime } from './server/infobip-whatsapp-runtime.mjs';";
  const instance = 'const infobipWhatsAppRuntime = createHeldInfobipWhatsAppRuntime();';
  const metaImport = "import { configureWhatsAppConcierge, handleWhatsAppRoute } from './server/whatsapp.mjs';";
  const metaRoute = '  if (await handleWhatsAppRoute(req, res, url)) return;';
  const route = '  if (await infobipWhatsAppRuntime.handleRoute(req, res, url)) return;';
  if (!source.includes(metaImport) || !source.includes(metaRoute)) throw Error('INFOBIP_CANONICAL_ANCHOR_MISSING');
  let next = source;
  if (!next.includes(imported)) next = next.replace(metaImport, `${metaImport}\n${imported}\n${instance}`);
  if (!next.includes(route)) next = next.replace(metaRoute, `${route}\n${metaRoute}`);
  for (const exact of [imported, instance, route]) {
    if (next.split(exact).length !== 2) throw Error('INFOBIP_CANONICAL_DUPLICATE');
  }
  return next;
}

const file = 'server.mjs', before = fs.readFileSync(file, 'utf8');
const after = composeHeldInfobipRoute(before);
if (after !== before) fs.writeFileSync(file, after);
console.log('[infobip-whatsapp-off] sealed OFF runtime composed; no configuration or I/O');
