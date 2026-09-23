import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const contextSource = fs.readFileSync('client/src/lib/navigationContext.ts', 'utf8');
const rosterAdapter = fs.readFileSync('client/src/lib/rosterFocus.ts', 'utf8');

const compiled = ts.transpileModule(contextSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    sourceMap: false,
  },
  fileName: 'navigationContext.ts',
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
const nav = await import(moduleUrl);

const {
  setPendingNavigationContext,
  consumePendingNavigationContext,
  peekPendingNavigationContext,
  clearPendingNavigationContext,
} = nav;

// consume-once: an unrelated destination cannot steal or clear the context.
setPendingNavigationContext({
  sourceView: 'roster',
  targetView: 'regulation',
  dateEpochMs: 1790182800000,
  journeyId: 'journey-42',
  airportCode: ' gru ',
  returnView: 'roster',
  returnLabel: 'Voltar para Escala',
  policy: 'once',
  rawText: 'must-not-cross-navigation-boundary',
  message: 'must-not-cross-navigation-boundary',
});
assert.equal(consumePendingNavigationContext('radar'), null, 'wrong target must not consume navigation context');
assert.equal(peekPendingNavigationContext('regulation')?.journeyId, 'journey-42', 'target mismatch must leave context pending');
const once = consumePendingNavigationContext('regulation');
assert.equal(once?.sourceView, 'roster');
assert.equal(once?.targetView, 'regulation');
assert.equal(once?.airportCode, 'GRU');
assert.equal(once?.returnView, 'roster');
assert.equal(once?.policy, 'once');
assert.ok(!('rawText' in once), 'navigation context must not transport raw text');
assert.ok(!('message' in once), 'navigation context must not transport arbitrary messages');
assert.equal(consumePendingNavigationContext('regulation'), null, 'once context must be empty after first matching consume');

// persistent-until-return: destination may read repeatedly until explicit return/global clear.
setPendingNavigationContext({
  sourceView: 'cockpit',
  targetView: 'radar',
  flightKey: 'JJ1234-2026-09-23',
  policy: 'persistent-until-return',
});
assert.equal(consumePendingNavigationContext('radar')?.flightKey, 'JJ1234-2026-09-23');
assert.equal(consumePendingNavigationContext('radar')?.flightKey, 'JJ1234-2026-09-23', 'persistent context must survive matching consume');
clearPendingNavigationContext();
assert.equal(peekPendingNavigationContext(), null, 'global/menu navigation clear must discard stale contextual focus');

// Invalid target never creates a context; input is sanitized/copied rather than retained by reference.
setPendingNavigationContext({ targetView: '   ', policy: 'once' });
assert.equal(peekPendingNavigationContext(), null, 'empty target must be rejected');
const mutable = { targetView: 'hotels', stayId: 'stay-7', policy: 'once' };
setPendingNavigationContext(mutable);
mutable.stayId = 'mutated-after-deposit';
assert.equal(peekPendingNavigationContext('hotels')?.stayId, 'stay-7', 'pending context must be a sanitized copy');
clearPendingNavigationContext();

// Privacy and ownership guardrails: no browser persistence, raw operational payload, parser or rule engine.
for (const forbidden of ['localStorage', 'sessionStorage', 'rawText', 'originalText', 'transcript', 'pdfParser', 'rosterParser', 'financialRules', 'canonicalRoster']) {
  assert.ok(!contextSource.includes(forbidden), `Navigation Context must not depend on ${forbidden}`);
}

// #560 compatibility is now an adapter over the shared relay, not a second navigation bus.
assert.match(rosterAdapter, /setPendingNavigationContext\(\{[\s\S]*targetView: 'roster'[\s\S]*policy: 'once'/, 'roster focus must deposit a one-shot shared context');
assert.match(rosterAdapter, /consumePendingNavigationContext\('roster'\)/, 'roster focus must consume only roster-addressed context');
assert.match(rosterAdapter, /peekPendingNavigationContext\('roster'\)/, 'roster focus test adapter must inspect only roster-addressed context');
assert.ok(!/let\s+pending\s*:/.test(rosterAdapter), 'rosterFocus must not maintain a second pending navigation bus');

console.log('✓ #566 Navigation Context: target-scoped once/persistent policies, explicit global clear, sanitized privacy-first payload, and #560 rosterFocus compatibility');
