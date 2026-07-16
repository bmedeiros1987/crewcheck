import fs from 'node:fs';

const emergencyPath = 'server/v1391/emergency.mjs';
let emergency = fs.readFileSync(emergencyPath, 'utf8');
emergency = emergency.replace(
  "VALUES(?,?,?,'active',?,?,?,?,?)",
  "VALUES(?,?,?,'active',?,?,?,?)",
);
fs.writeFileSync(emergencyPath, emergency, 'utf8');

for (const path of [
  'client/src/pages/Home.tsx',
  'client/src/components/v1391/RosterLaunchView.tsx',
  'client/src/components/v1391/PresentationStayManagerView.tsx',
]) {
  let source = fs.readFileSync(path, 'utf8');
  source = source.replaceAll('groundBeforeMinutes?: number;', 'groundBeforeMinutes?: number | null;');
  fs.writeFileSync(path, source, 'utf8');
}
