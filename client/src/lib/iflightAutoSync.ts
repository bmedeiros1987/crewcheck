// Sincronização automática da escala pelo iFlight (somente app Android).
//
// O login, a senha e o MFA são digitados pelo usuário na página oficial do iFlight
// dentro do navegador interno. O CrewCheck nunca recebe nem guarda essas credenciais:
// só reaproveita a sessão que o próprio navegador interno mantém e, enquanto ela
// estiver válida, baixa o PDF da escala em segundo plano e importa pelo fluxo normal.

export const IFLIGHT_CWP_URL = 'https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage';
export const IFLIGHT_LOGIN_REQUIRED = 'IFLIGHT_LOGIN_REQUIRED';
export const IFLIGHT_INTERVAL_OPTIONS = [15, 30, 60, 120] as const;

const STORAGE_KEY = 'crewcheck_iflight_autosync_v1';
const CHANGE_EVENT = 'crewcheck:iflight-autosync';
const TICK_MS = 60_000;
const RETRY_AFTER_ERROR_MS = 15 * 60_000;
const SILENT_TIMEOUT_SECONDS = 150;

type PersistedState = {
  enabled: boolean;
  intervalMinutes: number;
  needsLogin: boolean;
  lastAttemptAt: number;
  lastSuccessAt: number;
  lastError: string;
};

export type IFlightAutoSyncState = PersistedState & { running: boolean };

type NativePayload = {
  ok?: boolean;
  code?: string;
  error?: string;
  message?: string;
  filename?: string;
  sourceFileName?: string;
  dataBase64?: string;
};

type NativeBridge = {
  openPortalAndImport?: (url: string, options?: Record<string, unknown>) => Promise<NativePayload | string> | NativePayload | string;
};

type Importer = (file: File) => Promise<void>;

class SyncError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const DEFAULTS: PersistedState = {
  enabled: false,
  intervalMinutes: 30,
  needsLogin: false,
  lastAttemptAt: 0,
  lastSuccessAt: 0,
  lastError: '',
};

let running = false;
let importer: Importer | null = null;
let stopScheduler: (() => void) | null = null;

function bridge(): NativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { CrewCheckIFlight?: NativeBridge }).CrewCheckIFlight;
}

export function hasIFlightBridge(): boolean {
  return typeof bridge()?.openPortalAndImport === 'function';
}

function readPersisted(): PersistedState {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as Partial<PersistedState> | null;
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
    const interval = Number(parsed.intervalMinutes);
    return {
      enabled: parsed.enabled === true,
      intervalMinutes: (IFLIGHT_INTERVAL_OPTIONS as readonly number[]).includes(interval) ? interval : DEFAULTS.intervalMinutes,
      needsLogin: parsed.needsLogin === true,
      lastAttemptAt: Number(parsed.lastAttemptAt) || 0,
      lastSuccessAt: Number(parsed.lastSuccessAt) || 0,
      lastError: String(parsed.lastError || ''),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function emit() {
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* sem window */ }
}

function patch(next: Partial<PersistedState>) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPersisted(), ...next })); } catch { /* storage bloqueado */ }
  emit();
}

export function getIFlightAutoSyncState(): IFlightAutoSyncState {
  return { ...readPersisted(), running };
}

