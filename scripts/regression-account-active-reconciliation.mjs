import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { newestImports, startupCanCommit } from '../shared/rosterStartup.mjs';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const homePath = process.env.RECONCILIATION_BASELINE_HOME || 'client/src/pages/Home.tsx';
const home = fs.readFileSync(homePath, 'utf8');
const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
let activeBody, bootstrapBody;
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0] && ts.isArrowFunction(node.arguments[0])) {
    const body = node.arguments[0].body.getText(ast);
    if (body.includes('Account-active refresh is separate')) activeBody = body;
    if (body.includes('A escala ativa pertence')) bootstrapBody = body;
  }
  ts.forEachChild(node, visit);
}
visit(ast);
// Baseline executes its real bootstrap with a loaded cache, then fails because
// mount/focus never consults the active account. This is a behavior reproduction.
assert.ok(activeBody || bootstrapBody);
const setupCode = compile('export function setup() ' + (activeBody || bootstrapBody));
const helperCode = compile(fs.readFileSync('client/src/lib/rosterStartup.ts', 'utf8'));
const financialAst = ts.createSourceFile('financial.ts', fs.readFileSync('client/src/lib/financialStatementLearning.ts','utf8'),99,true,ts.ScriptKind.TS);
const financialCode = compile(financialAst.statements.filter(n => ts.isFunctionDeclaration(n) && ['financialRateOwner','financialRateSession'].includes(n.name?.text)).map(n=>n.getText(financialAst)).join('\n'));
const reviewCode = compile(fs.readFileSync('client/src/lib/rosterPublicationReview.ts', 'utf8'));
const publicationCode = compile(fs.readFileSync('client/src/lib/rosterPublicationRuntime.ts', 'utf8'));
const database = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
const databaseAst = ts.createSourceFile('database.ts', database, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const scopeNames = ['normalizeRosterCrewId', 'normalizeRosterCrewName', 'crewIdentityToken', 'assertAutomaticRosterScope'];
const scopeFunctions = databaseAst.statements.filter(node => ts.isFunctionDeclaration(node) && scopeNames.includes(node.name?.text));
const scopeCode = compile(scopeFunctions.map(node => node.getText(databaseAst)).join('\n') + '\nexport { assertAutomaticRosterScope };');
class CustomEvent extends Event { constructor(type, options = {}) { super(type); this.detail = options.detail; } }
class StorageEvent extends Event { constructor(key, newValue) { super('storage'); this.key = key; this.newValue = newValue; } }
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const roster = (stamp, month = 10, crewId = '900001') => ({ stamp, year: 2032, month, crewId, crewName: 'SYNTHETIC CREW',
  days: [{ date: '2032-10-10' }], events: [{ kind: 'FLIGHT', date: '2032-10-10', flightNumber: 'LA1111', origin: 'BSB', destination: 'GRU', departure: stamp === 'local' ? '08:00' : '08:10' }] });
function harness(empty = false, knownCrew = true) {
  let owner = 'synthetic-a', token = 'synthetic-session-a', nonce = 0, remote = null, lockHeld = false;
  const values = new Map(), bus = new EventTarget(), doc = new EventTarget(), intervals = new Map(), queuedLocks = [];
  const counts = { reads: 0, cache: 0, preserve: 0, writes: 0 };
  const window = { addEventListener: bus.addEventListener.bind(bus), removeEventListener: bus.removeEventListener.bind(bus), dispatchEvent: bus.dispatchEvent.bind(bus),
    setInterval: fn => { const id = ++nonce; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id) };
  const document = { visibilityState: 'visible', addEventListener: doc.addEventListener.bind(doc), removeEventListener: doc.removeEventListener.bind(doc) };
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { if (values.get(key) !== value) counts.writes++; values.set(key, value); } };
  const auth = { getStoredUser: () => owner ? { id: owner } : null, getToken: () => token };
  const helpers = {}, review = {}, publication = {}, scope = {};
  const globals = { localStorage, window, document, CustomEvent, StorageEvent, crypto: { randomUUID: () => 'synthetic-' + (++nonce) }, Event, console };
  vm.runInNewContext(helperCode, { ...globals, exports: helpers, require: name => name === './authClient' ? auth : { newestImports } });
  vm.runInNewContext(reviewCode, { ...globals, exports: review });
  const navigator = { locks: { request: (_key, callback) => {
    if (!lockHeld) return Promise.resolve(callback());
    const pending = deferred(); queuedLocks.push(() => { try { pending.resolve(callback()); } catch (error) { pending.reject(error); } }); return pending.promise;
  } } };
  vm.runInNewContext(publicationCode, { ...globals, navigator, exports: publication, require: name => name === './authClient' ? auth : review });
  if (activeBody) vm.runInNewContext(scopeCode, { exports: scope });
  const initialRoster = roster('local'); if (!knownCrew) { initialRoster.crewId=''; initialRoster.crewName='Tripulante'; }
  const bundleRef = { current: { roster: empty ? { days: [] } : initialRoster, compliance: {}, source: 'synthetic-local' } }, choiceRevision = { current: 0 };
  remote = { roster: bundleRef.current.roster, compliance: {}, gym: [] };
  const runtime = {}, financial = {};
  vm.runInNewContext(financialCode, { ...globals, ...auth, exports: financial });
  const context = { ...globals, ...auth, ...helpers, ...publication, ...scope, ...financial, bundleRef, choiceRevision, startupCanCommit, exports: runtime,
    setStartupStatus() {}, restoreLatestImport: async () => null, loadRoster: () => bundleRef.current,
    analyzeSafe: () => ({}), setBundleState: next => { bundleRef.current = next; },
    openActiveRoster: async options => { assert.equal(options.requireRemote, true); counts.reads++; return typeof remote === 'function' ? remote() : remote; },
    recomputeComplianceWithRegulatoryHistory: async () => ({ compliance: {} }),
    rosterFingerprint: value => value.stamp, normalizeRosterDays: value => value, buildCanonicalRosterEvents: value => value.events,
    publicationSnapshot: review.publication,
    preservePlannedRosterBeforeImport: (_before, _after, capturedSession) => { assert.equal(capturedSession,financial.financialRateSession(),'remote preservation must carry the captured current authenticated session'); counts.preserve++; },
    saveRoster: (value, source, selection) => { assert.equal(selection, 'automatic'); counts.cache++; localStorage.setItem(helpers.startupKey(), JSON.stringify({ owner, selection, roster: value, source })); },
    setBundle: next => { choiceRevision.current++; bundleRef.current = next; },
  };
  vm.runInNewContext(setupCode, context);
  const cleanup = runtime.setup();
  return { counts, values, helpers, bundleRef, publication, cleanup, context,
    focus: () => bus.dispatchEvent(new Event('focus')), online: () => bus.dispatchEvent(new Event('online')),
    visible: () => doc.dispatchEvent(new Event('visibilitychange')), interval: () => [...intervals.values()].forEach(fn => fn()),
    storage: (key, value) => bus.dispatchEvent(new StorageEvent(key, value)),
    decorate: () => { choiceRevision.current++; bundleRef.current={...bundleRef.current,compliance:{updated:true}}; },
    remote: value => { remote = value; }, session: (nextOwner, nextToken) => { owner = nextOwner; token = nextToken; },
    lock: () => { lockHeld = true; }, release: () => { lockHeld = false; queuedLocks.splice(0).forEach(fn => fn()); },
    manual: value => { const choice = helpers.beginRosterChoice(); choiceRevision.current++; bundleRef.current = { roster: value, compliance: {}, source: 'synthetic-manual' }; return choice; },
  };
}

