import fs from 'node:fs';

const serverPath = 'server.mjs';
if (!fs.existsSync(serverPath)) throw new Error('[v14.3.22-render-hotfix] server.mjs ausente.');

let source = fs.readFileSync(serverPath, 'utf8');
const patched = [
  'function conciergePlaceLines(places = []) {',
  '  return places.map((place, index) => {',
  "    const distance = Number.isFinite(place.distanceKm) ? ` · ${place.distanceKm < 1 ? `${Math.round(place.distanceKm * 1000)} m` : `${place.distanceKm.toFixed(1).replace('.', ',')} km`}` : '';",
  "    return `${index + 1}. ${place.name}${distance}${place.rating ? ` · nota ${place.rating}` : ''}${place.openNow === true ? ' · aberto agora' : place.openNow === false ? ' · fechado agora' : ''}\\n${place.address || place.mapsUrl || ''}`;",
  "  }).join('\\n\\n');",
  '}',
].join('\n');

if (!source.includes(patched)) {
  const pattern = /function conciergePlaceLines\(places = \[\]\) \{[\s\S]*?\n\}/;
  if (!pattern.test(source)) throw new Error('[v14.3.22-render-hotfix] conciergePlaceLines não localizado.');
  source = source.replace(pattern, patched);
  fs.writeFileSync(serverPath, source, 'utf8');
}

console.log('[v14.3.22-render-hotfix] Formatação de locais normalizada para aplicação idempotente no Render.');
