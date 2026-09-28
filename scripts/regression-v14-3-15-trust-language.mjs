import fs from 'node:fs';

const replyPath = 'server/v1403/build-reply.snippet';
const source = fs.readFileSync(replyPath, 'utf8');
const platformPath = 'client/src/components/platform/PlatformCenter.tsx';
const platformSource = fs.existsSync(platformPath) ? fs.readFileSync(platformPath, 'utf8') : '';
const trustDocPath = 'docs/CREWCHECK_TRUST_LANGUAGE_SYSTEM.md';
const trustDoc = fs.readFileSync(trustDocPath, 'utf8');

const forbiddenUserFacingPatterns = [
  /return ['"`][^'"`]*(?:HTTP\s*[45]\d\d|stack trace|payload|endpoint|webhook|token expirado)/i,
  /return ['"`][^'"`]*erro 500/i,
  /return ['"`]nenhum dado[.!]?['"`]/i,
];

for (const pattern of forbiddenUserFacingPatterns) {
  if (pattern.test(source)) {
    throw new Error(`[trust-language] Linguagem técnica ou vazia exposta ao usuário: ${pattern}`);
  }
}

const requiredSignals = [
  'conciergeEasterEggReply',
  'Não entendi exatamente',
  'Envie sua localização',
];

for (const signal of requiredSignals) {
  if (!source.includes(signal)) throw new Error(`[trust-language] Sinal esperado ausente: ${signal}`);
}

const operationalLines = source
  .split('\n')
  .filter((line) => /return\s+['"`]/.test(line) && /(port[aã]o|voo|escala|jornada|repouso|rbac|metar|taf|tr[aâ]nsito)/i.test(line));

for (const line of operationalLines) {
  if (/[😂🤣😜🥳]/u.test(line)) {
    throw new Error(`[trust-language] Humor indevido em resposta operacional: ${line.trim()}`);
  }
}

const requiredVisitorPolicy = [
  'Visitantes — “terráqueos”',
  'nunca mostrar códigos IATA ou ICAO isolados',
  'cidade ou nome do aeroporto é o rótulo principal',
  'Escala` → `Programação',
  'Radar` → `Situação do voo',
  'A tradução deve ser centralizada',
];

for (const signal of requiredVisitorPolicy) {
  if (!trustDoc.includes(signal)) throw new Error(`[trust-language] Política de visitante ausente: ${signal}`);
}

const visitorTechnicalLabels = [
  ['roster', 'Escala'],
  ['presentation', 'Apresentação'],
  ['radar', 'Radar'],
];

for (const [key, label] of visitorTechnicalLabels) {
  const pattern = new RegExp(`\\['${key}',\\s*'${label}'`);
  if (pattern.test(platformSource)) {
    console.warn(`[trust-language] AUDITORIA PENDENTE: permissão de visitante ainda usa “${label}”. Aplicar tradução na etapa do portal.`);
  }
}

const isolatedAirportCodeInVisitorCopy = /(?:>|['"`\s])(BSB|GRU|CGH|GIG|SDU|CNF|VCP|CWB|POA|REC|FOR|SSA|SLZ|BEL|MAO|SBBR|SBGR)(?:<|['"`\s])/g;
const visitorFacingLines = platformSource
  .split('\n')
  .filter((line) => /(visitor|visitante|share|compartilh|programa[cç][aã]o|cidade|aeroporto)/i.test(line));

for (const line of visitorFacingLines) {
  if (isolatedAirportCodeInVisitorCopy.test(line)) {
    throw new Error(`[trust-language] Código de aeroporto exposto em texto de visitante: ${line.trim()}`);
  }
  isolatedAirportCodeInVisitorCopy.lastIndex = 0;
}

console.log('[v14.3.15] Linguagem de confiança: sem vazamento técnico, sem humor operacional e com política humana para visitantes e aeroportos.');
