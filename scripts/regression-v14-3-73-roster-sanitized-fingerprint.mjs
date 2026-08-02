import assert from 'node:assert/strict';
import fs from 'node:fs';

const offline = fs.readFileSync('client/src/lib/offlineSync.ts', 'utf8');
const server = fs.readFileSync('server/platform.mjs', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

assert.match(server, /function sanitizeRoster\(roster\)[\s\S]*clone\.days = Array\.isArray\(clone\.days\) \? clone\.days\.slice\(0, 370\)\.map\(\(day\) => \(\{[\s\S]*rawText: '',[\s\S]*legs: Array\.isArray\(day\?\.legs\) \? day\.legs\.slice\(0, 16\) : \[\],[\s\S]*\}\)\) : \[\];/s, 'servidor deve manter sanitização canônica antes do fingerprint');
assert.match(offline, /\[v14\.3\.73\] server-sanitized roster fingerprint/, 'cliente preparado deve conter hotfix de sanitização');
assert.match(offline, /roster\.days\.slice\(0, 370\)\.map/, 'cliente deve aplicar o mesmo limite de dias');
assert.match(offline, /rawText: ''/, 'cliente deve zerar rawText antes do hash');
assert.match(offline, /day\.legs\.slice\(0, 16\)/, 'cliente deve aplicar o mesmo limite de pernas');
assert.match(offline, /days: sanitizedDays/, 'fingerprint deve usar os dias sanitizados');
assert.match(chain, /await import\('\.\.\/v14373\/apply\.mjs'\);/, 'hotfix v14.3.73 deve participar da preparação canônica');

console.log('[v14.3.73] OK — Web/APK replica sanitizeRoster antes de calcular a identidade da escala.');
