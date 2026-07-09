import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

const forbidden = [
  '0 voo(s)',
  'DRApresentação',
  'HSBApresentação',
  'flights} voo(s) ·',
  "<small>Apresentação {time((day as any).dutyReport)} · Término {time((day as any).dutyDebrief)}</small>",
];

for (const token of forbidden) {
  if (source.includes(token)) {
    throw new Error(`Roster duty polish regression failed: found forbidden token ${token}`);
  }
}

for (const required of ['Descanso regulamentar', 'Sobreaviso', 'rosterDaySummary', 'rosterEventLine']) {
  if (!source.includes(required)) {
    throw new Error(`Roster duty polish regression failed: missing ${required}`);
  }
}

console.log('v13.3.6 roster duty/rest polish regression OK');
