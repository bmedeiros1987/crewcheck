import type { CrewCheckPulseMessage, CrewCheckPulsePriority } from './pulseTypes';

/**
 * Fila do CrewCheck Pulse.
 *
 * Regras:
 * - uma mensagem visível por vez;
 * - prioridade maior interrompe a atual e a devolve para a fila;
 * - mensagens da mesma prioridade preservam FIFO;
 * - dedupeKey/id substitui a versão anterior em vez de empilhar duplicatas;
 * - dispensa/auto-dismiss avançam para a próxima mensagem somente após a animação;
 * - publicação durante uma saída cancela a limpeza antiga e nunca apaga a mensagem nova.
 */

export type PulseSessionState = {
  message: CrewCheckPulseMessage | null;
  leaving: boolean;
  queued: number;
};

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
};

type QueueItem = {
  message: CrewCheckPulseMessage;
  sequence: number;
};

const defaultTimers: Timers = {
  set: (fn, ms) => (typeof window === 'undefined' ? null : window.setTimeout(fn, ms)),
  clear: (id) => {
    if (typeof window !== 'undefined' && id !== null && id !== undefined) window.clearTimeout(id as number);
  },
};

export const PULSE_LEAVE_MS = 180;
export const PULSE_QUEUE_LIMIT = 8;

const PRIORITY_WEIGHT: Record<CrewCheckPulsePriority, number> = {
  baixa: 0,
  normal: 1,
  alta: 2,
  critica: 3,
};

function priorityOf(message: CrewCheckPulseMessage): CrewCheckPulsePriority {
  return message.priority || 'normal';
}

function keyOf(message: CrewCheckPulseMessage): string {
  return String(message.dedupeKey || message.id || '').trim();
}

export function createPulseSession(
  onChange: (state: PulseSessionState) => void,
  options: { leaveMs?: number; timers?: Timers; queueLimit?: number } = {},
) {
  const leaveMs = options.leaveMs ?? PULSE_LEAVE_MS;
  const timers = options.timers ?? defaultTimers;
  const queueLimit = Math.max(1, options.queueLimit ?? PULSE_QUEUE_LIMIT);

  let state: PulseSessionState = { message: null, leaving: false, queued: 0 };
  let current: CrewCheckPulseMessage | null = null;
  let queue: QueueItem[] = [];
  let sequence = 0;
  let leaveTimer: unknown = null;
  let autoTimer: unknown = null;

  const clearTimer = (kind: 'leave' | 'auto') => {
    const timer = kind === 'leave' ? leaveTimer : autoTimer;
    if (timer === null) return;
    timers.clear(timer);
    if (kind === 'leave') leaveTimer = null;
    else autoTimer = null;
  };

  const commit = (leaving = state.leaving) => {
    state = { message: current, leaving, queued: queue.length };
    onChange(state);
  };

  const sortQueue = () => {
    queue.sort((a, b) => {
      const priority = PRIORITY_WEIGHT[priorityOf(b.message)] - PRIORITY_WEIGHT[priorityOf(a.message)];
      return priority || a.sequence - b.sequence;
    });
    if (queue.length > queueLimit) queue = queue.slice(0, queueLimit);
  };

  const enqueue = (message: CrewCheckPulseMessage) => {
    const key = keyOf(message);
    if (key) {
      const index = queue.findIndex((item) => keyOf(item.message) === key);
      if (index >= 0) {
        const sequenceValue = queue[index].sequence;
        queue[index] = { message, sequence: sequenceValue };
        sortQueue();
        return;
      }
    }
    queue.push({ message, sequence: sequence++ });
    sortQueue();
  };

  const scheduleAutoDismiss = () => {
    clearTimer('auto');
    const delay = Number(current?.autoDismissMs || 0);
    if (!current || current.dismissible === false || !Number.isFinite(delay) || delay <= 0) return;
    autoTimer = timers.set(() => {
      autoTimer = null;
      dismiss();
    }, delay);
  };

  const show = (message: CrewCheckPulseMessage) => {
    clearTimer('leave');
    current = message;
    commit(false);
    scheduleAutoDismiss();
  };

  const showNext = () => {
    clearTimer('auto');
    current = null;
    if (!queue.length) {
      commit(false);
      return;
    }
    const next = queue.shift()!.message;
    show(next);
  };

  const dismiss = () => {
    if (!current) return;
    clearTimer('auto');
    clearTimer('leave');
    commit(true);
    leaveTimer = timers.set(() => {
      leaveTimer = null;
      showNext();
    }, leaveMs);
  };

  return {
    get state() {
      return state;
    },

    publish(message: CrewCheckPulseMessage) {
      if (!message || !String(message.title || '').trim()) return;
      clearTimer('leave');

      const incomingKey = keyOf(message);
      const currentKey = current ? keyOf(current) : '';

      if (incomingKey && current && incomingKey === currentKey) {
        current = message;
        commit(false);
        scheduleAutoDismiss();
        return;
      }

      // Se a mensagem atual já estava saindo por ação do usuário/auto-dismiss,
      // ela não deve voltar à fila só porque outra chegou durante os 180 ms.
      if (state.leaving) {
        clearTimer('auto');
        current = null;
        show(message);
        return;
      }

      if (!current) {
        show(message);
        return;
      }

      const incomingPriority = PRIORITY_WEIGHT[priorityOf(message)];
      const currentPriority = PRIORITY_WEIGHT[priorityOf(current)];
      if (incomingPriority > currentPriority) {
        clearTimer('auto');
        enqueue(current);
        show(message);
        return;
      }

      enqueue(message);
      commit(false);
    },

    dismiss,

    clear() {
      clearTimer('auto');
      clearTimer('leave');
      queue = [];
      current = null;
      commit(false);
    },

    dispose() {
      clearTimer('auto');
      clearTimer('leave');
      queue = [];
    },
  };
}
