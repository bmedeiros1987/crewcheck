import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

if (!source.includes('<span aria-hidden="true">·</span><span>{rosterDaySummary(day, dayEvents)}</span>')) {
  throw new Error('Missing explicit day-group separator between date and summary');
}

if (!source.includes("if (code === 'DR') return 'Descanso';")) {
  throw new Error('DR title was not compacted to Descanso');
}

if (source.includes('09/07Descanso') || source.includes('08/074 voos')) {
  throw new Error('Found glued roster header text pattern');
}

console.log('v13.3.7 roster header spacing regression OK');
