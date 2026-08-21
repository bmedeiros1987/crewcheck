import assert from 'node:assert/strict';
import fs from 'node:fs';

const compliance = fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8');
const pdf = fs.readFileSync('client/src/lib/pdfExport.ts', 'utf8');

assert.match(compliance, /function getOperationalLoadHours\(day: RosterDay\)/, 'routine must have a dedicated operational load duration');
assert.match(compliance, /const dutyHours = getOperationalLoadHours\(day\);/, 'routine must not reuse regulatory net duty as workload duration');
assert.match(compliance, /const competenceKey = `\$\{roster\.year \|\| ''\}-\$\{String\(roster\.month \|\| ''\)\.padStart\(2, '0'\)\}`;/, 'monthly metrics need an explicit target competence');
assert.match(compliance, /const competenceDays = sortedDays\.filter\(\(day\) => complianceDayMonthKey\(day\) === competenceKey\);/, 'adjacent days must not inflate month KPIs');
assert.doesNotMatch(compliance, /if \(roster\.totals\?\.flightHours\) metrics\.totalFlightHours = roster\.totals\.flightHours;/, 'raw PDF aggregate must not overwrite competence flight hours');
// #526: o limite de voo passou a ser avaliado por janela móvel de 28 dias (ACT
// cl. 3.3.17), não por bucket de mês civil. O CONTRATO deste gate não mudou —
// a avaliação continua obrigada a respeitar a competência de referência em vez
// de pegar o maior bucket adjacente — mas o mecanismo sim: a restrição agora é
// o argumento `competenceKey` passado à janela. Sem esse argumento, uma janela
// inteiramente dentro do mês subsequente anexado viraria alerta desta
// competência, que é exatamente o que este gate existe para impedir.
assert.match(compliance, /worstFlightHoursWindow28Days\(sortedDays, competenceKey\)/, 'flight limit must evaluate 28-day windows restricted to the reference competence, not any adjacent-month window');
assert.doesNotMatch(compliance, /const monthlyFlightHoursForAlert = monthlyBucketToEvaluate\.flightHours;/, 'flight limit must not fall back to civil-month bucketing');
assert.match(compliance, /alerts = alerts\.filter\(\(alert\) => \{[\s\S]*?parsed\.getFullYear\(\) === Number\(roster\.year\)/, 'dated alerts from adjacent months must not become current-month irregularities');
assert.match(compliance, /const competenceDays = days\.filter\(\(day\) => \{[\s\S]*?parsed\.getMonth\(\) \+ 1 === targetMonth;/, 'routine monthly grade must exclude adjacent context days');
assert.match(pdf, /const loadQueues = new Map<string, typeof compliance\.loadAnalysis\.days>\(\);/, 'PDF timeline must consume the same reconciled load analysis as routine');
assert.match(pdf, /analyzedDay\.dutyHours\.toFixed\(1\)/, 'PDF timeline duration must use reconciled operational hours');

console.log('Roster derived consistency regression OK');
