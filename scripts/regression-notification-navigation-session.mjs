import assert from 'node:assert/strict';
import fs from 'node:fs';

// Execute the actual Home effect: the former unconditional auth-changed reset
// fails this fixture. No account data, browser session or network is accessed.
const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const start = source.lastIndexOf('  useEffect(() => {', source.indexOf('const resetAccountNavigation'));
const end = source.indexOf('  },[]);', start) + '  },[]);'.length;
assert(start > 0 && end > start);
const effect = source.slice(start, end).replace('(event: Event)', '(event)');
function fixture() {
  const window = new EventTarget(); window.scrollTo = () => {};
  const location = { href: 'https://synthetic.invalid/app?view=notifications&fmonth=2032-01&ffrom=concierge' };
  const history = { state: { ccFinancial: 'synthetic', ccFinancialLists: 'synthetic', ccEnteredFromConcierge: true }, replaceState(state, _title, url) { this.state = state; location.href = String(url); } };
  let owner = 'synthetic-A', view = 'notifications', cleanup;
  new Function('window', 'location', 'history', 'getStoredUser', 'setViewState', 'normalizeInitialView', 'useEffect', effect)(window, location, history,
    () => owner ? { id: owner } : null, next => { view = next; }, value => value,
    run => { cleanup = run(); });
  return { window, location, history, emit: name => window.dispatchEvent(new Event(name)), owner: value => { owner = value; }, view: () => view, cleanup: () => cleanup() };
}
let f = fixture();
f.emit('crewcheck:auth-changed');
assert.equal(f.view(), 'notifications');
assert.equal(new URL(f.location.href).searchParams.get('view'), 'notifications');
// A menu navigation followed by the same-account refresh stays at its destination.
f.location.href = 'https://synthetic.invalid/app?view=notifications';
f.emit('crewcheck:auth-changed'); assert.equal(f.view(), 'notifications');
f.owner('synthetic-B'); f.emit('crewcheck:auth-changed');
assert.equal(f.view(), 'cockpit');
assert.equal(new URL(f.location.href).searchParams.get('fmonth'), null);
assert.equal(f.history.state.ccFinancial, undefined);
assert.equal(f.history.state.ccFinancialLists, undefined);
assert.equal(f.history.state.ccEnteredFromConcierge, undefined);
f.cleanup();
for (const event of ['crewcheck:auth-expired', 'crewcheck:auth-will-change']) {
  f = fixture(); f.emit(event); assert.equal(f.view(), 'cockpit'); f.cleanup();
}
f = fixture(); f.owner(null); f.emit('crewcheck:auth-changed'); assert.equal(f.view(), 'cockpit'); f.cleanup();
console.log('PASS actual Home navigation effect: same-account refresh preserves Notifications; account switch/expiry/logout/missing identity reset cockpit and financial context.');
