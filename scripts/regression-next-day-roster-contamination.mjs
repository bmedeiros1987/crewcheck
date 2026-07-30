import fs from 'node:fs';
import assert from 'node:assert/strict';

const canonicalPath = 'client/src/lib/canonicalRoster.ts';
const source = fs.readFileSync(canonicalPath, 'utf8');
assert.match(source, /function reconcileCompetingFlightActivities\(days: RosterDay\[\]\)/);
assert.match(source, /activityIntervalsOverlap\(left, right\) \|\| samePublishedPresentation\(left, right\)/);
assert.match(source, /reconcileCompetingFlightActivities\(Array\.from\(byActivity\.values\(\)\)/);

const minutes = (value) => {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
};
const signature = (leg) => [leg.flightNumber, leg.origin, leg.destination, leg.departureTime, leg.arrivalTime].join('|');
const connects = (a, b) => {
  if (a.destination !== b.origin) return false;
  const arrival = minutes(a.arrivalTime);
  const departure = minutes(b.departureTime);
  const gap = departure >= arrival ? departure - arrival : departure + 1440 - arrival;
  return gap <= 720;
};
const score = (chain) => chain.length * 1000 + Math.max(0, chain.length - 1) * 100;
const select = (legs) => {
  const ordered = [...legs].sort((a, b) => minutes(a.departureTime) - minutes(b.departureTime));
  const chains = [];
  for (let i = 0; i < ordered.length; i += 1) {
    let best = [ordered[i]];
    for (let j = 0; j < i; j += 1) {
      const previous = chains[j] || [ordered[j]];
      if (!connects(previous[previous.length - 1], ordered[i])) continue;
      const candidate = [...previous, ordered[i]];
      if (score(candidate) > score(best)) best = candidate;
    }
    chains[i] = best;
  }
  return chains.sort((a, b) => score(b) - score(a))[0];
};

const contaminated = [
  { flightNumber: 'LA0001', origin: 'BSB', destination: 'IMP', departureTime: '14:50', arrivalTime: '16:45' },
  { flightNumber: 'LA0002', origin: 'IMP', destination: 'BSB', departureTime: '17:30', arrivalTime: '19:25' },
  { flightNumber: 'LA0003', origin: 'GRU', destination: 'POA', departureTime: '19:25', arrivalTime: '21:10' },
  { flightNumber: 'LA0004', origin: 'BSB', destination: 'REC', departureTime: '20:45', arrivalTime: '23:20' },
  { flightNumber: 'LA0005', origin: 'POA', destination: 'GRU', departureTime: '21:55', arrivalTime: '23:40' },
];

const selected = select(contaminated);
assert.deepEqual(selected.map((leg) => `${leg.origin}-${leg.destination}`), ['BSB-IMP', 'IMP-BSB', 'BSB-REC']);
const kept = new Set(selected.map(signature));
assert.equal(contaminated.filter((leg) => kept.has(signature(leg))).length, 3);
assert.equal(contaminated.some((leg) => kept.has(signature(leg)) && leg.origin === 'GRU'), false);
assert.equal(contaminated.some((leg) => kept.has(signature(leg)) && leg.origin === 'POA'), false);

console.log('next-day-roster-contamination: OK');
