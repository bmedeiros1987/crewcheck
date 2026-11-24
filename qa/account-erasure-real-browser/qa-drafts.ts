import {captureAuthSession} from './client/src/lib/authClient';
import {financialRateOwner, financialRateSession} from './client/src/lib/financialStatementLearning';
import {FORECAST_DRAFT_PREFIX, readLatestForecastDraft, saveForecastDraft} from './client/src/lib/financialForecastDrafts';

const kinds = ['vacation', 'thirteenth'] as const;

function context(owner: string) {
  const guard = captureAuthSession();
  const session = financialRateSession();
  if (financialRateOwner() !== owner || !session || !guard.isCurrent()) throw Error('Expected synthetic browser owner');
  return {guard, session};
}

export function snapshot(owner: string) {
  const prefix = FORECAST_DRAFT_PREFIX + encodeURIComponent(owner) + ':';
  return Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith(prefix)).sort()
    .map(key => [key, localStorage.getItem(key)]));
}

export function read(owner: string) {
  const scope = context(owner);
  const valid = kinds.every(kind => {
    const result = readLatestForecastDraft(kind, scope);
    return result.status === 'found' && result.record.ownerId === owner;
  });
  return {valid, bytes: snapshot(owner)};
}

export async function seed(owner: string) {
  const scope = context(owner);
  const thirteenth = await saveForecastDraft('thirteenth', {
    year:'2032', start:'', end:'', avos:'', amount:'', basis:'full_year_equivalent',
    source:'Synthetic browser draft', tax:'', loan:'', advance:'',
  }, null, scope);
  const vacation = await saveForecastDraft('vacation', {
    acquisitionStart:'2031-01-01', acquisitionEnd:'2031-12-31', split:false, starts:['',''],
    basis:'monthly_average', amounts:['',''], source:'Synthetic browser draft',
    retentions:['',''], consigned:['',''], advances:['',''],
  }, null, scope);
  if (thirteenth.status !== 'saved' || vacation.status !== 'saved') throw Error('Expected both synthetic drafts to save');
  return read(owner);
}
