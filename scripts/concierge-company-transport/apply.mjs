import fs from 'node:fs';
function update(file, transform) {
  const before = fs.readFileSync(file, 'utf8'), after = transform(before);
  if (after !== before) fs.writeFileSync(file, after);
}
function replace(source, before, after) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error('[concierge-company-transport] Missing anchor: ' + before.slice(0, 100));
  return source.replace(before, after);
}
update('server.mjs', source => {
  if (!source.includes("from './server/concierge/company-transport.mjs'")) source = "import { companyTransportReply } from './server/concierge/company-transport.mjs';\nimport { companyTransportIntent } from './shared/companyTransportIntent.mjs';\n" + source;
  const anchor = '  if (stayMenu.handled) return stayMenu.reply;';
  source = replace(source, anchor, anchor + '\n  const companyTransport = await companyTransportReply(text, profile);\n  if (companyTransport.handled) return companyTransport.reply;');
  source = replace(source, "    [{ text: '🗓 Minha escala' }, { text: '🧘 Rotina' }],", "    [{ text: '🗓 Minha escala' }, { text: '🧘 Rotina' }],\n    [{ text: 'Ônibus e vans da empresa' }],");
  source = replace(source, "    '/saida — Planejador de Saída',", "    '/saida — Planejador de Saída',\n    '/transporte_empresa — Ônibus e vans da empresa (referência prevista)',");
  source = replace(source, "'/radar','/saida','/metar'", "'/radar','/saida','/transporte_empresa','/metar'");
  source = replace(source, "{ command: 'hoteis', description: 'Meu pernoite e registros salvos' }", "{ command: 'transporte_empresa', description: 'Ônibus e vans da empresa' },\n    { command: 'hoteis', description: 'Meu pernoite e registros salvos' }");
  const start = source.indexOf('async function handleTelegramConciergeAsk('), end = source.indexOf('\nfunction ', start);
  if (start < 0 || end < 0) throw new Error('[concierge-company-transport] Missing app request handler');
  const request = source.slice(start, end);
  let scopedRequest = replace(request, "  if (body.location && typeof body.location === 'object') {", "  if (body.location && typeof body.location === 'object' && !companyTransportIntent(body.text || body.message || '')) {");
  scopedRequest = replace(scopedRequest, "  if (body.location && typeof body.location === 'object') snapshot =", "  if (body.location && typeof body.location === 'object' && !companyTransportIntent(body.text || body.message || '')) snapshot =");
  source = source.slice(0, start) + scopedRequest + source.slice(end);
  return source;
});
update('client/src/pages/Home.tsx', source => {
  if (!source.includes("from '@shared/companyTransportIntent.mjs'")) source = "import { companyTransportIntent } from '@shared/companyTransportIntent.mjs';\n" + source;
  const start = source.indexOf('async function askTelegramConcierge('), end = source.indexOf('\nasync function ', start + 1);
  if (start < 0 || end < 0) throw new Error('[concierge-company-transport] Missing client ask');
  const ask = source.slice(start, end);
  source = source.slice(0, start) + replace(ask, '  const currentLocation = loadFreshNearbyCurrentGeo(storage);', '  const currentLocation = companyTransportIntent(text) ? null : loadFreshNearbyCurrentGeo(storage);') + source.slice(end);
  const view = source.indexOf('function TelegramConciergeView(');
  if (view < 0) throw new Error('[concierge-company-transport] Missing app menu');
  source = source.slice(0, view) + replace(source.slice(view), "    ['/saida', 'Planejador de Saída'],", "    ['/saida', 'Planejador de Saída'],\n    ['/transporte_empresa', 'Ônibus e vans da empresa'],");
  return source;
});
