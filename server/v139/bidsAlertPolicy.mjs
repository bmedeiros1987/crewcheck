import {validateNotificationSettings} from '../../shared/notificationSettings.mjs';
import crypto from 'node:crypto';
import { DEFAULT_NOTIFICATION_CHANNELS, selectedNotificationChannels, validateNotificationChannels } from '../../shared/notificationChannelPreferences.mjs';

export const DEFAULT_BIDS_ALERT_PREFERENCES = Object.freeze({ enabled: false, mode: 'auto', preferredTime: '09:00', quietStart: '22:00', quietEnd: '08:00', timezone: '', channels: DEFAULT_NOTIFICATION_CHANNELS });
const clock = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
export function validTimezone(value) {
  if (typeof value !== 'string' || !value || value.length > 80) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; } catch { return false; }
}
export function validateBidsPreferences(value) {
  if (!value || typeof value.enabled !== 'boolean' || !['auto', 'manual'].includes(value.mode) || ![value.preferredTime, value.quietStart, value.quietEnd].every(clock) || value.quietStart === value.quietEnd || (value.timezone !== '' && !validTimezone(value.timezone)) || (value.enabled && !validTimezone(value.timezone))) {
    throw Object.assign(new Error('Confira horário padrão, período de silêncio e seu fuso. Ativação exige fuso explícito.'), { status: 400 });
  }
  return { ...Object.fromEntries(Object.keys(DEFAULT_BIDS_ALERT_PREFERENCES).map(key => [key, value[key]])), channels: validateNotificationChannels(value.channels), ...(value.settings===undefined?{}:{settings:validateNotificationSettings(value.settings)}) };
}
const zonedEpoch = value => {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6] || 0) > 59) return null;
  const civil = new Date(0); civil.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (civil.getUTCFullYear() !== Number(match[1]) || civil.getUTCMonth() + 1 !== Number(match[2]) || civil.getUTCDate() !== Number(match[3])) return null;
  return Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
};
export function bidsCampaignPending(campaign) {
  const pending = [];
  if (!campaign?.id || !campaign?.revision || campaign?.source?.verified !== true || !campaign?.source?.label || !/^[a-f0-9]{64}$/.test(campaign?.source?.sha256 || '')) pending.push('comunicado vigente verificado');
  if (!validTimezone(campaign?.timezone)) pending.push('fuso oficial');
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(campaign?.targetMonth || '')) pending.push('competência');
  const opens = zonedEpoch(campaign?.opensAt), closes = zonedEpoch(campaign?.closesAt);
  if (opens == null) pending.push('instante de abertura confirmado');
  if (closes == null || (opens != null && (closes <= opens || closes - opens > 45 * 86400000))) pending.push('encerramento confirmado');
  if (campaign?.audience?.verified !== true || !campaign?.audience?.airline || !Array.isArray(campaign?.audience?.roles) || !campaign.audience.roles.length || campaign.audience.roles.some(role => typeof role !== 'string' || !role)) pending.push('público elegível verificado');
  return pending;
}
export function bidsAlertContextKey(ownerId, campaign) {
  return crypto.createHash('sha256').update(JSON.stringify([ownerId, campaign.id, campaign.revision, campaign.source.sha256, campaign.opensAt, campaign.closesAt, campaign.targetMonth, campaign.audience])).digest('hex');
}
function inQuiet(time, preferences) {
  const start = minutes(preferences.quietStart), end = minutes(preferences.quietEnd);
  return start < end ? time >= start && time < end : time >= start || time < end;
}

// A preview only: no provider, scheduler, queue, permission request or campaign mutation.
export function planBidsAlert({ campaign, preferences = DEFAULT_BIDS_ALERT_PREFERENCES, ownerId, eligibility, receipt, now = Date.now(), roster = { verified: false, intervals: [] } }) {
  let contextKey;
  const blocked = reason => ({ status: 'blocked', reason, candidateAt: null, scheduled: false, externalDelivery: false, ...(contextKey ? { contextKey } : {}) });
  const pending = bidsCampaignPending(campaign);
  if (pending.length) return { ...blocked('official_data_pending'), pending };
  if (!ownerId || eligibility?.verified !== true || eligibility?.eligible !== true || eligibility.ownerId !== ownerId || eligibility.campaignId !== campaign.id || eligibility.campaignRevision !== campaign.revision) return blocked('eligibility_unverified_or_outside_scope');
  contextKey = bidsAlertContextKey(ownerId, campaign);
  if (receipt?.ownerId === ownerId && receipt?.contextKey === contextKey && receipt?.submitted === true) return { ...blocked('already_did'), contextKey };
  try { preferences = validateBidsPreferences(preferences); } catch { return blocked('preferences_invalid'); }
  if (!preferences.enabled) return blocked('consent_absent');
  if (!selectedNotificationChannels(preferences.channels).length) return blocked('no_channel_selected');
  if (!Number.isFinite(now)) return blocked('clock_invalid');
  const opens = zonedEpoch(campaign.opensAt), closes = zonedEpoch(campaign.closesAt);
  if (now >= closes) return blocked('window_closed');
  const earliest = Math.max(opens, now), preferred = minutes(preferences.preferredTime);
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: preferences.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const intervals = roster?.verified === true && roster?.ownerId === ownerId && Array.isArray(roster.intervals) && roster.intervals.length <= 1000
    ? roster.intervals.filter(interval => Number.isFinite(interval.start) && Number.isFinite(interval.end) && interval.end > interval.start) : [];
  if (roster?.verified === true && (roster.ownerId !== ownerId || intervals.length !== roster.intervals?.length)) return blocked('roster_context_invalid');
  for (let instant = Math.ceil(earliest / 60000) * 60000; instant < closes; instant += 60000) {
    const time = minutes(formatter.format(instant));
    if (inQuiet(time, preferences)) continue;
    if (preferences.mode === 'manual' ? time !== preferred : time < preferred) continue;
    if (intervals.some(interval => instant >= interval.start && instant < interval.end)) continue;
    return {
      status: 'suggested', candidateAt: new Date(instant).toISOString(), timezone: preferences.timezone, mode: preferences.mode, contextKey,
      reason: preferences.mode === 'manual' ? 'manual_preference' : intervals.length ? 'auto_outside_known_roster_intervals' : 'auto_without_verified_roster',
      explanation: preferences.mode === 'manual' ? 'Horário escolhido, fora do período de silêncio.' : 'Sugestão fora do silêncio e dos compromissos conhecidos. Escala não comprova sono, descanso ou disponibilidade.',
      scheduled: false, externalDelivery: false,
    };
  }
  return blocked('no_allowed_time_before_deadline');
}

export {zonedEpoch as parseBidsInstant};
