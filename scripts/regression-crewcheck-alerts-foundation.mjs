import fs from 'node:fs';

const source = fs.readFileSync(new URL('../client/src/lib/crewcheckAlerts.ts', import.meta.url), 'utf8');

const required = [
  "case 'report':",
  'Never substitute departure/STD when it is absent.',
  "return finiteEpoch(input.reportEpochMillis);",
  "case 'departure':",
  "return finiteEpoch(input.departureEpochMillis);",
  "case 'pickup':",
  "return finiteEpoch(input.pickupEpochMillis);",
  "export type CrewCheckPrimaryFlightTime = 'report' | 'departure' | 'both';",
  "'signature-soft'",
  "'signature-operational'",
  "'signature-urgent'",
  "'signature-wake'",
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`CrewCheck Alerts foundation contract missing: ${token}`);
  }
}

if (/reportEpochMillis[^\n]{0,120}departureEpochMillis/.test(source)) {
  throw new Error('APZ/report path must not fall back to departure/STD.');
}

console.log('CrewCheck Alerts foundation regression: PASS');
