import { authFetch, getStoredUser } from './authClient';
import {
  buildConciergeStayReminderReconciliation,
  conciergeReminderChannelLabel,
  conciergeStayReminderJobKeys,
  normalizeConciergeReminderChannel,
  type ConciergeStayReminderPlanItem,
} from './conciergeStayNotificationPlan';

export type ConciergeStayReminderJob = {
  id?: number | string;
  jobKey?: string;
  job_key?: string;
  scheduledAt?: string;
  scheduled_at?: string;
  channel?: string;
  status?: string;
  sentAt?: string | null;
  sent_at?: string | null;
  lastError?: string | null;
  last_error?: string | null;
};

export type ConciergeStayReminderDelivery = {
  channel: string;
  channelLabel: string;
  chatId: string;
  telegramUsername: string;
  phone: string;
};

function storageGet(key: string): string {
  if (typeof window === 'undefined' || !window.localStorage) return '';
  try { return String(window.localStorage.getItem(key) || '').trim(); }
  catch { return ''; }
}

function jobKeyOf(job: ConciergeStayReminderJob): string {
  return String(job?.jobKey || job?.job_key || '').trim();
}

async function cancelConciergeStayReminderJobKey(jobKey: string) {
  try {
    const payload = await authFetch<any>('/api/alarm/cancel', {
      method: 'POST',
      body: JSON.stringify({ jobKey }),
    });
    return { cancelled: Number(payload?.cancelled || 0), error: '' };
  } catch (error) {
    return {
      cancelled: 0,
      error: error instanceof Error ? error.message : `Não foi possível cancelar ${jobKey}.`,
    };
  }
}

export function getConciergeStayReminderDelivery(): ConciergeStayReminderDelivery {
  const channel = normalizeConciergeReminderChannel(storageGet('crewcheck_wakeup_channel') || 'telegram');
  const user = getStoredUser();
  return {
    channel,
    channelLabel: conciergeReminderChannelLabel(channel),
    chatId: storageGet('crewcheck_telegram_chat_id'),
    telegramUsername: storageGet('crewcheck_telegram_username').replace(/^@/, ''),
    phone: storageGet('crewcheck_wakeup_phone') || String(user?.phoneE164 || '').trim(),
  };
}

export async function listConciergeStayReminderJobs(stayDate: unknown, stayId?: unknown): Promise<ConciergeStayReminderJob[]> {
  const keys = conciergeStayReminderJobKeys(stayDate, stayId);
  if (!keys) return [];
  const wanted = new Set(Object.values(keys));
  const payload = await authFetch<any>('/api/alarm/scheduled', { cache: 'no-store' });
  const jobs = Array.isArray(payload?.jobs) ? payload.jobs as ConciergeStayReminderJob[] : [];
  return jobs.filter((job) => wanted.has(jobKeyOf(job)));
}

export async function scheduleConciergeStayReminders(plan: ConciergeStayReminderPlanItem[]) {
  const delivery = getConciergeStayReminderDelivery();
  let scheduled = 0;
  const errors: string[] = [];

  for (const item of plan) {
    try {
      const payload = await authFetch<any>('/api/alarm/schedule', {
        method: 'POST',
        body: JSON.stringify({
          scheduledAt: item.scheduledAt.toISOString(),
          channel: delivery.channel,
          chatId: delivery.chatId,
          telegramUsername: delivery.telegramUsername,
          phone: delivery.phone,
          jobKey: item.jobKey,
          message: item.message,
        }),
      });
      if (payload?.ok) scheduled += 1;
      else errors.push(String(payload?.message || `Não foi possível agendar ${item.kind}.`));
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `Não foi possível agendar ${item.kind}.`);
    }
  }

  return {
    scheduled,
    failed: Math.max(0, plan.length - scheduled),
    errors,
    channel: delivery.channel,
    channelLabel: delivery.channelLabel,
  };
}

export async function cancelConciergeStayReminders(stayDate: unknown, stayId?: unknown) {
  const keys = conciergeStayReminderJobKeys(stayDate, stayId);
  if (!keys) return { cancelled: 0, errors: [] as string[] };

  let cancelled = 0;
  const errors: string[] = [];
  for (const jobKey of Object.values(keys)) {
    const result = await cancelConciergeStayReminderJobKey(jobKey);
    cancelled += result.cancelled;
    if (result.error) errors.push(result.error);
  }
  return { cancelled, errors };
}

export async function reconcileConciergeStayReminders(
  stayDate: unknown,
  desiredPlan: ConciergeStayReminderPlanItem[],
  stayId?: unknown,
) {
  const existingJobs = await listConciergeStayReminderJobs(stayDate, stayId);
  const delivery = getConciergeStayReminderDelivery();
  const reconciliation = buildConciergeStayReminderReconciliation(
    stayDate,
    desiredPlan,
    existingJobs,
    delivery.channel,
    stayId,
  );

  if (!reconciliation.enabled) {
    return {
      enabled: false,
      reason: reconciliation.reason,
      scheduled: 0,
      cancelled: 0,
      unchanged: 0,
      deferred: 0,
      errors: [] as string[],
      channel: delivery.channel,
      channelLabel: delivery.channelLabel,
    };
  }

  let cancelled = 0;
  const errors: string[] = [];
  for (const jobKey of reconciliation.cancelJobKeys) {
    const result = await cancelConciergeStayReminderJobKey(jobKey);
    cancelled += result.cancelled;
    if (result.error) errors.push(result.error);
  }

  const scheduleResult = reconciliation.schedule.length
    ? await scheduleConciergeStayReminders(reconciliation.schedule)
    : {
        scheduled: 0,
        failed: 0,
        errors: [] as string[],
        channel: delivery.channel,
        channelLabel: delivery.channelLabel,
      };
  errors.push(...scheduleResult.errors);

  return {
    enabled: true,
    reason: reconciliation.reason,
    scheduled: scheduleResult.scheduled,
    cancelled,
    unchanged: reconciliation.unchangedJobKeys.length,
    deferred: reconciliation.deferredJobKeys.length,
    errors,
    channel: scheduleResult.channel,
    channelLabel: scheduleResult.channelLabel,
  };
}