export function subscribeIFlightAutoSync(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function setIFlightAutoSyncEnabled(enabled: boolean) {
  patch(enabled ? { enabled: true, needsLogin: false } : { enabled: false });
}

export function setIFlightAutoSyncInterval(intervalMinutes: number) {
  if ((IFLIGHT_INTERVAL_OPTIONS as readonly number[]).includes(intervalMinutes)) patch({ intervalMinutes });
}

export function setIFlightImporter(next: Importer | null) {
  importer = next;
}

export function base64ToPdfFile(dataBase64: string, filename: string): File {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const safeName = String(filename || '').trim() || 'iFlight_RosterReport.pdf';
  return new File([bytes], safeName.toLowerCase().endsWith('.pdf') ? safeName : `${safeName}.pdf`, { type: 'application/pdf' });
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

export function buildIFlightPortalOptions(silent: boolean, now = new Date()): Record<string, unknown> {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    // Fluxo PDF: Roster Calendar -> Roster Report (LT) -> Run -> PDF, lido pelo parser canônico.
    format: 'pdf',
    calendarSweep: false,
    universalPdfCapture: true,
    pdfFallback: true,
    autoClicks: true,
    autoResumeAfterLogin: true,
    keepAuthorizedSession: true,
    silentPremiumPull: true,
    maskPortalUntilUserAction: true,
    noExternalApps: true,
    includeLegend: false,
    clickSend: false,
    credentialEntry: 'official_iflight_page_only',
    mfaEntry: 'official_iflight_page_only',
    privacyMode: 'lgpd_no_credentials',
    portalKind: 'cwp',
    portalUrl: IFLIGHT_CWP_URL,
    periodMonth: pad2(month),
    periodYear: String(year),
    fromDate: `01-${monthNames[month - 1]}-${year}`,
    toDate: `${pad2(lastDay)}-${monthNames[month - 1]}-${year}`,
    maxAutomationMinutes: silent ? 3 : 10,
    // silent: o portal fica invisível e, se pedir login/MFA, encerra com IFLIGHT_LOGIN_REQUIRED.
    silent,
    silentTimeoutSeconds: SILENT_TIMEOUT_SECONDS,
    actions: ['open_official_iflight_webview', 'reuse_authorized_session', 'open_roster_calendar', 'open_roster_report', 'download_pdf', 'return_to_crewcheck'],
  };
}

async function importFile(file: File) {
  if (!importer) throw new SyncError('NO_IMPORTER', 'O CrewCheck ainda não está pronto para importar a escala.');
  let imported = false;
  const onUpdated = () => { imported = true; };
  window.addEventListener('crewcheck:roster-updated', onUpdated);
  const silentFlag = window as unknown as { __crewcheckSilentImport?: boolean };
  silentFlag.__crewcheckSilentImport = true;
  try {
    await importer(file);
  } finally {
    delete silentFlag.__crewcheckSilentImport;
    window.removeEventListener('crewcheck:roster-updated', onUpdated);
  }
  if (!imported) throw new SyncError('IMPORT_FAILED', 'Baixei o PDF do iFlight, mas o CrewCheck não conseguiu ler a escala.');
}

export async function syncIFlightNow({ silent }: { silent: boolean }): Promise<{ ok: boolean; code?: string; message: string }> {
  if (running) return { ok: false, code: 'BUSY', message: 'Já existe uma sincronização em andamento.' };
  const open = bridge()?.openPortalAndImport;
  if (typeof open !== 'function') {
    return { ok: false, code: 'NO_BRIDGE', message: 'A atualização automática do iFlight funciona somente no app Android do CrewCheck.' };
  }
  running = true;
  patch({ lastAttemptAt: Date.now() });
  try {
    const raw = await open(IFLIGHT_CWP_URL, buildIFlightPortalOptions(silent));
    const payload: NativePayload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!payload?.ok) throw new SyncError(String(payload?.code || 'PORTAL_ERROR'), String(payload?.error || payload?.message || 'O portal do iFlight foi fechado antes de entregar a escala.'));
    if (!payload.dataBase64) throw new SyncError('NO_PDF', 'O iFlight não devolveu o PDF da escala.');
    await importFile(base64ToPdfFile(payload.dataBase64, payload.filename || payload.sourceFileName || 'iFlight_RosterReport.pdf'));
    patch({ lastSuccessAt: Date.now(), lastError: '', needsLogin: false });
    return { ok: true, message: 'Escala atualizada pelo iFlight.' };
  } catch (error) {
    const code = error instanceof SyncError ? error.code : 'ERROR';
    const message = error instanceof Error ? error.message : 'Não consegui atualizar a escala pelo iFlight.';
    if (code === IFLIGHT_LOGIN_REQUIRED) {
      patch({ needsLogin: true, lastError: 'A sessão do iFlight expirou. Entre de novo com login e MFA para retomar as atualizações.' });
    } else {
      patch({ lastError: message });
    }
    return { ok: false, code, message };
  } finally {
    running = false;
    emit();
  }
}

/** Primeira conexão (ou reconexão): portal visível, login e MFA feitos pelo usuário. */
export async function connectIFlight() {
  const result = await syncIFlightNow({ silent: false });
  if (result.ok) setIFlightAutoSyncEnabled(true);
  return result;
}

export function isIFlightSyncDue(state: IFlightAutoSyncState, now: number): boolean {
  if (!state.enabled || state.needsLogin || state.running) return false;
  const afterError = state.lastError && state.lastAttemptAt > state.lastSuccessAt;
  const waitMs = afterError ? RETRY_AFTER_ERROR_MS : state.intervalMinutes * 60_000;
  return now - state.lastAttemptAt >= waitMs;
}

function tick() {
  if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
  if (!hasIFlightBridge() || !importer) return;
  if (isIFlightSyncDue(getIFlightAutoSyncState(), Date.now())) void syncIFlightNow({ silent: true });
}

/** Liga o agendador (idempotente). Roda enquanto o app estiver aberto em primeiro plano. */
export function startIFlightAutoSync(): () => void {
  if (stopScheduler || typeof window === 'undefined') return stopScheduler || (() => undefined);
  const timer = window.setInterval(tick, TICK_MS);
  const first = window.setTimeout(tick, 5_000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', tick);
  stopScheduler = () => {
    window.clearInterval(timer);
    window.clearTimeout(first);
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('online', tick);
    stopScheduler = null;
  };
  return stopScheduler;
}
