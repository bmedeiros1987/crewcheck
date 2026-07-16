import fs from 'node:fs';

const emergencyPath = 'server/v1391/emergency.mjs';
let emergency = fs.readFileSync(emergencyPath, 'utf8');
emergency = emergency.replace(
  "VALUES(?,?,?,'active',?,?,?,?,?)",
  "VALUES(?,?,?,'active',?,?,?,?)",
);
fs.writeFileSync(emergencyPath, emergency, 'utf8');
