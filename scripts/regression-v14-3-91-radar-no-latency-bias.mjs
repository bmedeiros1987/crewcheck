import fs from 'node:fs';

const source = fs.readFileSync('server.mjs', 'utf8');
const start = source.indexOf('function scoreRadar(');
const end = source.indexOf('\nasync function jsonFetch(', start + 1);
if (start < 0 || end < 0) throw new Error('scoreRadar não localizado.');
const scope = source.slice(start, end);

if (/latencyMs|latency\s*</.test(scope)) throw new Error('Latência de rede ainda influencia scoreRadar.');
for (const required of [
  'if (item.gate) score += 16;',
  'if (item.status && !/monitorando|aguardando/i.test(String(item.status))) score += 14;',
  'return Math.max(0, Math.min(100, score));',
]) {
  if (!scope.includes(required)) throw new Error(`Contrato semântico ausente: ${required}`);
}

console.log('CrewCheck v14.3.91 radar no-latency-bias regression OK');
