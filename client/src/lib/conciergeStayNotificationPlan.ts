export type ConciergeStayReminderKind = 'wake' | 'presentation';

export type ConciergeStayReminderContext = {
  stayDate?: unknown;
  stayId?: unknown;
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

export type ConciergeStayReminderExistingJob = {
  jobKey?: unknown;
  job_key?: unknown;
  scheduledAt?: unknown;
  scheduled_at?: unknown;
  channel?: unknown;
  status?: unknown;
};

export type ConciergeStayReminderReconciliation = {
  enabled: boolean;
  reason: 'active-reminders' | 'no-active-reminders' | 'invalid-stay';
  schedule: ConciergeStayReminderPlanItem[];
  cancelJobKeys: string[];
  unchangedJobKeys: string[];
  deferredJobKeys: string[];
};

const PRESENTATION_REMINDER_MINUTES = 20;
const MINIMUM_FUTURE_MS = 60_000;
const COLLISION_WINDOW_MS = 10 * 60_000;
const RECONCILIATION_TIME_TOLERANCE_MS = 30_000;
const ACTIVE_REMINDER_STATUSES = new Set(['pending', 'processing']);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function validDate(value: unknown): Date | null {
  if (!(value instanceof Date)) return null;
  return Number.isFinite(value.getTime()) ? value : null;
}

function dateLike(value: unknown): Date | null {
  if (value instanceof Date) return validDate(value);
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function stayKey(value: unknown): string {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
}

function stableStayIdentity(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  const slug = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'stay';
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${slug}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function presentationLabel(context: ConciergeStayReminderContext): string {
  const explicit = text(context.presentationTime);
  if (/^\d{2}:\d{2}$/.test(explicit)) return explicit;
  const date = validDate(context.presentationAt);
  if (!date) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function existingJobKey(job: ConciergeStayReminderExistingJob): string {
  return text(job?.jobKey || job?.job_key);
}

function existingJobStatus(job: ConciergeStayReminderExistingJob): string {
  return text(job?.status).toLowerCase();
}

function existingJobScheduledAt(job: ConciergeStayReminderExistingJob): Date | null {
  return dateLike(job?.scheduledAt || job?.scheduled_at);
}

export function conciergeStayReminderJobKeys(
  stayDate: unknown,
  stayId?: unknown,
): Record<ConciergeStayReminderKind, string> | null {
  const day = stayKey(stayDate);
  if (!day) return null;
  const identity = stableStayIdentity(stayId);
  if (!identity) {
    return {
      wake: `concierge:stay:${day}:wake:v1`,
      presentation: `concierge:stay:${day}:presentation:v1`,
    };
  }
  return {
    wake: `concierge:stay:${day}:${identity}:wake:v2`,
    presentation: `concierge:stay:${day}:${identity}:presentation:v2`,
  };
}

export function buildConciergeStayReminderPlan(
  context: ConciergeStayReminderContext,
  nowInput: Date = new Date(),
): ConciergeStayReminderPlanItem[] {
  const now = validDate(nowInput) || new Date();
  const keys = conciergeStayReminderJobKeys(context?.stayDate, context?.stayId);
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

export function buildConciergeStayReminderReconciliation(
  stayDate: unknown,
  desiredPlan: ConciergeStayReminderPlanItem[],
  existingJobs: ConciergeStayReminderExistingJob[],
  desiredChannel: unknown,
  stayId?: unknown,
): ConciergeStayReminderReconciliation {
  const keys = conciergeStayReminderJobKeys(stayDate, stayId);
  if (!keys) {
    return {
      enabled: false,
      reason: 'invalid-stay',
      schedule: [],
      cancelJobKeys: [],
      unchangedJobKeys: [],
      deferredJobKeys: [],
    };
  }

  const allowedKeys = new Set(Object.values(keys));
  const existingByKey = new Map<string, ConciergeStayReminderExistingJob>();
  for (const job of Array.isArray(existingJobs) ? existingJobs : []) {
    const key = existingJobKey(job);
    if (!allowedKeys.has(key) || existingByKey.has(key)) continue;
    existingByKey.set(key, job);
  }

  const hasActiveReminder = [...existingByKey.values()].some((job) => ACTIVE_REMINDER_STATUSES.has(existingJobStatus(job)));
  if (!hasActiveReminder) {
    return {
      enabled: false,
      reason: 'no-active-reminders',
      schedule: [],
      cancelJobKeys: [],
      unchangedJobKeys: [],
      deferredJobKeys: [],
    };
  }

  const desiredByKey = new Map<string, ConciergeStayReminderPlanItem>();
  for (const item of Array.isArray(desiredPlan) ? desiredPlan : []) {
    if (allowedKeys.has(item?.jobKey)) desiredByKey.set(item.jobKey, item);
  }

  const desiredChannelNormalized = normalizeConciergeReminderChannel(desiredChannel);
  const schedule: ConciergeStayReminderPlanItem[] = [];
  const cancelJobKeys: string[] = [];
  const unchangedJobKeys: string[] = [];
  const deferredJobKeys: string[] = [];

  for (const key of Object.values(keys)) {
    const current = existingByKey.get(key);
    const desired = desiredByKey.get(key);
    const status = current ? existingJobStatus(current) : '';
    const isActive = ACTIVE_REMINDER_STATUSES.has(status);

    if (!desired) {
      if (status === 'processing') deferredJobKeys.push(key);
      else if (isActive) cancelJobKeys.push(key);
      continue;
    }

    if (!current || !isActive) {
      schedule.push(desired);
      continue;
    }

    const currentAt = existingJobScheduledAt(current);
    const sameTime = Boolean(currentAt) && Math.abs(currentAt!.getTime() - desired.scheduledAt.getTime()) <= RECONCILIATION_TIME_TOLERANCE_MS;
    const sameChannel = normalizeConciergeReminderChannel(current.channel) === desiredChannelNormalized;

    if (sameTime && sameChannel) {
      unchangedJobKeys.push(key);
      continue;
    }

    if (status === 'processing') {
      deferredJobKeys.push(key);
      continue;
    }

    schedule.push(desired);
  }

  return {
    enabled: true,
    reason: 'active-reminders',
    schedule,
    cancelJobKeys,
    unchangedJobKeys,
    deferredJobKeys,
  };
}
