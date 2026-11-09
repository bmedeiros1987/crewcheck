// A legal deadline is not an employer deposit forecast or a bank receipt.
export const VACATION_PAYMENT_LAW = Object.freeze({
  version:'Lei13475:art71:v1',
  source:'https://planalto.gov.br/ccivil_03/_ato2015-2018/2017/lei/l13475.htm',
  article:71,
});
const day = value => typeof value === 'string' && /^(?:19|[2-9]\d)\d{2}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value+'T12:00:00Z')) && new Date(value+'T12:00:00Z').toISOString().slice(0,10) === value;
/** Start is a civil date from an owner-bound vacation plan. Month-only plans
 * remain useful for approximate amount planning, but cannot yield an exact
 * deadline. No business-day/weekend roll-forward is inferred. */
export function vacationPaymentTiming({ownerId, plan, lawApplicable} = {}) {
  const pending = reason => ({state:'pending', deadlineDate:null, expectedDepositDate:null, paymentConfirmed:false, reason, rule:VACATION_PAYMENT_LAW});
  if (typeof ownerId !== 'string' || !ownerId.trim() || !plan || plan.ownerId !== ownerId) return pending('owner_mismatch');
  if (!Number.isSafeInteger(plan.revision) || plan.revision < 1) return pending('revision_missing');
  if (lawApplicable !== true) return pending('applicable_law_not_confirmed');
  if (plan.startDate == null || plan.startDate === '') return pending('start_date_missing');
  if (!day(plan.startDate)) return pending('start_date_invalid');
  const date = new Date(plan.startDate+'T12:00:00Z');
  date.setUTCDate(date.getUTCDate()-2);
  return {state:'deadline_known', startDate:plan.startDate, deadlineDate:date.toISOString().slice(0,10),
    expectedDepositDate:null, paymentConfirmed:false, reason:null, rule:VACATION_PAYMENT_LAW};
}
