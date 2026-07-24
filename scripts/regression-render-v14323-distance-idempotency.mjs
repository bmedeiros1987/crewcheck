import fs from 'node:fs';

const prepare = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
if (!prepare.includes("await import('../v14322-render-hotfix/apply.mjs');")) {
  throw new Error('Render hotfix não conectado antes do v14.3.23.');
}

const hotfix = fs.readFileSync('scripts/v14322-render-hotfix/apply.mjs', 'utf8');
for (const marker of [
  'function conciergePlaceLines(places = [])',
  'Number.isFinite(place.distanceKm)',
  'Formatação de locais normalizada',
]) {
  if (!hotfix.includes(marker)) throw new Error(`Marcador ausente no hotfix Render: ${marker}`);
}

console.log('[regression-render-v14323] Preparação do Concierge protegida contra divergência de formatação no Render.');
