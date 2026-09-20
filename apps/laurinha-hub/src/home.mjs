/**
 * Acoes de casa: lights, sound, party, good_night, climate, alarm.
 *
 * Regra que guia o modulo inteiro: nenhum entity_id e inventado. Cada acao
 * precisa estar descrita em LAURINHA_HUB_CONFIG. Acao sem configuracao
 * responde `action_not_configured` dizendo exatamente qual chave falta -
 * nunca um palpite que possa acender a luz errada da casa.
 *
 * Execucao e tolerante: uma acao com varios passos tenta todos e relata
 * passo a passo, em vez de morrer no primeiro erro e deixar a casa no meio
 * do caminho sem ninguem saber onde parou.
 */

import { HOME_ACTIONS } from './config.mjs';
import { ERRORS, HubError, toHubError } from './errors.mjs';
import { isUnavailableState } from './haClient.mjs';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Monta o `data` de um passo a partir dos parametros do pedido.
 * So passa adiante o que o passo declarou aceitar, com faixa validada.
 */
function buildStepData(step, params) {
  const data = { ...(step.data || {}) };
  const spec = step.params;
  if (!spec || typeof spec !== 'object') return data;

  for (const [requestKey, rule] of Object.entries(spec)) {
    if (!(requestKey in params)) continue;
    const raw = params[requestKey];
    const target = typeof rule === 'string' ? rule : rule.to || requestKey;

    if (typeof rule === 'object' && (rule.min != null || rule.max != null)) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        throw ERRORS.badRequest(
          `Valor invalido para "${requestKey}".`,
          `${requestKey} precisa ser numero.`,
        );
      }
      data[target] = clamp(parsed, rule.min ?? Number.MIN_SAFE_INTEGER, rule.max ?? Number.MAX_SAFE_INTEGER);
    } else {
      data[target] = raw;
    }
  }
  return data;
}

function splitService(service) {
  const [domain, name] = String(service || '').split('.');
  if (!domain || !name) {
    throw ERRORS.badRequest(
      'Configuracao de acao invalida.',
      `"${service}" deve estar no formato "dominio.servico".`,
    );
  }
  return { domain, name };
}

