import assert from 'node:assert/strict';
import fs from 'node:fs';
import {repairHomeContinuity, repairHomeDestinations, repairRosterDeparture} from './roster-startup/home-continuity.mjs';

const fence = 'rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster';
const old = `${fence}
  const rosterEvents = useMemo(() => buildLegs(rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster), [rosterWindow, bundle.roster]);
function Cockpit({ events, compliance }: { events: ZeroLeg[]; compliance: unknown }) {
 if (one) return <PersonalizedCockpit events={events}/>;
 if (two) return <PersonalizedCockpit events={events}/>;
 return <PersonalizedCockpit events={events}/>;
}
function PersonalizedCockpit({ events, compliance }: { events: ZeroLeg[]; compliance: unknown }) {
 return <HomeRosterPreview events={events} onNavigate={setView}/>;
}
<Cockpit events={events} compliance={reviewableCompliance(compliance, bundle.roster)}/>`;
const fixed = repairHomeContinuity(old);
assert.match(fixed, /<Cockpit events=\{homeOperationalEvents\} displayEvents=\{rosterEvents\}/, 'operational selection must not use the historical window directly');
assert.match(fixed, /homeOperationalRoster\(bundle.roster, rosterWindowPrimaryRef.current === bundle.roster \? rosterWindow : bundle.roster\)/, 'preserve the existing publication/session fence');
assert.match(fixed, /<HomeRosterPreview events=\{displayEvents\} operationalEvents=\{events\}/, 'historical navigation and automatic next flight have separate inputs');
assert.equal((fixed.match(/<PersonalizedCockpit events=\{events\} displayEvents=\{displayEvents\}/g)||[]).length,3,'all three layout branches preserve both contracts');
assert.equal(repairHomeContinuity(old.replace('<Cockpit events={events}', '<Cockpit events={rosterEvents}')),fixed,'repair an already historical-wired composition too');
assert.equal(repairHomeContinuity(fixed), fixed, 'prepared repair must be idempotent');
assert.throws(() => repairHomeContinuity(old.replaceAll(fence, 'rosterWindow')), /session-fenced/);
assert.throws(() => repairHomeContinuity(fence), /unique Cockpit/);
assert.throws(() => repairHomeContinuity(old + '\n<Cockpit events={events}'), /unique Cockpit/);
function assertOperationalConsumers(source, preview) {
  assert.match(source, /<Cockpit events=\{homeOperationalEvents\} displayEvents=\{rosterEvents\} conflictDates=\{homeOperationalProjection.conflictDates\} compliance=\{reviewableCompliance\(compliance, bundle\.roster\)\}/);
  assert.match(source, /homeOperationalRoster\(bundle\.roster, rosterWindowPrimaryRef\.current === bundle\.roster \? rosterWindow : bundle\.roster\)/);
  assert.match(source, /<HomeRosterPreview events=\{displayEvents\} operationalEvents=\{events\}/);
  assert.match(preview, /<NextFlightGateCard events=\{operationalEvents\}\/>/);
  assert.match(preview, /const signature = rosterSourceSignature\(events\)/);
}
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
if (home.includes(fence)) assert.equal(repairHomeContinuity(home), home, 'actual prepared HOME must use the fenced history');
if (home.includes(fence)) {
  const preview = fs.readFileSync('client/src/components/v1391/HomeRosterPreview.tsx', 'utf8');
  assertOperationalConsumers(home, preview);
  for (const [source, consumer] of [
    [home.replace('<Cockpit events={homeOperationalEvents}', '<Cockpit events={rosterEvents}'), preview],
    [home.replace('displayEvents={rosterEvents}', 'displayEvents={homeOperationalEvents}'), preview],
    [home.replace('homeOperationalRoster(bundle.roster, rosterWindowPrimaryRef.current === bundle.roster ? rosterWindow : bundle.roster)', 'homeOperationalRoster(bundle.roster, rosterWindow)'), preview],
    [home.replace('compliance={reviewableCompliance(compliance, bundle.roster)}', 'compliance={reviewableCompliance(compliance, rosterWindow)}'), preview],
    [home.replace('<HomeRosterPreview events={displayEvents}', '<HomeRosterPreview events={events}'), preview],
    [home, preview.replace('<NextFlightGateCard events={operationalEvents}', '<NextFlightGateCard events={events}')],
  ]) assert.throws(() => assertOperationalConsumers(source, consumer), assert.AssertionError, 'reject swapped authority/history, missing publication fence and wrong compliance source');

  assert.equal(repairHomeDestinations(home), home, 'prepared contextual destinations must use the historical identity');
  assert.match(home, /flightSurfaceContext\?\.programId \? contextualFlightEvent : flightEvent/, 'missing explicit identity must not fall back to another flight');
  assert.match(home, /<strong>Alertas da escala ativa<\/strong>/, 'compliance counts must identify the active publication scope');
  const roster = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');
  assert.equal(repairRosterDeparture(roster), roster, 'roster action must carry its own program identity');
}
assert.throws(()=>repairHomeDestinations(''), /anchor missing/);
assert.throws(()=>repairRosterDeparture(''), /anchor missing/);
console.log('HOME continuity: narrow repair, fail-closed anchors and repeat stability PASS');
