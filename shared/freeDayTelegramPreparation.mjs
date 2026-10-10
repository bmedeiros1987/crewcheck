// Preparation only: no transport, SQL writes, provider imports or automatic callers.
import { createHash } from 'node:crypto';
export function prepareFreeDayTelegramJob(alert, context) {
  if (!context?.owner || context.consent !== true || context.linkVerified !== true || context.configurationVerified !== true
    || !/^\d{4}-\d{2}-\d{2}$/.test(alert?.date || '') || !Number.isFinite(alert?.delayMinutes) || alert.delayMinutes <= 240
    || !['sequenceId', 'beforeVersion', 'afterVersion'].every(key => typeof alert[key] === 'string' && alert[key])) return null;
  const key = createHash('sha256').update(JSON.stringify([context.owner, alert.sequenceId, alert.beforeVersion, alert.afterVersion])).digest('hex');
  return { enabled: false, channel: 'telegram', jobKey: `free-day:${key}`,
    message: `Início de folga postergado em ${alert.delayMinutes} minutos. Abra o CrewCheck para revisar horários e condições. Pagamento e entrega não confirmados.` };
}
