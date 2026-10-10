/** Calendar dates are civil dates in the device's current zone, never UTC instants. */
export type ValidityDate = { kind: 'exact'; value: string } | { kind: 'month'; value: string } | { kind: 'permanent' } | { kind: 'unknown' };
export type ValidityEntry = {
  id: string; revision: number; category: 'license' | 'rating' | 'medical' | 'other'; label: string;
  expiry: ValidityDate; confirmed: boolean; origin: 'manual' | 'proposed';
  sourceCheck: 'pending' | 'verified' | 'invalid'; signatureCheck: 'unknown' | 'verified' | 'invalid';
  fitnessCheck: 'not_assessed'; supersededBy?: string;
};
export type TemporalState = 'unknown' | 'permanent' | 'within_period' | 'planning' | 'month_due' | 'expired';
export const DEFAULT_ALERT_DAYS = [90, 60, 30, 7, 0];
const DAY = 86_400_000;
export function civilToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
export function exactDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y,m,d] = value.split('-').map(Number);
  if (y < 1900 || y > 9998) return null;
  const stamp = Date.UTC(y,m-1,d), date = new Date(stamp);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m-1 && date.getUTCDate() === d ? stamp / DAY : null;
}
export function isValidityDate(value: unknown): value is ValidityDate {
  if (!value || typeof value !== 'object') return false;
  const v = value as ValidityDate;
  if (v.kind === 'unknown' || v.kind === 'permanent') return true;
  if (v.kind === 'exact') return typeof v.value === 'string' && exactDay(v.value) !== null;
  return v.kind === 'month' && typeof v.value === 'string' && /^\d{4}-\d{2}$/.test(v.value) && exactDay(v.value+'-01') !== null;
}
export function normalizeAlertDays(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('Informe marcos em dias.');
  const days = [...new Set(value)];
  if (!days.length || days.length > 12 || days.some(d => !Number.isInteger(d) || d < 0 || d > 730)) throw new Error('Use de 1 a 12 marcos, entre 0 e 730 dias.');
  return days.sort((a,b)=>b-a);
}
export function validateEntries(value: unknown): asserts value is ValidityEntry[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('Registros de validade inválidos.');
  const ids = new Set<string>();
  for (const v of value) {
    if (!v || typeof v.id !== 'string' || !v.id || ids.has(v.id) || !Number.isInteger(v.revision) || v.revision < 1
      || !['license','rating','medical','other'].includes(v.category) || typeof v.label !== 'string' || !v.label.trim() || v.label.length > 100
      || !isValidityDate(v.expiry) || typeof v.confirmed !== 'boolean' || !['manual','proposed'].includes(v.origin)
      || !['pending','verified','invalid'].includes(v.sourceCheck) || !['unknown','verified','invalid'].includes(v.signatureCheck)
      || v.fitnessCheck !== 'not_assessed' || (v.expiry.kind === 'permanent' && v.category !== 'license')
      || (v.supersededBy !== undefined && (typeof v.supersededBy !== 'string' || v.supersededBy === v.id))) throw new Error('Revise os registros de validade.');
    ids.add(v.id);
  }
  for (const v of value) if (v.supersededBy && !ids.has(v.supersededBy)) throw new Error('Renovação sem registro substituto.');
  for (const v of value) { const seen = new Set<string>(); let current = v; while (current.supersededBy) { if (seen.has(current.id)) throw new Error('Renovação circular.'); seen.add(current.id); current = value.find(x=>x.id===current.supersededBy)!; } }
}
export function legacyValidity(expiresAt?: string): ValidityEntry[] {
  return [{ id:'legacy-review',revision:1,category:'other',label:'Validade anterior · revisar',expiry:isValidityDate({kind:'exact',value:expiresAt}) ? {kind:'exact',value:expiresAt!} : {kind:'unknown'},confirmed:false,origin:'proposed',sourceCheck:'pending',signatureCheck:'unknown',fitnessCheck:'not_assessed' }];
}
export function validityLabel(expiry: ValidityDate): string {
  if (expiry.kind === 'permanent') return 'Licença permanente';
  if (expiry.kind === 'unknown') return 'Validade não informada';
  if (expiry.kind === 'month') return `Vence em ${expiry.value.slice(5)}/${expiry.value.slice(0,4)} · dia não informado`;
  return `Vence em ${expiry.value.split('-').reverse().join('/')}`;
}
export function assessValidity(entry: ValidityEntry, today = civilToday(), alertDays = DEFAULT_ALERT_DAYS): { state: TemporalState; days: number | null; conservative: boolean } {
  const now = exactDay(today);
  if (now === null || !isValidityDate(entry.expiry)) return {state:'unknown',days:null,conservative:false};
  const expiry = entry.expiry;
  if (expiry.kind === 'unknown' || expiry.kind === 'permanent') return {state:expiry.kind,days:null,conservative:false};
  const conservative = expiry.kind === 'month';
  const start = exactDay(expiry.value + (conservative ? '-01' : ''))!;
  const days = start-now;
  let state: TemporalState;
  if (conservative) {
    state = today.slice(0,7) > expiry.value ? 'expired' : today.slice(0,7) === expiry.value ? 'month_due' : days <= Math.max(...normalizeAlertDays(alertDays)) ? 'planning' : 'within_period';
  } else state = days < 0 ? 'expired' : days <= Math.max(...normalizeAlertDays(alertDays)) ? 'planning' : 'within_period';
  return {state,days,conservative};
}
export const TEMPORAL_LABELS: Record<TemporalState,string> = {unknown:'Data a conferir',permanent:'Permanente',within_period:'Dentro do período informado',planning:'Planejar renovação',month_due:'Mês de vencimento · conferir dia',expired:'Período informado encerrado'};
export type ValidityNotice = { key: string; entryId: string; revision: number; threshold: number; conservative: boolean; message: string };
export function dueValidityNotices(entries: ValidityEntry[], alertDays = DEFAULT_ALERT_DAYS, today = civilToday()): ValidityNotice[] {
  validateEntries(entries);
  const days = normalizeAlertDays(alertDays);
  return entries.flatMap(entry=>{
    if (entry.supersededBy || !entry.confirmed || entry.sourceCheck === 'invalid' || entry.signatureCheck === 'invalid') return [];
    const state = assessValidity(entry,today,days);
    if (state.days === null) return [];
    // One current milestone: reopening never floods historical thresholds.
    const threshold = [...days].reverse().find(d=>state.days! <= d);
    if (threshold === undefined) return [];
    return [{key:`${entry.id}:${entry.revision}:${threshold}`,entryId:entry.id,revision:entry.revision,threshold,conservative:state.conservative,
      message:state.conservative ? 'Marco conservador de planejamento a partir do início do mês informado. Dia oficial não informado. Revise no CrewLocker.' : 'Há um prazo informado para revisar no CrewLocker. Este aviso não autoriza operação.'}];
  });
}
/** Never carries document labels, medical classes, dates or identifiers to a transport. */
export function prepareValidityExternalNotice(): { enabled: false; message: string; reason: string } {
  return {enabled:false,message:'Há uma pendência para revisar no CrewLocker. Abra o aplicativo.',reason:'Entrega com o app fechado exige infraestrutura e consentimento; nenhum envio habilitado.'};
}
