import fs from 'node:fs';

const replyPath = 'server/v1403/build-reply.snippet';
const source = fs.readFileSync(replyPath, 'utf8');

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

console.log('[v14.3.15] Linguagem de confiança: sem vazamento técnico, sem humor operacional e com orientação mínima.');
