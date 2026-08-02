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

console.log(`[v14367] CrewCheck ${VERSION}: MCK em solo e PHB/Parnaíba reconhecidos.`);
