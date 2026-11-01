import type { InflightRestAlarm, InflightRestPlan } from '@shared/inflightRestPlan.mjs';
import type { LocalAlarmJob } from './localAlarms';

/** Hard OFF: the in-flight rest view renders nothing and arms nothing while false. */
export const INFLIGHT_REST_ALARM_ENABLED = false;

const pad = (value: number) => String(value).padStart(2, '0');

/** "YYYY-MM-DDTHH:mm" typed on this device → ISO instant with this device's offset at that moment. */
export function deviceLocalInstant(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  // A wall time skipped by a DST jump does not exist; refuse it instead of shifting it.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return `${value}:00${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

function copy(alarm: InflightRestAlarm, plan: InflightRestPlan) {
  if (alarm.kind === 'own-turn-end') return { title: 'Fim do seu descanso', body: `O turno ${alarm.turn} terminou. Hora de voltar.` };
  const next = plan.turns.find((turn) => turn.index === alarm.turn + 1);
  return next
    ? { title: 'Troca de descanso', body: `O turno ${alarm.turn} terminou; começa o turno ${next.index}.` }
    : { title: 'Fim do período de descanso', body: `O turno ${alarm.turn}, o último, terminou.` };
}

export function inflightRestJobs(plan: InflightRestPlan): LocalAlarmJob[] {
  return plan.alarms.map((alarm) => ({ id: `${alarm.kind}:${alarm.turn}`, at: alarm.epochMs, channel: alarm.channel, ...copy(alarm, plan) }));
}

export const INFLIGHT_REST_REASONS: Record<string, string> = {
  'invalid-instant': 'Confira o início e o fim do descanso.',
  'end-before-start': 'O fim precisa ser depois do início.',
  'window-too-long': 'O período passa de 20 horas.',
  'window-too-short': 'O período é curto demais para esse número de turnos (mínimo de 30 min por turno).',
  'invalid-turns': 'Escolha de 2 a 6 turnos.',
  'invalid-handover': 'A troca entre turnos vai de 0 a 30 min.',
  'invalid-my-turn': 'Escolha o seu turno.',
  disabled: 'Os alarmes de descanso ainda estão desativados nesta versão do app.',
  unavailable: 'Os alarmes de descanso funcionam no app Android do CrewCheck.',
  'signed-out': 'Entre na sua conta para programar alarmes.',
  'notifications-not-permitted': 'Permita as notificações do CrewCheck nas configurações do aparelho.',
  'arm-failed': 'O aparelho não aceitou o alarme. Nada ficou programado; tente de novo.',
  'account-changed': 'A conta mudou durante a programação. Nada ficou programado.',
  'too-many-alarms': 'Há alarmes demais programados. Cancele algum e tente de novo.',
  'journal-incomplete': 'Não foi possível confirmar os alarmes. Nada ficou programado; tente de novo.',
  'unconfirmed-response': 'O aparelho não confirmou os alarmes. Considere que nada ficou programado.',
};
export const inflightRestReason = (reason: string) => INFLIGHT_REST_REASONS[reason] || 'Não foi possível programar os alarmes.';
