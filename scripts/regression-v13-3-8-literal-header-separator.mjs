import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

if (!source.includes("{' · '}{rosterDaySummary(day, dayEvents)}")) {
  throw new Error('Missing literal spaced separator in roster day header');
}

if (source.includes('<span aria-hidden="true">·</span><span>{rosterDaySummary(day, dayEvents)}</span>')) {
  throw new Error('Old glued separator markup still present');
}

if (!source.includes('cz-day-headline')) {
  throw new Error('Missing cz-day-headline wrapper');
}

console.log('v13.3.8 literal header separator regression OK');
