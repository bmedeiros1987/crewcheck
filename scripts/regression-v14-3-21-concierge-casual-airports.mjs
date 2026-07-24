import fs from 'node:fs';

const source = fs.readFileSync('elevenlabs_tts_1377.js', 'utf8');

const required = [
  "GRU: 'Bagulhos, Guarulhos'",
  "CNF: 'Conflitos, Confins'",
  "CGH: 'Cegonhas, Congonhas'",
  "GIG: 'Galinhão, Galeão'",
  "FLN: 'Floripa, Florianópolis'",
  'CREWCHECK_CONCIERGE_CASUAL_AIRPORT_ALIASES',
  'hasFormalOrSensitiveContext',
  "'operational', 'regulatory', 'legal', 'safety', 'emergency', 'document'",
];

for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`[v14.3.21] marcador ausente: ${marker}`);
}

const aliases = ['Bagulhos', 'Conflitos', 'Cegonhas', 'Galinhão', 'Floripa'];
for (const alias of aliases) {
  const line = source.split('\n').find((item) => item.includes(alias));
  if (!line || !/(Guarulhos|Confins|Congonhas|Galeão|Florianópolis)/.test(line)) {
    throw new Error(`[v14.3.21] apelido sem nome oficial: ${alias}`);
  }
}

if (!/requestedCasualAirportAliases\(options\) && !hasFormalOrSensitiveContext\(value, options\)/.test(source)) {
  throw new Error('[v14.3.21] apelidos não estão protegidos por contexto formal.');
}

console.log('[v14.3.21] Apelidos afetivos opt-in, sempre acompanhados do nome oficial e bloqueados em contexto formal.');
