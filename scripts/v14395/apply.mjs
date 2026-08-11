import fs from 'node:fs';

const MARKER = 'v14.3.95 roster derived consistency';
const compliancePath = 'client/src/lib/complianceEngine.ts';
const pdfPath = 'client/src/lib/pdfExport.ts';

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[${MARKER}] anchor not found: ${label}`);
  return source.replace(before, after);
}

if (!fs.existsSync(compliancePath) || !fs.existsSync(pdfPath)) {
  throw new Error(`[${MARKER}] required source files are missing`);
}

let compliance = fs.readFileSync(compliancePath, 'utf8');

// v14.3.84 normally adds this during the full prepare chain. Add it here too so
// the focused v14.3.95 gate can run directly and remain equivalent/idempotent.
const rosterCodesImport = "import { getRosterCodeDefinition } from './rosterCodes';";
const embeddedDoImport = "import { countMissingEmbeddedFormalDoIntervals } from './embeddedFormalDaysOff';";
if (!compliance.includes(embeddedDoImport)) {
  if (!compliance.includes(rosterCodesImport)) throw new Error(`[${MARKER}] rosterCodes import anchor missing`);
  compliance = compliance.replace(rosterCodesImport, `${rosterCodesImport}\n${embeddedDoImport}`);
}

compliance = replaceOnce(
  compliance,
  `function getDutyHours(day: RosterDay): number {\n  return getRegulatoryDutyBreakdown(day).dutyHours;\n}\n`,
  `function getDutyHours(day: RosterDay): number {\n  return getRegulatoryDutyBreakdown(day).dutyHours;\n}\n\n// ${MARKER}: rotina/timeline precisam de uma duração operacional coerente,\n// separada da jornada regulatória líquida. Usa a janela publicada quando plausível\n// e cai para o envelope dos voos quando a virada/continuação contaminou report/debrief.\nfunction getOperationalLoadHours(day: RosterDay): number {\n  if (isRecoveryDay(day) || isNonOperationalAbsence(day) || isEmptyCalendarDay(day)) return 0;\n  const legs = day.legs || [];\n  if ((isStandby(day) || isReserve(day)) && !legs.length) return 0;\n\n  const dutyWindowHours = getDutyWindowHours(day);\n  if (legs.length) {\n    const groundHours = getGroundIntervalHours(day);\n    const flightHours = getFlightHours(day);\n    const envelopeHours = getLegDutyEnvelopeHours(day);\n    if (isLikelyParserMergedDutyWindow(day, dutyWindowHours, groundHours, flightHours)) return round1(envelopeHours);\n    if (dutyWindowHours > 0 && dutyWindowHours <= 16) return round1(Math.max(dutyWindowHours, envelopeHours));\n    return round1(envelopeHours || flightHours);\n  }\n\n  if (dutyWindowHours > 0 && dutyWindowHours <= 16) return round1(dutyWindowHours);\n  if (typeof day.dutyHours === 'number' && day.dutyHours > 0 && day.dutyHours <= 16) return round1(day.dutyHours);\n  return 0;\n}\n`,
  'operational load helper',
);

const analyzeDayLoadsStart = compliance.indexOf('export function analyzeDayLoads(roster: CrewRoster): LoadAnalysis {');
if (analyzeDayLoadsStart < 0) throw new Error(`[${MARKER}] analyzeDayLoads missing`);
const beforeAnalyze = compliance.slice(0, analyzeDayLoadsStart);
let analyzeAndAfter = compliance.slice(analyzeDayLoadsStart);
analyzeAndAfter = replaceOnce(
  analyzeAndAfter,
  `    const dutyHours = getDutyHours(day);\n    const flightHours = getFlightHours(day);\n`,
  `    const dutyHours = getOperationalLoadHours(day);\n    const flightHours = getFlightHours(day);\n`,
  'routine duty source',
);

