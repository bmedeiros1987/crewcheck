import fs from 'node:fs';
import { patchAuthResetArtifactBridge } from './patch.mjs';

const path = 'server/v139/auth.mjs';
const source = fs.readFileSync(path, 'utf8');
const next = patchAuthResetArtifactBridge(source);

if (next !== source) fs.writeFileSync(path, next, 'utf8');
console.log('[crewcheck:prepare] v14.3.99 auth reset artifact bridge applied.');
