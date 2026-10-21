// Pure projection over the existing salary engine's components. No payroll
// storage, tariff inference, role/fleet fallback, messaging or paid-state writes.
export const CABIN_DSR_RULE = Object.freeze({
  version: 'TAM-cabin-2025-2027:3.4.8:v1',
  effectiveFrom: '2025-12-01', effectiveTo: '2027-11-30',
  source: 'https://aeronautas.org.br/wp-content/uploads/2025/12/20251208-ACT-Aeronautas-Comissarios-25-27_v9-site.pdf',
  clause: '3.4.8',
});
const basisKeys = ['production', 'reserve', 'standby'];
const salaryKeys = ['base', 'fixedAdditions', ...basisKeys, 'chief', 'instructor'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const minor = value => Number.isSafeInteger(value) && value >= 0;
function monthBounds(month) {
  if (typeof month !== 'string' || !/^(?:19|[2-9]\d)\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, number] = month.split('-').map(Number);
  return {start: month+'-01', end: month+'-'+new Date(Date.UTC(year, number, 0)).getUTCDate()};
}
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const stamp = Date.parse(value+'T12:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10) === value;
}
function sourceIssue(value, context) {
  if (!value || value.ownerId !== context.ownerId) return 'owner_mismatch';
  if (value.competence !== context.competence) return 'competence_mismatch';
  if (!text(value.sourceId) || !Number.isSafeInteger(value.revision) || value.revision < 1) return 'source_missing';
  if (!day(value.effectiveFrom) || !day(value.effectiveTo) || value.effectiveFrom > context.bounds.start || value.effectiveTo < context.bounds.end) return 'source_out_of_period';
  return null;
}
function assessComponents(input, keys, context) {
  const issues = [], known = new Map();
  if (!Array.isArray(input)) return {known, issues:[{code:'components_missing'}]};
  for (const key of keys) {
    const matches = input.filter(item => item?.key === key);
    if (matches.length !== 1) { issues.push({key, code:matches.length ? 'duplicate_component' : 'component_missing'}); continue; }
    const value = matches[0];
    const issue = sourceIssue(value, context)
      || (value.currency !== 'BRL' ? 'currency_mismatch' : null)
      || (!['confirmed', 'estimated', 'unavailable'].includes(value.status) ? 'status_invalid' : null)
      || (value.status === 'unavailable' || value.amountMinor === null ? 'amount_unknown' : null)
      || (!minor(value.amountMinor) ? 'amount_invalid' : null);
    if (issue) issues.push({key, code:issue});
    else known.set(key, value.amountMinor);
  }
  return {known, issues};
}
function sum(values) {
  const result = [...values].reduce((total, value) => total + BigInt(value), 0n);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
// Round once at the DSR component boundary, half up; never round an hourly/km
// rate here. Printed historical amounts remain separate and are never rewritten.
function dsrMinor(basis, working, rest) {
  const numerator = BigInt(basis)*BigInt(rest), divisor = BigInt(working);
  const result = (numerator*2n+divisor)/(divisor*2n);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
function contextOf(args) {
  const bounds = monthBounds(args?.competence);
  return text(args?.ownerId) && bounds ? {ownerId:args.ownerId, competence:args.competence, bounds} : null;
}
function regimeIssue(profile, context) {
  if (!profile) return 'regime_missing';
  const issue = sourceIssue(profile, context);
  if (issue) return issue;
  if (profile.company !== 'TAM' || profile.role !== 'cabin') return 'act_not_applicable';
  if (!['NB','WB'].includes(profile.regime) || profile.review !== 'confirmed'
      || !['owner_reviewed','employer_document'].includes(profile.sourceKind)) return 'regime_not_proven';
  return null;
}

/** Basis is the existing engine's eligible production/reserve/standby, not
 * chief, fixed pay, indemnities or a total already containing DSR. Each zero
 * must be explicit. The caller must prove component inclusion and period scope. */
export function assessCabinDsr(args) {
  const empty = {state:'unavailable', amountMinor:null, knownBasisMinor:null, knownDsrSubtotalMinor:null,
    regime:null, rule:CABIN_DSR_RULE, paymentConfirmed:false};
  const context = contextOf(args);
  if (!context) return {...empty, pending:[{code:'scope_invalid'}]};
  const basis = assessComponents(args.components, basisKeys, context), pending = [...basis.issues];
  const applicable = context.bounds.start >= CABIN_DSR_RULE.effectiveFrom && context.bounds.end <= CABIN_DSR_RULE.effectiveTo;
  if (!applicable) pending.push({code:'act_out_of_period'});
  const profileIssue = regimeIssue(args.profile, context);
  if (profileIssue) pending.push({code:profileIssue});
  const basisIssue = sourceIssue(args.basisReview, context) || (args.basisReview?.review !== 'confirmed' ? 'basis_not_reviewed' : null);
  if (basisIssue) pending.push({code:'basis_not_reviewed', detail:basisIssue});
  const knownBasisMinor = basis.known.size ? sum(basis.known.values()) : null;
  if (basis.known.size && knownBasisMinor === null) pending.push({code:'amount_overflow'});
  const regime = !profileIssue && applicable ? args.profile.regime : null;
  const knownDsrSubtotalMinor = regime && !basisIssue && knownBasisMinor !== null
    ? dsrMinor(knownBasisMinor, regime === 'NB' ? 22 : 21, regime === 'NB' ? 8 : 9) : null;
  if (regime && knownBasisMinor !== null && !basisIssue && knownDsrSubtotalMinor === null) pending.push({code:'amount_overflow'});
  const complete = pending.length === 0;
  return {...empty, state:complete?'complete':knownDsrSubtotalMinor!==null?'partial':'unavailable',
    amountMinor:complete?knownDsrSubtotalMinor:null, knownBasisMinor, knownDsrSubtotalMinor, regime, pending};
}

/** One composition for app and Concierge over their SAME engine revision.
 * This does not calculate production, tariffs, chief or tax by another engine.
 * An independently reported DSR is reconciliation evidence, never added twice. */
export function composeSalaryWithDsr(args) {
  const context = contextOf(args), dsr = assessCabinDsr(args);
  const invalid = {state:'unavailable', grossMinor:null, knownSubtotalMinor:null, dsr,
    reportedDsrMinor:null, dsrDifferenceMinor:null, paymentConfirmed:false, pending:[{code:'scope_invalid'}]};
  if (!context || !Number.isSafeInteger(args.revision) || args.revision < 1) return invalid;
  const components = assessComponents(args.components, salaryKeys, context), pending = [...components.issues, ...dsr.pending];
  if (args.componentsExcludeDsr !== true) pending.push({code:'dsr_exclusion_not_proven'});
  if (Array.isArray(args.components) && args.components.some(item => !salaryKeys.includes(item?.key))) pending.push({code:'unexpected_component'});
  const sumWithoutDsr = components.known.size ? sum(components.known.values()) : null;
  const fullSum = sumWithoutDsr !== null && dsr.amountMinor !== null ? sum([sumWithoutDsr, dsr.amountMinor]) : null;
  if ((components.known.size && sumWithoutDsr === null) || (sumWithoutDsr !== null && dsr.amountMinor !== null && fullSum === null)) pending.push({code:'amount_overflow'});
  const knownSubtotalMinor = args.componentsExcludeDsr === true ? (dsr.amountMinor !== null ? fullSum : sumWithoutDsr) : null;
  let reportedDsrMinor = null, dsrDifferenceMinor = null;
  if (args.reportedDsr !== undefined) {
    const report = assessComponents([{...args.reportedDsr,key:'dsr'}], ['dsr'], context);
    if (args.reportedDsr?.status !== 'confirmed' || report.issues.length) pending.push({code:'reported_dsr_invalid'});
    else {
      reportedDsrMinor = report.known.get('dsr');
      if (dsr.amountMinor !== null) dsrDifferenceMinor = dsr.amountMinor - reportedDsrMinor;
    }
  }
  return {ownerId:context.ownerId, competence:context.competence, revision:args.revision,
    state:pending.length===0?'complete':knownSubtotalMinor!==null?'partial':'unavailable',
    grossMinor:pending.length===0?fullSum:null, knownSubtotalMinor, dsr,
    reportedDsrMinor, dsrDifferenceMinor, paymentConfirmed:false, pending};
}
