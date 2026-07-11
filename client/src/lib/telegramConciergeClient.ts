import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';
import { crewcheckAuthHeader } from './authClient';

export type TelegramConciergePreferences = {
  smartDeparture?: boolean;
  roster?: boolean;
  radar?: boolean;
  gateStatus?: boolean;
  traffic?: boolean;
  irregularities?: boolean;
  dailySummary?: boolean;
  weeklySummary?: boolean;
  concierge?: boolean;
  conciergePremiumText?: boolean;
  conciergeVoice?: boolean;
  conciergeAudioReplies?: boolean;
  conciergeName?: string;
  overnightWakeup?: boolean;
};

export type TelegramConciergeHealth = { ok?: boolean; configured?: boolean; bot?: unknown; webhook?: { url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number } | null; publicUrl?: string; webhookUrl?: string; message?: string };

export type TelegramConciergeAnswer = { ok: boolean; title: string; lines: string[]; intent?: string; message?: string };

export type TelegramConciergeStatus = {
  ok?: boolean;
  configured?: boolean;
  connected?: boolean;
  message?: string;
  botUsername?: string | null;
  code?: string | null;
  connectUrl?: string | null;
  expectedUsername?: string | null;
  chat?: { username?: string | null; maskedId?: string | null; firstName?: string | null } | null;
  preferences?: TelegramConciergePreferences;
  syncedRoster?: { available?: boolean; updatedAt?: string | null; periodYear?: number | null; periodMonth?: number | null };
  webhook?: { configured?: boolean; url?: string | null; pendingUpdates?: number | null; lastError?: string | null };
};

async function telegramJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      ...crewcheckAuthHeader(),
      ...(init?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message || `Erro HTTP ${response.status}`);
  return payload as T;
}

export function getTelegramConciergeStatus(): Promise<TelegramConciergeStatus> {
  return telegramJson<TelegramConciergeStatus>('/api/telegram/status', { method: 'GET', cache: 'no-store' });
}

export function connectTelegramConcierge(telegramUsername?: string): Promise<TelegramConciergeStatus> {
  return telegramJson<TelegramConciergeStatus>('/api/telegram/connect', {
    method: 'POST',
    body: JSON.stringify({ telegramUsername: String(telegramUsername || '').trim() }),
  });
}

export function saveTelegramConciergePreferences(preferencesPatch: TelegramConciergePreferences): Promise<TelegramConciergeStatus> {
  return telegramJson<TelegramConciergeStatus>('/api/telegram/preferences', {
    method: 'POST',
    body: JSON.stringify({ preferencesPatch }),
  });
}

export function sendTelegramConciergeTest(): Promise<{ ok: boolean; message?: string }> {
  return telegramJson('/api/telegram/test', { method: 'POST', body: '{}' });
}

export function askTelegramConcierge(question: string): Promise<TelegramConciergeAnswer> {
  return telegramJson<TelegramConciergeAnswer>('/api/telegram/concierge/ask', {
    method: 'POST',
    body: JSON.stringify({ question }),
  });
}

export function getTelegramConciergeHealth(): Promise<TelegramConciergeHealth> {
  return telegramJson<TelegramConciergeHealth>('/api/admin/telegram-health', { method: 'GET', cache: 'no-store' });
}

export function setupTelegramConciergeWebhook(): Promise<TelegramConciergeHealth> {
  return telegramJson<TelegramConciergeHealth>('/api/admin/telegram-setup-webhook', { method: 'POST', body: '{}' });
}

export function sendTelegramConciergeShare(title: string, content: string, kind = 'summary'): Promise<{ ok: boolean; message?: string }> {
  return telegramJson('/api/telegram/share', {
    method: 'POST',
    body: JSON.stringify({ title, content, kind }),
  });
}

export function syncRosterWithTelegramConcierge(payload: { roster: CrewRoster; compliance: ComplianceResult | null; gym?: GymRecommendation[]; sourceFileName?: string }): Promise<{ ok: boolean; status?: TelegramConciergeStatus; syncedRoster?: TelegramConciergeStatus['syncedRoster'] }> {
  return telegramJson('/api/telegram/roster-sync', {
    method: 'POST',
    body: JSON.stringify({ roster: payload.roster, compliance: payload.compliance, gym: payload.gym || [], sourceFileName: payload.sourceFileName || 'Escala CrewCheck' }),
  });
}

export function telegramStatusLabel(status: TelegramConciergeStatus | null | undefined): string {
  if (!status) return 'Verificando canal Telegram…';
  if (!status.configured) return status.message || 'Telegram ainda não configurado no servidor.';
  if (status.connected) return `Conectado${status.chat?.username ? ` · @${status.chat.username}` : ''}`;
  if (status.connectUrl || status.code) return 'Aguardando confirmação no bot.';
  return status.message || 'Telegram pronto para conectar.';
}
