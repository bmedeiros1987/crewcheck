import assert from 'node:assert/strict';
import fs from 'node:fs';

const compliance = fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8');
const pdf = fs.readFileSync('client/src/lib/pdfExport.ts', 'utf8');

assert.match(compliance, /function getOperationalLoadHours\(day: RosterDay\)/, 'routine must have a dedicated operational load duration');
assert.match(compliance, /const dutyHours = getOperationalLoadHours\(day\);/, 'routine must not reuse regulatory net duty as workload duration');
assert.match(compliance, /const competenceKey = `\$\{roster\.year \|\| ''\}-\$\{String\(roster\.month \|\| ''\)\.padStart\(2, '0'\)\}`;/, 'monthly metrics need an explicit target competence');
assert.match(compliance, /const competenceDays = sortedDays\.filter\(\(day\) => complianceDayMonthKey\(day\) === competenceKey\);/, 'adjacent days must not inflate month KPIs');
assert.doesNotMatch(compliance, /roster\.totals\?\.flightHours[\s\S]{0,120}metrics\.totalFlightHours\s*=\s*roster\.totals\.flightHours/, 'no raw PDF flight-hours aggregate may overwrite competence flight hours');
assert.match(compliance, /monthlyFlightBuckets\.find\(\(item\) => item\.key === competenceKey\)/, 'flight limit must evaluate the reference month, not the largest adjacent bucket');
assert.match(compliance, /alerts = alerts\.filter\(\(alert\) => \{[\s\S]*?parsed\.getFullYear\(\) === Number\(roster\.year\)/, 'dated alerts from adjacent months must not become current-month irregularities');
assert.match(compliance, /const competenceDays = days\.filter\(\(day\) => \{[\s\S]*?parsed\.getMonth\(\) \+ 1 === targetMonth;/, 'routine monthly grade must exclude adjacent context days');
assert.match(pdf, /const loadQueues = new Map<string, typeof compliance\.loadAnalysis\.days>\(\);/, 'PDF timeline must consume the same reconciled load analysis as routine');
assert.match(pdf, /analyzedDay\.dutyHours\.toFixed\(1\)/, 'PDF timeline duration must use reconciled operational hours');

console.log('Roster derived consistency regression OK');
