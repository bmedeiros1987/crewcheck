import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { parse } from '@babel/parser';

const stage = fs.readFileSync('scripts/v13910/apply.mjs', 'utf8');
const finalizer = fs.readFileSync('scripts/finalize-theme-runtime.mjs', 'utf8');
const homeStage = stage.slice(stage.indexOf('const homePath ='), stage.indexOf("if (fs.existsSync('server.mjs'))"));
const homeFinalizer = finalizer.slice(finalizer.indexOf('const homePath ='), finalizer.indexOf('const authPath ='));
const imports = vm.runInNewContext(finalizer.match(/^const imports = (.*);$/m)[1]);
function transform(code, source) {
  let output = source;
  const read = () => output, write = (_file, value) => { output = value; };
  vm.runInNewContext(code, { fs: { existsSync: () => true, readFileSync: read, writeFileSync: write }, read, write, VERSION: '14.0.0', imports });
  return output;
}
const current = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const committed = spawnSync('git', ['show', 'HEAD:client/src/pages/Home.tsx'], { encoding: 'utf8' });
assert.equal(committed.status, 0, 'read the real committed raw Home without reverting the current tree');
const raw = committed.stdout;
const legacy = transform(homeStage, raw);
const modern = transform(homeFinalizer, legacy);
const homeNode = parse(modern, { sourceType: 'module', plugins: ['typescript', 'jsx'] }).program.body.find(node => node.type === 'ExportDefaultDeclaration' && node.declaration.id?.name === 'Home').declaration;
const returnStart = homeNode.body.body.find(node => node.type === 'ReturnStatement').start;
const inHome = declaration => modern.replace('export default function Home() {', 'export default function Home() {\n  ' + declaration);
const inEffect = declaration => modern.replace('    applyCrewCheckTheme();', '    ' + declaration + '\n    applyCrewCheckTheme();');
const inCleanup = declaration => modern.replace("window.removeEventListener('crewcheck:theme-change', syncTheme);", declaration + " window.removeEventListener('crewcheck:theme-change', syncTheme);");
assert.ok(legacy.includes("crewcheck_theme_mode', 'auto'"));
assert.ok(!modern.includes("crewcheck_theme_mode', 'auto'"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'v13910-theme-'));
try {
  const files = ['scripts/v13910/apply.mjs', 'scripts/v13910/generate-brand-icon.mjs', 'client/src/lib/brand.ts', 'client/src/lib/pdfExport.ts', 'client/src/lib/emailClient.ts', 'client/src/lib/sharing.ts', 'client/src/components/premium/CabinChiefAssistant.tsx', 'client/src/components/v1400/premium-system.css', 'client/public/assets/brand/crewcheck-app-icon-2026.png'];
  if (fs.existsSync('scripts/v13910/theme-home-marker.mjs')) files.push('scripts/v13910/theme-home-marker.mjs');
  for (const file of files) { fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true }); fs.copyFileSync(file, path.join(temp, file)); }
  fs.mkdirSync(path.join(temp, 'client/src/pages'), { recursive: true });
  fs.symlinkSync(path.resolve('node_modules'), path.join(temp, 'node_modules'), 'dir');
  const target = path.join(temp, 'client/src/pages/Home.tsx');
  function run(source) {
    fs.writeFileSync(target, source);
    return spawnSync(process.execPath, ['scripts/v13910/apply.mjs'], { cwd: temp, encoding: 'utf8' });
  }
  for (const [name, source] of [
    ['raw', raw], ['legacy', legacy], ['real finalized Home', modern], ['current tree', current],
    ['unrelated nested Home binding', inHome('function unrelated() { const applyCrewCheckTheme = () => {}; applyCrewCheckTheme(); }')],
    ['unrelated nested cleanup binding', inCleanup('function unrelated() { const syncTheme = () => {}; syncTheme(); }')],
  ]) {
    const result = run(source);
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    const first = fs.readFileSync(target, 'utf8');
    assert.equal(run(first).status, 0, name + ' repeat');
    assert.equal(fs.readFileSync(target, 'utf8'), first, name + ' byte stability');
    if (name === 'real finalized Home') assert.equal(first, modern, 'must not reintroduce the independent legacy theme writer');
  }
  const negatives = [
    ['missing runtime import', modern.replace(/^import .*from '\.\.\/lib\/themeRuntime';\n/m, '')],
    ['commented runtime import', modern.replace(/^import .*from '\.\.\/lib\/themeRuntime';/m, '/* $& */')],
    ['missing initialization', modern.replace('    applyCrewCheckTheme();', '')],
    ['missing synchronization', modern.replace('const syncTheme = () => applyCrewCheckTheme();', 'const syncTheme = () => {};')],
    ['missing system condition', modern.replace("getCrewCheckThemePreference() === 'system'", "getCrewCheckThemePreference() === 'dark'")],
    ['missing system listener', modern.replace("crewcheckSystemTheme?.addEventListener?.('change', crewcheckSystemThemeListener);", '')],
    ['missing cleanup', modern.replace("crewcheckSystemTheme?.removeEventListener?.('change', crewcheckSystemThemeListener);", '')],
    ['missing theme cleanup', modern.replace("window.removeEventListener('crewcheck:theme-change', syncTheme);", '')],
    ['missing theme event', modern.replace("window.addEventListener('crewcheck:theme-change', syncTheme);", '')],
    ['commented initialization', modern.replace('    applyCrewCheckTheme();', '    /* applyCrewCheckTheme(); */')],
    ['string initialization', modern.replace('    applyCrewCheckTheme();', '    "applyCrewCheckTheme();";')],
    ['nested initialization', modern.replace('    applyCrewCheckTheme();', '    function unusedTheme() { applyCrewCheckTheme(); }')],
    ['dead initialization', modern.replace('    applyCrewCheckTheme();', '    if (false) { applyCrewCheckTheme(); }')],
    ['return before initialization', modern.replace('    applyCrewCheckTheme();', '    return; applyCrewCheckTheme();')],
    ['throw before initialization', modern.replace('    applyCrewCheckTheme();', '    throw new Error("synthetic"); applyCrewCheckTheme();')],
    ['throw before cleanup', modern.replace("    window.addEventListener('crewcheck:presentation-updated', refreshPresentation);", "    throw new Error('synthetic');\n    window.addEventListener('crewcheck:presentation-updated', refreshPresentation);")],
    ['commented CabinChief import', modern.replace(/^import CabinChiefAssistant from [^\n]+/m, '/* $& */')],
    ['missing CabinChief render', modern.replace(/\{view === 'crew' && <CabinChiefAssistant[^\n]+\/>\}/, '{/* CabinChiefAssistant */}')],
    ['dead CabinChief render', modern.replace(/\{view === 'crew' && (<CabinChiefAssistant[^\n]+\/>)\}/, "{false && <>{view === 'crew' && $1}</>}")],
    ['return before CabinChief', modern.slice(0, returnStart) + 'return null;\n  ' + modern.slice(returnStart)],
    ['Home shadows useEffect', inHome('const useEffect = () => {};')],
    ['Home shadows applyCrewCheckTheme', inHome('const applyCrewCheckTheme = () => {};')],
    ['Home shadows preference reader', inHome("const getCrewCheckThemePreference = () => 'system';")],
    ['Home shadows CabinChief', inHome('const CabinChiefAssistant = () => null;')],
    ['effect shadows applyCrewCheckTheme', inEffect('const applyCrewCheckTheme = () => {};')],
    ['effect shadows preference reader', inEffect("const getCrewCheckThemePreference = () => 'system';")],
    ['effect shadows browser window', inEffect('const window = syntheticWindow;')],
    ['cleanup shadows syncTheme', inCleanup('const syncTheme = () => {};')],
    ['cleanup shadows system media', inCleanup('const crewcheckSystemTheme = syntheticMedia;')],
    ['cleanup shadows system listener', inCleanup('const crewcheckSystemThemeListener = () => {};')],
    ['cleanup shadows browser window', inCleanup('const window = syntheticWindow;')],
  ];
  const acceptedNegatives = [];
  for (const [name, source] of negatives) {
    assert.ok(source !== modern, name + ' fixture must change the real Home');
    const result = run(source);
    if (result.status === 0) acceptedNegatives.push(name);
    else assert.match(result.stderr, /restauração de relatórios ou tema automático ausente|code: 'BABEL_PARSER_SYNTAX_ERROR'/, name);
  }
  assert.deepEqual(acceptedNegatives, [], 'incomplete or shadowed contracts must be rejected');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
console.log('PASS actual v13910 stage with real Home finalizer, legacy compatibility, modern repeat stability and incomplete/non-executable theme negatives');
