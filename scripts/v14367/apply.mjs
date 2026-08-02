import fs from 'node:fs';

const VERSION = '14.3.67';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[v14367] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14367] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

update('client/src/lib/aimsParser.ts', (source) => {
  let next = source;
  next = replaceRequired(
    next,
    "'PFB','PIN','PMW'",
    "'PFB','PHB','PIN','PMW'",
    'PHB na lista de aeroportos AIMS',
  );
  next = replaceRequired(
    next,
    '/^(ASB|RES|HSB|HSBE|RCFI|CRM|CRMB|CRMBSB|CBF|EMER|MT|C\\d{2,3}F)$/',
    '/^(ASB|RES|HSB|HSBE|RCFI|CRM|CRMB|CRMBSB|CBF|EMER|MCK|MCK320|MCK_SS|MT|C\\d{2,3}F)$/',
    'MCK como atividade operacional de solo',
  );
  return next;
});

update('client/src/lib/airports.ts', (source) => {
  if (source.includes("PHB: 'Parnaíba'")) return source;
  return replaceRequired(source, "  PMW: 'Palmas',", "  PHB: 'Parnaíba',\n  PMW: 'Palmas',", 'cidade PHB');
});

update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'Escala reconhece MCK como treinamento em solo e PHB como Parnaíba/PI.',
}, null, 2)}\n`);

// A regressão v14.3.48 protege a política de voz, não deve congelar release.json em 14.3.48.
// Quando releases posteriores são preparadas, aceite qualquer semver >= 14.3.48 sem tocar na política de voz.
update('scripts/regression-v14-3-48-elevenlabs-dual-voice.mjs', (source) => {
  const stale = "assert.ok(read('client/public/release.json').includes('14.3.48'), 'release.json deve anunciar v14.3.48');";
  const compatible = "const releaseVersion = String(JSON.parse(read('client/public/release.json'))?.version || '');\nassert.match(releaseVersion, /^\\d+\\.\\d+\\.\\d+$/, 'release.json deve anunciar uma versão semver válida');\nassert.ok(releaseVersion.localeCompare('14.3.48', undefined, { numeric: true, sensitivity: 'base' }) >= 0, 'release.json não pode regredir abaixo de v14.3.48');";
  if (source.includes(compatible)) return source;
  if (!source.includes(stale)) throw new Error('[v14367] Gate legado de release.json da regressão de voz não localizado.');
  return source.replace(stale, compatible);
});

console.log(`[v14367] CrewCheck ${VERSION}: MCK em solo e PHB/Parnaíba reconhecidos.`);
