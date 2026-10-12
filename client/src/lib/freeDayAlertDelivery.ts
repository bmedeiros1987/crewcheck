import { financialRateOwner, financialRateSession } from './financialStatementLearning';
import { freeDayAlertText, type FreeDayAlert } from './freeDayPostponement';
import type { CrewCheckPulseMessage } from '@/components/pulse/pulseTypes';

export type FreeDayAlertRecord = {
  version: 1; owner: string; alert: FreeDayAlert; detectedAt: string;
  appNotice: 'published' | 'unavailable';
  external: { channel: 'device'; state: 'unavailable' | 'accepted_unconfirmed' | 'failed'; reason: string; requestedAt: string | null; delivered: false };
};
export const freeDayAlertHistoryKey = (owner: string) => 'crewcheck_free_day_alert_history_v1:' + encodeURIComponent(owner);
const locks = new Map<string, Promise<unknown>>();
export function readFreeDayAlertHistory(): FreeDayAlertRecord[] {
  const owner = financialRateOwner();
  if (!owner) return [];
  try {
    const items: unknown = JSON.parse(localStorage.getItem(freeDayAlertHistoryKey(owner)) || '[]');
    return Array.isArray(items) ? items.filter(item => item?.version === 1 && item.owner === owner
      && typeof item.alert?.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.alert.date)
      && ['oldClock','newClock','afterVersion','beforeVersion'].every(key => typeof item.alert[key] === 'string')
      && Number.isFinite(item.alert.delayMinutes) && item.alert.delayMinutes > 240 && item.alert.payment === 'unconfirmed'
      && ['unavailable','accepted_unconfirmed','failed'].includes(item.external?.state) && item.external?.delivered === false) : [];
  } catch { return []; }
}
export async function publishFreeDayAlert(alert: FreeDayAlert, expectedSession: string | null,
  publish: (message: CrewCheckPulseMessage) => { pulse: boolean; notification: boolean }, deviceEnabled: boolean): Promise<FreeDayAlertRecord | null> {
  const owner = financialRateOwner();
  const valid = () => Boolean(owner && expectedSession) && expectedSession === financialRateSession() && owner === financialRateOwner();
  if (!valid() || !owner) return null;
  const execute = () => {
    if (!valid()) return null;
    const history = readFreeDayAlertHistory();
    const existing = history.find(item => item.alert.id === alert.id);
    if (existing) return existing;
    const detectedAt = new Date().toISOString();
    const sharedLock = typeof navigator !== 'undefined' && Boolean(navigator.locks?.request);
    const externalAllowed = deviceEnabled && sharedLock;
    const record: FreeDayAlertRecord = { version: 1, owner, alert, detectedAt, appNotice: 'unavailable',
      external: { channel: 'device', state: 'unavailable', reason: deviceEnabled
        ? 'Deduplicação entre abas indisponível; nenhum envio externo foi solicitado.'
        : 'Canal do dispositivo desabilitado, sem permissão prévia ou não suportado.', requestedAt: null, delivered: false } };
    // Reserve the owner/version key before dispatch. Storage failure stops sending.
    try { localStorage.setItem(freeDayAlertHistoryKey(owner), JSON.stringify([...history, record])); } catch { return null; }
    if (!valid()) return null;
    try {
      const result = publish({ id: `free-day:${owner}:${alert.id}`, dedupeKey: `free-day:${owner}:${alert.id}`,
        category: 'compliance', tone: 'atencao', priority: 'alta', title: 'Início da folga postergado',
        detail: freeDayAlertText(alert), pulseCooldownMs: 24 * 60 * 60_000,
        systemNotification: externalAllowed ? 'always' : 'never', notificationTag: `free-day:${owner}:${alert.id}`,
        action: { label: 'Revisar folga', view: 'alerts' } });
      record.appNotice = result.pulse ? 'published' : 'unavailable';
      if (externalAllowed) record.external = { channel: 'device', state: result.notification ? 'accepted_unconfirmed' : 'failed',
        reason: result.notification ? 'Solicitação aceita pelo dispositivo; não há comprovante de entrega.' : 'O canal não confirmou aceitação; entrega não comprovada.',
        requestedAt: detectedAt, delivered: false };
    } catch { if (externalAllowed) record.external = { channel: 'device', state: 'failed', reason: 'Falha ao solicitar a notificação; entrega não comprovada.', requestedAt: detectedAt, delivered: false }; }
    if (!valid()) return null;
    try { localStorage.setItem(freeDayAlertHistoryKey(owner), JSON.stringify([...history, record])); } catch { return null; }
    return record;
  };
  const name = 'crewcheck:free-day-alert:' + owner;
  if (typeof navigator !== 'undefined' && navigator.locks?.request) return navigator.locks.request(name, execute);
  const previous = locks.get(name) || Promise.resolve();
  const task = previous.then(execute, execute); locks.set(name, task);
  try { return await task; } finally { if (locks.get(name) === task) locks.delete(name); }
}
