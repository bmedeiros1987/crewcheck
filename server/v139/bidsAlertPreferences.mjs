import crypto from 'node:crypto';
import { parseJsonColumn, readBody, requireExistingIdentity, sendJson } from './common.mjs';
import { DEFAULT_BIDS_ALERT_PREFERENCES, bidsAlertContextKey, bidsCampaignPending, planBidsAlert, validateBidsPreferences } from './bidsAlertPolicy.mjs';
import { notificationChannelProjection } from '../../shared/notificationChannelPreferences.mjs';

// No current official announcement is configured. User reports and historical PBS
// tables cannot populate this registry. No sender/queue/provider is connected here.
export const CURRENT_BIDS_ALERT_CAMPAIGN = null;
export const bidsAlertStateKey = (email, ownerId) => `bids-alert-preferences:${crypto.createHash('sha256').update(JSON.stringify([email, ownerId])).digest('hex')}`;
const initial = (email, ownerId) => ({ email, ownerId, revision: 0, preferences: { ...DEFAULT_BIDS_ALERT_PREFERENCES }, receipt: null });
function ownState(value, email, ownerId) {
  if (!value || value.email !== email || value.ownerId !== ownerId || !Number.isSafeInteger(value.revision) || value.revision < 0) return initial(email, ownerId);
  return value;
}
function publicState(state, campaign, eligibility, now) {
  const pending = bidsCampaignPending(campaign);
  const preferences = (() => { try { return validateBidsPreferences(state.preferences); } catch { return { ...DEFAULT_BIDS_ALERT_PREFERENCES }; } })();
  const plan = planBidsAlert({ campaign, preferences, ownerId: state.ownerId, eligibility, receipt: state.receipt, now });
  const visible = pending.length === 0 && Boolean(plan.contextKey);
  return {
    ok: true, ownerId:state.ownerId, revision: state.revision, preferences, plan, pending,
    campaign: !visible ? null : { id: campaign.id, revision: campaign.revision, targetMonth: campaign.targetMonth, opensAt: campaign.opensAt, closesAt: campaign.closesAt, timezone: campaign.timezone, sourceLabel: campaign.source.label },
    canConfirmAlreadyDid: visible && now >= Date.parse(campaign.opensAt) && now < Date.parse(campaign.closesAt),
    alreadyDid: plan.reason === 'already_did', externalDelivery: false,
    channelStates: notificationChannelProjection({ preferences: preferences.channels, ownerId: state.ownerId, eventKey: plan.contextKey, sourceReady: false }),
    message: 'Preferências e sugestões no CrewCheck. Os avisos fora desta tela ainda não estão disponíveis neste fluxo.',
  };
}

function validDeclaration(campaign, eligibility, ownerId, body, now) {
  return bidsCampaignPending(campaign).length === 0 && eligibility?.verified === true && eligibility?.eligible === true && eligibility.ownerId === ownerId && eligibility.campaignId === campaign.id && eligibility.campaignRevision === campaign.revision && Number.isFinite(now) && now >= Date.parse(campaign.opensAt) && now < Date.parse(campaign.closesAt) && body.confirmed === true && body.contextKey === bidsAlertContextKey(ownerId, campaign);
}