const h = harness(); await flush();
assert.equal(h.counts.reads, 1, 'loaded owner roster must consult verified active account at mount');
assert.equal(h.counts.cache, 0, 'identical publication does not replace cache');
h.remote({ roster: roster('remote'), compliance: {}, gym: [] }); h.focus(); await flush();
assert.equal(h.counts.reads, 2); assert.equal(h.counts.cache, 1); assert.equal(h.counts.preserve, 1);
const version = h.publication.currentPublicationReview().version;
assert.ok(version > 1, 'real local publication producer observes authenticated changed body');
h.focus(); h.online(); h.visible(); await flush();
assert.equal(h.counts.reads, 3, 'overlapping wake-ups share one in-flight read');
assert.equal(h.counts.cache, 1); assert.equal(h.publication.currentPublicationReview().version, version);
h.interval(); await flush(); assert.equal(h.counts.reads, 4);
h.storage(h.helpers.startupKey(), JSON.stringify({ owner: 'synthetic-a', selection: 'automatic', roster: roster('remote') })); await flush();
assert.equal(h.counts.reads, 4, 'automatic storage notification never starts a feedback read');
h.cleanup(); h.focus(); h.online(); h.interval(); await flush(); assert.equal(h.counts.reads, 4);

for (const transition of ['manual', 'logout', 'account', 'token', 'clear', 'foreign-intent', 'unmount']) {
  const t = harness(); await flush(); const pending = deferred(); const before = t.counts.writes;
  t.remote(() => pending.promise); t.focus();
  let choice;
  if (transition === 'manual') choice = t.manual(roster('manual'));
  if (transition === 'logout') t.session(null, null);
  if (transition === 'account') t.session('synthetic-b', 'synthetic-session-b');
  if (transition === 'token') t.session('synthetic-a', 'replacement-session');
  if (transition === 'clear') t.helpers.markStartupCleared();
  if (transition === 'foreign-intent') t.values.set(t.helpers.startupKey() + '_intent_epoch', 'foreign-tab-before-storage-event');
  if (transition === 'unmount') t.cleanup();
  const writesAfterTransition = t.counts.writes;
  pending.resolve({ roster: roster('remote'), compliance: {}, gym: [] }); await flush();
  assert.equal(t.counts.cache, 0, transition + ' blocks delayed cache result');
  assert.equal(t.counts.writes, writesAfterTransition, transition + ' blocks publication write as well');
  if (choice) { assert.equal(t.bundleRef.current.roster.stamp, 'manual'); choice.finish(); }
  if (transition !== 'unmount') t.cleanup();
  assert.ok(t.counts.writes >= before);
}

