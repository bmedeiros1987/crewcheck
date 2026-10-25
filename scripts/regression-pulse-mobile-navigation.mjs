// Offline contracts. Geometry/hit-test values below are synthetic, not browser QA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const helperPath = 'client/src/components/navigation/headerMenuAccess.ts';
const helper = ts.transpileModule(fs.readFileSync(helperPath, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const helperScope = { exports: {} };
vm.runInNewContext(helper, helperScope);
const { isAvailableHeaderAction, availableBottomMenu, availablePulseReturnTarget } = helperScope.exports;
let checks = 0;
function fixture() {
  const view = { innerWidth: 390, innerHeight: 844, getComputedStyle: node => ({ display: 'block', visibility: 'visible', opacity: '1', ...node.style }) };
  const doc = { defaultView: view, querySelectorAll: () => [] };
  const ancestor = { parentElement: null, style: {} };
  const button = {
    ownerDocument: doc, isConnected: true, disabled: false, style: {}, attrs: {}, hiddenAncestor: false, parentElement: ancestor,
    getAttribute(name) { return this.attrs[name] ?? null; },
    matches(selector) { assert.equal(selector, ':disabled'); return this.disabled || this.disabledFieldset || false; },
    closest() { return this.hiddenAncestor ? ancestor : null; },
    getBoundingClientRect() { return this.rect; },
    rect: { left: 320, top: 770, width: 48, height: 48 },
    contains(hit) { return hit === this || hit === this.child; },
    child: {},
  };
  doc.hit = button.child;
  doc.elementFromPoint = () => doc.hit;
  doc.querySelector = selector => { assert.equal(selector, 'body > nav.cz-bottom-nav button[data-crewcheck-menu-trigger="true"]'); return doc.menu ?? null; };
  doc.menu = button;
  return { doc, view, ancestor, button };
}
function check(label, mutate, expected) {
  const f = fixture(); mutate(f);
  assert.equal(isAvailableHeaderAction(f.button), expected, label);
  assert.equal(availableBottomMenu(f.doc), expected ? f.button : null, label + ' footer');
  checks += 2;
}
check('reachable child hit', () => {}, true);
check('reachable button hit', f => { f.doc.hit = f.button; }, true);
check('detached', f => { f.button.isConnected = false; }, false);
check('disabled', f => { f.button.disabled = true; }, false);
check('effectively disabled by fieldset', f => { f.button.disabledFieldset = true; }, false);
check('aria disabled', f => { f.button.attrs['aria-disabled'] = 'true'; }, false);
check('hidden/inert ancestor', f => { f.button.hiddenAncestor = true; }, false);
for (const [property, value] of [['display', 'none'], ['visibility', 'hidden'], ['visibility', 'collapse'], ['opacity', '0']]) {
  check('button ' + property, f => { f.button.style[property] = value; }, false);
  check('ancestor ' + property, f => { f.ancestor.style[property] = value; }, false);
}
for (const [property, value] of [['width', 0], ['height', 0], ['left', -100], ['top', -100], ['left', 390], ['top', 844]]) {
  check('outside or zero ' + property, f => { f.button.rect[property] = value; }, false);
}
check('covered by dialog', f => { f.doc.hit = {}; }, false);
check('hit test unavailable', f => { delete f.doc.elementFromPoint; }, false);
check('missing view', f => { f.doc.defaultView = null; }, false);
function activeModal(f, { hidden = false, inside = false } = {}) {
  const modal = { style: hidden ? { display: 'none' } : {}, parentElement: null, closest: () => null, contains: () => inside, getBoundingClientRect: () => ({ width: 390, height: 844 }) };
  f.doc.querySelectorAll = selector => selector === 'dialog:modal' ? [] : [modal];
}
check('outside active modal', f => activeModal(f), false);
check('hidden modal does not block navigation', f => activeModal(f, { hidden: true }), true);
check('control inside active modal remains eligible', f => activeModal(f, { inside: true }), true);
const f = fixture();
f.doc.menu = null; assert.equal(availableBottomMenu(f.doc), null); checks++;
assert.equal(availablePulseReturnTarget(null), null); checks++;
const app = { ownerDocument: f.doc, querySelector: () => f.button };
assert.equal(availablePulseReturnTarget(app), f.button, 'visible header Back/Menu wins'); checks++;
const footer = fixture();
app.ownerDocument = footer.doc; f.button.style.display = 'none';
assert.equal(availablePulseReturnTarget(app), footer.button, 'last dismiss returns to actual bottom Menu when header is hidden'); checks++;
footer.doc.hit = null;
assert.equal(availablePulseReturnTarget(app), null, 'never focus hidden or covered navigation'); checks++;

// Run the actual owned finalizer over the actual Brand/BottomNav text, with
// only its upstream canonical mark/roster anchors supplied. This is not the
// complete v139 preparation chain (that remains an independent required gate).
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const region = (start, end) => {
  const a = home.indexOf(start), b = home.indexOf(end, a);
  assert(a >= 0 && b > a, start); return home.slice(a, b);
};
let brand = region('function Brand(', '\nfunction complianceAlertSignature(');
// Raw Home predates the upstream official-mark materializer.
brand = brand.replace('<CrewCheckPulse compact brandMark fallback={<span className="cz-logo"><Plane size={26}/></span>}/>', '<CrewCheckMark/>');
const nav = region('function BottomNav(', 'function KpiCard(');
const input = brand + '\nfunction complianceAlertSignature(){}\n' + nav + 'function KpiCard(){}\nconst rosterFixture = <RosterLaunchView events={rosterEvents} roster={bundle.roster}/>;';
const files = new Map([
  ['client/src/pages/Home.tsx', input],
  ['client/src/styles/ipad-header-recovery.css', '/* upstream fixture */\n'],
  ['client/src/components/pulse/integrated-header.css', fs.readFileSync('client/src/components/pulse/integrated-header.css', 'utf8')],
]);
const script = fs.readFileSync('scripts/pulse-alert-experience/apply.mjs', 'utf8').replace("import fs from 'node:fs';", '');
const run = () => vm.runInNewContext(script, { fs: { readFileSync: path => { assert(files.has(path), path); return files.get(path); }, writeFileSync: (path, value) => files.set(path, value) }, console: { log() {} } });
run();
const first = files.get('client/src/pages/Home.tsx'), firstCss = files.get('client/src/styles/ipad-header-recovery.css');
assert.equal((first.match(/data-header-navigation=/g) || []).length, 1);
assert.equal((first.match(/data-crewcheck-menu-trigger=/g) || []).length, 1);
assert(first.includes('data-header-navigation={back ? "back" : "menu"}'));
assert(first.includes('data-crewcheck-menu-trigger={isMenu ? "true" : undefined}'));
assert(first.includes('isMenu ? openMenu() : setView(v)'));
assert(first.includes("history.state?.ccEnteredFromConcierge) history.back()"));
assert(firstCss.endsWith(files.get('client/src/components/pulse/integrated-header.css')));
run();
assert.equal(files.get('client/src/pages/Home.tsx'), first, 'repeat finalizer never nests the brand wrapper or navigation markers');
assert.equal(files.get('client/src/styles/ipad-header-recovery.css'), firstCss, 'CSS composition is byte-idempotent');
checks += 9;
const css = files.get('client/src/components/pulse/integrated-header.css');
assert(css.includes('@media(max-width:639px)'));
assert(css.includes('[data-bottom-menu-available="true"] .cz-menu-btn[data-header-navigation="menu"],'));
assert(css.includes('[data-header-navigation-suppressed="true"] .cz-menu-btn[data-header-navigation="menu"] {display:none!important}'));
assert(css.includes('.cc-pulse-collapse {display:inline-grid!important;place-items:center!important;padding:0!important'));
assert(css.includes('animation:cc-pulse-soft-beat 2.4s ease-in-out 2 both'));
assert(css.includes('@media(prefers-reduced-motion:reduce)'));
checks += 6;
console.log(`PASS ${checks} offline Pulse navigation/generator contracts; no real layout, provider or notification executed`);
