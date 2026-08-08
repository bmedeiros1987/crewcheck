import fs from 'node:fs';

const source = fs.readFileSync('server.mjs', 'utf8');
const start = source.indexOf('async function runRadarRace(');
const end = source.indexOf('\nasync function handleRadar(', start + 1);
if (start < 0 || end < 0) throw new Error('runRadarRace não localizado.');
const scope = source.slice(start, end);

if (scope.includes('quality >= 88')) throw new Error('Radar ainda encerra cedo por score antes das demais fontes responderem.');
for (const required of [
  'const timer = setTimeout(finish, timeoutMs + 250);',
  'let pending = providers.length;',
  'pending -= 1;',
  'if (pending <= 0)',
  'const candidates = okResults.length ? okResults : results.filter(Boolean);',
]) {
  if (!scope.includes(required)) throw new Error(`Contrato multi-fonte ausente: ${required}`);
}

console.log('CrewCheck v14.3.90 radar wait-all regression OK');
