export const WAKEUP_CHANNELS = ['telegram','telegram-call','phone-call'];
export const WAKEUP_SELECTION_VERSION = 1;
export function normalizeWakeupChannels(value) {
  if (!Array.isArray(value) || value.some(item => !WAKEUP_CHANNELS.includes(item))) return null;
  return WAKEUP_CHANNELS.filter(item => value.includes(item));
}
export function inheritedWakeupChannels(value) {
  return value === 'telegram-call' ? ['telegram-call'] : value === 'ligacao' ? ['phone-call'] : value === 'ambos' ? ['telegram','phone-call'] : value === 'telegram' ? ['telegram'] : [];
}
export function wakeupSelectionReadiness(channels, readiness) {
  const selected = normalizeWakeupChannels(channels);
  if (!selected?.length) return {ready:false,channel:null,reason:'Escolha pelo menos um meio. Nenhum despertador foi ativado.'};
  if (selected.length > 1) return {ready:false,channel:null,reason:'Seleção múltipla salva como preferência. O envio combinado ainda não está disponível neste fluxo.'};
  if (selected[0] === 'phone-call') return {ready:false,channel:null,reason:'Agendamento de ligação telefônica pendente de número verificado e autorização neste fluxo. O teste manual é separado.'};
  if (selected[0] === 'telegram-call') return {ready:false,channel:null,reason:'Agendamento de ligação via Telegram pendente de vínculo, franquia e autorização neste fluxo. O teste manual é separado.'};
  if (readiness?.telegramConfigured !== true || readiness?.telegramLinked !== true) return {ready:false,channel:null,reason:readiness ? 'Mensagem Telegram indisponível: confira a configuração e o vínculo desta conta na central.' : 'Disponibilidade desta conta ainda não verificada. Reconecte para consultar.'};
  return {ready:true,channel:'telegram',reason:'Mensagem Telegram disponível para solicitar agendamento. Aceitação não confirma entrega nem despertar.'};
}
export async function wakeupAlarmScope(eventId, instant) {
  if (typeof eventId !== 'string' || !eventId.trim() || typeof instant !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(instant) || !Number.isFinite(Date.parse(instant))) return null;
  const civil=instant.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if(!civil)return null;const[y,m,d,h,minute,second]=civil.slice(1).map(Number),date=new Date(Date.UTC(y,m-1,d));
  if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d||h>23||minute>59||second>59)return null;
  const bytes = new TextEncoder().encode(JSON.stringify([eventId,new Date(instant).toISOString()]));
  const digest = await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
}
export function wakeupSelectionKey(ownerId,scope) {
  return typeof ownerId === 'string' && ownerId && /^[a-f0-9]{64}$/.test(scope || '') ? `crewcheck:wakeup-selection:v1:${encodeURIComponent(ownerId)}:${scope}` : null;
}
export function readWakeupSelection(storage,ownerId,scope) {
  const key = wakeupSelectionKey(ownerId,scope); if (!key) return null;
  try { const value=JSON.parse(storage.getItem(key)||'null'),channels=normalizeWakeupChannels(value?.channels); return value?.version===WAKEUP_SELECTION_VERSION && value.ownerId===ownerId && value.scope===scope && channels?.length ? channels : null; } catch { return null; }
}
export function saveWakeupSelection(storage,ownerId,scope,channels) {
  const key=wakeupSelectionKey(ownerId,scope),selected=normalizeWakeupChannels(channels);if(!key||!selected?.length)return false;
  try { storage.setItem(key,JSON.stringify({version:WAKEUP_SELECTION_VERSION,ownerId,scope,channels:selected}));return true; } catch { return false; }
}
export function clearWakeupSelection(storage,ownerId,scope) {
  const key=wakeupSelectionKey(ownerId,scope);if(!key)return false;try{storage.removeItem(key);return true;}catch{return false;}
}
export function phonePreferenceDisplay(value) {
  const digits=String(value||'').replace(/\D/g,'');return digits ? `Número informado · final ${digits.slice(-2)} · não verificado` : 'Número não informado · ligação telefônica indisponível';
}
