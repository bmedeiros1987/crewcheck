import assert from 'node:assert/strict';
import fs from 'node:fs';

const database = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const rosterView = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');

// Finding A: after a preferred adjacent publication fails to open, the fallback must
// be selected from device-local history and remain constrained to the same verified
// crew and exact adjacent nominal competence. No generic by-id or cross-period escape.
assert.match(database, /async function openDisplayAdjacentCandidate\([\s\S]*preferredOpened[\s\S]*getLocalRosterSummaries\(72\)\.filter\(\(item\) => crewIdentityToken\(item\) === primaryCrew\)[\s\S]*adjacentRosterSummary\(localSameCrew, primary, offset\)/);
assert.match(database, /crewIdentityToken\(localOpened\.roster\) !== primaryCrew/);
assert.match(database, /rosterPeriodOrdinal\(localOpened\.roster\) !== wantedOrdinal/);
assert.match(database, /const adjacent = await openDisplayAdjacentCandidate\(primary, adjacentSummary, offset, primaryCrew\)/);

// Finding B: financeSnapshot(bundle.roster) remains tied to the operational primary
// roster, and the visual month receives an explicit competence token. Adjacent months
// therefore render an unavailable state instead of presenting a legitimate-looking 0.
assert.match(home, /finance=\{financeSnapshot\(bundle\.roster\)\}/);
assert.match(home, /financeMonth=\{Number\(bundle\.roster\.year\)[\s\S]*bundle\.roster\.month/);
assert.match(rosterView, /financeMonth\?: string/);
assert.match(rosterView, /const financeAvailable = !financeMonth \|\| selectedMonth === financeMonth;/);
assert.match(rosterView, /const scopedFinance = financeAvailable \? finance : undefined;/);
assert.match(rosterView, /financeAvailable \? money\(perDiemTotal\) : 'Indisponível'/);
assert.match(rosterView, /financeAvailable \? \(scopedFinance\?\.salary\?\.configured \? money\(production\) : 'Calibrar tarifa'\) : 'Indisponível'/);
assert.doesNotMatch(rosterView, /const salaryRows = finance\?\.salary\?\.rows/);
assert.doesNotMatch(rosterView, /const perDiemRows = finance\?\.perdiem\?\.rows/);

// Operational isolation remains sovereign: widening the Escala display must never
// replace the active roster used by Cockpit/current-next/compliance/finance.
assert.match(home, /const events = useMemo\(\(\) => buildLegs\(bundle\.roster\)/);
assert.match(home, /const rosterEvents = useMemo\(\(\) => buildLegs\(rosterWindow\)/);

console.log('[p2-530-adjacent-fallback-finance] PASS — fallback local é crew/competence-scoped e financeiro adjacente fica explicitamente indisponível.');
