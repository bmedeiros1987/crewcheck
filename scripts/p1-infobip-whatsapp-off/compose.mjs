export function composeHeldInfobipRoute(source) {
  const imported = "import { createInfobipWhatsAppHost } from './server/infobip-whatsapp-host.mjs';";
  const instance = 'const infobipWhatsAppRuntime = createInfobipWhatsAppHost();';
  const startup = 'await infobipWhatsAppRuntime.start();';
  const metaImport = "import { configureWhatsAppConcierge, handleWhatsAppRoute } from './server/whatsapp.mjs';";
  const metaRoute = '  if (await handleWhatsAppRoute(req, res, url)) return;';
  const route = '  if (await infobipWhatsAppRuntime.handleRoute(req, res, url)) return;';
  if (!source.includes(metaImport) || !source.includes(metaRoute) || !source.includes('configureWhatsAppConcierge(async')) throw Error('INFOBIP_CANONICAL_ANCHOR_MISSING');
  let next = source.replace("import { createInfobipWhatsAppRuntime } from './server/infobip-whatsapp-runtime.mjs';", imported)
    .replace('const infobipWhatsAppRuntime = createInfobipWhatsAppRuntime();', instance);
  if (!next.includes(imported)) next = next.replace(metaImport, `${metaImport}\n${imported}\n${instance}`);
  if (!next.includes(route)) next = next.replace(metaRoute, `${route}\n${metaRoute}`);
  if (!next.includes(startup)) next = next.replace('\nhttp.createServer(async (req, res) => {', `\n${startup}\n\nhttp.createServer(async (req, res) => {`);
  for (const exact of [imported, instance, route, startup]) {
    if (next.split(exact).length !== 2) throw Error('INFOBIP_CANONICAL_DUPLICATE');
  }
  if (next.indexOf(startup) < next.lastIndexOf('configureWhatsAppConcierge(async') ||
      next.indexOf(startup) > next.indexOf('\nhttp.createServer(async (req, res) => {')) throw Error('INFOBIP_CANONICAL_STARTUP_ORDER');
  return next;
}

