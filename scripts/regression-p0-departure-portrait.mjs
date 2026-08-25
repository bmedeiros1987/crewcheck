import fs from 'node:fs';
import assert from 'node:assert/strict';

let passed = 0;
function check(name, condition, detail = '') {
  assert.ok(condition, `${name}${detail ? ` — ${detail}` : ''}`);
  passed += 1;
  console.log(`PASS ${name}`);
}

const androidManifest = fs.readFileSync('android-wrapper/app/src/main/AndroidManifest.xml', 'utf8');
const pwaManifest = JSON.parse(fs.readFileSync('client/public/manifest.json', 'utf8'));
const apply = fs.readFileSync('scripts/p0-departure-portrait/apply.mjs', 'utf8');

check('APK principal fica em portrait', androidManifest.includes('android:screenOrientation="portrait"'));
check('APK não permanece fullUser', !androidManifest.includes('android:screenOrientation="fullUser"'));
check('PWA instalada declara portrait', pwaManifest.orientation === 'portrait');
check('horário é nowrap com prioridade', apply.includes('white-space: nowrap !important'));
check('horário não permite quebra anywhere', apply.includes('overflow-wrap: normal !important'));
check('horário mantém dígitos agrupados', apply.includes('word-break: keep-all !important'));
check('números usam largura tabular', apply.includes('font-variant-numeric: tabular-nums !important'));
check('tamanho é responsivo, não hardcode de horário', apply.includes('font-size: clamp(') && !/23:37|00:15|15:05/.test(apply));
check('mobile usa uma única coluna', apply.includes('grid-template-columns: minmax(0, 1fr) !important'));
check('patch é marcado para idempotência', apply.includes("source.includes(marker)"));
check('nenhum parser/canônico é tocado', !/aimsParser|canonicalRoster|rosterParser/.test(apply));

console.log(`\n${passed}/11 checks passed`);
