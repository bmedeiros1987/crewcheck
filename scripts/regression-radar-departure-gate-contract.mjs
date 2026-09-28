import fs from 'node:fs';

const fixture = JSON.parse(fs.readFileSync('scripts/fixtures/radar-departure-gate-la3377.json', 'utf8'));

function sameOperationalSegment(candidate, target) {
  return String(candidate.flightNumber || '').toUpperCase() === String(target.flightNumber || '').toUpperCase()
    && String(candidate.operationalDate || '') === String(target.operationalDate || '')
    && String(candidate.origin || '').toUpperCase() === String(target.origin || '').toUpperCase()
    && String(candidate.destination || '').toUpperCase() === String(target.destination || '').toUpperCase();
}

function normalizeGate(value) {
  const gate = String(value || '').trim().toUpperCase();
  return gate && gate !== 'N/A' && gate !== '-' ? gate : '';
}

function selectDepartureGate(target, candidates = []) {
  const matching = candidates
    .filter((candidate) => sameOperationalSegment(candidate, target))
    .filter((candidate) => normalizeGate(candidate.departureGate))
    .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

  if (!matching.length) return { gate: '', terminal: '', confidence: 'missing' };

  const groups = new Map();
  for (const candidate of matching) {
    const gate = normalizeGate(candidate.departureGate);
    const terminal = String(candidate.departureTerminal || '').trim();
    const key = `${gate}|${terminal}`;
    const current = groups.get(key) || { gate, terminal, count: 0, newest: 0 };
    current.count += 1;
    current.newest = Math.max(current.newest, new Date(candidate.updatedAt || 0).getTime());
    groups.set(key, current);
  }

  const ranked = [...groups.values()].sort((a, b) => b.count - a.count || b.newest - a.newest);
  const winner = ranked[0];
  const runnerUp = ranked[1];
  if (runnerUp && runnerUp.count === winner.count) return { gate: '', terminal: '', confidence: 'conflict' };
  return { gate: winner.gate, terminal: winner.terminal, confidence: winner.count > 1 ? 'consensus' : 'single-source' };
}

const target = {
  flightNumber: fixture.flightNumber,
  operationalDate: fixture.operationalDate,
  origin: fixture.origin,
  destination: fixture.destination,
};

const selected = selectDepartureGate(target, fixture.candidates);
if (selected.gate !== fixture.expected.gate) throw new Error(`Expected departure gate ${fixture.expected.gate}, got ${selected.gate || '—'}`);
if (selected.terminal !== fixture.expected.terminal) throw new Error(`Expected departure terminal ${fixture.expected.terminal}, got ${selected.terminal || '—'}`);
for (const forbidden of fixture.expected.mustNotUse || []) {
  if (selected.gate === forbidden) throw new Error(`Arrival/other-segment gate ${forbidden} must never be selected`);
}

const conflict = selectDepartureGate(target, [
  ...fixture.candidates.filter((candidate) => sameOperationalSegment(candidate, target)).slice(0, 1),
  {
    source: 'conflicting',
    ...target,
    departureGate: '12',
    departureTerminal: '1',
    updatedAt: '2026-07-31T15:21:00Z'
  }
]);
if (conflict.gate !== '' || conflict.confidence !== 'conflict') throw new Error('Conflicting gates must render as unavailable');

const wrongSegmentOnly = selectDepartureGate(target, fixture.candidates.filter((candidate) => !sameOperationalSegment(candidate, target)));
if (wrongSegmentOnly.gate !== '') throw new Error('Gate from another segment must be ignored');

console.log('Radar departure gate contract: OK');
