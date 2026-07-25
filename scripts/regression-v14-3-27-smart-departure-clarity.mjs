import fs from 'node:fs';

const apply = fs.readFileSync('scripts/v14327/apply.mjs', 'utf8');
const css = fs.readFileSync('client/src/components/v14327/smart-departure-clarity.css', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

const required = [
  [apply, "rawLiveMinutes >= 5 && rawLiveMinutes <= 300", 'limite de rota incompatível'],
  [apply, "weekday: 'long'", 'dia da saída'],
  [apply, 'Sair em {leaveDayLabel}', 'rótulo de data'],
  [apply, 'cz-depart-detail', 'detalhes separados'],
  [apply, 'cz-depart-warning', 'aviso de rota incompatível'],
  [css, '.cz-depart-when', 'layout da data'],
  [css, '.cz-depart-detail', 'layout sem sobreposição'],
  [chain, "await import('../v14327/apply.mjs');", 'patch conectado à preparação'],
];

for (const [source, marker, label] of required) {
  if (!source.includes(marker)) throw new Error(`v14.3.27: regressão em ${label}`);
}

console.log('v14.3.27 smart departure clarity regression: OK');