analyzeAndAfter = replaceOnce(
  analyzeAndAfter,
  `  const workedDays = days.filter(day => !day.isDayOff || day.fatigueScore > 10);\n  const averageScore = workedDays.length ? workedDays.reduce((sum, day) => sum + day.fatigueScore, 0) / workedDays.length : 0;\n  const hardBonus = days.filter(day => day.fatigueScore >= 78).length * 2;\n  const intensityScore = clamp(Math.round(averageScore + hardBonus), 0, 100);\n  const recoveryScore = clamp(100 - intensityScore, 0, 100);\n  const hardestDays = [...days].sort((a, b) => b.fatigueScore - a.fatigueScore).slice(0, 6);\n  const easiestDays = [...days]\n    .filter(day => day.gymScore >= 45)\n`,
  `  const targetYear = Number(roster.year);\n  const targetMonth = Number(roster.month);\n  const competenceDays = days.filter((day) => {\n    const parsed = parseDate(day.date);\n    return parsed.getFullYear() === targetYear && parsed.getMonth() + 1 === targetMonth;\n  });\n  const workedDays = competenceDays.filter(day => !day.isDayOff || day.fatigueScore > 10);\n  const averageScore = workedDays.length ? workedDays.reduce((sum, day) => sum + day.fatigueScore, 0) / workedDays.length : 0;\n  const hardBonus = competenceDays.filter(day => day.fatigueScore >= 78).length * 2;\n  const intensityScore = clamp(Math.round(averageScore + hardBonus), 0, 100);\n  const recoveryScore = clamp(100 - intensityScore, 0, 100);\n  const hardestDays = [...competenceDays].sort((a, b) => b.fatigueScore - a.fatigueScore).slice(0, 6);\n  const easiestDays = [...competenceDays]\n    .filter(day => day.gymScore >= 45)\n`,
  'routine competence aggregate',
);
compliance = beforeAnalyze + analyzeAndAfter;

// Full source preparation v14.3.84 inserts an all-days DO adjustment just before
// weekendPairs. Remove only that derived block: v14.3.95 reapplies the same rule
// against the reference-month slice, so adjacent-month DO cannot inflate August.
compliance = compliance.replace(
  /  \/\/ CC-0001\/#225:[\s\S]*?  if \(missingEmbeddedFormalDaysOff > 0\) \{\n    metrics\.totalDaysOff \+= missingEmbeddedFormalDaysOff;\n    metrics\.daysOff \+= missingEmbeddedFormalDaysOff;\n    metrics\.restDays \+= missingEmbeddedFormalDaysOff;\n  \}\n\n(?=  metrics\.weekendPairs = calculateWeekendPairs\(sortedDays\);)/,
  '',
);

compliance = replaceOnce(
  compliance,
  `  metrics.weekendPairs = calculateWeekendPairs(sortedDays);\n  metrics.averageTurnaround = restCount > 0 ? restTotal / restCount : 0;\n  metrics.maxConsecutiveNights = countMaxConsecutiveMadrugadas(sortedDays);\n  const maxNightOpsWindow = countNightOpsInRolling168h(sortedDays);\n\n  if (roster.totals?.flightHours) metrics.totalFlightHours = roster.totals.flightHours;\n  // Não usar total de duty do PDF para irregularidade: em PDFs convertidos ele pode\n  // incluir solo/pernoite/continuação e inflar a escala. Mantemos cálculo próprio.\n`,
  `  // ${MARKER}: dias adjacentes continuam no bundle para continuidade, mas não\n  // contaminam KPIs/cálculos da competência mensal principal.\n  const competenceKey = \`${'${roster.year || \'\'}'}-${'${String(roster.month || \'\').padStart(2, \'0\')}'}\`;\n  const competenceDays = sortedDays.filter((day) => complianceDayMonthKey(day) === competenceKey);\n  const competenceGroundIntervals = competenceDays.flatMap((day) => getGroundIntervals(day));\n  const competenceMissingEmbeddedFormalDaysOff = countMissingEmbeddedFormalDoIntervals(competenceDays);\n  metrics.totalFlightHours = competenceDays.reduce((sum, day) => sum + getFlightHours(day), 0);\n  metrics.totalDutyHours = competenceDays.reduce((sum, day) => sum + getRegulatoryWorkHoursForTotals(day), 0);\n  metrics.totalDaysOff = competenceDays.filter(isFormalDayOff).length + competenceMissingEmbeddedFormalDaysOff;\n  metrics.daysOff = metrics.totalDaysOff;\n  metrics.restDays = competenceDays.filter(isRecoveryDay).length + competenceMissingEmbeddedFormalDaysOff;\n  metrics.totalStandby = competenceDays.filter(isStandby).length;\n  metrics.standbyCount = metrics.totalStandby;\n  metrics.reserveCount = competenceDays.filter(isReserve).length;\n  metrics.nightOperations = competenceDays.filter(hasMadrugadaDuty).length;\n  metrics.totalGroundHours = competenceGroundIntervals.reduce((sum, interval) => sum + interval.minutes, 0) / 60;\n  metrics.maxGroundIntervalMinutes = competenceGroundIntervals.reduce((max, interval) => Math.max(max, interval.minutes), 0);\n  metrics.groundLimitExceedances = competenceGroundIntervals.filter((interval) => interval.minutes > (interval.period === 'diurno'\n    ? actRules.groundBetweenLegs.maxDayMinutes\n    : actRules.groundBetweenLegs.maxNightMinutes)).length;\n  metrics.weekendPairs = calculateWeekendPairs(competenceDays);\n  metrics.averageTurnaround = restCount > 0 ? restTotal / restCount : 0;\n  metrics.maxConsecutiveNights = countMaxConsecutiveMadrugadas(sortedDays);\n  const maxNightOpsWindow = countNightOpsInRolling168h(sortedDays);\n\n  // Totais agregados do PDF podem conter dias adjacentes/acumulados. A competência\n  // usa sempre os eventos normalizados do mês; continuidade permanece disponível.\n`,
  'competence metrics',
);

