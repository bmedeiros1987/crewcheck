// OFF capability only. No route, database, env, network, medical inference or sender.
import { createHash } from 'node:crypto';
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)
  && !['__proto__','constructor','prototype'].includes(value);
const actions = ['confirm', 'offer-help', 'assist', 'cancel', 'more-help'];
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const clone = value => structuredClone(value);
const denied = code => ({ handled: true, code, notificationState: 'not_sent' });

/** Called only with the existing server's reviewed recipient selection/preview.
 * IDs are internal references. No phone, coordinates, health text or room is stored here.
 */
export function medicalCoordinationDraft(input) {
  if (!input || Object.keys(input).some(k => !['alertId','ownerId','previewId','recipientIds','createdAt','draftExpiresAt'].includes(k))
    || ![input.alertId,input.ownerId,input.previewId].every(id)
    || !Array.isArray(input.recipientIds) || !input.recipientIds.length
    || !input.recipientIds.every(id) || new Set(input.recipientIds).size !== input.recipientIds.length
    || input.recipientIds.includes(input.ownerId) || !Number.isFinite(input.createdAt)
    || !Number.isFinite(input.draftExpiresAt) || input.draftExpiresAt <= input.createdAt) throw Error('MEDICAL_DRAFT_INVALID');
  return { ...clone(input), kind: 'medical', phase: 'draft', revision: 0, round: 0,
    primaryHelperId: null, offers: {}, offerHistory: [], roundRecipientIds: [], seen: [], pauseNewCalls: false, lastRequestAt: null };
}

function transition(state, command, auth, policy, at) {
  const fail = code => ({ code, state, effects: [], cancelPending: false, changed: false });
  if (!state || state.kind !== 'medical' || state.ownerId !== auth.ownerId || state.alertId !== command.alertId || auth.alertId !== state.alertId
    || !id(auth.actorId) || !id(command.requestId) || !actions.includes(command.action)) return fail('SCOPE_DENIED');
  if (state.seen.includes(command.requestId)) return fail('DUPLICATE');
  const owner = auth.actorId === state.ownerId;
  if (command.action !== 'offer-help' && (!owner || auth.confirmation?.action !== command.action
    || auth.confirmation?.alertId !== state.alertId || auth.confirmation?.revision !== state.revision)) return fail('CONFIRMATION_REQUIRED');
  if (state.phase === 'assisted' || state.phase === 'cancelled') return fail('CLOSED');
  const contacted = auth.contactedRecipientIds;
  const needsLedger = command.action !== 'confirm' && !(state.phase === 'draft' && command.action === 'cancel');
  if (needsLedger && (!Array.isArray(contacted) || new Set(contacted).size !== contacted.length
    || contacted.some(x => !state.recipientIds.includes(x)))) return fail('DELIVERY_LEDGER_REQUIRED');
  const next = clone(state), effects = [];
  let cancelPending = false;
  const notify = (event, recipients) => {
    for (const recipientId of [...new Set(recipients)]) effects.push({
      id: createHash('sha256').update(JSON.stringify([state.alertId,next.round,event,auth.actorId,recipientId])).digest('hex'), purpose: 'medical_emergency',
      event, recipientId, alertId: state.alertId, round: next.round, previewId: state.previewId,
    });
  };
  if (command.action === 'confirm') {
    if (state.phase !== 'draft' || at < state.createdAt || at >= state.draftExpiresAt
      || at >= state.createdAt + policy.alertTtlMs) return fail('DRAFT_EXPIRED');
    if (auth.channel !== 'whatsapp' || auth.previewId !== state.previewId
      || !Array.isArray(auth.authorizedRecipientIds) || !same(auth.authorizedRecipientIds, state.recipientIds)) return fail('RECIPIENTS_OR_CONSENT_CHANGED');
    if (state.recipientIds.length > policy.maxRecipients) return fail('RECIPIENT_LIMIT');
    next.phase = 'requesting'; next.round = 1; next.lastRequestAt = at; next.roundRecipientIds = [...state.recipientIds];
    notify('request_help', state.recipientIds);
  } else if (command.action === 'offer-help') {
    if (owner || !['requesting','help_on_way'].includes(state.phase) || !state.roundRecipientIds.includes(auth.actorId)
      || !contacted.includes(auth.actorId)
      || auth.recipientIntentCurrent !== true
      || auth.recipientConsentCurrent !== true || auth.availableNow !== true || auth.round !== state.round
      || at < state.createdAt || at >= state.createdAt + policy.alertTtlMs) return fail('HELP_DENIED');
    if (Object.hasOwn(state.offers,auth.actorId)) return fail('DUPLICATE');
    next.offers[auth.actorId] = { at, role: state.primaryHelperId ? 'additional' : 'first' };
    if (!state.primaryHelperId) {
      next.primaryHelperId = auth.actorId; next.phase = 'help_on_way'; next.pauseNewCalls = true;
      cancelPending = true;
      notify('help_on_way', [state.ownerId, ...contacted.filter(x => x !== auth.actorId)]);
    } else notify('additional_help_offer', [state.ownerId]);
  } else if (command.action === 'assist' || command.action === 'cancel') {
    if (state.phase === 'draft' && command.action === 'assist') return fail('NOT_ACTIVE');
    next.phase = command.action === 'assist' ? 'assisted' : 'cancelled'; next.pauseNewCalls = true;
    cancelPending = state.phase !== 'draft';
    // Trusted admission resolves attempted/accepted/uncertain recipients from the
    // durable ledger; never notify a merely queued or arbitrary new address.
    if (state.phase !== 'draft') notify(next.phase, contacted);
  } else {
    if (!['requesting','help_on_way'].includes(state.phase) || auth.previewId !== state.previewId
      || !Array.isArray(auth.authorizedRecipientIds) || !same(auth.authorizedRecipientIds, state.recipientIds)) return fail('RECONFIRM_REQUIRED');
    if (state.round >= policy.maxRounds || at < state.lastRequestAt + policy.minRepeatMs
      || at >= state.createdAt + policy.alertTtlMs) return fail('REPEAT_LIMIT');
    const alreadyHelping = new Set([...state.offerHistory.flatMap(x => Object.keys(x.offers)), ...Object.keys(state.offers)]);
    const remaining = state.recipientIds.filter(x => !alreadyHelping.has(x));
    if (!remaining.length) return fail('NO_MORE_RECIPIENTS');
    next.offerHistory.push({ round: state.round, primaryHelperId: state.primaryHelperId, offers: clone(state.offers) });
    next.round++; next.phase = 'requesting'; next.pauseNewCalls = false; next.roundRecipientIds = remaining;
    next.primaryHelperId = null; next.offers = {}; next.lastRequestAt = at;
    cancelPending = true;
    notify('request_help', remaining);
    notify('more_help_requested', [...alreadyHelping]);
  }
  next.revision++; next.seen.push(command.requestId);
  return { code: 'RECORDED', state: next, effects, cancelPending, changed: true };
}

