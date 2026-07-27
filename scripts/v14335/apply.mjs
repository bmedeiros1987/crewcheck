import fs from 'node:fs';

const VERSION = '14.3.35';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const locationContextSnippet = fs.readFileSync('scripts/v14335/location-context.snippet', 'utf8').trim();
const searchPlacesSnippet = fs.readFileSync('scripts/v14335/search-places.snippet', 'utf8').trim();
const departureReplySnippet = fs.readFileSync('scripts/v14335/departure-reply.snippet', 'utf8').trim();
const hotelsReplySnippet = fs.readFileSync('scripts/v14335/hotels-reply.snippet', 'utf8').trim();
const gymsReplySnippet = fs.readFileSync('scripts/v14335/gyms-reply.snippet', 'utf8').trim();
const hospitalsReplySnippet = fs.readFileSync('scripts/v14335/hospitals-reply.snippet', 'utf8').trim();
const pharmaciesReplySnippet = fs.readFileSync('scripts/v14335/pharmacies-reply.snippet', 'utf8').trim();
const locationHandlerSnippet = fs.readFileSync('scripts/v14335/location-handler.snippet', 'utf8').trim();

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14335] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertAfterRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14335] Âncora ausente: ${label}`);
  return source.replace(anchor, `${anchor}\n${value.trimEnd()}`);
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14335] Âncora ausente: ${label}`);
  return source.replace(anchor, `${value.trimEnd()}\n\n${anchor}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14335] Ponto de aplicação não localizado: ${label}`);
  return source.replace(before, after);
}

function replaceBlock(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim())) return source;
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14335] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return `${source.slice(0, start)}${replacement.trimEnd()}\n\n${source.slice(end)}`;
}

update('server.mjs', (source) => {
  let next = source;
  const importAnchor = "import { handleV139Route, handleV139Telegram } from './server/v139/index.mjs';";
  const locationImport = `import {
  conciergeLocationDistanceKm as conciergeLocationDistanceKmV14335,
  normalizeConciergeLocation as normalizeConciergeLocationV14335,
  conciergeLocationState as conciergeLocationStateV14335,
  resolveConciergeLocationLabel as resolveConciergeLocationLabelV14335,
  filterConciergePlacesByLocation as filterConciergePlacesByLocationV14335,
} from './server/v14335/concierge-location.mjs';`;
  next = insertAfterRequired(next, importAnchor, locationImport, 'import da política de localização');

  next = replaceBlock(next, 'async function conciergeDepartureReply(', 'async function conciergeSearchPlaces(', departureReplySnippet, 'Planejador de Saída no Telegram');
  next = replaceBlock(next, 'async function conciergeSearchPlaces(', 'function conciergePlaceLines(', searchPlacesSnippet, 'busca de locais por coordenadas');
  next = insertBeforeRequired(next, 'async function conciergeSearchPlaces(', locationContextSnippet, 'contexto de localização recente');
  next = replaceBlock(next, 'async function conciergeHotelsReply(', 'async function conciergeGymsReply(', hotelsReplySnippet, 'sugestões de hotéis');
  next = replaceBlock(next, 'async function conciergeGymsReply(', 'async function conciergeHospitalsReply(', gymsReplySnippet, 'busca de academias');
  next = replaceBlock(next, 'async function conciergeHospitalsReply(', 'function conciergeStayReply(', hospitalsReplySnippet, 'busca de hospitais');
  next = insertBeforeRequired(next, 'function conciergeStayReply(', pharmaciesReplySnippet, 'busca de farmácias');
  next = replaceBlock(next, 'async function handleTelegramLocation(', '// CrewCheck v13.7.15 — Telegram Link backend.', locationHandlerSnippet, 'recebimento de localização do Telegram');

  const hospitalDispatch = "  if (/^\\/(?:hospital|hospitais|prontoatendimento)(?:@\\S+)?\\b/i.test(value) || /\\b(hospital|pronto atendimento|pronto-socorro|emergência médica|upa)\\b/i.test(lower)) return conciergeHospitalsReply(snapshot);";
  const pharmacyDispatch = "  if (/^\\/(?:farmacia|farmacias|farmácia|farmácias)(?:@\\S+)?\\b/i.test(value) || /\\b(farm[aá]cia|drogaria|remédio perto|remedio perto)\\b/i.test(lower)) return conciergePharmaciesReply(snapshot);";
  next = insertAfterRequired(next, hospitalDispatch, pharmacyDispatch, 'intenção de farmácias');

  const oldLocationIntent = "  if (/onde.*(estou|localiza)|perto de mim/i.test(lower)) return snapshot?.preferences?.location ? 'Localização recebida. Use /academias, /hoteis ou /saida para consultar perto de você.' : 'Envie sua localização pelo clipe do Telegram para ativar busca próxima e Planejador de Saída.';";
  const newLocationIntent = "  if (/onde.*(estou|localiza)|perto de mim/i.test(lower)) { const state = conciergeLocationContextV14335(snapshot); return state.fresh ? `${state.message} Use /farmacias, /hospitais, /academias, /hoteis ou /saida.` : state.message; }";
  next = replaceRequired(next, oldLocationIntent, newLocationIntent, 'resposta de localização usada');

  next = next.replace('locationSupported: true, voiceSupported:', 'locationSupported: true, locationMaxAgeHours: 6, locationCityLabel: true, voiceSupported:');
  return next;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: localização real do Telegram com validade, cidade usada e busca segura de farmácias';`));
update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/crewcheck-cache-reset-[0-9-]+/g, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/currentRelease\s*=\s*'[^']+'/g, `currentRelease = '${VERSION}'`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`));
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`));
update('client/public/release.json', () => JSON.stringify({ version: VERSION, build: VERSION_DIGITS, channel: 'web', updatePolicy: 'automatic', notes: 'Telegram: localização real válida por 6h, cidade exibida e farmácias limitadas às coordenadas recentes.' }, null, 2) + '\n', { optional: true });

console.log(`[v14335] Telegram usa localização recente por 6h, mostra a cidade aplicada, bloqueia coordenadas vencidas e limita locais a 35 km. Versão ${VERSION}.`);
