import fs from 'node:fs';
const path = 'server.mjs';
let source = fs.readFileSync(path, 'utf8');
if (!source.includes("from './server/concierge/pharmacy-reference.mjs'")) {
  source = "import { pharmacyReferenceReply } from './server/concierge/pharmacy-reference.mjs';\n" + source;
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
    lookup: query => conciergeSearchPlaces(query, '', null, 4),
    nearby: point => conciergeSearchNearbyHealthPlacesAtReference(['pharmacy'], point, 6),
    placeLines: conciergePlaceLines,
    routeLines: conciergeHealthRouteLines,
  });
  if (poi.handled) return conciergeHumanizeReplyV14408(poi.reply, text);`);
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
fs.writeFileSync(path, source);
console.log('[concierge-poi] scoped hotel search reference; GPS and health query restrictions preserved');
