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
  source = source.replaceAll('groundBeforeMinutes?: number }', 'groundBeforeMinutes?: number | null }');
  fs.writeFileSync(path, source, 'utf8');
}

const packagePath = 'package.json';
const packageMetadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageMetadata.name = 'crewcheck-v13-9-1-launch-stabilization';
packageMetadata.version = '13.9.1';
packageMetadata.description = 'CrewCheck v13.9.1 - launch stabilization';
fs.writeFileSync(packagePath, `${JSON.stringify(packageMetadata, null, 2)}\n`, 'utf8');

const lockPath = 'package-lock.json';
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.name = packageMetadata.name;
  lock.version = packageMetadata.version;
  if (lock.packages?.['']) {
    lock.packages[''].name = packageMetadata.name;
    lock.packages[''].version = packageMetadata.version;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}
