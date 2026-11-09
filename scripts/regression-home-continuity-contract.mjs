import assert from 'node:assert/strict';
import fs from 'node:fs';
import {repairHomeContinuity, repairHomeDestinations, repairRosterDeparture} from './roster-startup/home-continuity.mjs';

const fence = 'rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster';
const old = `${fence}\n<Cockpit events={events} compliance={reviewableCompliance(compliance, bundle.roster)}/>`;
const fixed = repairHomeContinuity(old);
assert.equal(fixed, old.replace('<Cockpit events={events}', '<Cockpit events={rosterEvents}'));
assert.equal(repairHomeContinuity(fixed), fixed, 'prepared repair must be idempotent');
assert.throws(() => repairHomeContinuity(old.replace(fence, 'rosterWindow')), /session-fenced/);
assert.throws(() => repairHomeContinuity(fence), /unique Cockpit/);
assert.throws(() => repairHomeContinuity(old + '\n<Cockpit events={events}'), /unique Cockpit/);
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
if (home.includes(fence)) assert.equal(repairHomeContinuity(home), home, 'actual prepared HOME must use the fenced history');
if (home.includes(fence)) {
  assert.equal(repairHomeDestinations(home), home, 'prepared contextual destinations must use the historical identity');
  assert.match(home, /flightSurfaceContext\?\.programId \? contextualFlightEvent : flightEvent/, 'missing explicit identity must not fall back to another flight');
  assert.match(home, /<strong>Alertas da escala ativa<\/strong>/, 'compliance counts must identify the active publication scope');
  const roster = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');
  assert.equal(repairRosterDeparture(roster), roster, 'roster action must carry its own program identity');
}
assert.throws(()=>repairHomeDestinations(''), /anchor missing/);
assert.throws(()=>repairRosterDeparture(''), /anchor missing/);
console.log('HOME continuity: narrow repair, fail-closed anchors and repeat stability PASS');
