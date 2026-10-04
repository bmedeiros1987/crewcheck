import fs from 'node:fs';
const path = 'server.mjs';
let source = fs.readFileSync(path, 'utf8');
// The app endpoint loads the linked Telegram chatId for account storage. Stamp
// origin at the trusted call site instead of inferring it from that stored link.
const appCall = "buildTelegramConciergeReply(String(body.text || body.message || ''), profile, snapshot)";
const scopedAppCall = "buildTelegramConciergeReply(String(body.text || body.message || ''), { ...profile, channel: 'app' }, snapshot)";
if (!source.includes(scopedAppCall)) {
  if (!source.includes(appCall)) throw new Error('[concierge-poi] app reply origin call missing');
  source = source.replace(appCall, scopedAppCall);
}
if (!source.includes("from './server/concierge/pharmacy-reference.mjs'")) {
  source = "import { pharmacyReferenceReply } from './server/concierge/pharmacy-reference.mjs';\n" + source;
}
if (source.includes('const poi = await pharmacyReferenceReply') && !source.includes('gps: conciergeLocationContextV14335')) {
  const start = source.indexOf('  const poi = await pharmacyReferenceReply');
  const end = source.indexOf('\n', source.indexOf('if (poi.handled) return', start));
  if (start < 0 || end < 0) throw new Error('[concierge-poi] old reference adapter boundary missing');
  source = source.slice(0, start) + source.slice(end + 1);
}
if (!source.includes('const poi = await pharmacyReferenceReply')) {
  const anchor = '  let currentSnapshot = command.snapshot || snapshot;';
  if (!source.includes(anchor)) throw new Error('[concierge-poi] final reply wrapper missing');
  source = source.replace(anchor, `${anchor}
  const poi = await pharmacyReferenceReply(text, profile, currentSnapshot, {
    save: (owner, preferences) => conciergeSaveSnapshotAsync(owner, null, { preferences }),
    load: conciergeLoadSnapshot,
    stays: conciergeStayRecords,
    city: airport => WEATHER_AIRPORT_POINTS[airport]?.city || '',
    gpsFresh: value => conciergeLocationContextV14335(value).fresh,
    gps: conciergeLocationContextV14335,
    lookup: query => conciergeSearchPlaces(query, '', null, 4),
    nearby: (point, kind) => conciergeSearchNearbyHealthPlacesAtReference([kind === 'hospital' ? 'hospital' : 'pharmacy'], point, 20),
  });
  if (poi.handled) return profile.channel === 'app' && poi.placeResults ? { reply: poi.reply, placeResults: poi.placeResults } : conciergeHumanizeReplyV14408(poi.reply, text);`);
}
if (!source.includes('async function conciergeSearchNearbyHealthPlacesAtReference(')) {
  // Reuse the same restricted Nearby query, without disguising a hotel as GPS.
  const boundary = `  const current = locationState.location;
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {`;
  if (!source.includes(boundary)) throw new Error('[concierge-poi] canonical nearby helper missing');
  source = source.replace(boundary, `  return conciergeSearchNearbyHealthPlacesAtReference(includedTypes, locationState.location, maxResultCount);
}
async function conciergeSearchNearbyHealthPlacesAtReference(includedTypes, current, maxResultCount = 6) {
  const key = mapsServerKey();
  if (!key || typeof current?.latitude !== 'number' || typeof current?.longitude !== 'number' || !Number.isFinite(current.latitude) || !Number.isFinite(current.longitude) || Math.abs(current.latitude) > 90 || Math.abs(current.longitude) > 180) return [];
  try {
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {`);
}
// These existing Nearby fields identify specialized/closed businesses without a new provider call.
const nearbyStart = source.indexOf('async function conciergeSearchNearbyHealthPlacesAtReference(');
const nearbyEnd = source.indexOf('async function conciergePharmaciesReply(', nearbyStart);
if (nearbyStart < 0 || nearbyEnd < 0) throw new Error('[concierge-poi] nearby projection boundary missing');
let nearby = source.slice(nearbyStart, nearbyEnd);
if (!nearby.includes('places.location,places.types,places.businessStatus')) nearby = nearby.replace('places.currentOpeningHours.openNow,places.location', 'places.currentOpeningHours.openNow,places.location,places.types,places.businessStatus');
if (!nearby.includes('types: Array.isArray(place?.types)')) {
  nearby = nearby.replace("        name: place?.displayName?.text || 'Local',", "        name: place?.displayName?.text || 'Local',\n        types: Array.isArray(place?.types) ? place.types : [],\n        businessStatus: String(place?.businessStatus || ''),");
}
source = source.slice(0, nearbyStart) + nearby + source.slice(nearbyEnd);
// Only the trusted app channel receives structured cards. Messaging adapters keep plain text.
const appResponse = /ok: true,\s*reply,\s*linked: profile\.linked/;
const structuredResponse = "ok: true, reply: typeof reply === 'string' ? reply : reply.reply, ...(reply?.placeResults ? { placeResults: reply.placeResults } : {}), linked: profile.linked";
if (!source.includes(structuredResponse)) {
  if (!appResponse.test(source)) throw new Error('[concierge-poi] app response boundary missing');
  source = source.replace(appResponse, structuredResponse);
}
fs.writeFileSync(path, source);
console.log('[concierge-poi] scoped hotel search reference; GPS and health query restrictions preserved');


// Compose only the Concierge answer area; no shared Pernoite or mobile lifecycle change.
const homePath = 'client/src/pages/Home.tsx';
let home = fs.readFileSync(homePath, 'utf8');
if (!home.includes("from '@/components/concierge/ConciergePlaceResults'")) {
  home = "import { ConciergePlaceResults, isConciergePlaceResults, type ConciergePlaceResultsData } from '@/components/concierge/ConciergePlaceResults';\n" + home;
}
if (!home.includes('const [placeResults, setPlaceResults]')) {
  const state = "  const [answer, setAnswer] = useState('');";
  if (!home.includes(state)) throw new Error('[concierge-poi] Concierge answer state missing');
  home = home.replace(state, state + "\n  const [placeResults, setPlaceResults] = useState<ConciergePlaceResultsData | null>(null);");
}
if (!home.includes('setPlaceResults(isConciergePlaceResults(payload.placeResults)')) {
  const answer = "      setAnswer(String(payload.reply || 'Sem resposta.'));";
  if (!home.includes(answer)) throw new Error('[concierge-poi] Concierge reply assignment missing');
  home = home.replace(answer, answer + "\n      setPlaceResults(isConciergePlaceResults(payload.placeResults) ? payload.placeResults : null);");
  home = home.replace("    setBusy('ask');", "    setBusy('ask');\n    setPlaceResults(null);");
}
const oldAnswer = `{answer && <article className="cz-roster-card"><div className="cz-roster-main"><span className="cz-roster-icon"><Wifi/></span><div className="cz-roster-copy"><h3>Resposta do Concierge</h3><p style={{ whiteSpace: 'pre-wrap' }}>{answer}</p></div></div></article>}`;
const newAnswer = `{placeResults ? <ConciergePlaceResults results={placeResults} onMore={() => ask(placeResults.moreQuery)} busy={busy === 'ask'}/> : ${oldAnswer.slice(1, -1)}}`;
if (!home.includes('<ConciergePlaceResults results={placeResults}')) {
  if (!home.includes(oldAnswer)) throw new Error('[concierge-poi] Concierge answer view missing');
  home = home.replace(oldAnswer, newAnswer);
}
fs.writeFileSync(homePath, home);
