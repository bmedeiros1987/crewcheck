import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const database = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');

assert.match(database, /export async function openRosterDisplayWindow\(primary: CrewRoster\)/, 'P0 #673: janela histórica multi-competência ausente');
assert.match(home, /const \[rosterWindow, setRosterWindow\] = useState<CrewRoster>/, 'P0 #673: estado da janela histórica ausente');

const refreshStart = home.indexOf('const refreshRosterWindow = () => {');
assert.ok(refreshStart >= 0, 'P0 #673: refresh da janela histórica ausente');
const refreshSlice = home.slice(refreshStart, refreshStart + 1800);
const openStart = home.indexOf('void openRosterDisplayWindow(primary)', refreshStart);
assert.ok(openStart > refreshStart, 'P0 #673: materialização histórica assíncrona ausente');
const preOpenSlice = home.slice(refreshStart, openStart);

// Real-device failure: after importing a new competence the UI briefly/indefinitely
// fell back to the raw primary roster (which may contain only carry-in days of the
// previous month). A later unrelated import rebuilt the history and "healed" it.
// The display window must only commit the latest fully-materialized request.
assert.match(home, /const rosterWindowRequestRef = useRef\(0\)/, 'P0 #673: falta geração monotônica para impedir resultado stale');
assert.doesNotMatch(preOpenSlice, /setRosterWindow\(primary\);/, 'P0 #673: refresh não pode encolher a Escala antes de iniciar a materialização histórica');
assert.match(refreshSlice, /const requestId = \+\+rosterWindowRequestRef\.current/, 'P0 #673: refresh sem request id monotônico');
assert.match(refreshSlice, /requestId === rosterWindowRequestRef\.current/, 'P0 #673: resultado assíncrono antigo ainda pode sobrescrever o mais novo');

// A successful import must trigger a second refresh after persistence/sync settles,
// so the new bundle is already current when the historical window is rebuilt.
assert.match(home, /saveRosterAnalysis\([\s\S]{0,500}\.finally\(\(\) => \{[\s\S]{0,500}crewcheck:roster-history-updated/, 'P0 #673: import não agenda refresh pós-persistência');

console.log('[p0-673] PASS — janela histórica não encolhe durante refresh, ignora respostas stale e recompõe após persistência.');
