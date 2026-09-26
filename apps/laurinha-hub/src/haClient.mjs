/**
 * Cliente do Home Assistant.
 *
 * Tudo que fala com o HA passa por aqui, e so por aqui. Isso concentra em um
 * lugar as tres garantias que o projeto exige:
 *
 *  1. o token vive no processo do Hub e nunca sai em resposta ou log;
 *  2. toda chamada tem timeout e nunca deixa a TV pendurada;
 *  3. so servicos de uma lista permitida podem ser chamados, entao o Hub nao
 *     consegue apagar entidade nem reescrever configuracao do HA.
 */

import { ALLOWED_SERVICE_DOMAINS, FORBIDDEN_SERVICES } from './config.mjs';
import { ERRORS, HubError } from './errors.mjs';
import { redact } from './redact.mjs';

const UNAVAILABLE_STATES = new Set(['unavailable', 'unknown']);

export function isUnavailableState(state) {
  return state == null || UNAVAILABLE_STATES.has(String(state).toLowerCase());
}

export function createHaClient({ config, fetchImpl = globalThis.fetch, logger = console, now = Date.now }) {
  const { baseUrl, token, timeoutMs, retries } = config.ha;

  function assertConfigured() {
    if (!config.ha.configured) throw ERRORS.hubNotConfigured();
  }

  async function request(pathname, { method = 'GET', body = null } = {}) {
    assertConfigured();

    const url = `${baseUrl}${pathname}`;
    let lastNetworkError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: body == null ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const aborted = error?.name === 'TimeoutError' || error?.name === 'AbortError';
        lastNetworkError = aborted
          ? ERRORS.haTimeout(timeoutMs)
          : ERRORS.haUnreachable(redact(String(error?.message || error)));
        // Rede e timeout podem ser transitorios; 4xx/5xx nao sao reprocessados.
        if (attempt < retries) continue;
        throw lastNetworkError;
      }

      if (response.status === 401 || response.status === 403) throw ERRORS.haUnauthorized();
      if (response.status === 404) return { status: 404, data: null };
      if (!response.ok) throw ERRORS.haError(response.status);

      const text = await response.text();
      if (!text) return { status: response.status, data: null };
      try {
        return { status: response.status, data: JSON.parse(text) };
      } catch {
        return { status: response.status, data: text };
      }
    }

    throw lastNetworkError || ERRORS.haUnreachable('sem tentativas restantes');
  }

  return {
    get configured() {
      return config.ha.configured;
    },

    /** GET /api/ - liveness do HA, sem depender de nenhuma entidade. */
    async ping() {
      const started = now();
      await request('/api/');
      return { ok: true, latencyMs: now() - started };
    },

    /** Estado de uma entidade. Devolve null quando o HA nao conhece o ID. */
    async getState(entityId) {
      if (!entityId) return null;
      const { status, data } = await request(`/api/states/${encodeURIComponent(entityId)}`);
      if (status === 404 || !data) return null;
      return data;
    },

    /**
     * Estados de varias entidades em uma unica ida ao HA.
     * Devolve um Map entityId -> estado (ou undefined se nao existir).
     */
    async getStates(entityIds) {
      const wanted = new Set(entityIds.filter(Boolean));
      const result = new Map();
      if (!wanted.size) return result;

      const { data } = await request('/api/states');
      if (!Array.isArray(data)) return result;
      for (const entry of data) {
        if (entry && wanted.has(entry.entity_id)) result.set(entry.entity_id, entry);
      }
      return result;
    },

    /**
     * Chama um servico. Rejeita qualquer coisa fora da lista permitida antes
     * de tocar na rede.
     */
    async callService(domain, service, data = {}) {
      const fqn = `${domain}.${service}`;
      if (!ALLOWED_SERVICE_DOMAINS.has(domain) || FORBIDDEN_SERVICES.has(fqn)) {
        throw ERRORS.serviceNotAllowed(fqn);
      }
      const response = await request(
        `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`,
        { method: 'POST', body: data },
      );
      return response.data;
    },

    /**
     * Verifica que a entidade existe e esta disponivel antes de agir.
     * Falhar aqui gera erro amigavel em vez de um 500 vindo do HA.
     */
    async requireAvailableEntity(entityId, label) {
      const state = await this.getState(entityId);
      if (!state) throw ERRORS.entityNotFound(label || entityId);
      if (isUnavailableState(state.state)) throw ERRORS.entityUnavailable(label || entityId);
      return state;
    },

    /** Executa e converte qualquer erro inesperado em HubError. */
    async safe(operation, fallback = null) {
      try {
        return { ok: true, value: await operation() };
      } catch (error) {
        const hubError = error instanceof HubError ? error : ERRORS.haUnreachable(
          redact(String(error?.message || error)),
        );
        logger.warn?.('[hub] chamada ao Home Assistant falhou:', redact(hubError.message));
        return { ok: false, error: hubError, value: fallback };
      }
    },
  };
}