const decorated = harness();await flush();const decoratingRead=deferred();decorated.remote(()=>decoratingRead.promise);decorated.focus();decorated.decorate();
decoratingRead.resolve({roster:roster('remote'),compliance:{},gym:[]});await flush();assert.equal(decorated.counts.cache,1,'compliance-only decoration is not a newer roster choice');decorated.cleanup();
const foreignCompleted = harness();await flush();const key=foreignCompleted.helpers.startupKey();
const priorChoice={owner:'synthetic-a',selection:'explicit',roster:roster('local'),choiceIntent:'previous'};
foreignCompleted.values.set(key,JSON.stringify(priorChoice));foreignCompleted.values.set(key+'_intent_epoch','foreign-pending');
const foreignRead=deferred();foreignCompleted.remote(()=>foreignRead.promise);foreignCompleted.focus();
// Foreign completion has the already-captured intent, even identical body bytes.
// The cache generation must reject it before a delayed storage event arrives.
foreignCompleted.values.set(key,JSON.stringify({...priorChoice,choiceIntent:'foreign-pending'}));
foreignRead.resolve({roster:roster('remote'),compliance:{},gym:[]});await flush();assert.equal(foreignCompleted.counts.cache,0);foreignCompleted.cleanup();
const legacyOwner = harness(false,false);await flush();const legacyRemote=roster('remote');legacyRemote.crewId='';legacyRemote.crewName='Tripulante';
legacyOwner.remote({roster:legacyRemote,compliance:{},gym:[]});legacyOwner.focus();await flush();assert.equal(legacyOwner.counts.cache,1,'legacy missing crew fields retain authenticated-account authority, never inferred person identity');legacyOwner.cleanup();
const pendingManual = harness(); await flush(); const manual = pendingManual.helpers.beginRosterChoice();
pendingManual.focus(); pendingManual.online(); await flush(); assert.equal(pendingManual.counts.reads, 1, 'pending manual choice blocks new automatic reads');
manual.finish(); pendingManual.cleanup();

