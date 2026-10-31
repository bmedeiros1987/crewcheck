import assert from 'node:assert/strict';
import fs from 'node:fs';
import {repairHomeContinuity} from './roster-startup/home-continuity.mjs';

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
console.log('HOME continuity: narrow repair, fail-closed anchors and repeat stability PASS');
