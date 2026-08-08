import fs from 'node:fs';

const VERSION = '14.3.90';
const file = 'server.mjs';
if (!fs.existsSync(file)) throw new Error('[v14390] server.mjs ausente.');
let source = fs.readFileSync(file, 'utf8');

const earlyFinish = `          if (item.ok && quality >= 88 && latencyMs <= timeoutMs) {
            clearTimeout(timer);
            finish();
          }
`;

if (source.includes(earlyFinish)) {
  source = source.replace(earlyFinish, '');
}

const raceStart = source.indexOf('async function runRadarRace(');
const raceEnd = source.indexOf('\nasync function handleRadar(', raceStart + 1);
if (raceStart < 0 || raceEnd < 0) throw new Error('[v14390] runRadarRace não localizado.');
const raceScope = source.slice(raceStart, raceEnd);

if (raceScope.includes('quality >= 88')) {
  throw new Error('[v14390] radar ainda encerra a corrida antes das demais fontes responderem.');
}
for (const required of [
  'const timer = setTimeout(finish, timeoutMs + 250);',
  'let pending = providers.length;',
  'pending -= 1;',
  'if (pending <= 0)',
  'const candidates = okResults.length ? okResults : results.filter(Boolean);',
]) {
  if (!raceScope.includes(required)) throw new Error(`[v14390] contrato da corrida multi-fonte mudou: ${required}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14390] CrewCheck ${VERSION}: radar aguarda as fontes configuradas dentro da janela operacional antes de escolher o melhor resultado.`);
