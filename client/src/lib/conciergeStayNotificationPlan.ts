export type ConciergeStayReminderKind = 'wake' | 'presentation';

export type ConciergeStayReminderContext = {
  stayDate?: unknown;
  presentationTime?: unknown;
  presentationAt?: Date | null;
  wakeAt?: Date | null;
  isPast?: boolean;
};

export type ConciergeStayReminderPlanItem = {
  kind: ConciergeStayReminderKind;
  jobKey: string;
  scheduledAt: Date;
  title: string;
  message: string;
};

const PRESENTATION_REMINDER_MINUTES = 20;
const MINIMUM_FUTURE_MS = 60_000;
const COLLISION_WINDOW_MS = 10 * 60_000;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function validDate(value: unknown): Date | null {
  if (!(value instanceof Date)) return null;
  return Number.isFinite(value.getTime()) ? value : null;
}

function stayKey(value: unknown): string {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function presentationLabel(context: ConciergeStayReminderContext): string {
  const explicit = text(context.presentationTime);
  if (/^\d{2}:\d{2}$/.test(explicit)) return explicit;
  const date = validDate(context.presentationAt);
  if (!date) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function conciergeStayReminderJobKeys(stayDate: unknown): Record<ConciergeStayReminderKind, string> | null {
  const day = stayKey(stayDate);
  if (!day) return null;
  return {
    wake: `concierge:stay:${day}:wake:v1`,
    presentation: `concierge:stay:${day}:presentation:v1`,
  };
}

export function buildConciergeStayReminderPlan(
  context: ConciergeStayReminderContext,
  nowInput: Date = new Date(),
): ConciergeStayReminderPlanItem[] {
  const now = validDate(nowInput) || new Date();
  const keys = conciergeStayReminderJobKeys(context?.stayDate);
  const presentationAt = validDate(context?.presentationAt);
  const wakeAt = validDate(context?.wakeAt);
  if (!keys || !presentationAt || context?.isPast) return [];

  const presentation = presentationLabel(context) || 'horário salvo';
  const items: ConciergeStayReminderPlanItem[] = [];

  if (wakeAt && wakeAt.getTime() > now.getTime() + MINIMUM_FUTURE_MS) {
    items.push({
      kind: 'wake',
      jobKey: keys.wake,
      scheduledAt: new Date(wakeAt.getTime()),
      title: 'CrewCheck Concierge · Despertar',
      message: `Hora de iniciar sua preparação para a apresentação às ${presentation}. Confira seus itens e o próximo passo no CrewCheck.`,
    });
  }

  const presentationReminderAt = new Date(presentationAt.getTime() - PRESENTATION_REMINDER_MINUTES * 60_000);
  const collidesWithWake = items.some((item) => Math.abs(item.scheduledAt.getTime() - presentationReminderAt.getTime()) < COLLISION_WINDOW_MS);
  if (!collidesWithWake && presentationReminderAt.getTime() > now.getTime() + MINIMUM_FUTURE_MS) {
    items.push({
      kind: 'presentation',
      jobKey: keys.presentation,
      scheduledAt: presentationReminderAt,
      title: 'CrewCheck Concierge · Apresentação próxima',
      message: `Sua apresentação salva é às ${presentation}. Revise o deslocamento e os itens necessários; este lembrete não presume pickup nem horário de saída do hotel.`,
    });
  }

  return items.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export function normalizeConciergeReminderChannel(value: unknown): string {
  const raw = text(value).toLowerCase();
  const aliases: Record<string, string> = {
    ligacao: 'phone-call',
    ligação: 'phone-call',
    phone: 'phone-call',
    infobip: 'phone-call',
    ambos: 'telegram+phone-call',
    both: 'telegram+phone-call',
    all: 'telegram+telegram-call+phone-call',
  };
  const normalized = aliases[raw] || raw || 'telegram';
  const allowed = new Set([
    'telegram',
    'telegram-call',
    'phone-call',
    'telegram+telegram-call',
    'telegram+phone-call',
    'telegram-call+phone-call',
    'telegram+telegram-call+phone-call',
  ]);
  return allowed.has(normalized) ? normalized : 'telegram';
}

export function conciergeReminderChannelLabel(value: unknown): string {
  const channel = normalizeConciergeReminderChannel(value);
  const labels: Record<string, string> = {
    telegram: 'Telegram',
    'telegram-call': 'ligação via Telegram',
    'phone-call': 'ligação VoIP',
    'telegram+telegram-call': 'Telegram + ligação via Telegram',
    'telegram+phone-call': 'Telegram + ligação VoIP',
    'telegram-call+phone-call': 'ligação via Telegram + ligação VoIP',
    'telegram+telegram-call+phone-call': 'todos os canais do Despertador',
  };
  return labels[channel] || 'Telegram';
}
