import assert from 'node:assert/strict';
import fs from 'node:fs';

const offline = fs.readFileSync('client/src/lib/offlineSync.ts', 'utf8');
const server = fs.readFileSync('server/platform.mjs', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');

assert.match(server, /function rosterFingerprint\(roster\)\s*\{\s*return sha256\(JSON\.stringify\(\{ year: roster\?\.year, month: roster\?\.month, crewId: roster\?\.crewId, days: roster\?\.days \}\)\);\s*\}/s, 'servidor deve manter fingerprint SHA-256 canônico da escala');
assert.match(offline, /\[v14\.3\.72\] server-compatible roster fingerprint/, 'cliente preparado deve conter hotfix de fingerprint');
assert.match(offline, /\{ year: roster\?\.year, month: roster\?\.month, crewId: roster\?\.crewId, days: roster\?\.days \}/, 'cliente deve serializar os mesmos campos do servidor');
assert.doesNotMatch(offline, /period:\$\{roster\?\.crewId[\s\S]{0,200}const text = periodKey/s, 'checksum local não pode voltar a representar apenas o mês');
assert.match(chain, /await import\('\.\.\/v14372\/apply\.mjs'\);/, 'hotfix v14.3.72 deve participar da preparação canônica');

console.log('[v14.3.72] OK — Web/APK e servidor usam a mesma identidade SHA-256 para a mesma revisão de escala.');
