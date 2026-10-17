import fs from 'node:fs';
import { patchCiriumRadarOff } from './patch.mjs';
const file = 'server.mjs';
const source = fs.readFileSync(file, 'utf8');
const next = patchCiriumRadarOff(source);
if (next !== source) fs.writeFileSync(file, next);
console.log('[cirium-radar-off] isolated injection path preserved; no runtime activation');