compliance = replaceOnce(
  compliance,
  `  const monthlyFlightBuckets = flightHoursByRosterMonth(sortedDays);\n  const isMultiMonthRoster = monthlyFlightBuckets.length > 1;\n  const monthlyBucketToEvaluate = isMultiMonthRoster\n    ? monthlyFlightBuckets.reduce((best, item) => item.flightHours > best.flightHours ? item : best, { key: '', flightHours: 0 })\n    : { key: \`${'${roster.year || \'\'}'}-${'${String(roster.month || \'\').padStart(2, \'0\')}'}\`, flightHours: metrics.totalFlightHours };\n  const monthlyFlightHoursForAlert = monthlyBucketToEvaluate.flightHours;\n`,
  `  const monthlyFlightBuckets = flightHoursByRosterMonth(sortedDays);\n  const isMultiMonthRoster = monthlyFlightBuckets.length > 1;\n  const monthlyBucketToEvaluate = monthlyFlightBuckets.find((item) => item.key === competenceKey)\n    || { key: competenceKey, flightHours: metrics.totalFlightHours };\n  const monthlyFlightHoursForAlert = monthlyBucketToEvaluate.flightHours;\n`,
  'target month flight bucket',
);

compliance = replaceOnce(
  compliance,
  `  alerts = sanitizeComplianceAlertsForProduction(auditAlertConfidence(alerts, sortedDays));\n`,
  `  // Alertas de dias adjacentes servem de contexto para continuidade, mas não podem\n  // virar irregularidade da competência principal. Alertas sem data (mensais/globais) permanecem.\n  alerts = alerts.filter((alert) => {\n    if (!alert.date) return true;\n    const parsed = parseDate(alert.date);\n    return parsed.getFullYear() === Number(roster.year) && parsed.getMonth() + 1 === Number(roster.month);\n  });\n  alerts = sanitizeComplianceAlertsForProduction(auditAlertConfidence(alerts, sortedDays));\n`,
  'adjacent alert filter',
);

fs.writeFileSync(compliancePath, compliance, 'utf8');

let pdf = fs.readFileSync(pdfPath, 'utf8');
pdf = replaceOnce(
  pdf,
  `  const timelineData = roster.days.map((day) => {\n    let details = '';\n`,
  `  // ${MARKER}: a timeline e a rotina compartilham a mesma duração operacional\n  // reconciliada; o parser/bundle original permanece intacto.\n  const loadQueues = new Map<string, typeof compliance.loadAnalysis.days>();\n  for (const analyzedDay of compliance.loadAnalysis.days) {\n    const key = \`${'${analyzedDay.date}'}|${'${analyzedDay.type}'}\`;\n    const queue = loadQueues.get(key) || [];\n    queue.push(analyzedDay);\n    loadQueues.set(key, queue);\n  }\n  const timelineData = roster.days.map((day) => {\n    const key = \`${'${day.date}'}|${'${day.type}'}\`;\n    const analyzedDay = loadQueues.get(key)?.shift();\n    let details = '';\n`,
  'timeline analysis queue',
);

pdf = replaceOnce(
  pdf,
  `      day.dutyHours ? \`${'${day.dutyHours.toFixed(1)}'}h\` : '-',\n      details,\n`,
  `      analyzedDay && analyzedDay.dutyHours > 0\n        ? \`${'${analyzedDay.dutyHours.toFixed(1)}'}h\`\n        : day.dutyHours ? \`${'${day.dutyHours.toFixed(1)}'}h\` : '-',\n      details,\n`,
  'timeline duty value',
);

fs.writeFileSync(pdfPath, pdf, 'utf8');
console.log(`[crewcheck:prepare] ${MARKER} applied`);
