import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const database = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');

assert.match(database, /export async function openRosterDisplayWindow\(primary: CrewRoster\)/, 'P0 #673: historical display window missing');
assert.match(home, /const \[rosterWindow, setRosterWindow\] = useState<CrewRoster>/, 'P0 #673: historical roster window state missing');

const refreshStart = home.indexOf('const refreshRosterWindow = () => {');
assert.ok(refreshStart >= 0, 'P0 #673: historical window refresh missing');
const openStart = home.indexOf('void openRosterDisplayWindow(primary)', refreshStart);
assert.ok(openStart > refreshStart, 'P0 #673: async historical materialization missing');
const refreshSlice = home.slice(refreshStart, refreshStart + 2200);
const preOpenSlice = home.slice(refreshStart, openStart);

// Real-device class from #673/#675: a refresh must not immediately collapse a
// complete multi-month display window to the active competence while async history
// is still loading, and an older request must never win after a newer refresh starts.
assert.doesNotMatch(
  preOpenSlice,
  /setRosterWindow\(primary\);/,
  'P0 #673: refresh still collapses the visible history before async materialization completes',
);
assert.match(
  home,
  /const rosterWindowRequestRef = useRef\(0\)/,
  'P0 #673: monotonic generation guard missing; stale async refresh can still win',
);
assert.match(
  refreshSlice,
  /const requestId = \+\+rosterWindowRequestRef\.current/,
  'P0 #673: refresh does not allocate a monotonic request id',
);
assert.match(
  refreshSlice,
  /requestId === rosterWindowRequestRef\.current/,
  'P0 #673: async result is not gated by the latest request generation',
);

// saveRosterAnalysis emits the history event while React may still hold the previous
// active bundle. A settled follow-up refresh is required after persistence completes.
assert.match(
  home,
  /saveRosterAnalysis\([\s\S]{0,700}\.finally\(\(\) => \{[\s\S]{0,700}crewcheck:roster-history-updated/,
  'P0 #673: import does not schedule a post-persistence history refresh',
);

console.log('PASS P0 #530/#673 order-independent history lifecycle');
