import type { CrewCheckPulseMessage } from './pulseTypes';

/**
 * Estado de uma única mensagem do Pulse, com dono único do timer de saída.
 *
 * Existe por causa de uma corrida real da fundação: dispensar uma mensagem
 * agendava `setMessage(null)` para 180 ms depois — e se outra mensagem chegasse
 * dentro dessa janela, o timer antigo apagava a mensagem nova. Para um banner
 * operacional isso é inaceitável: o aviso que acabou de chegar é justamente o
 * que não pode sumir.
 *
 * A lógica mora aqui, fora do componente, por um motivo prático: sem jsdom,
 * testing-library ou vitest no projeto, uma correção só dentro do React seria
 * verificável apenas lendo o texto do fonte. Esta frente já foi mordida duas
 * vezes por gates que afirmam texto em vez de comportamento — o gate textual do
 * #303 e o meu próprio falso positivo com "#546" lido como cor. Aqui o teste
 * executa a sequência de verdade, com relógio injetado.
 *
 * Escopo deliberadamente mínimo: uma mensagem por vez. Fila, prioridade e
 * integração com eventos reais continuam sendo slice 2.
 */

export type PulseSessionState = {
  message: CrewCheckPulseMessage | null;
  leaving: boolean;
};

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
};

const defaultTimers: Timers = {
  set: (fn, ms) => (typeof window === 'undefined' ? null : window.setTimeout(fn, ms)),
  clear: (id) => {
    if (typeof window !== 'undefined' && id !== null && id !== undefined) window.clearTimeout(id as number);
  },
};

export const PULSE_LEAVE_MS = 180;

export function createPulseSession(
  onChange: (state: PulseSessionState) => void,
  options: { leaveMs?: number; timers?: Timers } = {},
) {
  const leaveMs = options.leaveMs ?? PULSE_LEAVE_MS;
  const timers = options.timers ?? defaultTimers;

  let state: PulseSessionState = { message: null, leaving: false };
  let pending: unknown = null;

  const cancelPending = () => {
    if (pending === null) return;
    timers.clear(pending);
    pending = null;
  };

  const commit = (next: PulseSessionState) => {
    state = next;
    onChange(state);
  };

  return {
    get state() {
      return state;
    },

    /**
     * Publica uma mensagem. Cancela qualquer saída pendente: se o usuário
     * dispensou algo há 50 ms e um aviso novo chega agora, o aviso novo fica.
     */
    publish(message: CrewCheckPulseMessage) {
      if (!message || !message.title) return;
      cancelPending();
      commit({ message, leaving: false });
    },

    /** Inicia a saída animada. O estado só zera quando o timer completa. */
    dismiss() {
      if (!state.message) return;
      cancelPending();
      commit({ message: state.message, leaving: true });
      pending = timers.set(() => {
        pending = null;
        commit({ message: null, leaving: false });
      }, leaveMs);
    },

    /** Desmontagem: nenhum timer sobrevive ao componente. */
    dispose() {
      cancelPending();
    },
  };
}
