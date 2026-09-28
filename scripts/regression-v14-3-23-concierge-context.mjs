import fs from 'node:fs';

const apply = fs.readFileSync('scripts/v14323/apply.mjs', 'utf8');
const required = [
  'conciergeStayRecords',
  'conciergeCurrentStay',
  'conciergeContextualRoutineReply',
  'conciergeHospitalsReply',
  'conciergeDistanceKm',
  'places.location',
  'Distâncias são aproximadas em linha reta',
  'O pernoite é tratado como contexto de descanso entre programações',
  'posso treinar agora?',
  'devo dormir',
  'quanto falta para me apresentar',
];

for (const marker of required) {
  if (!apply.includes(marker)) throw new Error(`[v14.3.23] marcador ausente: ${marker}`);
}

const forbidden = [
  /pernoite.*voo ou jornada independente/i,
  /distância exata garantida/i,
  /substitui atendimento médico/i,
  /você deve treinar/i,
];

for (const pattern of forbidden) {
  if (pattern.test(apply)) throw new Error(`[v14.3.23] afirmação insegura: ${pattern}`);
}

console.log('[v14.3.23] Pernoite contextual, rotina prudente, distâncias aproximadas e linguagem natural protegidos.');
