import fs from 'node:fs';

const VERSION = '14.3.91';
const file = 'server.mjs';
if (!fs.existsSync(file)) throw new Error('[v14391] server.mjs ausente.');
let source = fs.readFileSync(file, 'utf8');

const scoreStart = source.indexOf('function scoreRadar(');
const scoreEnd = source.indexOf('\nasync function jsonFetch(', scoreStart + 1);
if (scoreStart < 0 || scoreEnd < 0) throw new Error('[v14391] scoreRadar não localizado.');

const latencyBlock = `  const latency = Number(item.latencyMs || 9999);\n  if (latency < 800) score += 8;\n  else if (latency < 1500) score += 5;\n  else if (latency < 2400) score += 2;\n`;
if (source.includes(latencyBlock)) {
  source = source.replace(latencyBlock, '');
}

const updatedScoreStart = source.indexOf('function scoreRadar(');
const updatedScoreEnd = source.indexOf('\nasync function jsonFetch(', updatedScoreStart + 1);
const scoreScope = source.slice(updatedScoreStart, updatedScoreEnd);

if (/latencyMs|latency\s*</.test(scoreScope)) {
  throw new Error('[v14391] latência de rede ainda influencia scoreRadar.');
}
for (const required of [
  'if (item.gate) score += 16;',
  'if (item.status && !/monitorando|aguardando/i.test(String(item.status))) score += 14;',
  'return Math.max(0, Math.min(100, score));',
]) {
  if (!scoreScope.includes(required)) throw new Error(`[v14391] contrato semântico do radar mudou: ${required}`);
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14391] CrewCheck ${VERSION}: latência de rede não influencia mais a qualidade semântica do Radar.`);

await import('../v14392/apply.mjs');
