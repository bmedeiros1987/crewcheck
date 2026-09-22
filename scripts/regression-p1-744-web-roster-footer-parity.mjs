import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => fs.readFileSync(path, 'utf8');
const home = read('client/src/pages/Home.tsx');
const desktopCss = read('client/src/styles/web-desktop-shell.css');
const clarityCss = fs.existsSync('client/src/styles/v14357-ui-clarity.css')
  ? read('client/src/styles/v14357-ui-clarity.css')
  : read('scripts/v14357/ui-clarity.css');
const indexCss = read('client/src/index.css');

// P1 #744: no consumer-facing duty subtitle may inherit raw parser/legend text.
assert.doesNotMatch(
  home,
  /subtitle:\s*kind === 'stay'[\s\S]{0,500}?\(day as any\)\.rawText/,
  'Web projection must not use day.rawText as a non-flight card subtitle',
);
assert.match(
  home,
  /function webNonFlightSubtitleV14744\(/,
  'prepared Home must expose a structured non-flight subtitle helper',
);

// Extract the helper itself so the real September leak class is executable.
const source = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = source.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === 'webNonFlightSubtitleV14744');
assert.ok(node, 'webNonFlightSubtitleV14744 declaration missing');
const compiled = ts.transpileModule(node.getText(source), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
}).outputText;
const helper = new vm.Script(compiled + '\nwebNonFlightSubtitleV14744;')
  .runInNewContext({ String }, { timeout: 1000 });
assert.equal(typeof helper, 'function');

const poisonedHsb = {
  type: 'HSB',
  pairingCode: 'HSB',
  base: 'BSB',
  dutyReport: '00:00',
  dutyDebrief: '23:59',
  description: '22-Sep-2026 23-Sep-2026 24-Sep-2026 LEGEND HSB DO VC DR',
  rawText: 'Sun VC BSB 00:00 BSB 23:59 Pairing/Flight extends to previous day(s) VC VC VC',
};
const hsbText = helper(poisonedHsb, { presentation: '00:00', departure: '00:00', arrival: '23:59' }, 'BSB');
assert.match(hsbText, /^Sobreaviso · 00:00 → 23:59 · Base BSB$/, 'HSB copy must be structured and concise');
assert.doesNotMatch(hsbText, /LEGEND|Pairing\/Flight|22-Sep|VC VC|previous day/i, 'HSB copy must not leak source tokens');

const vacationText = helper({
  type: 'DO',
  pairingCode: 'VC',
  base: 'BSB',
  rawText: 'Sun VC BSB 00:00 LEGEND HSB DO VC DR',
}, { presentation: '', departure: '', arrival: '' }, 'BSB');
assert.equal(vacationText, 'Férias · Sem programação operacional · Base BSB');

// Desktop Web must keep the same five-destination footer visible.
const desktopStart = desktopCss.indexOf('@media (pointer: fine) and (min-width: 901px)');
assert.ok(desktopStart >= 0, 'desktop pointer:fine media block missing');
const nextMedia = desktopCss.indexOf('\n@media ', desktopStart + 1);
const desktopBlock = desktopCss.slice(desktopStart, nextMedia >= 0 ? nextMedia : desktopCss.length);
assert.doesNotMatch(desktopBlock, /\.cz-bottom-nav\s*\{[\s\S]*?display:\s*none\s*!important/, 'desktop Web must not hide bottom navigation');
assert.doesNotMatch(desktopBlock, /\.cz-bottom-nav\s*\{[\s\S]*?visibility:\s*hidden\s*!important/, 'desktop Web must not make bottom navigation invisible');
assert.match(desktopBlock, /padding-bottom:\s*calc\(132px \+ env\(safe-area-inset-bottom, 0px\)\)/, 'desktop Web must reserve footer space');

assert.doesNotMatch(
  clarityCss,
  /@media \(min-width: 901px\)[\s\S]*?\.cz-bottom-nav\s*\{[\s\S]*?display:\s*none\s*!important/,
  'v14.3.57 prepared clarity layer must not re-hide the desktop footer',
);

// Drawer open remains the only intentional hide state.
assert.match(
  indexCss,
  /html\.crewcheck-menu-open \.cz-bottom-nav,[\s\S]*?body\.crewcheck-menu-open \.cz-bottom-nav\s*\{[\s\S]*?display:\s*none\s*!important/,
  'open drawer must still hide the footer to prevent overlap',
);

// v14.3.37 prepared navigation contract remains intact.
for (const token of [
  "['cockpit','FlyDeck',HomeIcon]",
  "['roster','Escala',CalendarDays]",
  "['departure','Saída',Navigation]",
  "['alerts','Alertas',Bell]",
  "['settings','Menu',Menu]",
]) {
  assert.ok(home.includes(token), 'prepared footer destination missing: ' + token);
}
assert.match(home, /createPortal\(<nav className="cz-bottom-nav"/, 'prepared footer must stay portaled to document.body');

console.log('PASS P1 #744 Web parity: structured non-flight copy + desktop footer restored');
