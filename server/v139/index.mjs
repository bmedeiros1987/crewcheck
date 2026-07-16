import { handleAuthRoute } from './auth.mjs';
import { handleBidsCore } from './bidsCore.mjs';
import { handleBidsCalendar } from './bidsCalendar.mjs';
import { handleBidsScheduler } from './bidsNotify.mjs';
import { handleCrewLockRoute, handleCrewLockTelegram } from './crewlock.mjs';
import { cleanText, sendJson } from './common.mjs';
import { handleRoutineRoute } from './routine.mjs';

export async function handleV139Route(req, res, url) {
  try {
    if (await handleAuthRoute(req, res, url)) return true;
    if (await handleBidsScheduler(req, res, url)) return true;
    if (await handleBidsCalendar(req, res, url)) return true;
    if (await handleBidsCore(req, res, url)) return true;
    if (await handleCrewLockRoute(req, res, url)) return true;
    if (await handleRoutineRoute(req, res, url)) return true;
    return false;
  } catch (error) {
    const status = Number(error?.status || 500);
    console.error('[crewcheck:v139]', cleanText(error?.code || error?.message || 'V139_ERROR', 180));
    sendJson(res, status >= 400 && status < 600 ? status : 500, {
      ok: false,
      code: error?.code || 'V139_ERROR',
      message: status >= 500 ? 'O CrewCheck não conseguiu concluir esta operação agora.' : error?.message || 'Solicitação inválida.',
    });
    return true;
  }
}

export async function handleV139Telegram(message = {}, sendTelegram) {
  try {
    return await handleCrewLockTelegram(message, sendTelegram);
  } catch {
    return false;
  }
}

export const crewCheckV139 = {
  version: '13.9.0',
  modules: ['recovery', 'bids', 'crewlock-e2ee', 'routine'],
};