const locked = harness(); await flush(); locked.lock(); locked.remote({ roster: roster('remote'), compliance: {}, gym: [] });
locked.focus(); await flush(); const lockedBefore = locked.counts.writes;
const lockedChoice = locked.manual(roster('manual')); const writesAfterLockedManual = locked.counts.writes; locked.release(); await flush();
assert.equal(locked.counts.writes, writesAfterLockedManual, 'actual navigator-lock producer rechecks manual fence inside lock');
assert.equal(locked.counts.cache, 0); assert.equal(locked.bundleRef.current.roster.stamp, 'manual'); lockedChoice.finish(); locked.cleanup();

for (const value of [roster('remote', 11), roster('remote', 10, '900002'), roster('remote', 10, 'UNKNOWN')]) {
  const t = harness(); await flush(); t.remote({ roster: value, compliance: {}, gym: [] }); const writes = t.counts.writes;
  t.focus(); await flush(); assert.equal(t.counts.cache, 0); assert.equal(t.counts.writes, writes, 'foreign/unknown crew or period is rejected before observation'); t.cleanup();
}
const mismatchedSummary = harness(); await flush(); const beforeSummary = mismatchedSummary.counts.writes;
mismatchedSummary.remote({roster:roster('remote'),compliance:{},gym:[],summary:{crewId:'900002'}});mismatchedSummary.focus();await flush();
assert.equal(mismatchedSummary.counts.writes,beforeSummary);assert.equal(mismatchedSummary.counts.cache,0);mismatchedSummary.cleanup();
const newerObservation = harness();await flush();const oldRead = deferred();newerObservation.remote(()=>oldRead.promise);newerObservation.focus();
const newestEvents = [{...roster('remote').events[0],departure:'08:20'}];
await newerObservation.publication.recordPublication('synthetic-a',newestEvents);
const newestRevision=newerObservation.publication.currentPublicationReview().publication.revision;
oldRead.resolve({roster:roster('remote'),compliance:{},gym:[]});await flush();
assert.equal(newerObservation.publication.currentPublicationReview().publication.revision,newestRevision);
assert.equal(newerObservation.counts.cache,0,'a rejected older observation cannot still replace cache');newerObservation.cleanup();
const conflict = harness(); await flush(); conflict.remote(() => { throw Object.assign(new Error('synthetic conflict'), { code: 'ACTIVE_ROSTER_CONFLICT', remoteCandidate: { roster: roster('remote'), compliance: {}, gym: [] } }); });
conflict.focus(); await flush(); assert.equal(conflict.counts.cache, 1, 'verified same-period candidate can reconcile'); conflict.cleanup();
const empty = harness(true); await flush(); empty.focus(); empty.online(); empty.interval(); await flush();
assert.equal(empty.counts.reads, 0, 'cold start remains latest-import bootstrap, not arbitrary active period'); empty.cleanup();

// Exercise the real prepared reader: requireRemote cannot promote a cache on
// API/authorization failures, while its existing explicit/default API is intact.
const reader = databaseAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'openActiveRoster');
let cacheReads = 0;
const readerExports = {};
const apiError = Object.assign(new Error('synthetic unauthorized'), { status: 401 });
vm.runInNewContext(compile(reader.getText(databaseAst)), { exports: readerExports,
  getSmartLocalActiveRosterSummary: () => ({ id: 'synthetic-cache' }), jsonFetch: async () => { throw apiError; },
  openSavedRoster: async () => { cacheReads++; return { roster: roster('local'), compliance: {}, gym: [] }; }, buildSmartLocalContinuousRoster: async (_summary, value) => value,
});
await assert.rejects(readerExports.openActiveRoster({ requireRemote: true }), error => error === apiError);
assert.equal(cacheReads, 0);
assert.equal((await readerExports.openActiveRoster()).roster.stamp, 'local'); assert.equal(cacheReads, 1);
console.log('PASS actual account-active lifecycle: refresh, corrections, overlap, manual/session/clear/intent fences, locked writes, bounded storage, crew/period and remote-only authority — TZ=' + (process.env.TZ || 'device'));