export function createHomeService({ config, ha, sound, logger = console }) {
  function actionConfig(action) {
    const entry = config.homeActions?.[action];
    if (!entry || typeof entry !== 'object') return null;
    return entry;
  }

  /** Entidades que a TV quer ver na tela, so as configuradas. */
  function watchedEntities() {
    const ids = new Set(config.homeSensors);
    for (const action of HOME_ACTIONS) {
      const entry = actionConfig(action);
      for (const id of entry?.stateEntities || []) ids.add(String(id));
    }
    return [...ids];
  }

  async function readState() {
    const actions = HOME_ACTIONS.map((action) => {
      const entry = actionConfig(action);
      return {
        id: action,
        label: entry?.label || action,
        configured: Boolean(entry),
        available: Boolean(entry) && config.ha.configured,
        reason: !entry
          ? 'Acao ainda nao configurada no Hub.'
          : !config.ha.configured
            ? 'Hub ainda nao ligado ao Home Assistant.'
            : null,
        params: entry ? describeParams(entry) : [],
      };
    });

    const base = {
      ok: true,
      actions,
      entities: [],
      haReachable: config.ha.configured,
      error: null,
    };

    const ids = watchedEntities();
    if (!config.ha.configured) {
      return { ...base, ok: false, haReachable: false, error: ERRORS.hubNotConfigured().toJSON() };
    }
    if (!ids.length) return base;

    const probe = await ha.safe(() => ha.getStates(ids));
    if (!probe.ok) {
      return { ...base, ok: false, haReachable: false, error: probe.error.toJSON() };
    }

    const entities = ids.map((id) => {
      const entity = probe.value.get(id);
      if (!entity) {
        return { entityId: id, state: null, available: false, reason: 'Entidade nao existe no Home Assistant.' };
      }
      const unavailable = isUnavailableState(entity.state);
      return {
        entityId: id,
        name: entity.attributes?.friendly_name || id,
        state: entity.state,
        available: !unavailable,
        reason: unavailable ? 'Aparelho indisponivel agora.' : null,
      };
    });

    return { ...base, entities };
  }

  function describeParams(entry) {
    const params = new Map();
    for (const step of entry.steps || []) {
      for (const [key, rule] of Object.entries(step.params || {})) {
        params.set(key, {
          name: key,
          min: typeof rule === 'object' ? rule.min ?? null : null,
          max: typeof rule === 'object' ? rule.max ?? null : null,
        });
      }
    }
    if (entry.sound) params.set('volume', { name: 'volume', min: 0, max: 100 });
    return [...params.values()];
  }

  async function runSteps(steps, params) {
    const results = [];
    for (const [index, step] of steps.entries()) {
      const label = step.label || step.service || `passo ${index + 1}`;
      try {
        const { domain, name } = splitService(step.service);
        const data = buildStepData(step, params);
        const target = step.target && typeof step.target === 'object' ? step.target : null;
        const payload = target ? { ...target, ...data } : data;

        if (step.requireAvailable !== false && payload.entity_id) {
          const entityIds = Array.isArray(payload.entity_id) ? payload.entity_id : [payload.entity_id];
          for (const entityId of entityIds) {
            await ha.requireAvailableEntity(entityId, step.label || entityId);
          }
        }

        await ha.callService(domain, name, payload);
        results.push({ step: label, ok: true });
      } catch (error) {
        const hubError = error instanceof HubError ? error : toHubError(error);
        logger.warn?.('[hub] passo da acao falhou:', label, hubError.code);
        results.push({ step: label, ok: false, error: hubError.toJSON() });
      }
    }
    return results;
  }

  return {
    state: readState,

    listActions() {
      return HOME_ACTIONS.map((action) => ({ id: action, configured: Boolean(actionConfig(action)) }));
    },

    async run(action, params = {}) {
      if (!HOME_ACTIONS.includes(action)) {
        throw ERRORS.badRequest(
          'Essa acao nao existe.',
          `Acoes validas: ${HOME_ACTIONS.join(', ')}.`,
        );
      }
      const entry = actionConfig(action);
      if (!entry) throw ERRORS.actionNotConfigured(action, `homeActions.${action}`);
      if (!config.ha.configured && (entry.steps || []).length) throw ERRORS.hubNotConfigured();

      const results = await runSteps(entry.steps || [], params);

      // Parte de som do Modo Festa (ou de qualquer acao que declare `sound`).
      let soundResult = null;
      if (entry.sound) {
        const volume = params.volume != null
          ? clamp(Number(params.volume) || 0, 0, 100)
          : entry.sound.volume;
        try {
          await sound.applyPartySound({ outputId: entry.sound.output, volume });
          soundResult = { step: 'som ambiente', ok: true };
        } catch (error) {
          const hubError = error instanceof HubError ? error : toHubError(error);
          soundResult = { step: 'som ambiente', ok: false, error: hubError.toJSON() };
        }
        results.push(soundResult);
      }

      const failed = results.filter((result) => !result.ok);
      const succeeded = results.filter((result) => result.ok);

      // Tudo falhou: propaga o primeiro erro real, com o status dele.
      if (results.length && !succeeded.length) {
        const first = failed[0].error;
        throw new HubError(first.code, first.message, {
          status: first.code === 'entity_unavailable' ? 409 : 502,
          hint: first.hint,
          details: { steps: results },
        });
      }

      return {
        ok: failed.length === 0,
        action,
        label: entry.label || action,
        partial: failed.length > 0 && succeeded.length > 0,
        steps: results,
        // Mensagem pronta para a TV mostrar sem precisar montar texto.
        message: failed.length === 0
          ? `${entry.label || action}: tudo certo.`
          : `${entry.label || action}: ${succeeded.length} de ${results.length} passos funcionaram.`,
        frameMode: entry.frameMode === true ? { enable: true } : null,
      };
    },
  };
}
