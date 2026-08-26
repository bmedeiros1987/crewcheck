import '../../server/telegram-fast-ack.mjs';
import { handleAuthRoute } from './auth.mjs';
import { handleBidsCore } from './bidsCore.mjs';
import { handleBidsCalendar } from './bidsCalendar.mjs';
import { handleBidsScheduler } from './bidsNotify.mjs';
import { handleCrewLockRoute, handleCrewLockTelegram } from './crewlock.mjs';
import { cleanText, sendJson } from './common.mjs';
import { handleRoutineRoute } from './routine.mjs';
import { handleEmergencyRoute, handleEmergencyTelegram } from '../v1391/emergency.mjs';
import { handleStayProfileRoute } from '../v1391/stayProfile.mjs';
import { handlePartnerAccountsRoute } from '../v1410/partnerAccounts.mjs';
import { handleEmailHealthRoute } from '../v1412/emailHealth.mjs';
import { handleMailerSendWebhook } from '../v1412/mailersendWebhook.mjs';
import { handleAiswebHealthRoute } from '../v1412/aiswebHealth.mjs';
import { handleCiriumHealthRoute } from '../v1412/ciriumHealth.mjs';
import { handlePartnerGateApiRoute } from '../v1413/partnerGateApi.mjs';

function normalizeTelegramIntentText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, ' ')
    .trim();
}

function isCanonicalHealthPlacesIntent(message = {}) {
  const text = normalizeTelegramIntentText(message?.text || message?.caption || '');
  return /^(?:\/(?:farmacias|hospitais)(?:@\w+)?|farmacias|hospitais)$/.test(text);
}

export async function handleV139Route(req, res, url) {
  try {
    if (await handleMailerSendWebhook(req, res, url)) return true;
    if (await handleEmailHealthRoute(req, res, url)) return true;
    if (await handleAiswebHealthRoute(req, res, url)) return true;
    if (await handleCiriumHealthRoute(req, res, url)) return true;
    if (await handleAuthRoute(req, res, url)) return true;
    if (await handlePartnerGateApiRoute(req, res, url)) return true;
    if (await handlePartnerAccountsRoute(req, res, url)) return true;
    if (await handleEmergencyRoute(req, res, url)) return true;
    if (await handleStayProfileRoute(req, res, url)) return true;
    if (await handleBidsScheduler(req, res, url)) return true;
    if (await handleBidsCalendar(req, res, url)) return true;
    if (await handleBidsCore(req, res, url)) return true;
    if (await handleCrewLockRoute(req, res, url)) return true;
    if (await handleRoutineRoute(req, res, url)) return true;
    return false;
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error('[crewcheck:v1391]', cleanText(error?.code || error?.message || 'V1391_ERROR', 180));
    sendJson(res, status >= 400 && status < 600 ? status : 500, {
      ok: false,
      code: error?.code || 'V1391_ERROR',
      message: status >= 500 ? 'O CrewCheck não conseguiu concluir esta operação agora.' : error.message || 'Solicitação inválida.',
    });
    return true;
  }
}

export async function handleV139Telegram(updateOrMessage = {}, sendTelegram) {
  try {
    const update = updateOrMessage?.callback_query || updateOrMessage?.message || updateOrMessage?.edited_message
      ? updateOrMessage
      : { message: updateOrMessage };
    const message = update?.message || update?.edited_message || updateOrMessage || {};
    const isLiveLocation = Boolean(message?.location && (message.location.live_period || update?.edited_message));
    const shouldUseCanonicalHealthPlaces = isCanonicalHealthPlacesIntent(message);

    if (!isLiveLocation && !shouldUseCanonicalHealthPlaces && await handleEmergencyTelegram(update, sendTelegram)) return true;

    return await handleCrewLockTelegram(message, sendTelegram);
  } catch {
    return false;
  }
}

export const crewCheckV139 = {
  version: '14.1.3',
  modules: ['recovery', 'bids', 'crewlock-e2ee', 'routine', 'emergency', 'stay-profile', 'partner-accounts', 'partner-gate-api-v1', 'notifications-runtime', 'mailersend-webhook', 'email-health', 'aisweb-health', 'cirium-health'],
};
