import assert from 'node:assert/strict';
import fs from 'node:fs';
import { build } from 'esbuild';

const result = await build({ entryPoints: ['client/src/lib/universalPdfIntake.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { detectPdfDestination: detect, decodeSharedPdf: decode, PdfIntakeQueue, MAX_INTAKE_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`PASS ${name}`); }
for (const text of ['AIMS Escala Periodo', 'Crewtopia Escala Apresentação', 'CrewRosterReport', 'iFlight Roster Report', 'Crew Roster Report']) {
  check(`roster: ${text}`, () => assert.equal(detect(text).destination, 'roster'));
}
for (const [text, type] of [
  ['ANAC Certificado de Habilitação Técnica', 'CHT'],
  ['Agência Nacional de Aviação Civil Certificado Médico Aeronáutico', 'CMA'],
  ['ANAC CMA Classe 1 Validade', 'CMA'],
  ['ANAC CHT Habilitações', 'CHT'],
  ['ANAC Licença de piloto', 'Outro'],
]) check(`wallet: ${type}`, () => assert.deepEqual(detect(text), { destination: 'wallet', documentType: type }));
for (const text of ['', 'CMA', 'CHT', 'ANAC', 'AIMS', 'Escala', 'AIMS newsletter', 'CMA Shipping Invoice', 'Manual ANAC de escala',
  'CrewRosterReport ANAC Certificado Médico Aeronáutico']) {
  check(`safe fallback: ${text || 'empty'}`, () => assert.equal(detect(text).destination, 'choose'));
}
check('filename cannot classify content', () => {
  const file = decode({ filename: '../../ANAC-CMA.pdf', dataBase64: btoa('%PDF-1.7\n') });
  assert.equal(file.name, 'ANAC-CMA.pdf');
  assert.equal(detect('').destination, 'choose');
});
check('invalid binary rejected', () => assert.throws(() => decode({ dataBase64: btoa('not a PDF') })));
check('invalid base64 rejected', () => assert.throws(() => decode({ dataBase64: '@@@' })));
check('oversize rejected before decode', () => assert.throws(() => decode({ dataBase64: 'A'.repeat(Math.ceil(MAX_INTAKE_BYTES / 3) * 4 + 1) })));

const queue = new PdfIntakeQueue();
const calls = [];
let release;
const first = queue.enqueue('A', async () => { calls.push('A'); await new Promise((r) => { release = r; }); });
const duplicate = queue.enqueue('A', async () => calls.push('duplicate'));
const second = queue.enqueue('B', async () => calls.push('B'));
await new Promise((r) => setTimeout(r, 0));
check('second share waits for first review', () => assert.deepEqual(calls, ['A']));
release();
await Promise.all([first, duplicate, second]);
check('duplicate suppressed and next file delivered', () => assert.deepEqual(calls, ['A', 'B']));
await assert.rejects(queue.enqueue('failed', async () => { throw new Error('read failed'); }));
await queue.enqueue('failed', async () => calls.push('retry'));
check('failed receipt can be retried', () => assert.equal(calls.at(-1), 'retry'));

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const start = home.indexOf('  async function handleFile(inputEvent:');
const handler = home.slice(start, home.indexOf('  async function copyCurrentSummarySilently', start));
check('existing roster activation follows preview and affirmative decision', () => {
  assert.ok(start > 0);
  const confirmation = handler.indexOf('await confirmRosterImport(roster, file.name)');
  const cancel = handler.indexOf('if (!decision.ok)');
  const activation = handler.indexOf('const newCompliance = saveRoster(');
  assert.ok(confirmation > 0 && cancel > confirmation && activation > cancel);
  assert.match(handler.slice(cancel, activation), /return;/);
  assert.match(home, /title.textContent = 'Ativar esta escala\?'/);
});
check('shared route delegates to current existing handleFile', () => {
  assert.match(home, /importSharedRosterRef.current = handleFile/);
  assert.match(home, /const handleFile = importSharedRosterRef.current;\s+await handleFile/);
});
check('home exposes same wallet and pending form', () => {
  assert.match(home, /Crew Wallet\{walletImport/);
  assert.match(home, /<CrewLockerView incoming=\{walletImport/);
});
const manifest = fs.readFileSync('android-wrapper/app/src/main/AndroidManifest.xml', 'utf8');
check('Android SEND supports MIME-only EXTRA_STREAM shares', () => {
  const filters = manifest.match(/<intent-filter>[\s\S]*?<\/intent-filter>/g);
  assert.ok(filters.some((filter) => filter.includes('android.intent.action.SEND"') && filter.includes('application/pdf') && !filter.includes('android:scheme')));
  assert.match(manifest, /android:launchMode="singleTop"/);
});
console.log(`${checks} P1 intake checks passed. No parser/canonical/corpus changes.`);