/** Repository contract: a durable atomic transaction holds state + unique effects
 * + medical/global budget reservation together; exceptions roll EVERYTHING back.
 * No production implementation is supplied by this OFF increment.
 */
export function createMedicalEmergencyCoordinator({ enabled = false, repository, admit, isCurrent,
  clock = Date.now, policy } = {}) {
  if (enabled !== true) return async () => ({ handled: false });
  if (typeof repository?.transact !== 'function' || typeof admit !== 'function' || typeof isCurrent !== 'function'
    || typeof clock !== 'function' || !policy || !['maxRecipients','maxRounds','minRepeatMs','alertTtlMs'].every(k => Number.isSafeInteger(policy[k]) && policy[k] > 0)) throw Error('MEDICAL_CONFIG');
  policy = Object.freeze(Object.fromEntries(['maxRecipients','maxRounds','minRepeatMs','alertTtlMs'].map(k=>[k,policy[k]])));
  return async command => {
    try {
      if (!command || !id(command.alertId) || !id(command.requestId)) return denied('COMMAND_INVALID');
      command = Object.freeze({alertId:command.alertId,action:command.action,requestId:command.requestId});
      const auth = await admit(command);
      if (!auth || isCurrent(auth) !== true) return denied('SCOPE_CHANGED');
      return await repository.transact(command.alertId, async tx => {
        const state = tx.read(), at = clock();
        if (!Number.isFinite(at) || isCurrent(auth) !== true) throw Error('MEDICAL_SCOPE_CHANGED');
        const proposed = transition(state, command, auth, policy, at);
        if (!proposed.changed) return denied(proposed.code);
        // This reservation is explicitly separate from personal Concierge credits.
        // It must fail closed until verified provider tariffs/global reserve exist.
        const reserved = proposed.effects.length === 0 || await tx.reserveMedicalEffects(proposed.effects, { purpose: 'medical_emergency', ordinaryQuota: false });
        const finalAt = clock();
        if (!Number.isFinite(finalAt) || finalAt < at || isCurrent(auth) !== true) throw Error('MEDICAL_SCOPE_CHANGED');
        const final = transition(state, command, auth, policy, finalAt);
        if (!final.changed || final.code !== proposed.code || !same(final.effects.map(x=>x.id), proposed.effects.map(x=>x.id))) throw Error('MEDICAL_EXPIRED');
        if (reserved !== true && ['confirm','more-help'].includes(command.action)) throw Error('MEDICAL_BUDGET_UNAVAILABLE');
        if (final.cancelPending) tx.cancelPendingRequests(state.round);
        tx.write(final.state);
        if (reserved === true) tx.enqueueEffects(final.effects);
        return { handled: true, code: final.code, phase: final.state.phase, revision: final.state.revision,
          notificationState: !final.effects.length ? 'not_required' : reserved === true ? 'reserved_not_sent' : 'blocked_budget',
          coordinationOnly: true, exclusiveAssistance: false };
      });
    } catch { return denied('COORDINATION_UNAVAILABLE'); }
  };
}
