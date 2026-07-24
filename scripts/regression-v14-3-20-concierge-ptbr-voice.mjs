import fs from 'node:fs';

const source = fs.readFileSync('elevenlabs_tts_1377.js', 'utf8');

const required = [
  "const CREWCHECK_BRUNO_VOICE_ID = 'hYLzOVviGWJgnkfQyCeO'",
  "CREWCHECK_CONCIERGE_VOICE_PROFILE || 'bruno'",
  "language_code: 'pt'",
  "MAB: 'Marabá'",
  "SBMA: 'Marabá'",
  ".replace(/\\bvc\\b/gi, 'você')",
  ".replace(/\\bpq\\b/gi, 'porque')",
  ".replace(/\\bRES\\b/g, 'Reserva')",
  ".replace(/\\bHSB\\b/g, 'Sobreaviso')",
];

for (const marker of required) {
  if (!source.includes(marker)) throw new Error(`[v14.3.20] marcador ausente: ${marker}`);
}

if (/ELEVENLABS_VOICE_ID[^\n]+\|\|\s*CREWCHECK_BRUNO_VOICE_ID/.test(source)) {
  throw new Error('[v14.3.20] Daniel/voz genérica não pode prevalecer sobre o perfil Bruno por fallback acidental.');
}

console.log('[v14.3.20] Voz do Bruno, pt-BR natural, abreviações e nomes humanos de aeroportos protegidos.');
