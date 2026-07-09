import fs from 'node:fs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');

const required = [
  'function confirmRosterImport',
  'function importGuardianSummary',
  'function chronologicalNextRosterLeg',
  'const decision = confirmRosterImport(roster, file.name);',
  'crewcheck_last_import_guardian_summary',
  'Antes de salvar, o CrewCheck valida período',
  'if (chronological) return chronological;',
  'período importado está correto',
];

for (const token of required) {
  if (!source.includes(token)) throw new Error(`Missing import guardian token: ${token}`);
}

const handleFile = source.match(/async function handleFile\(inputEvent: ChangeEvent<HTMLInputElement>\) \{[\s\S]*?\n  \}/);
if (!handleFile) throw new Error('handleFile not found');
if (handleFile[0].indexOf('confirmRosterImport') > handleFile[0].indexOf('saveRoster')) {
  throw new Error('Import guardian must run before saveRoster');
}

const nextFlight = source.match(/function nextFlight\(events: ZeroLeg\[\]\) \{[\s\S]*?\n\}/);
if (!nextFlight) throw new Error('nextFlight not found');
if (!nextFlight[0].includes('selectNextRosterEvent') || !nextFlight[0].includes('chronologicalNextRosterLeg')) {
  throw new Error('nextFlight must keep canonical selector plus chronological fallback');
}

console.log('v13.4.5 import guardian regression OK');
