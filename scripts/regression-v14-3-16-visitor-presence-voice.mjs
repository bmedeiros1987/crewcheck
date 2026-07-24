import fs from 'node:fs';

const specPath = 'docs/CREWCHECK_VISITOR_PRESENCE_VOICE_ENGINE.md';
const source = fs.readFileSync(specPath, 'utf8');

const requiredSignals = [
  'Proteção de descanso',
  'Consentimento por visitante',
  'Relação familiar e interpretação',
  'Alexa',
  'hYLzOVviGWJgnkfQyCeO',
  '`daniel`',
  'não afirma que o usuário está dormindo',
  'localização exata, desligada por padrão',
  'resposta afetiva configurada',
];

for (const signal of requiredSignals) {
  if (!source.includes(signal)) {
    throw new Error(`[visitor-presence] Regra obrigatória ausente: ${signal}`);
  }
}

const privacyRules = [
  /sem localização exata por padrão/i,
  /sem quarto ou academia sem autorização individual/i,
  /sem interrupção durante descanso, salvo emergência autorizada/i,
  /voz clonada nunca pode ser usada por outro usuário sem consentimento explícito/i,
];

for (const rule of privacyRules) {
  if (!rule.test(source)) {
    throw new Error(`[visitor-presence] Proteção de privacidade ausente: ${rule}`);
  }
}

const relationships = ['mãe', 'pai', 'esposa', 'marido', 'companheira', 'companheiro', 'filha', 'filho', 'irmã', 'irmão'];
for (const relationship of relationships) {
  if (!source.includes(relationship)) {
    throw new Error(`[visitor-presence] Relação familiar não coberta: ${relationship}`);
  }
}

const forbiddenClaims = [
  /sempre afirmar que.*dormindo/i,
  /compartilhar localização exata por padrão/i,
  /qualquer visitante.*emergência/i,
];

for (const claim of forbiddenClaims) {
  if (claim.test(source)) {
    throw new Error(`[visitor-presence] Regra insegura encontrada: ${claim}`);
  }
}

console.log('[v14.3.16] Motor familiar preparado: presença consentida, descanso protegido, voz selecionável e arquitetura compatível com Alexa.');