export async function handleBidsAlertPreferences(req, res, url, {
  identify = requireExistingIdentity, read = readBody,
  getCampaign = () => CURRENT_BIDS_ALERT_CAMPAIGN,
  resolveEligibility = () => ({ verified: false, eligible: false }),
  clock = () => Date.now(),
} = {}) {
  if (!['/api/platform/bids/alert-preferences','/api/platform/notifications/preferences'].includes(url.pathname)) return false;
  res.setHeader('Cache-Control', 'no-store');
  const context = await identify(req, res);
  if (!context) return true;
  const ownerId = String(context.payload?.sub || '');
  if (!ownerId || String(context.profile?.public_id || '') !== ownerId) { sendJson(res, 401, { ok: false, message: 'Sessão da conta não é mais válida.' }); return true; }
  const key = bidsAlertStateKey(context.email, ownerId);
  if (req.method === 'GET') {
    const [rows] = await context.db.query('SELECT p.public_id,s.payload FROM crewcheck_platform_profiles p LEFT JOIN crewcheck_telegram_state s ON s.state_key=? WHERE p.email=? AND BINARY p.public_id=BINARY ?', [key, context.email, ownerId]);
    if (!rows[0]) { sendJson(res, 401, { ok: false, message: 'Sessão da conta não é mais válida.' }); return true; }
    const state = ownState(parseJsonColumn(rows[0]?.payload, null), context.email, ownerId);
    const campaign = getCampaign();
    sendJson(res, 200, publicState(state, campaign, await resolveEligibility(context, campaign), clock()));
    return true;
  }
  if (req.method !== 'POST') { sendJson(res, 405, { ok: false, message: 'Método não permitido.' }); return true; }
  const body = await read(req, 12000);
  if(url.pathname==='/api/platform/notifications/preferences'&&body?.ownerId!==ownerId){sendJson(res,409,{ok:false,message:'A conta mudou. Recarregue as preferências.'});return true;}
  if (!body || !['save-preferences', 'already-did'].includes(body.action) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || typeof body.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.requestId)) {
    sendJson(res, 400, { ok: false, message: 'Confira ação e versão das preferências.' }); return true;
  }
  const preferences = body.action === 'save-preferences' ? validateBidsPreferences(body.preferences) : null;
  let campaign = getCampaign(), eligibility = await resolveEligibility(context, campaign);
  // Incomplete source, forged client metadata or unknown audience cannot create a receipt.
  if (body.action === 'already-did' && !validDeclaration(campaign, eligibility, ownerId, body, clock())) {
    sendJson(res, 409, { ok: false, message: 'Janela, público ou confirmação ainda não validados. Nada foi enviado ou confirmado.' }); return true;
  }
  const connection = await context.db.getConnection();
  try {
    await connection.beginTransaction();
    const [owners] = await connection.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [context.email]);
    if (String(owners[0]?.public_id || '') !== ownerId) throw Object.assign(new Error('Sessão da conta não é mais válida.'), { status: 401 });
    await connection.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE state_key=state_key', [key, JSON.stringify(initial(context.email, ownerId))]);
    const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
    const state = ownState(parseJsonColumn(rows[0]?.payload, null), context.email, ownerId);
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify([body.action, preferences, body.contextKey || ''])).digest('hex');
    const duplicate = state.requestId === body.requestId && state.fingerprint === fingerprint;
    if (!duplicate && state.revision !== body.expectedRevision) throw Object.assign(new Error('As preferências mudaram. Recarregue antes de salvar.'), { status: 409 });
    let submittedAt;
    if (body.action === 'already-did' && !duplicate) {
      campaign = getCampaign();
      eligibility = await resolveEligibility(context, campaign);
      const writeNow = clock();
      if (!validDeclaration(campaign, eligibility, ownerId, body, writeNow)) throw Object.assign(new Error('A janela ou o vínculo mudou enquanto a confirmação aguardava. Nada foi confirmado.'), { status: 409 });
      submittedAt = new Date(writeNow).toISOString();
    }
    const next = duplicate ? state : { ...state, revision: state.revision + 1, requestId: body.requestId, fingerprint,
      ...(preferences ? { preferences: {...preferences,...(preferences.settings===undefined&&state.preferences?.settings?{settings:state.preferences.settings}:{})} } : { receipt: { ownerId, contextKey: body.contextKey, submitted: true, submittedAt } }),
    };
    if (!duplicate) await connection.query('UPDATE crewcheck_telegram_state SET payload=?,updated_at=NOW(3) WHERE state_key=?', [JSON.stringify(next), key]);
    await connection.commit();
    sendJson(res, 200, { ...publicState(next, campaign, eligibility, clock()), message: preferences ? 'Preferências salvas. Nenhum aviso foi agendado ou enviado.' : 'Você declarou que já fez BIDS nesta janela. Isso não comprova registro ou aceitação no sistema oficial. Nenhuma mensagem foi enviada.' });
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  return true;
}
