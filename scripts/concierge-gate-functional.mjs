import fs from 'node:fs';
// Append to the existing terminal stylesheet; never rewrite Home or Radar logic.
const path='client/src/styles/ipad-header-recovery.css';
const marker='/* Concierge and manual gate functional reading */';
const css=fs.readFileSync(path,'utf8').split(marker)[0].trimEnd();
fs.writeFileSync(path,css+'\n'+marker+'\n'+fs.readFileSync('client/src/styles/concierge-gate-functional.css','utf8'));
