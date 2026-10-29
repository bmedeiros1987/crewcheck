export function composeHeldInfobipRoute(source) {
  const imported = "import { createInfobipWhatsAppSingleTestHost as createInfobipWhatsAppHost, createInfobipRenderHttpServer } from './server/infobip-whatsapp-single-test.mjs';";
  const instance = 'const infobipWhatsAppRuntime = createInfobipWhatsAppHost();';
  const startup = 'await infobipWhatsAppRuntime.start(infobipHttpServer);';
  const server = 'const infobipHttpServer = createInfobipRenderHttpServer(async (req, res) => {';
  const listen = 'infobipHttpServer.listen(port, () => {';
  const metaImport = "import { configureWhatsAppConcierge, handleWhatsAppRoute } from './server/whatsapp.mjs';";
  const metaRoute = '  if (await handleWhatsAppRoute(req, res, url)) return;';
  const route = '  if (await infobipWhatsAppRuntime.handleRoute(req, res, url)) return;';
  if (!source.includes(metaImport) || !source.includes(metaRoute) || !source.includes('configureWhatsAppConcierge(async')) throw Error('INFOBIP_CANONICAL_ANCHOR_MISSING');
  let next = source.replace("import { createInfobipWhatsAppApplicationHost as createInfobipWhatsAppHost, createInfobipRenderHttpServer } from './server/infobip-whatsapp-application.mjs';", imported)
    .replace("import { createInfobipWhatsAppRuntime } from './server/infobip-whatsapp-runtime.mjs';", imported)
    .replace("import { createInfobipWhatsAppHost } from './server/infobip-whatsapp-host.mjs';", imported)
    .replace("import { createInfobipWhatsAppHost, createInfobipRenderHttpServer } from './server/infobip-whatsapp-host.mjs';", imported)
    .replace('const infobipWhatsAppRuntime = createInfobipWhatsAppRuntime();', instance)
    .replace('await infobipWhatsAppRuntime.start();\n\n', '');
  if (!next.includes(imported)) next = next.replace(metaImport, `${metaImport}\n${imported}\n${instance}`);
  if (!next.includes(route)) next = next.replace(metaRoute, `${route}\n${metaRoute}`);
  if (!next.includes(server)) next = next.replace('http.createServer(async (req, res) => {', server);
  if (!next.includes(startup)) next = next.replace('}).listen(port, () => {', `});\n${startup}\n${listen}`);
  for (const exact of [imported, instance, route, server, startup, listen]) {
    if (next.split(exact).length !== 2) throw Error('INFOBIP_CANONICAL_DUPLICATE');
  }
  if (next.indexOf(startup) < next.lastIndexOf('configureWhatsAppConcierge(async') ||
      next.indexOf(startup) < next.indexOf(server) || next.indexOf(startup) > next.indexOf(listen)) throw Error('INFOBIP_CANONICAL_STARTUP_ORDER');
  const restrictedImport="import {restrictConciergeSnapshotWrite,isConciergeConversationWritesOnly} from './server/concierge-read-only-scope.mjs';";
  if(!next.includes(restrictedImport))next=restrictedImport+'\n'+next;
  const saveAnchor='async function conciergeSaveSnapshotAsync(profile = {}, roster = null, metadata = {}) {';
  const guard="\n  const restrictedWrite = restrictConciergeSnapshotWrite(profile, roster, metadata);\n  if (restrictedWrite) {\n    if (!restrictedWrite.metadata) return conciergeSnapshotForProfile(profile) || conciergeLoadSnapshot(profile);\n    roster = null; metadata = restrictedWrite.metadata;\n  }";
  if(!next.includes('const restrictedWrite = restrictConciergeSnapshotWrite(')) {
    if(!next.includes(saveAnchor))throw Error('INFOBIP_READ_ONLY_SAVE_ANCHOR_MISSING');
    next=next.replace(saveAnchor,saveAnchor+guard);
  }
  const identityAnchor="async function conciergeIdentityFlow(text = '', profile = {}, snapshot = null) {";
  const identityGuard="\n  if (isConciergeConversationWritesOnly(profile)) return {handled:false,snapshot};";
  if(!next.includes(identityGuard.trim())) {
    if(!next.includes(identityAnchor))throw Error('INFOBIP_READ_ONLY_IDENTITY_ANCHOR_MISSING');
    next=next.replace(identityAnchor,identityAnchor+identityGuard);
  }
  return next;
}
