import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode, type RefObject } from 'react';
import { jsPDF } from 'jspdf';
import { useLocation } from 'wouter';
import {
 Activity,
 AlertTriangle,
 ArrowLeft,
 BarChart3,
 Bell,
 Building2,
 CalendarDays,
 Camera,
 Car,
 CheckCircle2,
 ChevronRight,
 CloudUpload,
 ClipboardList,
 CreditCard,
 Copy,
 Database,
 Download as DownloadIcon,
 DollarSign,
 Dumbbell,
 FileText,
 FolderOpen,
 ExternalLink,
 GraduationCap,
 History,
 Home as HomeIcon,
 Loader2,
 Lock,
 Mail,
 MessageCircle,
 Languages,
 Menu,
 Monitor,
 Moon,
 Search,
 SlidersHorizontal,
 MapPin,
 Navigation,
 Clock,
 Bus,
 LogOut,
 Plane,
 Radar,
 RefreshCw,
 Settings,
 Shield,
 Sparkles,
 StickyNote,
 Sun,
 TrendingUp,
 Trash2,
 Upload,
 Users,
 UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { analyzeCompliance, getGymRecommendations, type ComplianceResult, type GymRecommendation } from '@/lib/complianceEngine';
import { detectAndMarkLayovers } from '@/lib/layoverDetection';
import { normalizeRosterSchedule } from '@/lib/rosterNormalizer';
import type { CrewRoleSelection } from '@/lib/actRules';
import { parsePDF, type CrewRoster } from '@/lib/pdfParser';
import { getStoredUser, getToken, logout } from '@/lib/authClient';
import { syncPendingRosters, getPendingOfflineCount, saveRosterOfflineFirst } from '@/lib/offlineSync';
import { getDatabaseStatus, listSavedRosters, openSavedRoster, saveRosterAnalysis, activateRosterAnalysis, deleteRosterAnalysis, type DatabaseStatus, type SavedRosterSummary } from '@/lib/databaseClient';
import { exportReport } from '@/lib/pdfExport';
import { applyDocumentLanguage, getSavedLanguage, saveCrewLanguage, type CrewLanguage } from '@/lib/i18n';
import { downloadCalendarFile, generateICalendar } from '@/lib/calendarExport';
import {
 connectGoogleCalendar,
 hasGoogleCalendarToken,
 hasGoogleClientIdFromEnv,
 getGoogleClientIdOverride,
 isGoogleCalendarConfigured,
 listGoogleCalendars,
 loadGoogleCalendarSettings,
 saveGoogleCalendarSettings,
 saveGoogleClientIdOverride,
 type GoogleCalendarOption,
 type GoogleCalendarSettings,
 type GoogleCalendarSyncMode,
} from '@/lib/googleCalendarSync';
import Dashboard from '../components/premium/Dashboard';
import CalendarView from '../components/premium/CalendarView';
import IFlightIntegrationView from '../components/premium/IFlightIntegrationView';
import CabinChiefAssistant from '../components/premium/CabinChiefAssistant';
import { cancelBillingSubscription, createBillingCheckout, formatBillingValue, getBillingStatus, regularizePremiumTrial, startPremiumTrial, billingStatusLabel, type BillingCheckoutBillingType, type BillingCheckoutResponse, type BillingStatus } from '@/lib/billingClient';

type HomeView = 'home' | 'import' | 'history' | 'calendar' | 'billing' | 'iflight' | 'flightboard' | 'departure' | 'routine' | 'perdiem' | 'salary' | 'currency' | 'parking' | 'c32f' | 'settings' | 'support' | 'notes' | 'chief' | 'medical' | 'bids' | 'admin' | 'systemstatus' | 'more';
type CrewCheckBottomActive = 'home' | 'roster' | 'vivo' | 'iflight' | 'flightboard' | 'departure' | 'settings' | 'more';
type CrewThemeMode = 'light' | 'dark' | 'system';
type ResultsView = 'summary' | 'roster' | 'alerts' | 'irregularities' | 'gym' | 'fatigue' | 'metrics' | 'glossary' | 'statistics' | 'settings' | 'manual';
type TelegramStatus = { ok?: boolean; configured?: boolean; connected?: boolean; botUsername?: string | null; code?: string | null; connectUrl?: string | null; expectedUsername?: string | null; message?: string; chat?: { username?: string | null; maskedId?: string | null; firstName?: string | null } | null; preferences?: Record<string, boolean | string>; syncedRoster?: { available?: boolean; updatedAt?: string | null; periodYear?: number | null; periodMonth?: number | null } };

type NativePdfPayload = {
 ok?: boolean;
 filename?: string;
 sourceFileName?: string;
 dataBase64?: string;
};

const RESULT_VIEWS = new Set<ResultsView>(['summary', 'roster', 'alerts', 'irregularities', 'gym', 'fatigue', 'metrics', 'glossary', 'statistics', 'settings', 'manual']);

const C32F_ADMIN_EMAIL = normalizeEmail(import.meta.env.VITE_CREWCHECK_ADMIN_EMAIL || '');
const APP_VERSION = '11.0.82';
const PREMIUM_SAFETY_NOTICE_VERSION = 'premium-safety-notice-v1-short-2026-06-20';
const PREMIUM_SAFETY_NOTICE_TEXT = 'O CrewCheck é uma ferramenta independente de apoio pessoal. Não é aplicativo oficial de companhia aérea, não substitui a escala oficial e pode apresentar informações incorretas, incompletas ou desatualizadas. Sempre confirme sua escala, horários, alterações, voos, portões e demais informações nos canais oficiais da sua companhia aérea antes de tomar qualquer decisão operacional.';

function normalizeEmail(value?: string | null): string {
 return String(value || '').trim().toLowerCase();
}

function normalizeTelegramUsernameInput(value?: string | null): string {
 return String(value || '').replace(/@+/g, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 32);
}


function normalizeCpfInput(value?: string | null): string {
 return String(value || '').replace(/\D+/g, '').slice(0, 11);
}

function formatCpfInput(value?: string | null): string {
 const digits = normalizeCpfInput(value);
 if (digits.length <= 3) return digits;
 if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
 if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
 return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function isC32FAcademyAdmin(user: ReturnType<typeof getStoredUser>): boolean {
 return normalizeEmail(user?.email) === C32F_ADMIN_EMAIL;
}

async function fileToBase64Payload(file: File): Promise<string> {
 const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('Arquivo inválido.'));
  reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'));
  reader.readAsArrayBuffer(file);
 });
 let binary = '';
 const bytes = new Uint8Array(buffer);
 const chunkSize = 0x8000;
 for (let i = 0; i < bytes.length; i += chunkSize) {
  binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
 }
 return btoa(binary);
}

function base64ToPdfFile(filename: string, dataBase64: string): File {
 const binary = atob(dataBase64);
 const bytes = new Uint8Array(binary.length);
 for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
 return new File([bytes], filename || 'iFlight_RosterReport.pdf', { type: 'application/pdf' });
}

async function parsePdfViaServer(file: File): Promise<CrewRoster> {
 const dataBase64 = await fileToBase64Payload(file);
 const response = await fetch('/api/parse-pdf', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ filename: file.name, dataBase64 }),
 });
 const payload = await response.json().catch(() => null);
 if (!response.ok || !payload?.ok || !payload?.roster) {
  throw new Error(payload?.message || payload?.detail || 'Parser servidor indisponível.');
 }
 return payload.roster as CrewRoster;
}


function isAppleMobileOrTabletLike(): boolean {
 try {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touch = typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && touch);
 } catch {
  return false;
 }
}

function shouldUseServerOnlyParser(fileName = ''): boolean {
 const name = String(fileName || '').toLowerCase();
 return isAppleMobileOrTabletLike() || /crewrosterreport|roster\s*report|iflight|cwp/.test(name);
}

function hasCurrentRosterSession() {
 return Boolean(sessionStorage.getItem('crewcheck_roster') && sessionStorage.getItem('crewcheck_compliance'));
}

function setInitialResultsView(view?: ResultsView) {
 if (view && RESULT_VIEWS.has(view)) sessionStorage.setItem('crewcheck_initial_view', view);
}


type SessionRosterBundle = {
 roster: CrewRoster;
 compliance: ComplianceResult;
 gym: GymRecommendation[];
};

type LocalProfileSettings = {
 displayName: string;
 company: string;
 base: string;
 rank: string;
 isInstructor: boolean;
 hasVirtualBase: boolean;
 virtualBase: string;
 timeMode: CrewTimeMode;
 customTimeZone: string;
};

type CrewTimeMode = 'BSB' | 'LOCAL' | 'UTC' | 'CUSTOM';

const CREWCHECK_DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const CREWCHECK_TIMEZONE_OPTIONS = [
 { value: 'America/Sao_Paulo', label: 'Brasília / BSB' },
 { value: 'America/Manaus', label: 'Manaus / AMT' },
 { value: 'America/Belem', label: 'Belém' },
 { value: 'America/Fortaleza', label: 'Nordeste' },
 { value: 'America/Cuiaba', label: 'Cuiabá' },
 { value: 'America/Rio_Branco', label: 'Acre' },
 { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
 { value: 'America/Santiago', label: 'Santiago' },
 { value: 'America/Lima', label: 'Lima / Bogotá' },
 { value: 'America/New_York', label: 'Miami / New York' },
 { value: 'Europe/London', label: 'Londres' },
 { value: 'Europe/Paris', label: 'Paris / Frankfurt / Madrid' },
 { value: 'UTC', label: 'UTC' },
];

const AIRPORT_TIMEZONES_CLIENT: Record<string, string> = {
 BSB: 'America/Sao_Paulo', GRU: 'America/Sao_Paulo', CGH: 'America/Sao_Paulo', VCP: 'America/Sao_Paulo', GIG: 'America/Sao_Paulo', SDU: 'America/Sao_Paulo', CNF: 'America/Sao_Paulo', POA: 'America/Sao_Paulo', CWB: 'America/Sao_Paulo', FLN: 'America/Sao_Paulo', VIX: 'America/Sao_Paulo', GYN: 'America/Sao_Paulo',
 MAO: 'America/Manaus', PVH: 'America/Porto_Velho', RBR: 'America/Rio_Branco', CGB: 'America/Cuiaba', BVB: 'America/Boa_Vista', MCP: 'America/Belem', BEL: 'America/Belem', MAB: 'America/Belem', THE: 'America/Fortaleza', SLZ: 'America/Fortaleza', FOR: 'America/Fortaleza', NAT: 'America/Fortaleza', JPA: 'America/Fortaleza', REC: 'America/Recife', MCZ: 'America/Maceio', AJU: 'America/Maceio', SSA: 'America/Bahia',
 MIA: 'America/New_York', JFK: 'America/New_York', MCO: 'America/New_York', EZE: 'America/Argentina/Buenos_Aires', AEP: 'America/Argentina/Buenos_Aires', SCL: 'America/Santiago', LIM: 'America/Lima', BOG: 'America/Bogota', CDG: 'Europe/Paris', MAD: 'Europe/Madrid', FRA: 'Europe/Berlin', LHR: 'Europe/London', LIS: 'Europe/Lisbon'
};

function isValidCrewDate(date: Date | null | undefined): date is Date {
 return date instanceof Date && Number.isFinite(date.getTime());
}

function safeCrewDate(date: Date | null | undefined, fallback = new Date()): Date {
 return isValidCrewDate(date) ? date : fallback;
}

function safeCrewIso(date: Date | null | undefined, fallback = new Date()): string {
 const safe = safeCrewDate(date, fallback);
 try { return safe.toISOString(); } catch { return fallback.toISOString(); }
}

function safeCrewShortDate(date: Date | null | undefined): string {
 const safe = safeCrewDate(date);
 try { return safe.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); } catch { return '—'; }
}

function datePartsInTimeZone(date: Date, timeZone: string) {
 const safeDate = safeCrewDate(date);
 const safeZone = timeZone || CREWCHECK_DEFAULT_TIMEZONE;
 try {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: safeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(safeDate);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { year: get('year'), month: get('month'), day: get('day') };
 } catch {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CREWCHECK_DEFAULT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(safeDate);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return { year: get('year'), month: get('month'), day: get('day') };
 }
}

function todayIsoInTimeZone(timeZone = CREWCHECK_DEFAULT_TIMEZONE) {
 const parts = datePartsInTimeZone(new Date(), timeZone || CREWCHECK_DEFAULT_TIMEZONE);
 return `${parts.year || new Date().getFullYear()}-${parts.month || String(new Date().getMonth() + 1).padStart(2, '0')}-${parts.day || String(new Date().getDate()).padStart(2, '0')}`;
}

function preferredSystemTimeZone(settings?: Pick<LocalProfileSettings, 'timeMode' | 'customTimeZone'>) {
 const mode = settings?.timeMode || readCrewTimeMode();
 if (mode === 'UTC') return 'UTC';
 if (mode === 'LOCAL') {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || CREWCHECK_DEFAULT_TIMEZONE; } catch { return CREWCHECK_DEFAULT_TIMEZONE; }
 }
 if (mode === 'CUSTOM') return settings?.customTimeZone || readCrewCustomTimeZone();
 return CREWCHECK_DEFAULT_TIMEZONE;
}

function readCrewTimeMode(): CrewTimeMode {
 try {
  const saved = localStorage.getItem('crewcheck_time_mode');
  return saved === 'LOCAL' || saved === 'UTC' || saved === 'CUSTOM' || saved === 'BSB' ? saved : 'BSB';
 } catch { return 'BSB'; }
}

function readCrewCustomTimeZone(): string {
 try { return localStorage.getItem('crewcheck_custom_timezone') || CREWCHECK_DEFAULT_TIMEZONE; } catch { return CREWCHECK_DEFAULT_TIMEZONE; }
}

function formatCrewDateTime(value?: string | number | Date | null, settings?: Pick<LocalProfileSettings, 'timeMode' | 'customTimeZone'>, options?: Intl.DateTimeFormatOptions) {
 if (!value) return '—';
 const date = value instanceof Date ? value : new Date(value);
 if (!isValidCrewDate(date)) return '—';
 const tz = preferredSystemTimeZone(settings);
 try {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', ...(options || {}) }).format(date);
 } catch {
  try { return new Intl.DateTimeFormat('pt-BR', { timeZone: CREWCHECK_DEFAULT_TIMEZONE, hour: '2-digit', minute: '2-digit', ...(options || {}) }).format(date); } catch { return '—'; }
 }
}

function timeZoneModeLabel(settings?: Pick<LocalProfileSettings, 'timeMode' | 'customTimeZone'>) {
 const mode = settings?.timeMode || readCrewTimeMode();
 if (mode === 'LOCAL') return 'horário local do dispositivo';
 if (mode === 'UTC') return 'UTC';
 if (mode === 'CUSTOM') return (settings?.customTimeZone || readCrewCustomTimeZone()).replace('_', ' ');
 return 'Brasília / BSB';
}

function todayIsoForAirportClient(airport: string) {
 const tz = AIRPORT_TIMEZONES_CLIENT[String(airport || '').toUpperCase()] || CREWCHECK_DEFAULT_TIMEZONE;
 return todayIsoInTimeZone(tz);
}

function loadLocalProfileSettings(): LocalProfileSettings {
 try {
  return {
   displayName: localStorage.getItem('crewcheck_profile_display_name') || '',
   company: localStorage.getItem('crewcheck_profile_company') || '',
   base: localStorage.getItem('crewcheck_profile_base') || '',
   rank: localStorage.getItem('crewcheck_profile_rank') || '',
   isInstructor: localStorage.getItem('crewcheck_profile_is_instructor') === '1',
   hasVirtualBase: localStorage.getItem('crewcheck_profile_has_virtual_base') === '1' || localStorage.getItem('crewcheck_perdiem_settings')?.includes('baseVirtualEnabled') || false,
   virtualBase: localStorage.getItem('crewcheck_profile_virtual_base_airport') || '',
   timeMode: readCrewTimeMode(),
   customTimeZone: readCrewCustomTimeZone(),
  };
 } catch {
  return { displayName: '', company: '', base: '', rank: '', isInstructor: false, hasVirtualBase: false, virtualBase: '', timeMode: 'BSB', customTimeZone: CREWCHECK_DEFAULT_TIMEZONE };
 }
}

function saveLocalProfileSettings(settings: LocalProfileSettings): LocalProfileSettings {
 const cleaned = {
  displayName: settings.displayName.trim(),
  company: settings.company.trim(),
  base: settings.base.trim().toUpperCase(),
  rank: settings.rank.trim(),
  isInstructor: Boolean(settings.isInstructor),
  hasVirtualBase: Boolean(settings.hasVirtualBase),
  virtualBase: String(settings.virtualBase || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3),
  timeMode: settings.timeMode === 'LOCAL' || settings.timeMode === 'UTC' || settings.timeMode === 'CUSTOM' || settings.timeMode === 'BSB' ? settings.timeMode : 'BSB',
  customTimeZone: CREWCHECK_TIMEZONE_OPTIONS.some((item) => item.value === settings.customTimeZone) ? settings.customTimeZone : CREWCHECK_DEFAULT_TIMEZONE,
 };
 try {
  localStorage.setItem('crewcheck_profile_display_name', cleaned.displayName);
  localStorage.setItem('crewcheck_profile_company', cleaned.company);
  localStorage.setItem('crewcheck_profile_base', cleaned.base);
  localStorage.setItem('crewcheck_profile_rank', cleaned.rank);
  localStorage.setItem('crewcheck_profile_is_instructor', cleaned.isInstructor ? '1' : '0');
  localStorage.setItem('crewcheck_profile_has_virtual_base', cleaned.hasVirtualBase ? '1' : '0');
  localStorage.setItem('crewcheck_profile_virtual_base_airport', cleaned.hasVirtualBase ? cleaned.virtualBase : '');
  localStorage.setItem('crewcheck_time_mode', cleaned.timeMode);
  localStorage.setItem('crewcheck_custom_timezone', cleaned.customTimeZone);
  try {
   const current = JSON.parse(localStorage.getItem('crewcheck_perdiem_settings') || '{}');
   localStorage.setItem('crewcheck_perdiem_settings', JSON.stringify({ ...current, baseVirtualEnabled: cleaned.hasVirtualBase, baseVirtualAirport: cleaned.hasVirtualBase ? cleaned.virtualBase : '' }));
  } catch {}
 } catch {
  // mantém estado em memória quando storage não está disponível
 }
 return cleaned;
}

function loadCrewThemeMode(): CrewThemeMode {
 try {
  const saved = localStorage.getItem('crewcheck_theme_mode');
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
 } catch {
  return 'system';
 }
}

function getEffectiveCrewTheme(mode: CrewThemeMode): 'light' | 'dark' {
 if (mode === 'light') return 'light';
 if (mode === 'dark') return 'dark';
 try {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
 } catch {
  return 'light';
 }
}

function saveAndApplyCrewThemeMode(mode: CrewThemeMode): CrewThemeMode {
 try {
  localStorage.setItem('crewcheck_theme_mode', mode);
  const effective = getEffectiveCrewTheme(mode);
  document.documentElement.dataset.crewThemeMode = mode;
  document.documentElement.dataset.crewTheme = effective;
  document.documentElement.classList.toggle('dark', effective === 'dark');
  document.documentElement.style.colorScheme = effective;
  window.dispatchEvent(new CustomEvent('crewcheck:theme-change', { detail: { mode, effective } }));
 } catch {
  // mantém estado visual padrão quando storage não estiver disponível
 }
 return mode;
}

function readCurrentRosterBundle(): SessionRosterBundle | null {
 try {
  const rosterRaw = sessionStorage.getItem('crewcheck_roster');
  const complianceRaw = sessionStorage.getItem('crewcheck_compliance');
  if (!rosterRaw || !complianceRaw) return null;
  return {
   roster: JSON.parse(rosterRaw) as CrewRoster,
   compliance: JSON.parse(complianceRaw) as ComplianceResult,
   gym: JSON.parse(sessionStorage.getItem('crewcheck_gym') || '[]') as GymRecommendation[],
  };
 } catch {
  return null;
 }
}

type RosterChangeSummaryV10867 = {
 samePeriod: boolean;
 added: number;
 removed: number;
 changed: number;
 duplicatesIgnored: number;
 message: string;
};

function rosterComparableKeyV10867(day: CrewRoster['days'][number]): string {
 const code = String(day.pairingCode || day.type || '').toUpperCase();
 const legs = (day.legs || []).map((leg) => [leg.flightNumber, leg.origin, leg.destination].join('-')).join('+');
 return `${day.date}|${code}|${legs || day.type}`;
}

function rosterComparableValueV10867(day: CrewRoster['days'][number]): string {
 const legs = (day.legs || []).map((leg) => [leg.flightNumber, leg.origin, leg.destination, leg.departureTime, leg.arrivalTime, leg.workType].join('-')).join('+');
 return [day.date, day.type, day.pairingCode, day.dutyReport || '', day.dutyDebrief || '', legs].join('|');
}

function buildRosterChangeSummaryV10867(previous: CrewRoster | null | undefined, next: CrewRoster): RosterChangeSummaryV10867 | null {
 if (!previous?.days?.length || !next?.days?.length) return null;
 const samePeriod = Number(previous.month) === Number(next.month) && Number(previous.year) === Number(next.year);
 if (!samePeriod) return null;
 const oldMap = new Map<string, string>();
 previous.days.forEach((day) => oldMap.set(rosterComparableKeyV10867(day), rosterComparableValueV10867(day)));
 const newMap = new Map<string, string>();
 let duplicatesIgnored = 0;
 next.days.forEach((day) => {
  const key = rosterComparableKeyV10867(day);
  const value = rosterComparableValueV10867(day);
  if (newMap.get(key) === value) duplicatesIgnored += 1;
  newMap.set(key, value);
 });
 let added = 0;
 let removed = 0;
 let changed = 0;
 for (const [key, value] of newMap) {
  if (!oldMap.has(key)) added += 1;
  else if (oldMap.get(key) !== value) changed += 1;
 }
 for (const key of oldMap.keys()) if (!newMap.has(key)) removed += 1;
 const message = added || removed || changed
  ? `Alterações da escala: ${added} nova(s), ${changed} alterada(s), ${removed} removida(s); duplicidades ignoradas: ${duplicatesIgnored}.`
  : `Nenhuma alteração operacional detectada; duplicidades ignoradas: ${duplicatesIgnored}.`;
 return { samePeriod, added, removed, changed, duplicatesIgnored, message };
}




type CrewCheckPermissionStatus = { location?: boolean; notifications?: boolean; background?: boolean; batteryUnrestricted?: boolean };
type CrewCheckNativeLocationPayload = { ok?: boolean; lat?: number; lng?: number; accuracy?: number; provider?: string; time?: number; error?: string; permission?: boolean; callbackId?: string };

type CrewCheckNativeLike = {
 openExternal?: (url: string) => boolean | void;
 requestLocation?: () => boolean | void;
 requestCurrentLocation?: (callbackId: string) => boolean | void;
 requestNotifications?: () => boolean | void | Promise<boolean | void>;
 requestBackgroundMode?: () => boolean | void | Promise<boolean | void>;
 openPowerSettings?: () => boolean | void;
 permissionStatus?: () => CrewCheckPermissionStatus | string | null;
 notify?: (title: string, body: string) => boolean | void;
 scheduleNotification?: (title: string, body: string, epochMillis: number) => boolean | void;
};

function getCrewCheckNative(): CrewCheckNativeLike | undefined {
 const win = window as unknown as { CrewCheckNative?: CrewCheckNativeLike; CrewCheckPremium?: CrewCheckNativeLike; AndroidCrewCheckNative?: CrewCheckNativeLike };
 return win.CrewCheckPremium || win.CrewCheckNative || win.AndroidCrewCheckNative;
}

function readCrewCheckPermissionStatus(): CrewCheckPermissionStatus {
 try {
  const win = window as unknown as { __crewcheckNativePermissionStatus?: CrewCheckPermissionStatus };
  const native = getCrewCheckNative();
  const raw = native?.permissionStatus?.();
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (parsed && typeof parsed === 'object') return { ...(win.__crewcheckNativePermissionStatus || {}), ...parsed };
  if (win.__crewcheckNativePermissionStatus) return win.__crewcheckNativePermissionStatus;
 } catch {
  // segue para fallback web
 }
 return {
  location: undefined,
  notifications: 'Notification' in window ? Notification.permission === 'granted' : undefined,
 };
}

function requestCrewCheckLocationPermission(): boolean {
 try {
  const native = getCrewCheckNative();
  if (native?.requestLocation) return Boolean(native.requestLocation());
 } catch {
  // Localização é opcional; se o usuário negar, a saída inteligente mostra aviso.
 }
 return false;
}

function requestCrewCheckCurrentLocation(timeoutMs = 16000): Promise<CrewCheckNativeLocationPayload | null> {
 return new Promise((resolve) => {
  try {
   const native = getCrewCheckNative();
   if (!native?.requestCurrentLocation) {
    resolve(null);
    return;
   }
   const callbackId = `loc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
   let done = false;
   const cleanup = () => window.removeEventListener('crewcheck:native-location-result', listener as EventListener);
   const finish = (payload: CrewCheckNativeLocationPayload | null) => {
    if (done) return;
    done = true;
    cleanup();
    resolve(payload);
   };
   const listener = (event: Event) => {
    const detail = (event as CustomEvent<CrewCheckNativeLocationPayload>).detail || {};
    if (detail.callbackId && detail.callbackId !== callbackId) return;
    finish(detail);
   };
   window.addEventListener('crewcheck:native-location-result', listener as EventListener);
   native.requestCurrentLocation(callbackId);
   window.setTimeout(() => finish(null), timeoutMs);
  } catch {
   resolve(null);
  }
 });
}

function requestCrewCheckBrowserLocation(timeoutMs = 17000): Promise<CrewCheckNativeLocationPayload> {
 return new Promise((resolve) => {
  if (!('geolocation' in navigator)) {
   resolve({ ok: false, error: 'Localização indisponível neste navegador. Use HTTPS ou libere localização para o app.' });
   return;
  }
  navigator.geolocation.getCurrentPosition((position) => {
   resolve({
    ok: true,
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    provider: 'browser-geolocation',
    time: position.timestamp,
   });
  }, (geoError) => {
   resolve({ ok: false, permission: geoError?.code === 1, error: geoError?.code === 1 ? 'Permita a localização no aviso do navegador/Android.' : 'Não consegui obter sua localização atual. Ative GPS/alta precisão e tente novamente.' });
  }, { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30_000 });
 });
}


function requestCrewCheckBackgroundMode(): boolean {
 try {
  const native = getCrewCheckNative();
  if (native?.requestBackgroundMode) return Boolean(native.requestBackgroundMode());
  if (native?.openPowerSettings) return Boolean(native.openPowerSettings());
  toast.info('No Android, abra as configurações do app e permita funcionamento em segundo plano para melhorar os alertas.');
  return false;
 } catch {
  return false;
 }
}

function requestCrewCheckNotificationPermission(): boolean {
 try {
  const native = getCrewCheckNative();
  if (native?.requestNotifications) return Boolean(native.requestNotifications());
  if ('Notification' in window && Notification.permission === 'default') {
   void Notification.requestPermission();
   return false;
  }
  return 'Notification' in window && Notification.permission === 'granted';
 } catch {
  return false;
 }
}

function scheduleCrewCheckNotification(title: string, body: string, epochMillis: number): boolean {
 try {
  const native = getCrewCheckNative();
  if (native?.scheduleNotification) {
   native.scheduleNotification(title, body, epochMillis);
   return true;
  }
 } catch {
  return false;
 }
 return false;
}

function notifyCrewCheck(title: string, body: string, key?: string): void {
 try {
  if (key) {
   const todayKey = new Date().toISOString().slice(0, 10);
   const storageKey = `crewcheck_notification_${key}_${todayKey}`;
   if (localStorage.getItem(storageKey) === '1') return;
   localStorage.setItem(storageKey, '1');
  }
  const native = getCrewCheckNative();
  if (native?.notify) {
   native.notify(title, body);
   return;
  }
  if ('Notification' in window && Notification.permission === 'granted') {
   new Notification(title, { body, tag: key || title });
  }
 } catch {
  // Silencioso por privacidade e compatibilidade.
 }
}

type DashboardNextEvent = {
 title: string;
 time: string;
 endTime: string;
 date: string;
 route?: string;
 status?: string;
 gate?: string;
 terminal?: string;
 countdown?: string;
 source?: string;
 flightNumber?: string;
 isFlight?: boolean;
 targetIso?: string;
 smartDepartureTargetIso?: string;
 smartDepartureRule?: string;
 origin?: string;
 destination?: string;
 base?: string;
 requiresDeparture?: boolean;
 relation?: 'current' | 'today' | 'tomorrow' | 'future' | 'rest_followup' | 'fallback';
 relationLabel?: string;
 dayContext?: string;
 isToday?: boolean;
 isTomorrow?: boolean;
 isInProgress?: boolean;
 isAfterRest?: boolean;
 actualDateIso?: string;
};



function crewcheckCurrentUserScope(): string {
 try {
  const current = getStoredUser();
  const raw = String(current?.id || current?.email || 'anon').trim().toLowerCase();
  return raw.replace(/[^a-z0-9_-]+/g, '_').slice(0, 80) || 'anon';
 } catch {
  return 'anon';
 }
}

function crewcheckRosterSyncKey(): string {
 return `crewcheck_roster_sync_latest_v11_${crewcheckCurrentUserScope()}`;
}

function crewcheckRosterSyncChannel(): string {
 return `crewcheck-roster-sync-${crewcheckCurrentUserScope()}`;
}

type RadarPrivateStatus = {
 ok?: boolean;
 flightNumber?: string | null;
 status?: string | null;
 gate?: string | null;
 terminal?: string | null;
 scheduledDeparture?: string | null;
 estimatedDeparture?: string | null;
 scheduledArrival?: string | null;
 estimatedArrival?: string | null;
 confidence?: string | null;
 updatedAt?: string | null;
 message?: string | null;
};

function radarDateFromNextEvent(event?: DashboardNextEvent): string {
 if (event?.targetIso && /^\d{4}-\d{2}-\d{2}/.test(event.targetIso)) return event.targetIso.slice(0, 10);
 const text = String(event?.date || '');
 const match = text.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-]?(\d{2,4})?/);
 if (!match) return new Date().toISOString().slice(0, 10);
 const day = match[1].padStart(2, '0');
 const month = match[2].padStart(2, '0');
 const year = match[3] ? (match[3].length === 2 ? `20${match[3]}` : match[3]) : String(new Date().getFullYear());
 return `${year}-${month}-${day}`;
}

function radarStatusLine(status?: RadarPrivateStatus | null): string {
 const parts = [
  status?.status ? `Status: ${status.status}` : '',
  status?.gate ? `Portão: ${status.gate}` : '',
  status?.terminal ? `Terminal: ${status.terminal}` : '',
  status?.estimatedDeparture ? `Previsto: ${status.estimatedDeparture}` : '',
 ].filter(Boolean);
 return parts.length ? parts.join(' · ') : 'Sem portão confirmado ainda.';
}

function hasUsefulRadarStatus(status?: RadarPrivateStatus | null): boolean {
 return Boolean(status?.status || status?.gate || status?.terminal || status?.estimatedDeparture || status?.scheduledDeparture);
}

function isFinishedRadarStatusText(status?: string | null): boolean {
 const normalized = String(status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
 return /pousou|voo finalizado|finalizado|encerrado|decolou|decolado|departed|arrived|landed|closed/.test(normalized);
}

function readDashboardCachedRadarStatus(flightNumber?: string | null, dateIso?: string | null): RadarPrivateStatus | null {
 try {
  const flight = String(flightNumber || '').replace(/\s+/g, '').toUpperCase();
  const date = String(dateIso || '').slice(0, 10);
  if (!flight || !date) return null;
  const raw = localStorage.getItem(`crewcheck_radar_last_${flight}_${date}`);
  return raw ? JSON.parse(raw) : null;
 } catch {
  return null;
 }
}

function shouldSkipDashboardFlightByRadar(flightNumber?: string | null, dateIso?: string | null): boolean {
 const cached = readDashboardCachedRadarStatus(flightNumber, dateIso);
 return isFinishedRadarStatusText(cached?.status);
}


function inferDashboardOriginalDestination(day: CrewRoster['days'][number], firstLeg?: CrewRoster['days'][number]['legs'][number], lastLeg?: CrewRoster['days'][number]['legs'][number]): string {
 const origin = String(firstLeg?.origin || '').toUpperCase();
 const parsedDestination = String(firstLeg?.destination || '').toUpperCase();
 if (parsedDestination && parsedDestination !== origin) return parsedDestination;

 const raw = String(day.rawText || '').replace(/\s+/g, ' ').trim();
 const flightNumber = String(firstLeg?.flightNumber || '').replace(/\s+/g, '').toUpperCase();
 const knownAirport = new Set('BSB GRU CGH GIG SDU VCP CNF POA CWB FLN VIX GYN GIG GIG REC FOR NAT BEL MAO MCP MCZ JPA AJU SSA IOS BPS PMW SLZ THE CGB CGR PVH RBR BVB MAB VIX GYN GIG GYN CPV BEB FOR GYN VCP GIG SDU RAO UDI IGU NVT JOI LDB MGF'.split(/\s+/));

 const airportTokensFrom = (source: string) => (source.match(/\b[A-Z]{3}\b/g) || []).filter((token) => knownAirport.has(token));
 let searchArea = raw.toUpperCase();
 if (flightNumber) {
  const compactFlight = flightNumber.replace(/^([A-Z]{2})(\d)/, '$1 $2');
  const idxA = searchArea.indexOf(flightNumber);
  const idxB = searchArea.indexOf(compactFlight);
  const idx = idxA >= 0 ? idxA : idxB;
  if (idx >= 0) searchArea = searchArea.slice(idx, idx + 260);
 }

 const tokens = airportTokensFrom(searchArea);
 if (origin) {
  const originIdx = tokens.findIndex((token) => token === origin);
  if (originIdx >= 0) {
   const nextDifferent = tokens.slice(originIdx + 1).find((token) => token && token !== origin);
   if (nextDifferent) return nextDifferent;
  }
 }

 const firstDifferent = tokens.find((token) => token && token !== origin);
 return firstDifferent || parsedDestination || String(lastLeg?.destination || '').toUpperCase();
}

function buildDashboardDisplayRoute(day: CrewRoster['days'][number], firstLeg?: CrewRoster['days'][number]['legs'][number], lastLeg?: CrewRoster['days'][number]['legs'][number]): string {
 if (!firstLeg) return '';
 const origin = String(firstLeg.origin || day.base || '').toUpperCase();
 const destination = inferDashboardOriginalDestination(day, firstLeg, lastLeg);
 if (origin && destination) return `${origin} → ${destination}`;
 if (origin) return origin;
 return destination || '';
}

function rosterLatestOperationalDate(roster?: CrewRoster | null): Date | null {
 if (!roster?.days?.length) return null;
 const dates = roster.days.map((day) => rosterDateFromString(day.date).getTime()).filter((value) => Number.isFinite(value));
 if (!dates.length) return null;
 return new Date(Math.max(...dates));
}

function isRosterStaleForLive(roster?: CrewRoster | null): boolean {
 const latest = rosterLatestOperationalDate(roster);
 if (!latest) return false;
 const today = new Date();
 today.setHours(0, 0, 0, 0);
 latest.setHours(0, 0, 0, 0);
 return latest.getTime() < today.getTime();
}

function isSavedRosterCurrentOrFuture(saved?: SavedRosterSummary | null): boolean {
 if (!saved?.month || !saved?.year) return false;
 const today = new Date();
 const currentKey = today.getFullYear() * 100 + (today.getMonth() + 1);
 return Number(saved.year) * 100 + Number(saved.month) >= currentKey;
}

function staleRosterDashboardFallback(roster: CrewRoster): DashboardNextEvent {
 const month = Number(roster.month) || (roster.days?.[0] ? rosterDateFromString(roster.days[0].date).getMonth() + 1 : 0);
 const year = Number(roster.year) || (roster.days?.[0] ? rosterDateFromString(roster.days[0].date).getFullYear() : new Date().getFullYear());
 return {
  title: 'Escala antiga detectada',
  time: 'Atualize',
  endTime: 'nova escala',
  date: `${month ? monthLabel(month, year) : 'Histórico'} · não usada em próximas programações`,
  status: 'Antiga',
  countdown: '—',
  source: 'Histórico CrewCheck',
  isFlight: false,
 };
}


function dashboardLocalDateKey(date: Date): string {
 const safe = safeCrewDate(date);
 return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`;
}

function dashboardEndDate(dayDate: string, start: string, end: string, day: CrewRoster['days'][number]): Date {
 const startTarget = dashboardTargetDate(dayDate, start || '00:00');
 let endTarget: Date;
 if (end) {
  endTarget = dashboardTargetDate(dayDate, end);
  const startMinutes = parseTimeToMinutes(start || '00:00');
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) endTarget.setDate(endTarget.getDate() + 1);
 } else if (isDashboardRestOnlyDay(day)) {
  endTarget = dashboardTargetDate(dayDate, '23:59');
 } else {
  endTarget = new Date(startTarget.getTime() + 90 * 60 * 1000);
 }
 return endTarget;
}

function isDashboardRestOnlyDay(day: CrewRoster['days'][number]): boolean {
 if (day.legs?.length) return false;
 const text = `${day.type || ''} ${day.pairingCode || ''} ${day.rawText || ''}`.toUpperCase();
 if (/\b(HSB|HSBE|SOBREAVISO|HOME\s*STAND|ASB|RES|RESERVA|AIRPORT\s*STAND|MT|REUNI[AÃ]O|MEETING|CRM|CBF|EMER|CHECK|SIMULADOR|LA\s?\d{3,4})\b/.test(text)) return false;
 return /\b(DO|DOF|DOP|DOPR|DR|OFF|VC|FOLGA|FÉRIAS|FERIAS|DESCANSO|MONOFOLGA)\b/.test(text);
}

function dashboardRelationForTarget(target: Date, endTarget: Date, todayStart: Date, now: Date, afterRest: boolean): { relation: DashboardNextEvent['relation']; relationLabel: string; dayContext: string; isToday: boolean; isTomorrow: boolean; isInProgress: boolean; isAfterRest: boolean } {
 const targetDay = new Date(target); targetDay.setHours(0, 0, 0, 0);
 const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(todayStart.getDate() + 1);
 const isToday = targetDay.getTime() === todayStart.getTime();
 const isTomorrow = targetDay.getTime() === tomorrowStart.getTime();
 const isInProgress = target.getTime() <= now.getTime() && endTarget.getTime() > now.getTime();
 const daysAway = Math.max(0, Math.round((targetDay.getTime() - todayStart.getTime()) / 86400000));
 if (isInProgress) return { relation: 'current', relationLabel: 'Em andamento', dayContext: 'Esta programação já começou e ainda não foi finalizada pela janela estimada do CrewCheck.', isToday, isTomorrow, isInProgress, isAfterRest: false };
 if (afterRest) {
  const when = isTomorrow ? 'amanhã' : `em ${daysAway} dias`;
  return { relation: 'rest_followup', relationLabel: isTomorrow ? 'A seguir · amanhã' : `A seguir · ${safeCrewShortDate(target)}`, dayContext: `Hoje consta folga/monofolga. A programação exibida é ${when}; o CrewCheck antecipa a leitura para você se organizar sem confundir com hoje.`, isToday, isTomorrow, isInProgress, isAfterRest: true };
 }
 if (isToday) return { relation: 'today', relationLabel: 'A seguir · hoje', dayContext: 'Próxima programação de hoje ainda não finalizada.', isToday, isTomorrow, isInProgress, isAfterRest: false };
 if (isTomorrow) return { relation: 'tomorrow', relationLabel: 'A seguir · amanhã', dayContext: 'A próxima programação é amanhã. Hoje não há programação operacional pendente para deslocamento no cockpit.', isToday, isTomorrow, isInProgress, isAfterRest: false };
 return { relation: 'future', relationLabel: `A seguir · ${safeCrewShortDate(target)}`, dayContext: `A próxima programação operacional está em ${daysAway} dias.`, isToday, isTomorrow, isInProgress, isAfterRest: false };
}

function buildDashboardNextEvent(bundle: SessionRosterBundle | null, saved?: SavedRosterSummary): DashboardNextEvent {
 const currentSaved = isSavedRosterCurrentOrFuture(saved) ? saved : null;
 const fallback: DashboardNextEvent = currentSaved
  ? {
    title: currentSaved.sourceFileName || 'Escala salva',
    time: 'Abrir',
    endTime: 'histórico',
    date: `${monthLabel(currentSaved.month, currentSaved.year)} · ${currentSaved.base || 'Base'}`,
    status: 'Salva',
    base: currentSaved.base || undefined,
    countdown: '—',
    source: 'Histórico CrewCheck',
    isFlight: false,
   }
  : saved
   ? {
     title: 'Escala antiga salva',
     time: 'Atualize',
     endTime: 'nova escala',
     date: `${monthLabel(saved.month, saved.year)} · histórico`,
     status: 'Antiga',
     countdown: '—',
     source: 'Histórico CrewCheck',
     isFlight: false,
    }
   : {
     title: 'Importe sua escala',
     time: 'PDF',
     endTime: 'novo',
     date: 'PDF exportado pelo CrewTopia, AIMS ou fonte oficial',
     status: 'PDF',
     countdown: '—',
     source: 'Importação segura',
     isFlight: false,
    };

 const roster = bundle?.roster;
 if (!roster?.days?.length) return fallback;
 if (isRosterStaleForLive(roster)) return staleRosterDashboardFallback(roster);

 const now = new Date();
 const todayStart = new Date(now);
 todayStart.setHours(0, 0, 0, 0);
 const candidates: any[] = [...roster.days]
  .flatMap((day, dayIndex): any[] => {
   const orderedLegs = [...(day.legs || [])].sort((a, b) => (parseTimeToMinutes(a.departureTime || '') ?? 9999) - (parseTimeToMinutes(b.departureTime || '') ?? 9999));
   const base = String(day.base || roster.base || '').toUpperCase();
   const activation = dashboardDepartureActivation(day, orderedLegs[0]);

   if (orderedLegs.length) {
    return orderedLegs.map((leg, legIndex) => {
     const previousLeg = orderedLegs[legIndex - 1];
     const nextLeg = orderedLegs[legIndex + 1];
     const displayDestination = String(leg.destination || '').toUpperCase();
     const route = `${String(leg.origin || base || '').toUpperCase()} → ${displayDestination || inferDashboardOriginalDestination(day, leg, leg)}`;
     const publishedPresentation = legIndex === 0 ? inferDashboardFlightPresentationTime(day, leg) : '';
     const start = legIndex === 0 ? (activation?.startTime || publishedPresentation || day.dutyReport || leg.departureTime || '') : (leg.departureTime || '');
     const target = dashboardTargetDate(day.date, start || leg.departureTime || '00:00');
     let endTarget = dashboardTargetDate(day.date, leg.arrivalTime || leg.departureTime || start || '00:00');
     const startMinutes = parseTimeToMinutes(start || leg.departureTime || '00:00');
     const endMinutes = parseTimeToMinutes(leg.arrivalTime || '');
     if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) endTarget.setDate(endTarget.getDate() + 1);
     if (!leg.arrivalTime) endTarget = new Date(target.getTime() + 90 * 60_000);
     // Após pousar/chegar, o Cockpit deve avançar para o próximo trecho, mesmo que a jornada do dia ainda não tenha sido encerrada.
     endTarget = new Date(endTarget.getTime() + 20 * 60_000);
     const flightDateKey = dashboardLocalDateKey(target);
     return {
      day, firstLeg: leg, lastLeg: leg, range: { start, end: leg.arrivalTime || (nextLeg?.departureTime ? `próx. ${nextLeg.departureTime}` : '') },
      route, title: route, target, endTarget, smartTarget: legIndex === 0 ? dashboardSmartDepartureTarget(day, leg, start, base).target : target,
      smartRule: legIndex === 0 ? dashboardSmartDepartureTarget(day, leg, start, base).rule : 'Trecho seguinte da jornada; acompanhar horário publicado da escala',
      index: dayIndex * 100 + legIndex, base, requiresDeparture: legIndex === 0 ? (activation?.requiresDeparture ?? true) : false, activation: legIndex === 0 ? activation : { requiresDeparture: false, title: 'Trecho seguinte', status: 'Programado' },
      isRestOnly: false, flightDateKey, finishedByRadar: shouldSkipDashboardFlightByRadar(leg.flightNumber, flightDateKey), previousLeg, nextLeg,
     };
    });
   }

   const range = dashboardDutyRange(day, undefined, undefined);
   const start = activation?.startTime || range.start || day.dutyReport || '00:00';
   const target = dashboardTargetDate(day.date, start);
   const endTarget = dashboardEndDate(day.date, start, range.end || '', day);
   const route = activation?.title || day.pairingCode || day.type || 'Programação';
   const title = activation?.title || readableDutyTitle(day.type, day.pairingCode);
   const requiresDeparture = activation?.requiresDeparture ?? dashboardRequiresHomeDeparture(day, undefined, base);
   const smart = dashboardSmartDepartureTarget(day, undefined, start, base);
   const isRestOnly = isDashboardRestOnlyDay(day);
   return [{ day, firstLeg: undefined, lastLeg: undefined, range: { ...range, start }, route, title, target, endTarget, smartTarget: smart.target, smartRule: smart.rule, index: dayIndex * 100, base, requiresDeparture, activation, isRestOnly, flightDateKey: dashboardLocalDateKey(target), finishedByRadar: false, previousLeg: undefined, nextLeg: undefined }];
  })
  .filter((item) => !item.finishedByRadar)
  .sort((a, b) => a.target.getTime() - b.target.getTime() || a.index - b.index);

 const openCandidates = candidates.filter((item) => item.endTarget.getTime() > now.getTime());
 const operationalCandidates = openCandidates.filter((item) => !item.isRestOnly);
 const next = operationalCandidates[0] || openCandidates[0];
 if (!next) return staleRosterDashboardFallback(roster);
 const todayRest = candidates.find((item) => item.isRestOnly && dashboardLocalDateKey(item.target) === dashboardLocalDateKey(todayStart));
 const afterRest = Boolean(todayRest && dashboardLocalDateKey(next.target) !== dashboardLocalDateKey(todayStart));
 const relation = dashboardRelationForTarget(next.target, next.endTarget, todayStart, now, afterRest);
 const operationalText = `${next.day.type || ''} ${next.day.pairingCode || ''} ${next.day.rawText || ''} ${next.title || ''} ${next.route || ''}`.toUpperCase();
 const effectiveRequiresDeparture = Boolean(next.requiresDeparture || ['ASB', 'RES', 'RESERVA', 'AIRPORT STAND', 'LA', 'VOO ACIONADO', 'REUNIÃO', 'MEETING', 'CRM', 'CBF', 'EMER', 'CHECK', 'SIMULADOR'].some((token) => operationalText.includes(token)));

 return {
  title: next.title,
  route: next.route,
  time: next.range.start || '—',
  endTime: next.range.end || (isDashboardReserveOrStandby(next.day) ? 'fim não lido' : '—'),
  date: `${next.day.dayOfWeek || ''} ${next.day.date}`.trim(),
  status: next.firstLeg ? 'Programado' : (next.activation?.status || readableDutyTitle(next.day.type, next.day.pairingCode)),
  gate: next.firstLeg ? '—' : undefined,
  terminal: next.firstLeg ? '—' : undefined,
  countdown: effectiveRequiresDeparture ? countdownToRosterTime(next.day.date, next.range.start) : 'Sem deslocamento',
  targetIso: safeCrewIso(next.target),
  smartDepartureTargetIso: safeCrewIso(next.smartTarget || next.target),
  smartDepartureRule: next.smartRule,
  source: next.firstLeg ? 'Escala atual · Radar CrewCheck quando disponível' : 'Escala atual',
  flightNumber: next.firstLeg?.flightNumber || undefined,
  isFlight: Boolean(next.firstLeg),
  origin: next.firstLeg?.origin || next.base,
  destination: next.firstLeg ? inferDashboardOriginalDestination(next.day, next.firstLeg, next.lastLeg) : (next.lastLeg?.destination || undefined),
  base: next.base,
  requiresDeparture: effectiveRequiresDeparture,
  relation: relation.relation,
  relationLabel: relation.relationLabel,
  dayContext: relation.dayContext,
  isToday: relation.isToday,
  isTomorrow: relation.isTomorrow,
  isInProgress: relation.isInProgress,
  isAfterRest: relation.isAfterRest,
  actualDateIso: dashboardLocalDateKey(next.target),
 };
}

function dashboardDutyRange(day: CrewRoster['days'][number], firstLeg?: CrewRoster['days'][number]['legs'][number], lastLeg?: CrewRoster['days'][number]['legs'][number]): { start: string; end: string } {
 const times = extractTimesFromText(day.rawText || '');
 const flightPresentation = firstLeg ? inferDashboardFlightPresentationTime(day, firstLeg) : '';
 const start = firstLeg ? (flightPresentation || day.dutyReport || firstLeg.departureTime || times[0] || '') : (day.dutyReport || times[0] || '');
 let end = firstLeg ? (day.dutyDebrief || lastLeg?.arrivalTime || '') : (day.dutyDebrief || '');

 if (!firstLeg && !end && times.length > 1 && !isDashboardReserveOrStandby(day)) end = times[times.length - 1];
 if (isDashboardReserveOrStandby(day) && start && end === start) end = '';
 if (!end && start && isDashboardReserveOrStandby(day)) end = inferDashboardReserveEndTime(day, start);
 if (!end && start && !isDashboardReserveOrStandby(day) && typeof day.dutyHours === 'number' && day.dutyHours > 0) end = addMinutesToDisplayTime(start, Math.round(day.dutyHours * 60));
 return { start, end };
}

function inferDashboardFlightPresentationTime(day: CrewRoster['days'][number], firstLeg?: CrewRoster['days'][number]['legs'][number]): string {
 const departure = firstLeg?.departureTime || '';
 if (!departure) return day.dutyReport || '';
 const report = day.dutyReport || '';
 const depMinutes = parseTimeToMinutes(departure);
 const reportMinutes = parseTimeToMinutes(report);
 if (report && depMinutes !== null && reportMinutes !== null) {
  const diff = depMinutes >= reportMinutes ? depMinutes - reportMinutes : depMinutes + 1440 - reportMinutes;
  if (diff >= 15 && diff <= 240) return report;
 }
 // Regra de confiança: a Escala/Cockpit só exibe apresentação quando ela veio publicada.
 // A estimativa de 1h antes fora de base fica exclusiva da Saída Inteligente.
 return '';
}

function dashboardSmartDepartureTarget(day: CrewRoster['days'][number], firstLeg: CrewRoster['days'][number]['legs'][number] | undefined, scaleStart: string, base: string): { target: Date; rule: string } {
 const scaleTarget = dashboardTargetDate(day.date, scaleStart || firstLeg?.departureTime || day.dutyReport || '');
 if (!dashboardRequiresHomeDeparture(day, firstLeg, base)) return { target: scaleTarget, rule: 'Sem saída inteligente: programação não exige deslocamento de casa' };
 if (!firstLeg?.departureTime) return { target: scaleTarget, rule: 'Saída Inteligente: programação exige deslocamento; usando horário publicado na escala' };
 const publishedReport = inferDashboardFlightPresentationTime(day, firstLeg);
 if (publishedReport) return { target: dashboardTargetDate(day.date, publishedReport), rule: 'Apresentação publicada na escala' };
 const origin = String(firstLeg.origin || '').toUpperCase();
 const homeBase = String(base || day.base || '').toUpperCase();
 if (origin && homeBase && origin !== homeBase) {
  const operational = dashboardTargetDate(day.date, addMinutesToDisplayTime(firstLeg.departureTime, -60));
  return { target: operational, rule: 'Saída Inteligente: voo fora da base sem apresentação publicada; considera 1h antes da decolagem' };
 }
 return { target: scaleTarget, rule: 'Horário publicado/visível na escala' };
}

function dashboardDepartureActivation(day: CrewRoster['days'][number], firstLeg: CrewRoster['days'][number]['legs'][number] | undefined): { requiresDeparture: boolean; startTime?: string; title?: string; status?: string } | null {
 if (firstLeg) {
  // Cockpit/Próxima Programação deve exibir o horário publicado de apresentação.
  // A decolagem fica apenas nos detalhes do voo e no radar; não pode sobrescrever o
  // início calculado por dashboardDutyRange().
  return { requiresDeparture: true, title: 'Voo', status: 'Programado' };
 }
 const text = `${day.type || ''} ${day.pairingCode || ''} ${day.rawText || ''}`.toUpperCase();
 const hasStandby = /\b(HSB|HSBE|SOBREAVISO|HOME\s*STAND)\b/.test(text);
 const findTimeNear = (token: string) => {
  const idx = text.indexOf(token);
  if (idx < 0) return '';
  const raw = String(day.rawText || '').slice(idx, idx + 140);
  return extractTimesFromText(raw)[0] || '';
 };
 if (/\b(ASB|RES|RESERVA|AIRPORT\s*STAND)\b/.test(text)) {
  const token = text.match(/\b(ASB|RES|RESERVA|AIRPORT\s*STAND)\b/)?.[0] || 'ASB';
  return { requiresDeparture: true, startTime: findTimeNear(token) || day.dutyReport || '', title: 'Reserva', status: 'Reserva' };
 }
 if (/\bLA\s?\d{3,4}\b/.test(text)) {
  const token = text.match(/\bLA\s?\d{3,4}\b/)?.[0] || 'LA';
  return { requiresDeparture: true, startTime: findTimeNear(token) || day.dutyReport || '', title: 'Voo acionado', status: hasStandby ? 'Sobreaviso acionado' : 'Voo' };
 }
 if (/\b(MT|REUNI[AÃ]O|MEETING)\b/.test(text)) {
  const token = text.match(/\b(MT|REUNI[AÃ]O|MEETING)\b/)?.[0] || 'MT';
  return { requiresDeparture: true, startTime: findTimeNear(token) || day.dutyReport || '', title: 'Reunião', status: 'Reunião' };
 }
 if (/\b(C\d{2,3}F|TREINAMENTO\s+PRESENCIAL|SIMULADOR|CHECK|CRM|CBF|EMER)\b/.test(text) && !/\b(EAD|ONLINE|REMOTO|REMOTE|VIRTUAL)\b/.test(text)) {
  const token = text.match(/\b(C\d{2,3}F|TREINAMENTO\s+PRESENCIAL|SIMULADOR|CHECK|CRM|CBF|EMER)\b/)?.[0] || 'CRM';
  return { requiresDeparture: true, startTime: findTimeNear(token) || day.dutyReport || '', title: 'Treinamento', status: 'Treinamento' };
 }
 if (hasStandby) return { requiresDeparture: false, startTime: day.dutyReport || '', title: 'Sobreaviso', status: 'Sobreaviso' };
 return null;
}

function dashboardRequiresHomeDeparture(day: CrewRoster['days'][number], firstLeg: CrewRoster['days'][number]['legs'][number] | undefined, base: string): boolean {
 const activation = dashboardDepartureActivation(day, firstLeg);
 if (activation) return activation.requiresDeparture;
 const text = `${day.type || ''} ${day.pairingCode || ''} ${day.rawText || ''}`.toUpperCase();
 if (/\b(DO|DOF|DOP|DOPR|DR|OFF|VC|FERIAS|FÉRIAS|FOLGA|DESCANSO)\b/.test(text)) return false;
 if (/\b(EAD|ONLINE|REMOTO|REMOTE|VIRTUAL)\b/.test(text)) return false;
 if (/\b(ASB|RES|RESERVA|AIRPORT\s*STAND|MT|REUNI[AÃ]O|MEETING|C\d{2,3}F|TREINAMENTO\s+PRESENCIAL|SIMULADOR|CHECK|CRM|CBF|EMER)\b/.test(text)) return true;
 return false;
}

function inferDashboardReserveEndTime(day: CrewRoster['days'][number], start: string): string {
 const code = String(day.pairingCode || day.type || '').toUpperCase();
 const explicit = extractDashboardActivityTimes(day, code).filter((time) => time !== start);
 if (explicit.length) return explicit[explicit.length - 1];
 if (code.includes('ASB') || code.includes('RES')) return addMinutesToDisplayTime(start, 360);
 if (code.includes('HSBE')) return addMinutesToDisplayTime(start, 180);
 if (code.includes('HSB')) return addMinutesToDisplayTime(start, 180);
 return '';
}

function extractDashboardActivityTimes(day: CrewRoster['days'][number], code: string): string[] {
 const normalizedCode = String(code || '').toUpperCase();
 const raw = String(day.rawText || '');
 if (!normalizedCode || !raw) return [];
 const upper = raw.toUpperCase();
 const idx = upper.search(new RegExp(`\\b${normalizedCode}\\b`));
 if (idx < 0) return [];
 const nextIdx = findDashboardNextActivityIndex(upper, idx + normalizedCode.length);
 const segment = raw.slice(idx, nextIdx > idx ? nextIdx : Math.min(raw.length, idx + 220));
 return extractTimesFromText(segment);
}

function findDashboardNextActivityIndex(text: string, fromIndex: number): number {
 const re = /\b(HSBE|HSB|ASB|RES|CBF|EMER|CRMBSB|CRMB|CRM|MT|C\d{2,3}F|DOF?|DOPR?|DR|OFF|VC|LA\s?\d{3,4})\b/g;
 re.lastIndex = fromIndex;
 const match = re.exec(text);
 return match ? match.index : -1;
}

function isDashboardReserveOrStandby(day: CrewRoster['days'][number]): boolean {
 const code = String(day.pairingCode || day.type || '').toUpperCase();
 return /^(HSB|HSBE|ASB|RES)$/.test(code);
}

function extractTimesFromText(text: string): string[] {
 const seen = new Set<string>();
 const times: string[] = [];
 for (const match of String(text || '').matchAll(/\b([01]?\d|2[0-3]):[0-5]\d(?:\(\+1\))?\b/g)) {
  const clean = match[0].replace('(+1)', '');
  if (!seen.has(clean)) { seen.add(clean); times.push(clean); }
 }
 return times;
}

function addMinutesToDisplayTime(time: string, minutesToAdd: number): string {
 const [hours, minutes] = String(time || '').split(':').map((part) => Number(part));
 if (!Number.isFinite(hours)) return '';
 const total = (((hours * 60 + (Number.isFinite(minutes) ? minutes : 0) + minutesToAdd) % 1440) + 1440) % 1440;
 return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function dashboardTargetDate(date: string, time: string): Date {
 const target = rosterDateFromString(date);
 const parsed = parseTimeToMinutes(time);
 if (parsed !== null) target.setHours(Math.floor(parsed / 60), parsed % 60, 0, 0);
 return safeCrewDate(target);
}

function rosterDateFromString(value: string): Date {
 const raw = String(value || '').trim();
 const now = new Date();
 if (!raw) return new Date(now.getFullYear(), now.getMonth(), now.getDate());

 const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
 if (iso) {
  const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return safeCrewDate(date, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
 }

 const br = raw.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/);
 if (br) {
  const year = br[3] ? Number(br[3].length === 2 ? `20${br[3]}` : br[3]) : now.getFullYear();
  const date = new Date(year, Number(br[2]) - 1, Number(br[1]));
  return safeCrewDate(date, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
 }

 const monthMap: Record<string, number> = { JAN: 1, FEV: 2, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAI: 5, MAY: 5, JUN: 6, JUL: 7, AGO: 8, AUG: 8, SET: 9, SEP: 9, OUT: 10, OCT: 10, NOV: 11, DEZ: 12, DEC: 12 };
 const text = raw.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
 const textual = text.match(/(\d{1,2})\s+([A-Z]{3})\b(?:\s+(\d{2,4}))?/);
 if (textual) {
  const year = textual[3] ? Number(textual[3].length === 2 ? `20${textual[3]}` : textual[3]) : now.getFullYear();
  const month = monthMap[textual[2]] || now.getMonth() + 1;
  const date = new Date(year, month - 1, Number(textual[1]));
  return safeCrewDate(date, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
 }

 const parsed = new Date(raw);
 return safeCrewDate(parsed, new Date(now.getFullYear(), now.getMonth(), now.getDate()));
}

function countdownToRosterTime(date: string, time: string): string {
 const target = rosterDateFromString(date);
 const [hours, minutes] = String(time || '').split(':').map((part) => Number(part));
 if (Number.isFinite(hours)) target.setHours(hours, Number.isFinite(minutes) ? minutes : 0, 0, 0);
 const diff = target.getTime() - Date.now();
 if (diff <= 0) return 'agora';
 const totalMinutes = Math.floor(diff / 60000);
 const days = Math.floor(totalMinutes / 1440);
 const hoursLeft = Math.floor((totalMinutes % 1440) / 60);
 const minutesLeft = totalMinutes % 60;
 if (days > 0) return `${days}d ${hoursLeft}h`;
 return `${hoursLeft}h ${String(minutesLeft).padStart(2, '0')}m`;
}

function readableDutyTitle(type: string, code?: string | null): string {
 const normalized = String(code || type || '').toUpperCase();
 if (['DO', 'DOF', 'DR', 'DOP', 'DOPR'].includes(normalized)) return 'Folga';
 if (['HSB', 'HSBE'].includes(normalized)) return 'Sobreaviso';
 if (['ASB', 'RES'].includes(normalized)) return 'Reserva';
 if (['CRM', 'C32F'].includes(normalized)) return 'Treinamento';
 return normalized || 'Programação';
}


type BidsWindowType = 'general' | 'instructor';
type BidsMonthWindow = { month: number; label: string; generalStart: number; generalEnd: number; instructorStart: number; instructorEnd: number; exception?: string };


function crewcheckAuthHeader(extra: Record<string, string> = {}): Record<string, string> {
 const token = getToken();
 return { ...extra, ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

const CREWCHECK_BIDS_WINDOWS: BidsMonthWindow[] = [
 { month: 2, label: 'Fevereiro', generalStart: 7, generalEnd: 11, instructorStart: 7, instructorEnd: 10, exception: 'exceção' },
 { month: 3, label: 'Março', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 15 },
 { month: 4, label: 'Abril', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 14 },
 { month: 5, label: 'Maio', generalStart: 10, generalEnd: 14, instructorStart: 10, instructorEnd: 12, exception: 'exceção' },
 { month: 6, label: 'Junho', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 14 },
 { month: 7, label: 'Julho', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
 { month: 8, label: 'Agosto', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
 { month: 9, label: 'Setembro', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
 { month: 10, label: 'Outubro', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 12 },
 { month: 11, label: 'Novembro', generalStart: 10, generalEnd: 14, instructorStart: 10, instructorEnd: 12, exception: 'exceção' },
 { month: 12, label: 'Dezembro', generalStart: 11, generalEnd: 15, instructorStart: 11, instructorEnd: 13 },
];

function defaultBidsMonth(): number {
 const now = new Date();
 const m = now.getMonth() + 1;
 return CREWCHECK_BIDS_WINDOWS.find((item) => item.month >= m)?.month || 2;
}

function bidsKey(year: number, month: number, type: BidsWindowType) {
 return `crewcheck_bids_done_${year}_${month}_${type}`;
}

function bidsDate(year: number, month: number, day: number, hour = 9, minute = 0): Date {
 return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function bidsIcalDate(date: Date): string {
 return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}00`;
}

function buildBidsIcs(year: number, item: BidsMonthWindow, type: BidsWindowType, done: boolean): string {
 const startDay = type === 'instructor' ? item.instructorStart : item.generalStart;
 const endDay = type === 'instructor' ? item.instructorEnd : item.generalEnd;
 const typeLabel = type === 'instructor' ? 'Instrutores' : 'Geral';
 const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
 const open = bidsDate(year, item.month, startDay, 8, 0);
 const close = bidsDate(year, item.month, endDay, 18, 0);
 const openEnd = bidsDate(year, item.month, startDay, 8, 30);
 const closeEnd = bidsDate(year, item.month, endDay, 18, 30);
 const alarm = (text: string, trigger: string) => `BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:${text}\nTRIGGER:${trigger}\nEND:VALARM\n`;
 const event = (uid: string, start: Date, end: Date, summary: string, description: string, alarms: string) =>
`BEGIN:VEVENT
UID:${uid}@crewcheck.local
DTSTAMP:${stamp}
DTSTART;TZID=America/Sao_Paulo:${bidsIcalDate(start)}
DTEND;TZID=America/Sao_Paulo:${bidsIcalDate(end)}
SUMMARY:${summary.replace(/,/g, '\\,')}
DESCRIPTION:${description.replace(/\n/g, '\\n').replace(/,/g, '\\,')}
LOCATION:BIDS / PBS · Sistema oficial
CATEGORIES:CrewCheck,BIDS,PBS
STATUS:CONFIRMED
TRANSP:TRANSPARENT
${alarms}END:VEVENT
`;
 return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CrewCheck Premium//BIDS Reminder//PT-BR
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-TIMEZONE:America/Sao_Paulo
X-WR-CALNAME:CrewCheck · BIDS · ${item.label}/${year}
${event(
 `crewcheck-bids-open-${year}-${item.month}-${type}`,
 open,
 openEnd,
 `BIDS aberto · ${item.label} · ${typeLabel}`,
 `Janela de solicitação do BIDS/PBS aberta.\nMês: ${item.label}/${year}\nTipo: ${typeLabel}\nJanela: ${startDay} a ${endDay}\nStatus no CrewCheck: ${done ? 'já solicitado' : 'pendente'}\n\nConfirme sempre no sistema oficial.\n#CREWCHECK #BIDS`,
 alarm('BIDS abriu hoje · registrar solicitação', '-PT30M') + alarm('BIDS abriu · não esquecer solicitação', '-PT0M')
)}
${event(
 `crewcheck-bids-close-${year}-${item.month}-${type}`,
 close,
 closeEnd,
 `Último dia BIDS · ${item.label}`,
 `Último dia da janela de solicitação do BIDS/PBS.\nMês: ${item.label}/${year}\nTipo: ${typeLabel}\nJanela: ${startDay} a ${endDay}\n\nSe já solicitou no CrewCheck, marque como “Já solicitado” para parar os lembretes internos.\n#CREWCHECK #BIDS`,
 alarm('BIDS fecha hoje · confira se já solicitou', '-PT10H') + alarm('BIDS fecha em breve · última conferência', '-PT2H')
)}
END:VCALENDAR
`;
}

function downloadBidsTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
 const blob = new Blob([content], { type: mime });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = filename;
 document.body.appendChild(link);
 link.click();
 window.setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 400);
}

function BidsReminderScreen({ onBack, isInstructor = false }: { onBack: () => void; isInstructor?: boolean }) {
 const now = new Date();
 const [year, setYear] = useState(now.getFullYear());
 const [month, setMonth] = useState(defaultBidsMonth());
 const [type, setType] = useState<BidsWindowType>(() => (localStorage.getItem('crewcheck_bids_type') as BidsWindowType) || (isInstructor ? 'instructor' : 'general'));
 const item = CREWCHECK_BIDS_WINDOWS.find((entry) => entry.month === month) || CREWCHECK_BIDS_WINDOWS[0];
 const startDay = type === 'instructor' ? item.instructorStart : item.generalStart;
 const endDay = type === 'instructor' ? item.instructorEnd : item.generalEnd;
 const key = bidsKey(year, item.month, type);
 const [done, setDone] = useState(() => localStorage.getItem(key) === '1');

 useEffect(() => {
  setDone(localStorage.getItem(key) === '1');
  localStorage.setItem('crewcheck_bids_type', type);
 }, [key, type]);

 const openDate = bidsDate(year, item.month, startDay, 8, 0);
 const closeDate = bidsDate(year, item.month, endDay, 18, 0);
 const today = new Date();
 const inWindow = today >= bidsDate(year, item.month, startDay, 0, 0) && today <= bidsDate(year, item.month, endDay, 23, 59);
 const status = done ? 'Já solicitado' : inWindow ? 'Janela aberta' : today < openDate ? 'Aguardando abertura' : 'Janela encerrada';

 const toggleDone = () => {
  const next = !done;
  if (next) {
   localStorage.setItem(key, '1');
   toast.success('BIDS marcado como já solicitado. Lembretes internos pausados.');
  } else {
   localStorage.removeItem(key);
   toast.info('Status reaberto. O CrewCheck volta a lembrar.');
  }
  setDone(next);
 };

 const exportCalendar = () => {
  const filename = `CrewCheck_BIDS_${year}_${String(month).padStart(2, '0')}_${type}.ics`;
  downloadBidsTextFile(filename, buildBidsIcs(year, item, type, done), 'text/calendar;charset=utf-8');
  toast.success('Calendário BIDS gerado. Importe no Google Calendar/Apple Calendar.');
 };

 const openGoogleCalendarBids = () => {
  const start = bidsIcalDate(openDate);
  const end = bidsIcalDate(closeDate);
  const title = encodeURIComponent(`CrewCheck · BIDS ${item.label}/${year}`);
  const details = encodeURIComponent(`Janela BIDS/PBS ${item.label}/${year} · ${type === 'instructor' ? 'Instrutores' : 'Geral'} · ${startDay} a ${endDay}. Confirme sempre no sistema oficial.`);
  window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&location=BIDS%20%2F%20PBS`, '_blank', 'noopener,noreferrer');
  toast.success('Google Calendar aberto para adicionar o lembrete BIDS.');
 };

 return (
  <div className="crewcheck-bids-screen min-h-screen bg-[#030914] px-5 pb-28 pt-7 text-white">
   <div className="mx-auto max-w-5xl">
    <div className="flex items-center justify-between gap-3">
     <button onClick={onBack} className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-slate-100 active:scale-95"><ArrowLeft className="h-5 w-5" /></button>
     <div className="min-w-0 flex-1 text-center">
      <p className="text-[0.68rem] font-black uppercase tracking-[0.34em] text-cyan-100/65">CrewCheck Premium</p>
      <h1 className="truncate text-2xl font-black tracking-tight">BIDS / PBS</h1>
     </div>
     <button onClick={exportCalendar} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-cyan-50 active:scale-95"><CalendarDays className="h-5 w-5" /></button>
    </div>

    <section className="mt-6 rounded-[2rem] border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(34,211,238,.13),rgba(255,255,255,.055),rgba(37,99,235,.10))] p-5 shadow-2xl shadow-cyan-950/20">
     <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/65">janela de solicitação</p>
     <h2 className="mt-2 text-4xl font-black">{status}</h2>
     <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Mês alvo: {item.label}/{year} · {type === 'instructor' ? 'Instrutores' : 'Geral'} · janela {startDay} a {endDay}{item.exception ? ` · ${item.exception}` : ''}</p>
     {isInstructor ? <p className="mt-2 inline-flex rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-amber-100">Perfil marcado como instrutor</p> : null}

     <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <label className="block"><span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/60">Ano</span><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none" /></label>
      <label className="block"><span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/60">Mês</span><select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none">{CREWCHECK_BIDS_WINDOWS.map((entry) => <option key={entry.month} value={entry.month}>{entry.label}</option>)}</select></label>
      <label className="block"><span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/60">Tipo</span><select value={type} onChange={(e) => setType(e.target.value as BidsWindowType)} className="mt-2 w-full rounded-2xl border border-white/10 bg-[#061426] px-3 py-3 text-sm font-black text-white outline-none"><option value="general">Geral</option><option value="instructor">Instrutores</option></select></label>
     </div>

     <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <div className="rounded-3xl border border-white/10 bg-[#061426] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Abertura</p><p className="mt-2 text-2xl font-black">{openDate.toLocaleDateString('pt-BR')}</p></div>
      <div className="rounded-3xl border border-white/10 bg-[#061426] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Fechamento</p><p className="mt-2 text-2xl font-black">{closeDate.toLocaleDateString('pt-BR')}</p></div>
      <button onClick={toggleDone} className={`rounded-3xl border p-4 text-left transition active:scale-95 ${done ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-50' : 'border-amber-300/25 bg-amber-300/10 text-amber-50'}`}><CheckCircle2 className="mb-2 h-6 w-6" /><b>{done ? 'Já solicitado' : 'Marcar como já solicitado'}</b><p className="mt-1 text-xs leading-5 opacity-80">Quando marcado, o CrewCheck para de insistir no lembrete interno.</p></button>
     </div>

     <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button onClick={exportCalendar} className="rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#061426]"><DownloadIcon className="mr-2 inline h-4 w-4" /> Exportar para calendário</button><button onClick={openGoogleCalendarBids} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-4 text-sm font-black text-cyan-50"><ExternalLink className="mr-2 inline h-4 w-4" /> Sincronizar BIDS</button>
      <button onClick={() => toast.info('Use o calendário exportado para receber alerta mesmo com o app fechado.')} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-4 text-sm font-black text-cyan-50"><Bell className="mr-2 inline h-4 w-4" /> Como serei avisado?</button>
     </div>
    </section>

    <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5">
     <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/60">tabela importada do informativo</p>
     <div className="mt-4 overflow-hidden rounded-3xl border border-white/10">
      {CREWCHECK_BIDS_WINDOWS.map((entry) => (
       <div key={entry.month} className="grid grid-cols-[1fr_1fr_1fr] border-b border-white/10 bg-[#061426] px-3 py-3 text-sm last:border-b-0">
        <b>{entry.label}</b>
        <span>Geral: {entry.generalStart} a {entry.generalEnd}</span>
        <span>Instr.: {entry.instructorStart} a {entry.instructorEnd}</span>
       </div>
      ))}
     </div>
     <p className="mt-4 text-xs leading-5 text-slate-400">Fonte operacional: informativo de alteração da janela de solicitação do PBS/BIDS enviado pelo usuário. Confirme sempre no sistema oficial.</p>
    </section>
   </div>
  </div>
 );
}


function BillingStandaloneScreen({ onBack }: { onBack: () => void }) {
 const [status, setStatus] = useState<BillingStatus | null>(null);
 const [busy, setBusy] = useState(false);

 const refresh = useCallback(async (silent = false) => {
  setBusy(true);
  try {
   const next = await getBillingStatus();
   setStatus(next);
   if (!silent) toast.success('Assinatura atualizada.');
  } catch (error) {
   if (!silent) toast.error(error instanceof Error ? error.message : 'Não consegui carregar a assinatura.');
  } finally {
   setBusy(false);
  }
 }, []);

 useEffect(() => {
  void refresh(true);
 }, [refresh]);

 async function handleStartTrialStandalone(cpfCnpj: string): Promise<BillingStatus | null> {
  setBusy(true);
  try {
   const next = await startPremiumTrial({
    cpfCnpj,
    acknowledgedSafetyNotice: true,
    safetyNoticeVersion: PREMIUM_SAFETY_NOTICE_VERSION,
   });
   setStatus(next);
   toast.success(next.message || 'Teste Premium ativado. A cobrança fica programada para depois do período grátis.');
   return next;
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar o teste premium.');
   return null;
  } finally {
   setBusy(false);
  }
 }

 async function handleSubscribeStandalone(planId: 'premium_monthly' | 'premium_annual', cpfCnpj: string, billingType: BillingCheckoutBillingType = 'UNDEFINED'): Promise<BillingCheckoutResponse | null> {
  setBusy(true);
  try {
   const result = await createBillingCheckout(planId, billingType, {
    cpfCnpj,
    acknowledgedSafetyNotice: true,
    safetyNoticeVersion: PREMIUM_SAFETY_NOTICE_VERSION,
   });
   if (result.billing) setStatus(result.billing);
   toast.success(result.message || 'Cobrança criada. Escolha a forma de pagamento no checkout seguro.');
   return result;
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível criar a cobrança.');
   return null;
  } finally {
   setBusy(false);
  }
 }

 async function handleRegularizeTrialStandalone(cpfCnpj: string): Promise<BillingStatus | null> {
  setBusy(true);
  try {
   const next = await regularizePremiumTrial({
    cpfCnpj,
    acknowledgedSafetyNotice: true,
    safetyNoticeVersion: PREMIUM_SAFETY_NOTICE_VERSION,
   });
   setStatus(next);
   toast.success(next.message || 'Assinatura regularizada.');
   return next;
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível regularizar a assinatura.');
   return null;
  } finally {
   setBusy(false);
  }
 }

 async function handleCancelStandalone() {
  if (!window.confirm('Cancelar a assinatura premium? O plano básico gratuito continuará disponível.')) return;
  setBusy(true);
  try {
   const next = await cancelBillingSubscription();
   setStatus(next);
   toast.success(next.message || 'Cancelamento registrado.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível cancelar a assinatura.');
  } finally {
   setBusy(false);
  }
 }

 return (
  <div className="min-h-screen bg-[#061425] px-4 py-6 pb-32 text-white sm:px-6 lg:px-8">
   <div className="mx-auto max-w-6xl">
    <HeaderBack title="Assinatura" subtitle="planos · teste · pagamento" onBack={onBack} />
    <div className="mt-6">
     <BillingSettingsCard
      status={status}
      busy={busy}
      onRefresh={() => void refresh()}
      onStartTrial={handleStartTrialStandalone}
      onSubscribe={handleSubscribeStandalone}
      onRegularizeTrial={handleRegularizeTrialStandalone}
      onCancel={handleCancelStandalone}
     />
    </div>
   </div>
  </div>
 );
}


function buildCrewCheckDemoRoster(): CrewRoster {
 const now = new Date();
 const year = now.getFullYear();
 const month = now.getMonth() + 1;
 const baseDate = new Date(year, now.getMonth(), now.getDate());
 const fmt = (offset: number) => {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset);
  return d.toLocaleDateString('pt-BR');
 };
 const dayInfo = (offset: number) => {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + offset);
  return { dayNumber: d.getDate(), month: d.getMonth() + 1, year: d.getFullYear(), dayOfWeek: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase() };
 };
 const d0 = dayInfo(0);
 const d1 = dayInfo(1);
 const d2 = dayInfo(2);
 return {
  crewName: 'Tripulante Exemplo',
  crewId: 'DEMO-0001',
  base: 'BSB',
  rank: 'Comissário(a) de voo',
  airline: 'CrewCheck Demo',
  month,
  year,
  rawText: 'Modo demonstração CrewCheck. Dados fictícios para apresentar o app sem usar dados reais.',
  totals: { flightHours: 8.5, dutyHours: 16.2 },
  days: [
   { date: fmt(0), dayOfWeek: d0.dayOfWeek, dayNumber: d0.dayNumber, month: d0.month, year: d0.year, type: 'VOO', pairingCode: 'LA3001', dutyReport: '08:30', dutyDebrief: '15:10', dutyHours: 6.6, flyingHours: 3.8, isNextDay: false, hotel: null, base: 'BSB', rawText: 'DEMO BSB-GRU-BSB', legs: [
    { flightNumber: 'LA3001', origin: 'BSB', destination: 'GRU', departureTime: '09:20', arrivalTime: '11:05', workType: 'OP', duration: 1.75 },
    { flightNumber: 'LA3002', origin: 'GRU', destination: 'BSB', departureTime: '13:20', arrivalTime: '15:10', workType: 'OP', duration: 1.83 },
   ] },
   { date: fmt(1), dayOfWeek: d1.dayOfWeek, dayNumber: d1.dayNumber, month: d1.month, year: d1.year, type: 'VOO', pairingCode: 'LA3100', dutyReport: '11:15', dutyDebrief: '22:10', dutyHours: 10.9, flyingHours: 4.8, isNextDay: false, hotel: 'Pernoite fora de base · exemplo', base: 'BSB', rawText: 'DEMO BSB-FOR-CNF pernoite', legs: [
    { flightNumber: 'LA3100', origin: 'BSB', destination: 'FOR', departureTime: '12:05', arrivalTime: '14:45', workType: 'OP', duration: 2.67 },
    { flightNumber: 'LA3101', origin: 'FOR', destination: 'CNF', departureTime: '18:05', arrivalTime: '22:10', workType: 'OP', duration: 2.1 },
   ] },
   { date: fmt(2), dayOfWeek: d2.dayOfWeek, dayNumber: d2.dayNumber, month: d2.month, year: d2.year, type: 'DO', pairingCode: 'DO', dutyReport: null, dutyDebrief: null, dutyHours: 0, flyingHours: 0, isNextDay: false, hotel: null, base: 'BSB', rawText: 'Folga demonstrativa', legs: [] },
  ],
 };
}

function Home() {
 const [, setLocation] = useLocation();
 const [currentView, setCurrentView] = useState<HomeView>('home');
 const [isDragging, setIsDragging] = useState(false);
 const [isProcessing, setIsProcessing] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [fileName, setFileName] = useState<string | null>(null);
 const [roleSelection, setRoleSelection] = useState<CrewRoleSelection>('auto');
 const [savedRosters, setSavedRosters] = useState<SavedRosterSummary[]>([]);
 const [savedLoading, setSavedLoading] = useState(true);
 const [autoLatestLoaded, setAutoLatestLoaded] = useState(false);
 const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
 const [openingSavedId, setOpeningSavedId] = useState<string | null>(null);
 const [pendingOffline, setPendingOffline] = useState(getPendingOfflineCount());
 const [profileAvatar, setProfileAvatar] = useState(() => { const raw = localStorage.getItem('crewcheck_profile_avatar') || ''; return raw.includes('/icons/crewcheck-icon') ? '' : raw; });
 const [profileSettings, setProfileSettings] = useState<LocalProfileSettings>(() => loadLocalProfileSettings());
 const [themeMode, setThemeMode] = useState<CrewThemeMode>(() => loadCrewThemeMode());
 const [dashboardClockTick, setDashboardClockTick] = useState(() => Date.now());
 const [homeBillingStatus, setHomeBillingStatus] = useState<BillingStatus | null>(null);
 const [trialBannerDismissed, setTrialBannerDismissed] = useState(() => {
  try { return localStorage.getItem('crewcheck_trial_banner_closed_v108114') === '1'; } catch { return false; }
 });
 const [homeTrialBusy, setHomeTrialBusy] = useState(false);
 const fileInputRef = useRef<HTMLInputElement | null>(null);
 const nativePdfImportingRef = useRef(false);
 const [showOnboarding, setShowOnboarding] = useState(() => {
  try { return localStorage.getItem('crewcheck_onboarding_premium_v1') !== 'done'; } catch { return true; }
 });

 const user = getStoredUser();
 useEffect(() => {
  try {
   if (!user?.email) return;
   const syncedAvatar = localStorage.getItem(`crewcheck_profile_avatar_${user.email}`);
   if (syncedAvatar && syncedAvatar.includes('/icons/crewcheck-icon')) { localStorage.removeItem(`crewcheck_profile_avatar_${user.email}`); } else if (syncedAvatar && syncedAvatar !== profileAvatar) setProfileAvatar(syncedAvatar);
  } catch {}
 }, [user?.email]);


 useEffect(() => {
  let alive = true;
  if (!user?.email) return () => { alive = false; };
  getBillingStatus().then((status) => { if (alive) setHomeBillingStatus(status); }).catch(() => null);
  return () => { alive = false; };
 }, [user?.email]);

 async function handleHomeStartTrial() {
  setHomeTrialBusy(true);
  try {
   toast.info('Para iniciar o teste grátis, abra Conta > Assinatura, informe o CPF e confirme a ciência. Assim a cobrança fica programada após 7 dias.');
  } finally {
   setHomeTrialBusy(false);
  }
 }

 function dismissTrialBanner() {
  setTrialBannerDismissed(true);
  try { localStorage.setItem('crewcheck_trial_banner_closed_v108114', '1'); } catch {}
 }
 function finishOnboarding() {
  setShowOnboarding(false);
  try { localStorage.setItem('crewcheck_onboarding_premium_v1', 'done'); } catch {}
 }
 function restartOnboarding() {
  try { localStorage.removeItem('crewcheck_onboarding_premium_v1'); } catch {}
  setShowOnboarding(true);
 }
 // Reavalia a próxima programação a cada minuto para manter o cockpit vivo após o login.
 void dashboardClockTick;
 const currentRosterBundle = readCurrentRosterBundle();
 const liveRosterBundle = currentRosterBundle && !isRosterStaleForLive(currentRosterBundle.roster) ? currentRosterBundle : null;
 const canAccessC32FAcademy = isC32FAcademyAdmin(user);
 const dashboardNextEvent = buildDashboardNextEvent(currentRosterBundle, savedRosters.find(isSavedRosterCurrentOrFuture));
 const [nextFlightStatus, setNextFlightStatus] = useState<RadarPrivateStatus | null>(null);
 const dashboardNextEventLive: DashboardNextEvent = dashboardNextEvent?.isFlight && hasUsefulRadarStatus(nextFlightStatus)
  ? {
    ...dashboardNextEvent,
    status: nextFlightStatus?.status || dashboardNextEvent.status,
    gate: nextFlightStatus?.gate || dashboardNextEvent.gate,
    terminal: nextFlightStatus?.terminal || dashboardNextEvent.terminal,
    source: nextFlightStatus?.updatedAt ? `Radar CrewCheck · ${formatCrewDateTime(nextFlightStatus.updatedAt, profileSettings)}` : 'Radar CrewCheck',
   }
  : dashboardNextEvent;
 const dashboardAlerts = currentRosterBundle?.compliance?.alerts?.length || 0;
 const dashboardDaysLoaded = currentRosterBundle?.roster?.days?.length || 0;
 const dashboardComplianceScore = currentRosterBundle?.compliance?.score;

 useEffect(() => {
  const timer = window.setInterval(() => {
   setDashboardClockTick(Date.now());
   window.dispatchEvent(new CustomEvent('crewcheck:refresh-smart-departure'));
  }, 60_000);
  window.dispatchEvent(new CustomEvent('crewcheck:refresh-smart-departure'));
  return () => window.clearInterval(timer);
 }, []);


 useEffect(() => {
  try {
   if (!localStorage.getItem('crewcheck_notifications_intro_v1')) {
    localStorage.setItem('crewcheck_notifications_intro_v1', '1');
    requestCrewCheckNotificationPermission();
   }
   if (dashboardNextEvent?.title && dashboardNextEvent.time && dashboardNextEvent.time !== 'PDF') {
    notifyCrewCheck(
     'CrewCheck · próxima programação',
     `${dashboardNextEvent.title} às ${dashboardNextEvent.time}. ${dashboardNextEvent.countdown && dashboardNextEvent.countdown !== '—' ? `Faltam ${dashboardNextEvent.countdown}.` : ''}`,
     `next_${dashboardNextEvent.date}_${dashboardNextEvent.time}`
    );
   }
  } catch {
   // Não bloqueia o cockpit se o navegador/app negar notificações.
  }
 }, [dashboardNextEvent?.title, dashboardNextEvent?.time, dashboardNextEvent?.date, dashboardNextEvent?.countdown]);


 useEffect(() => {
  try {
   const roster = currentRosterBundle?.roster;
   if (!roster?.days?.length) return;
   const base = String(roster.base || '').toUpperCase();
   const now = Date.now();
   for (const day of roster.days.slice(0, 45)) {
    const text = `${day.type || ''} ${day.pairingCode || ''} ${day.rawText || ''}`.toUpperCase();
    const firstLeg = day.legs?.[0];
    const startsAtBase = Boolean(firstLeg?.origin && base && String(firstLeg.origin).toUpperCase() === base);
    const extraFlightAtBase = Boolean(startsAtBase && day.legs?.some((leg) => String(leg.workType || '').toUpperCase() === 'PS') && !/\b(CBF|EMER|CRM|C\d{2,3}F|TREIN|TRAIN|CHECK|SIMULADOR|EAD)\b/.test(text));
    const reserve = /\b(ASB|RES|RESERVA|AIRPORT\s*STAND)\b/.test(text);
    if (!reserve && !extraFlightAtBase) continue;
    const start = day.dutyReport || firstLeg?.departureTime || '';
    if (!start) continue;
    const target = dashboardTargetDate(day.date, start).getTime();
    const reminder = target - 30 * 60_000;
    if (reminder <= now + 60_000) continue;
    const key = `checkin_${day.date}_${start}_${day.pairingCode || day.type}`;
    if (localStorage.getItem(`crewcheck_checkin_reminder_${key}`) === '1') continue;
    const ok = scheduleCrewCheckNotification('CrewCheck · Check-in da escala', `Lembrete premium: preencher o formulário de Check-in da escala para ${reserve ? 'reserva/ASB' : 'Extra/PS'} às ${start}.`, reminder);
    if (ok) localStorage.setItem(`crewcheck_checkin_reminder_${key}`, '1');
   }
  } catch {
   // check-in é auxiliar; nunca bloqueia o cockpit.
  }
 }, [currentRosterBundle?.roster?.days?.length]);


 useEffect(() => {
  if (!dashboardNextEvent?.isFlight || !dashboardNextEvent.flightNumber) {
   setNextFlightStatus(null);
   return;
  }
  let active = true;
  const controller = new AbortController();
  const loadRadarStatus = async () => {
   try {
    const params = new URLSearchParams({
     flightNumber: dashboardNextEvent.flightNumber || '',
     flight: dashboardNextEvent.flightNumber || '',
     date: radarDateFromNextEvent(dashboardNextEvent),
    });
    if (dashboardNextEvent.origin) params.set('origin', dashboardNextEvent.origin);
    if (dashboardNextEvent.destination) params.set('destination', dashboardNextEvent.destination);
    if (dashboardNextEvent.route) params.set('route', dashboardNextEvent.route);
    params.set('notifyTelegram', '1');
    const response = await fetch(`/api/radar/private-status?${params.toString()}`, { cache: 'no-store', signal: controller.signal, headers: crewcheckAuthHeader() });
    const payload = await response.json().catch(() => null) as RadarPrivateStatus | null;
    if (!active || !payload?.ok) return;
    setNextFlightStatus(payload);
    if (hasUsefulRadarStatus(payload)) {
     const statusKey = `crewcheck_radar_last_${dashboardNextEvent.flightNumber}_${radarDateFromNextEvent(dashboardNextEvent)}`;
     const compact = JSON.stringify({ status: payload.status || '', gate: payload.gate || '', terminal: payload.terminal || '', estimatedDeparture: payload.estimatedDeparture || '' });
     const previous = localStorage.getItem(statusKey);
     if (previous && previous !== compact) {
      notifyCrewCheck(
       `CrewCheck · ${dashboardNextEvent.flightNumber}`,
       radarStatusLine(payload),
       `radar_${dashboardNextEvent.flightNumber}_${payload.status || 'status'}_${payload.gate || 'sem-portao'}_${payload.terminal || 'sem-terminal'}`
      );
     }
     localStorage.setItem(statusKey, compact);
     if (isFinishedRadarStatusText(payload.status)) {
      setDashboardClockTick(Date.now());
      window.dispatchEvent(new CustomEvent('crewcheck:refresh-smart-departure'));
     }

     if (dashboardNextEvent.targetIso) {
      const target = new Date(dashboardNextEvent.targetIso).getTime();
      const when = target - 90 * 60_000;
      const scheduleKey = `crewcheck_radar_scheduled_${dashboardNextEvent.flightNumber}_${radarDateFromNextEvent(dashboardNextEvent)}`;
      if (when > Date.now() + 60_000 && localStorage.getItem(scheduleKey) !== '1') {
       const scheduled = scheduleCrewCheckNotification(
        `CrewCheck · próximo voo ${dashboardNextEvent.flightNumber}`,
        radarStatusLine(payload),
        when
       );
       if (scheduled) localStorage.setItem(scheduleKey, '1');
      }
     }
    }
   } catch {
    // Radar é auxiliar; não deve bloquear a tela inicial.
   }
  };
  void loadRadarStatus();
  const timer = window.setInterval(() => void loadRadarStatus(), 4 * 60_000);
  return () => { active = false; controller.abort(); window.clearInterval(timer); };
 }, [dashboardNextEvent?.isFlight, dashboardNextEvent?.flightNumber, dashboardNextEvent?.origin, dashboardNextEvent?.destination, dashboardNextEvent?.route, dashboardNextEvent?.targetIso]);

 const refreshSavedRosters = useCallback(async () => {
  setSavedLoading(true);
  try {
   const [statusResult, historyResult] = await Promise.allSettled([
    getDatabaseStatus(),
    listSavedRosters(72),
   ]);
   if (statusResult.status === 'fulfilled') setDbStatus(statusResult.value);
   else setDbStatus({ ok: false, connected: false, databaseConfigured: false, message: 'Banco indisponível. Histórico local ativo.' });
   if (historyResult.status === 'fulfilled') setSavedRosters(historyResult.value);
   else setSavedRosters([]);
   setPendingOffline(getPendingOfflineCount());
  } finally {
   setSavedLoading(false);
  }
 }, []);

 useEffect(() => {
  refreshSavedRosters();
 }, [refreshSavedRosters]);

 useEffect(() => {
  const refreshCloud = () => void refreshSavedRosters();
  window.addEventListener('focus', refreshCloud);
  window.addEventListener('online', refreshCloud);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCloud(); });
  return () => {
   window.removeEventListener('focus', refreshCloud);
   window.removeEventListener('online', refreshCloud);
  };
 }, [refreshSavedRosters]);


 useEffect(() => {
  try {
   const params = new URLSearchParams(window.location.search);
   const storedTarget = window.localStorage.getItem('crewcheck_next_home_view');
   if (storedTarget) window.localStorage.removeItem('crewcheck_next_home_view');
   const target = storedTarget || params.get('view') || params.get('screen');
   if (target && ['home','import','history','calendar','billing','iflight','flightboard','departure','routine','perdiem','salary','currency','parking','c32f','settings','support','notes','more'].includes(target)) {
    setCurrentView(target as HomeView);
    window.history.replaceState(null, '', window.location.pathname || '/');
   } else if (params.has('import') || params.has('newRoster')) {
    setCurrentView('import');
    window.history.replaceState(null, '', window.location.pathname || '/');
   }
  } catch {
   // Mantém a tela inicial quando o navegador bloqueia leitura da URL.
  }
 }, []);


 useEffect(() => {
  const latest = savedRosters.find(isSavedRosterCurrentOrFuture) || savedRosters[0];
  if (autoLatestLoaded || savedLoading || hasCurrentRosterSession() || !latest) return;
  setAutoLatestLoaded(true);
  openSavedRoster(latest.id)
   .then((data) => {
    const normalized = normalizeRosterSchedule(detectAndMarkLayovers(data.roster));
    sessionStorage.setItem('crewcheck_roster', JSON.stringify(normalized));
    sessionStorage.setItem('crewcheck_compliance', JSON.stringify(data.compliance));
    sessionStorage.setItem('crewcheck_gym', JSON.stringify(data.gym || []));
    sessionStorage.setItem('crewcheck_role_selection', roleSelection);
    sessionStorage.setItem('crewcheck_source_file', latest.sourceFileName || 'Última escala sincronizada');
    toast.success('Última escala da nuvem sincronizada neste dispositivo.');
    setDashboardClockTick(Date.now());
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('crewcheck:refresh-smart-departure')), 450);
   })
   .catch(() => {
    // Mantém silencioso; o histórico continua disponível pelo menu.
   });
 }, [autoLatestLoaded, savedLoading, savedRosters, roleSelection]);

 useEffect(() => {
  saveAndApplyCrewThemeMode(themeMode);
  if (themeMode !== 'system') return;
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const onChange = () => saveAndApplyCrewThemeMode('system');
  media?.addEventListener?.('change', onChange);
  return () => media?.removeEventListener?.('change', onChange);
 }, [themeMode]);

 const handleOpenSavedRoster = useCallback(async (id: string, targetView: ResultsView = 'summary') => {
  setOpeningSavedId(id);
  try {
   const data = await openSavedRoster(id);
   sessionStorage.setItem('crewcheck_roster', JSON.stringify(normalizeRosterSchedule(detectAndMarkLayovers(data.roster))));
   sessionStorage.setItem('crewcheck_compliance', JSON.stringify(data.compliance));
   sessionStorage.setItem('crewcheck_gym', JSON.stringify(data.gym || []));
   sessionStorage.setItem('crewcheck_role_selection', roleSelection);
   const summary = savedRosters.find((item) => item.id === id);
   sessionStorage.setItem('crewcheck_source_file', summary?.sourceFileName || 'Escala salva');
   setInitialResultsView(targetView);
   toast.success('Escala salva carregada.');
   setLocation('/results');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a escala salva.');
  } finally {
   setOpeningSavedId(null);
  }
 }, [roleSelection, savedRosters, setLocation]);

 const handleLoadSavedRosterToHome = useCallback(async (id: string) => {
  setOpeningSavedId(id);
  try {
   const data = await openSavedRoster(id);
   sessionStorage.setItem('crewcheck_roster', JSON.stringify(normalizeRosterSchedule(detectAndMarkLayovers(data.roster))));
   sessionStorage.setItem('crewcheck_compliance', JSON.stringify(data.compliance));
   sessionStorage.setItem('crewcheck_gym', JSON.stringify(data.gym || []));
   sessionStorage.setItem('crewcheck_role_selection', roleSelection);
   const summary = savedRosters.find((item) => item.id === id);
   sessionStorage.setItem('crewcheck_source_file', summary?.sourceFileName || 'Escala salva');
   setDashboardClockTick(Date.now());
   window.setTimeout(() => window.dispatchEvent(new CustomEvent('crewcheck:refresh-smart-departure')), 350);
   toast.success('Mês carregado para cálculo de diárias.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível carregar este mês.');
  } finally {
   setOpeningSavedId(null);
  }
 }, [roleSelection, savedRosters]);

 async function handleLogout() {
  try {
   await logout();
  } finally {
   sessionStorage.clear();
   setLocation('/login');
  }
 }


 async function handleActivateSavedRoster(id: string) {
  setOpeningSavedId(id);
  try {
   await activateRosterAnalysis(id);
   const data = await openSavedRoster(id);
   const summary = savedRosters.find((item) => item.id === id);
   sessionStorage.setItem('crewcheck_roster', JSON.stringify(normalizeRosterSchedule(detectAndMarkLayovers(data.roster))));
   sessionStorage.setItem('crewcheck_compliance', JSON.stringify(data.compliance));
   sessionStorage.setItem('crewcheck_gym', JSON.stringify(data.gym || []));
   sessionStorage.setItem('crewcheck_role_selection', roleSelection);
   sessionStorage.setItem('crewcheck_source_file', summary?.sourceFileName || 'Escala ativa');
   await refreshSavedRosters();
   setDashboardClockTick(Date.now());
   window.setTimeout(() => window.dispatchEvent(new CustomEvent('crewcheck:refresh-smart-departure')), 350);
   toast.success('Escala ativa atualizada em todos os dispositivos.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível tornar esta escala ativa.');
  } finally {
   setOpeningSavedId(null);
  }
 }

 async function handleDeleteSavedRoster(id: string) {
  const item = savedRosters.find((saved) => saved.id === id);
  const label = item ? `${monthLabel(item.month, item.year)} · ${item.sourceFileName || 'Escala'}` : 'esta escala';
  if (!window.confirm(`Excluir ${label}? Essa ação remove a escala do gerenciador para evitar uso incorreto.`)) return;
  setOpeningSavedId(id);
  try {
   await deleteRosterAnalysis(id);
   await refreshSavedRosters();
   toast.success('Escala excluída do gerenciador.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a escala.');
  } finally {
   setOpeningSavedId(null);
  }
 }

 async function handleSyncPending() {
  try {
   const result = await syncPendingRosters();
   await refreshSavedRosters();
   setPendingOffline(result.remaining);
   if (result.synced > 0) toast.success(`${result.synced} escala(s) sincronizada(s).`);
   if (result.remaining > 0) toast.warning(`${result.remaining} pendência(s) ainda offline.`);
   if (!result.synced && !result.remaining) toast.info('Nenhuma pendência offline para sincronizar.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Falha ao sincronizar pendências offline.');
  }
 }


 function handleExportCurrentPdf() {
  const bundle = readCurrentRosterBundle();
  if (!bundle) {
   toast.info('Importe ou abra uma escala antes de exportar o PDF completo.');
   setCurrentView('import');
   return;
  }
  const result = exportReport(bundle.roster, bundle.compliance, bundle.gym);
  toast.success(`PDF salvo: ${result.fileName}`, {
   description: 'Procure em Downloads/Arquivos do dispositivo ou toque em Abrir.',
   action: { label: 'Abrir', onClick: () => result.open() },
  } as any);
 }

 function handleExportCurrentIcs() {
  const bundle = readCurrentRosterBundle();
  if (!bundle) {
   toast.info('Importe ou abra uma escala antes de exportar o calendário completo.');
   setCurrentView('import');
   return;
  }
  const ical = generateICalendar(bundle.roster, bundle.gym, {
   mode: 'all',
   titleFormat: 'route-flight',
   includeReminders: true,
   flightReminderMinutes: [120, 30],
   dutyReminderMinutes: [120, 30],
   gymReminderMinutes: [60],
   routineReminderMinutes: [60],
  });
  downloadCalendarFile(ical, `crewcheck-completo-${bundle.roster.year}-${String(bundle.roster.month).padStart(2, '0')}.ics`);
  toast.success('Calendário completo exportado.');
 }

 function handleProfileSettingsChange(next: LocalProfileSettings) {
  setProfileSettings(saveLocalProfileSettings(next));
  toast.success('Perfil atualizado neste dispositivo.');
 }

 const goToResults = useCallback((view: ResultsView = 'summary') => {
  if (hasCurrentRosterSession()) {
   setInitialResultsView(view);
   setLocation('/results');
   return;
  }
  const currentSaved = savedRosters.find(isSavedRosterCurrentOrFuture);
  if (currentSaved) {
   void handleOpenSavedRoster(currentSaved.id, view);
   return;
  }
  toast.info('Carregue uma escala primeiro para abrir esta função.');
  setCurrentView('import');
 }, [handleOpenSavedRoster, savedRosters, setLocation]);


 const publishRosterSyncBundle = useCallback((roster: CrewRoster, compliance: ComplianceResult, gym: GymRecommendation[], sourceFileName: string) => {
  const payload = { roster, compliance, gym, sourceFileName, updatedAt: new Date().toISOString(), source: 'crewcheck-unified-sync-v1109', userScope: crewcheckCurrentUserScope() };
  try {
   localStorage.setItem(crewcheckRosterSyncKey(), JSON.stringify(payload));
   localStorage.setItem(`crewcheck_latest_roster_bundle_${crewcheckCurrentUserScope()}`, JSON.stringify(payload));
   window.dispatchEvent(new CustomEvent('crewcheck:roster-sync-updated', { detail: payload }));
   if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(crewcheckRosterSyncChannel());
    channel.postMessage(payload);
    channel.close();
   }
  } catch {
   // Mantém a escala ativa na sessão mesmo quando o navegador bloqueia armazenamento persistente.
  }
 }, []);

 const forceSyncRosterEverywhere = useCallback(async (roster: CrewRoster, compliance: ComplianceResult, gym: GymRecommendation[], sourceFileName: string, storageOptions?: { sourceFileDataBase64?: string | null; sourceMimeType?: string | null; sourceFileSize?: number | null }) => {
  publishRosterSyncBundle(roster, compliance, gym, sourceFileName);
  try {
   const result = await saveRosterOfflineFirst({ roster, compliance, gym, sourceFileName, ...(storageOptions || {}) }, { forceOnline: true });
   setPendingOffline(result.pendingCount);
   if (result.savedOnline || result.deduplicatedLocal) {
    sessionStorage.removeItem('crewcheck_auto_db_save_pending');
    await refreshSavedRosters();
    toast.success(result.savedOnline ? 'Escala sincronizada em todos os módulos.' : 'Escala já estava sincronizada; duplicidade evitada.');
   } else if (result.queued) {
    toast.warning('Escala sincronizada neste dispositivo e colocada na fila online.');
   }
  } catch {
   // Resultados continua com o salvamento offline-first como fallback.
  }
 }, [publishRosterSyncBundle, refreshSavedRosters]);

 useEffect(() => {
  function applyIncomingBundle(payload: any) {
   if (!payload?.roster || hasCurrentRosterSession()) return;
   if (payload.userScope && payload.userScope !== crewcheckCurrentUserScope()) return;
   try {
    sessionStorage.setItem('crewcheck_roster', JSON.stringify(normalizeRosterSchedule(detectAndMarkLayovers(payload.roster))));
    if (payload.compliance) sessionStorage.setItem('crewcheck_compliance', JSON.stringify(payload.compliance));
    if (payload.gym) sessionStorage.setItem('crewcheck_gym', JSON.stringify(payload.gym || []));
    if (payload.sourceFileName) sessionStorage.setItem('crewcheck_source_file', payload.sourceFileName);
    setDashboardClockTick(Date.now());
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('crewcheck:refresh-smart-departure')), 250);
   } catch {
    // Ignora pacotes de sincronização inválidos.
   }
  }
  const storageHandler = (event: StorageEvent) => {
   if (event.key === crewcheckRosterSyncKey() && event.newValue) {
    try { applyIncomingBundle(JSON.parse(event.newValue)); } catch {}
   }
  };
  const customHandler = (event: Event) => applyIncomingBundle((event as CustomEvent).detail);
  let channel: BroadcastChannel | null = null;
  try {
   if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel(crewcheckRosterSyncChannel());
    channel.onmessage = (event) => applyIncomingBundle(event.data);
   }
  } catch {}
  window.addEventListener('storage', storageHandler);
  window.addEventListener('crewcheck:roster-sync-updated', customHandler as EventListener);
  return () => {
   window.removeEventListener('storage', storageHandler);
   window.removeEventListener('crewcheck:roster-sync-updated', customHandler as EventListener);
   try { channel?.close(); } catch {}
  };
 }, []);

 const handleDashboardNavigate = useCallback((view: string) => {
  const premiumViews = new Set(['flightboard','departure','smartDeparture','departureExtra','perdiem','salary','currency','parking','chief','medical','bids','reports','alerts']);
  const hasPremiumAccess = Boolean(homeBillingStatus?.premiumAccess || canAccessC32FAcademy);
  if (premiumViews.has(view) && !hasPremiumAccess) {
   toast.info('Este recurso ajuda a manter o CrewCheck sustentável e está no Premium. Você ainda pode importar e consultar a escala básica gratuitamente.');
   setCurrentView('billing');
   return;
  }
  const map: Record<string, () => void> = {
   home: () => setCurrentView('home'),
   import: () => setCurrentView('import'),
   roster: () => goToResults('roster'),
   calendar: () => setCurrentView('calendar'),
   irregularities: () => goToResults('irregularities'),
   routine: () => goToResults('gym'),
   c32f: () => canAccessC32FAcademy ? setCurrentView('c32f') : toast.info('Academia C32F restrita ao administrador.'),
   iflight: () => canAccessC32FAcademy ? setCurrentView('iflight') : (toast.info('Use a importação manual do PDF oficial para carregar sua escala.'), setCurrentView('import')),
   flightboard: () => setCurrentView('flightboard'),
   departureExtra: () => { try { localStorage.setItem('crewcheck_departure_focus', 'vivo'); } catch {} setCurrentView('departure'); },
   departure: () => setCurrentView('departure'),
   smartDeparture: () => setCurrentView('departure'),
   perdiem: () => setCurrentView('perdiem'),
   salary: () => setCurrentView('salary'),
   currency: () => setCurrentView('currency'),
   parking: () => setCurrentView('parking'),
   chief: () => setCurrentView('chief'),
   medical: () => setCurrentView('medical'),
   bids: () => setCurrentView('bids'),
   admin: () => canAccessC32FAcademy ? setCurrentView('admin') : toast.info('Dashboard administrativo restrito.'),
   systemstatus: () => canAccessC32FAcademy ? setCurrentView('systemstatus') : toast.info('Painel técnico restrito ao administrador.'),
   history: () => setCurrentView('history'),
   reports: () => goToResults('metrics'),
   pdf: () => handleExportCurrentPdf(),
   ics: () => handleExportCurrentIcs(),
   google: () => goToResults('settings'),
   billing: () => setCurrentView('billing'),
   subscription: () => setCurrentView('billing'),
   assinatura: () => setCurrentView('billing'),
   alerts: () => goToResults('alerts'),
   notes: () => setCurrentView('notes'),
   support: () => setCurrentView('support'),
   tutorial: () => restartOnboarding(),
   settings: () => setCurrentView('settings'),
   sync: () => void handleSyncPending(),
   more: () => setCurrentView('more'),
  };
  (map[view] || (() => setCurrentView('more')))();
 }, [canAccessC32FAcademy, goToResults, homeBillingStatus?.premiumAccess]);

 const commitRoster = useCallback(async (inputRoster: CrewRoster, sourceFileName: string, targetView: ResultsView = 'summary', options?: { demo?: boolean; sourceFileDataBase64?: string | null; sourceMimeType?: string | null; sourceFileSize?: number | null }) => {
  const previousBundle = readCurrentRosterBundle();
  const roster = normalizeRosterSchedule(detectAndMarkLayovers(inputRoster));
  const changeSummary = buildRosterChangeSummaryV10867(previousBundle?.roster, roster);
  const compliance = analyzeCompliance(roster, roleSelection);
  const gym = getGymRecommendations(roster, roleSelection);

  const isDemo = Boolean(options?.demo);
  if (changeSummary && !isDemo) sessionStorage.setItem('crewcheck_last_roster_changes', JSON.stringify(changeSummary));
  else sessionStorage.removeItem('crewcheck_last_roster_changes');
  sessionStorage.setItem('crewcheck_roster', JSON.stringify(roster));
  sessionStorage.setItem('crewcheck_compliance', JSON.stringify(compliance));
  sessionStorage.setItem('crewcheck_gym', JSON.stringify(gym));
  sessionStorage.setItem('crewcheck_role_selection', roleSelection);
  sessionStorage.setItem('crewcheck_source_file', sourceFileName);
  if (isDemo) {
   sessionStorage.removeItem('crewcheck_auto_sync_pending');
   sessionStorage.removeItem('crewcheck_auto_db_save_pending');
   sessionStorage.setItem('crewcheck_demo_active', '1');
   localStorage.setItem('crewcheck_demo_mode_seen', '1');
  } else {
   sessionStorage.removeItem('crewcheck_demo_active');
   localStorage.removeItem('crewcheck_demo_active');
   sessionStorage.setItem('crewcheck_auto_sync_pending', '1');
   sessionStorage.setItem('crewcheck_auto_db_save_pending', '1');
  }
  setInitialResultsView(targetView);
  if (!isDemo) void forceSyncRosterEverywhere(roster, compliance, gym, sourceFileName, { sourceFileDataBase64: options?.sourceFileDataBase64 || null, sourceMimeType: options?.sourceMimeType || null, sourceFileSize: options?.sourceFileSize || null });

  toast.success(isDemo ? 'Modo demonstração carregado com dados fictícios.' : 'Escala interpretada com sucesso.');
  if (changeSummary && !isDemo) toast.info(changeSummary.message);
  if (!isDemo) notifyCrewCheck('CrewCheck · escala atualizada', changeSummary?.message || 'Sua escala foi importada e recalculada com rotina, diárias, salário e calendário.', 'roster_imported');
  setLocation('/results');
 }, [forceSyncRosterEverywhere, roleSelection, setLocation]);

 const handleRosterImport = useCallback(async (roster: CrewRoster, sourceFileName = 'iFlight LATAM') => {
  await commitRoster(roster, sourceFileName, 'roster');
 }, [commitRoster]);


 const handleSyncTelegramRoster = useCallback(async () => {
  const bundle = readCurrentRosterBundle();
  const roster = bundle?.roster;
  if (!roster?.days?.length) {
   toast.info('Importe ou abra uma escala antes de sincronizar com o Concierge.');
   return false;
  }
  const compliance = bundle?.compliance || analyzeCompliance(roster, roleSelection);
  const gym = Array.isArray(bundle?.gym) ? bundle.gym : getGymRecommendations(roster, roleSelection);
  const sourceFileName = sessionStorage.getItem('crewcheck_source_file') || 'Escala CrewCheck';
  try {
   publishRosterSyncBundle(roster, compliance, gym, sourceFileName);
   const response = await fetch('/api/telegram/roster-sync', { method: 'POST', headers: crewcheckAuthHeader({ 'content-type': 'application/json' }), body: JSON.stringify({ roster, compliance, gym, sourceFileName, force: true }), cache: 'no-store' });
   const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string; status?: TelegramStatus; syncedRoster?: TelegramStatus['syncedRoster']; roster?: SavedRosterSummary } | null;
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Falha ao confirmar escala no Concierge.');
   sessionStorage.removeItem('crewcheck_auto_db_save_pending');
   sessionStorage.removeItem('crewcheck_auto_sync_pending');
   await refreshSavedRosters();
   toast.success('Escala enviada ao servidor e liberada para o Concierge Telegram.');
   return true;
  } catch (error) {
   try {
    await forceSyncRosterEverywhere(roster, compliance, gym, sourceFileName);
   } catch {}
   toast.warning(error instanceof Error ? error.message : 'Escala salva no dispositivo, mas ainda não consegui confirmar no servidor.');
   return false;
  }
 }, [forceSyncRosterEverywhere, publishRosterSyncBundle, refreshSavedRosters, roleSelection]);

 const handleDemoMode = useCallback(async () => {
  const demoRoster = buildCrewCheckDemoRoster();
  await commitRoster(demoRoster, 'Modo demonstração CrewCheck', 'summary', { demo: true });
 }, [commitRoster]);

 useEffect(() => {
  try {
   if (localStorage.getItem('crewcheck_demo_autoload') !== '1') return;
   localStorage.removeItem('crewcheck_demo_autoload');
   if (!hasCurrentRosterSession()) void handleDemoMode();
  } catch {}
 }, [handleDemoMode]);

 const handleFile = useCallback(async (file: File) => {
  const fileNameLower = (file.name || '').toLowerCase();
  const looksLikePdf = fileNameLower.endsWith('.pdf') || file.type === 'application/pdf' || file.type === 'application/octet-stream' || fileNameLower.includes('pdf');
  if (!looksLikePdf) {
   setError('Por favor, envie um PDF exportado pelo CrewTopia, CrewRosterReport/AIMS ou fonte oficial disponível. No iPhone, use Arquivos > iCloud/No iPhone e selecione o PDF original.');
   return;
  }
  if (!file.size || file.size < 50) {
   setError('O PDF selecionado parece vazio ou não foi liberado pelo iOS. Tente salvar o arquivo em Arquivos > No iPhone e selecionar novamente.');
   return;
  }

  setFileName(file.name);
  setIsProcessing(true);
  setError(null);

  try {
   let originalFileBase64: string | null = null;
   try { originalFileBase64 = await fileToBase64Payload(file); } catch { originalFileBase64 = null; }
   let roster: CrewRoster;
   try {
    roster = await parsePdfViaServer(file);
   } catch (serverError) {
    const serverMessage = serverError instanceof Error ? serverError.message : 'Leitura segura indisponível.';
    if (shouldUseServerOnlyParser(file.name)) {
     console.warn('Server PDF parser failed; blocking unsafe local fallback on Apple/CrewRosterReport', serverError);
     throw new Error(`${serverMessage} Para evitar escala fora de ordem no iPad/iPhone, salve o PDF oficial em Arquivos e tente novamente quando a leitura segura estiver disponível.`);
    }
    console.warn('Server PDF parser failed; trying local parser fallback', serverError);
    try {
     roster = await parsePDF(file);
     toast.info('PDF interpretado pelo modo local do app. Confira com a escala oficial.');
    } catch (localError) {
     console.error('Local PDF parser fallback failed', localError);
     const localMessage = localError instanceof Error ? localError.message : 'Leitura local indisponível.';
     throw new Error(`${serverMessage} Leitura local: ${localMessage}`);
    }
   }
   try { sessionStorage.removeItem('crewcheck_demo_active'); localStorage.removeItem('crewcheck_demo_active'); } catch {}
   await commitRoster(roster, file.name, 'summary', { sourceFileDataBase64: originalFileBase64, sourceMimeType: file.type || 'application/pdf', sourceFileSize: file.size || null });
  } catch (err) {
   console.error('Error parsing PDF:', err);
   const message = err instanceof Error ? err.message : '';
   setError(`Não consegui interpretar este PDF. ${message ? `Detalhe: ${message}. ` : ''}Tente salvar o arquivo localmente e selecionar novamente pelo botão Escolher PDF. Se for escala em formato ticket, confira se o PDF tem texto selecionável.`);
  } finally {
   setIsProcessing(false);
  }
 }, [commitRoster]);

 useEffect(() => {
  async function importNativePdf(payload?: NativePdfPayload) {
   if (!payload?.dataBase64 || nativePdfImportingRef.current) return;
   nativePdfImportingRef.current = true;
   const filename = payload.filename || payload.sourceFileName || 'iFlight_RosterReport.pdf';
   setCurrentView('import');
   setFileName(filename);
   setIsProcessing(true);
   setError(null);
   toast.info('PDF recebido do iFlight. Importando escala...');
   try {
    const file = base64ToPdfFile(filename, payload.dataBase64);
    let roster: CrewRoster;
    try {
     roster = await parsePdfViaServer(file);
    } catch (serverError) {
     if (shouldUseServerOnlyParser(filename)) {
      const serverMessage = serverError instanceof Error ? serverError.message : 'Leitura segura indisponível.';
      throw new Error(`${serverMessage} A importação automática recebida pelo dispositivo foi interrompida para evitar leitura incorreta. Selecione o PDF oficial manualmente em Arquivos.`);
     }
     console.warn('Server PDF parser failed for native PDF; trying local parser fallback', serverError);
     roster = await parsePDF(file);
    }
    try { sessionStorage.removeItem('crewcheck_demo_active'); localStorage.removeItem('crewcheck_demo_active'); } catch {}
    await commitRoster(roster, filename, 'roster', { sourceFileDataBase64: payload.dataBase64, sourceMimeType: 'application/pdf', sourceFileSize: null });
   } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.';
    setError(`Recebi o PDF do iFlight, mas não consegui interpretar. Detalhe: ${message}`);
    toast.error('Não consegui interpretar o PDF recebido do iFlight.');
   } finally {
    setIsProcessing(false);
    const win = window as Window & { __crewcheckPendingNativePdf?: NativePdfPayload };
    delete win.__crewcheckPendingNativePdf;
    nativePdfImportingRef.current = false;
   }
  }

  const handler = (event: Event) => {
   void importNativePdf((event as CustomEvent<NativePdfPayload>).detail);
  };

  window.addEventListener('crewcheck:native-pdf', handler as EventListener);
  const win = window as Window & { __crewcheckPendingNativePdf?: NativePdfPayload };
  if (win.__crewcheckPendingNativePdf) void importNativePdf(win.__crewcheckPendingNativePdf);
  return () => window.removeEventListener('crewcheck:native-pdf', handler as EventListener);
 }, [commitRoster]);

 const handleDrop = useCallback((event: DragEvent) => {
  event.preventDefault();
  setIsDragging(false);
  const file = event.dataTransfer.files?.[0];
  if (file) void handleFile(file);
 }, [handleFile]);

 const handleFileInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (file) void handleFile(file);
  event.target.value = '';
 }, [handleFile]);

 const [premiumDrawerOpen, setPremiumDrawerOpen] = useState(false);

 const renderWithMobileMenu = (content: ReactNode, active: CrewCheckBottomActive = 'home') => (
  <div className={`crewcheck-side-layout ${premiumDrawerOpen ? 'is-menu-open' : ''}`}>
   <button type="button" className="crewcheck-nav-trigger" onClick={() => setPremiumDrawerOpen(true)} aria-label="Abrir menu principal">
    <Menu className="h-5 w-5" />
   </button>
   {premiumDrawerOpen && <button type="button" className="crewcheck-sidebar-backdrop" onClick={() => setPremiumDrawerOpen(false)} aria-label="Fechar menu" />}
   <CrewCheckMobileMenu active={active} onNavigate={(view) => { setPremiumDrawerOpen(false); handleDashboardNavigate(view); }} canAccessAdmin={canAccessC32FAcademy} drawerOpen={premiumDrawerOpen} onClose={() => setPremiumDrawerOpen(false)} />
   <main className="crewcheck-side-content">{content}</main>
  </div>
 );


 if (currentView === 'billing') return renderWithMobileMenu(<BillingStandaloneScreen onBack={() => setCurrentView('home')} />, 'settings');

 if (currentView === 'calendar') return renderWithMobileMenu(<CalendarView onBack={() => setCurrentView('home')} />, 'roster');
 if (currentView === 'iflight') {
  if (!canAccessC32FAcademy) return renderWithMobileMenu(<ImportScreen userLabel={user?.name || user?.email || 'Usuário'} roleSelection={roleSelection} onRoleSelectionChange={setRoleSelection} isDragging={isDragging} isProcessing={isProcessing} error={error} fileName={fileName} fileInputRef={fileInputRef} isAdmin={false} onOpenIFlight={() => {}} onBack={() => setCurrentView('home')} onDrop={handleDrop} onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onFileInput={handleFileInput} onDemoMode={handleDemoMode} onLogout={handleLogout} />, 'roster');
  return renderWithMobileMenu(<IFlightIntegrationView onBack={() => setCurrentView('import')} onSuccess={() => goToResults('roster')} onFileUpload={handleFile} onRosterImport={handleRosterImport} />, 'roster');
 }
 if (currentView === 'flightboard') return renderWithMobileMenu(<FlightBoardScreen onBack={() => setCurrentView('home')} isAdmin={canAccessC32FAcademy} />, 'flightboard');
 if (currentView === 'departure') return renderWithMobileMenu(<SmartDepartureScreen nextEvent={dashboardNextEventLive} bundle={liveRosterBundle} userBase={profileSettings.base || user?.base || ''} hasRoster={Boolean(liveRosterBundle?.roster?.days?.length)} canAccessAdmin={canAccessC32FAcademy} onBack={() => setCurrentView('home')} onOpenRoster={() => goToResults('roster')} />, 'vivo');
 if (currentView === 'chief') return renderWithMobileMenu(<CabinChiefAssistant bundle={currentRosterBundle} onBack={() => setCurrentView('home')} onOpenRoster={() => goToResults('roster')} initialFocus="chief" />, 'more');
 if (currentView === 'medical') return renderWithMobileMenu(<CabinChiefAssistant bundle={currentRosterBundle} onBack={() => setCurrentView('home')} onOpenRoster={() => goToResults('roster')} initialFocus="medical" />, 'more');
 if (currentView === 'bids') return renderWithMobileMenu(<BidsReminderScreen onBack={() => setCurrentView('home')} isInstructor={profileSettings.isInstructor} />, 'more');
 if (currentView === 'admin') return renderWithMobileMenu(<AdminDashboardScreen bundle={currentRosterBundle} savedRosters={savedRosters} dbStatus={dbStatus} pendingOffline={pendingOffline} onBack={() => setCurrentView('home')} />, 'settings');
 if (currentView === 'systemstatus') return renderWithMobileMenu(canAccessC32FAcademy ? <SystemStatusScreen onBack={() => setCurrentView('home')} /> : <SupportPanel onBack={() => setCurrentView('home')} onOpenSettings={() => setCurrentView('settings')} onOpenImport={() => setCurrentView('import')} />, 'settings');

 if (currentView === 'perdiem') return renderWithMobileMenu(<PerDiemForecastScreen bundle={currentRosterBundle} savedRosters={savedRosters} onOpenSavedRoster={handleLoadSavedRosterToHome} onBack={() => setCurrentView('home')} onOpenImport={() => setCurrentView('import')} />, 'more');

 if (currentView === 'salary') return renderWithMobileMenu(<SalaryForecastScreen bundle={currentRosterBundle} savedRosters={savedRosters} onOpenSavedRoster={handleLoadSavedRosterToHome} isAdmin={canAccessC32FAcademy} onBack={() => setCurrentView('home')} onOpenImport={() => setCurrentView('import')} />, 'more');

 if (currentView === 'currency') return renderWithMobileMenu(<CurrencyConverterScreen bundle={currentRosterBundle} onBack={() => setCurrentView('home')} onOpenPerDiem={() => setCurrentView('perdiem')} />, 'more');

 if (currentView === 'parking') return renderWithMobileMenu(<ParkingSpotScreen onBack={() => setCurrentView('home')} />, 'more');

 if (currentView === 'import') {
  return renderWithMobileMenu(
   <ImportScreen
    userLabel={user?.name || user?.email || 'Usuário'}
    roleSelection={roleSelection}
    onRoleSelectionChange={setRoleSelection}
    isDragging={isDragging}
    isProcessing={isProcessing}
    error={error}
    fileName={fileName}
    fileInputRef={fileInputRef}
    isAdmin={canAccessC32FAcademy}
    onOpenIFlight={() => setCurrentView('iflight')}
    onBack={() => setCurrentView('home')}
    onDrop={handleDrop}
    onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
    onDragLeave={() => setIsDragging(false)}
    onFileInput={handleFileInput}
    onDemoMode={handleDemoMode}
    onLogout={handleLogout}
   />,
   'roster'
  );
 }

 if (currentView === 'history') {
  return renderWithMobileMenu(<HistoryScreen rosters={savedRosters} loading={savedLoading} dbStatus={dbStatus} openingId={openingSavedId} onBack={() => setCurrentView('home')} onOpen={(id) => void handleOpenSavedRoster(id, 'summary')} onActivate={(id) => void handleActivateSavedRoster(id)} onDelete={(id) => void handleDeleteSavedRoster(id)} onRefresh={refreshSavedRosters} />, 'more');
 }

 if (currentView === 'routine') {
  return renderWithMobileMenu(<SimplePanel title="Rotina Reliable" icon={Dumbbell} onBack={() => setCurrentView('home')} description="Treino, estudo e recuperação agora são sugeridos de forma conservadora dentro da escala, respeitando descanso, alimentação, reserva, sobreaviso, pernoite, madrugadas e margem real de deslocamento." actions={[{ label: 'Abrir painel premium de rotina', onClick: () => goToResults('gym') }, { label: 'Importar nova escala', onClick: () => setCurrentView('import') }]} />, 'more');
 }

 if (currentView === 'notes') {
  return renderWithMobileMenu(<NotesPanel onBack={() => setCurrentView('home')} />, 'more');
 }

 if (currentView === 'c32f') {
  if (!canAccessC32FAcademy) {
   return renderWithMobileMenu(<SimplePanel title="Acesso restrito" icon={Lock} onBack={() => setCurrentView('home')} description="A academia C32F é um módulo administrativo privado." actions={[{ label: 'Voltar ao início', onClick: () => setCurrentView('home') }]} />, 'home');
  }
  return renderWithMobileMenu(<C32FStudyPanel onBack={() => setCurrentView('home')} onOpenRoster={() => goToResults('roster')} />, 'more');
 }

 if (currentView === 'settings') {
  return renderWithMobileMenu(<SettingsHomePanel
   userLabel={profileSettings.displayName || user?.name || user?.email || 'Tripulante'}
   userEmail={user?.email || ''}
   profileSettings={profileSettings}
   avatar={profileAvatar}
   pendingOffline={pendingOffline}
   hasRoster={hasCurrentRosterSession()}
   canAccessAdmin={canAccessC32FAcademy}
   onProfileSettingsChange={handleProfileSettingsChange}
   onAvatarChange={(value) => { setProfileAvatar(value); try { if (value) { localStorage.setItem('crewcheck_profile_avatar', value); if (user?.email) localStorage.setItem(`crewcheck_profile_avatar_${user.email}`, value); } else { localStorage.removeItem('crewcheck_profile_avatar'); if (user?.email) localStorage.removeItem(`crewcheck_profile_avatar_${user.email}`); } } catch {} }}
   themeMode={themeMode}
   onThemeModeChange={setThemeMode}
   onBack={() => setCurrentView('home')}
   onOpenIFlight={() => setCurrentView('iflight')}
   onOpenImport={() => setCurrentView('import')}
   onOpenResultsSettings={() => goToResults('settings')}
   onOpenPerDiem={() => setCurrentView('perdiem')}
   onOpenSalary={() => setCurrentView('salary')}
   onExportPdf={handleExportCurrentPdf}
   onExportIcs={handleExportCurrentIcs}
   onSyncPending={() => void handleSyncPending()}
   onSyncTelegramRoster={() => void handleSyncTelegramRoster()}
   onLogout={handleLogout}
  />, 'settings');
 }

 if (currentView === 'support') {
  return renderWithMobileMenu(<SupportPanel onBack={() => setCurrentView('home')} onOpenSettings={() => setCurrentView('settings')} onOpenImport={() => setCurrentView('import')} />, 'more');
 }

 if (currentView === 'more') {
  return renderWithMobileMenu(<MorePanel onBack={() => setCurrentView('home')} onNavigate={handleDashboardNavigate} onLogout={handleLogout} pendingOffline={pendingOffline} hasRoster={hasCurrentRosterSession()} canAccessC32FAcademy={canAccessC32FAcademy} />, 'more');
 }

 return renderWithMobileMenu(
  <div className="relative min-h-screen bg-[#08111f] crewcheck-has-global-menu">
   <TrialFreeBanner
    status={homeBillingStatus}
    dismissed={trialBannerDismissed}
    busy={homeTrialBusy}
    onStartTrial={handleHomeStartTrial}
    onClose={dismissTrialBanner}
    onOpenImport={() => setCurrentView('import')}
    onOpenBilling={() => handleDashboardNavigate('billing')}
   />
   <Dashboard
    user={{ name: profileSettings.displayName || user?.name || user?.email || 'Tripulante', company: profileSettings.company || 'CrewCheck Premium', base: profileSettings.base || user?.base || undefined, avatar: profileAvatar || undefined }}
    nextEvent={dashboardNextEventLive}
    canAccessC32FAcademy={canAccessC32FAcademy}
    pendingOffline={pendingOffline}
    hasRoster={hasCurrentRosterSession()}
    alertsCount={dashboardAlerts}
    daysLoaded={dashboardDaysLoaded}
    complianceScore={dashboardComplianceScore}
    onNavigate={handleDashboardNavigate}
   />
   {showOnboarding && <PremiumOnboardingModal onClose={finishOnboarding} onImport={() => { finishOnboarding(); setCurrentView('import'); }} onTelegram={() => { finishOnboarding(); setCurrentView('settings'); }} onDemo={() => { finishOnboarding(); void handleDemoMode(); }} />}

  </div>,
  'home'
 );
}



function PremiumOnboardingModal({ onClose, onImport, onTelegram, onDemo }: { onClose: () => void; onImport: () => void; onTelegram: () => void; onDemo: () => void }) {
 const steps = [
  { icon: CloudUpload, title: 'Importe sua escala em segundos', text: 'Envie o PDF no app ou encaminhe a escala para o bot do Telegram. O CrewCheck atualiza cockpit, escala, diárias e salário automaticamente.' },
  { icon: Navigation, title: 'Saída Inteligente', text: 'Calcule quando sair, com aeroporto, modal, trânsito, margem e alertas. O Telegram avisa apenas quando for relevante.' },
  { icon: CalendarDays, title: 'Escala organizada', text: 'Voos, reservas, sobreavisos, inativos, pernoites, tripulação e diárias ficam em cards claros e auditáveis.' },
  { icon: TrendingUp, title: 'Financeiro completo', text: 'Diárias, salário estimado, internacionais, ceia, pernoites e divergências em uma área financeira mais limpa.' },
  { icon: MessageCircle, title: 'Telegram Premium', text: 'Conecte uma vez e depois envie PDF direto pelo bot. O CrewCheck lê, salva e responde com o status da importação.' },
 ];
 return (
  <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-xl sm:items-center sm:p-6">
   <section className="w-full max-w-5xl overflow-hidden rounded-[2.3rem] border border-cyan-200/25 bg-[#07111f] text-white shadow-2xl shadow-cyan-950/50">
    <div className="relative overflow-hidden bg-gradient-to-br from-cyan-300/25 via-blue-500/20 to-violet-500/20 p-6 sm:p-8">
     <button onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-cyan-50">Pular</button>
     <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-cyan-200 text-[#07111f] shadow-xl shadow-cyan-950/30"><Sparkles className="h-8 w-8" /></div>
      <div>
       <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/70">Bem-vindo ao CrewCheck</p>
       <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Seu cockpit pessoal de escala, rotina e financeiro.</h2>
       <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200/90">Um guia rápido, no padrão dos apps premium, para você testar o essencial sem se perder nas funcionalidades.</p>
      </div>
     </div>
    </div>
    <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">
     {steps.map((step, index) => {
      const Icon = step.icon;
      return <div key={step.title} className="rounded-[1.6rem] border border-white/10 bg-white/[0.055] p-4"><div className="flex items-center justify-between gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-100"><Icon className="h-5 w-5" /></div><span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/50">0{index + 1}</span></div><h3 className="mt-4 text-base font-black">{step.title}</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{step.text}</p></div>;
     })}
    </div>
    <div className="flex flex-col gap-3 border-t border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
     <div className="text-xs font-semibold leading-5 text-slate-400">Conta grátis de teste disponível. Você pode testar com demonstração, upload manual ou Telegram vinculado.</div>
     <div className="flex flex-col gap-2 sm:flex-row">
      <button onClick={onDemo} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-black text-white">Testar demo</button>
      <button onClick={onTelegram} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-50"><MessageCircle className="mr-2 inline h-4 w-4" />Conectar Telegram</button>
      <button onClick={onImport} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-[#07111f]">Importar PDF</button>
     </div>
    </div>
   </section>
  </div>
 );
}

function TrialFreeBanner({ status, dismissed, busy, onStartTrial, onClose, onOpenImport, onOpenBilling }: {
 status: BillingStatus | null;
 dismissed: boolean;
 busy: boolean;
 onStartTrial: () => void;
 onClose: () => void;
 onOpenImport: () => void;
 onOpenBilling: () => void;
}) {
 if (dismissed || status?.premiumAccess || status?.trialEligible === false) return null;
 return (
  <div className="fixed left-3 right-3 top-3 z-[70] mx-auto max-w-5xl rounded-[1.6rem] border border-cyan-200/35 bg-[linear-gradient(135deg,rgba(6,182,212,.96),rgba(37,99,235,.92),rgba(124,58,237,.92))] p-3 text-white shadow-2xl shadow-cyan-950/35 backdrop-blur-2xl sm:top-5 sm:p-4">
   <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-start gap-3">
     <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#07111f]"><Sparkles className="h-5 w-5" /></div>
     <div>
      <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-cyan-50/80">Premium grátis por 7 dias</p>
      <h3 className="mt-0.5 text-base font-black leading-tight sm:text-xl">Teste Saída Inteligente, Extra, Radar, Diárias e Salário sem cartão de crédito.</h3>
      <p className="mt-1 text-xs font-semibold leading-5 text-cyan-50/85">Para evitar múltiplos testes da mesma escala, importe uma escala antes de ativar. O plano básico continua gratuito.</p>
     </div>
    </div>
    <div className="flex shrink-0 flex-wrap gap-2">
     <button type="button" onClick={onOpenImport} className="rounded-2xl border border-white/35 bg-white/10 px-4 py-3 text-xs font-black text-white">Importar escala</button>
     <button type="button" onClick={onStartTrial} disabled={busy} className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-[#07111f] disabled:opacity-60">{busy ? 'Ativando...' : 'Ativar grátis'}</button>
     <button type="button" onClick={onOpenBilling} className="rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-xs font-black text-white">Planos</button>
     <button type="button" onClick={onClose} className="rounded-2xl border border-white/25 bg-black/10 px-3 py-3 text-xs font-black text-white">Fechar</button>
    </div>
   </div>
  </div>
 );
}


function CrewCheckPrimaryBottomMenu({ active, onNavigate }: { active: CrewCheckBottomActive; onNavigate: (view: string) => void }) {
 const [compact, setCompact] = useState(() => {
  try { return localStorage.getItem('crewcheck_bottom_menu_compact') === '1'; } catch { return false; }
 });
 const toggleCompact = () => setCompact((current) => {
  const next = !current;
  try { localStorage.setItem('crewcheck_bottom_menu_compact', next ? '1' : '0'); } catch {}
  return next;
 });
 const items: Array<{ id: CrewCheckBottomActive; label: string; fullLabel: string; icon: LucideIcon; view: string; aliases?: CrewCheckBottomActive[] }> = [
  { id: 'home', label: 'Cockpit', fullLabel: 'Cockpit', icon: HomeIcon, view: 'home' },
  { id: 'roster', label: 'Escala', fullLabel: 'Escala completa', icon: CalendarDays, view: 'roster' },
  { id: 'flightboard', label: 'Radar', fullLabel: 'Radar de Voos', icon: Monitor, view: 'flightboard' },
  { id: 'departure', label: 'Saída', fullLabel: 'Saída Inteligente', icon: Navigation, view: 'departure', aliases: ['vivo'] },
  { id: 'settings', label: 'Conta', fullLabel: 'Conta e configurações', icon: Settings, view: 'settings', aliases: ['more'] },
 ];
 return (
  <nav className={`crewcheck-global-bottom-menu crewcheck-primary-bottom-nav crewcheck-standard-bottom-nav ${compact ? 'is-compact' : ''} fixed bottom-0 left-0 right-0 z-[95] px-3 pb-[calc(0.9rem+env(safe-area-inset-bottom,0px))] pt-2.5 lg:hidden`} aria-label="Menu inferior CrewCheck">
   <div className="crewcheck-bottom-menu-shell mx-auto flex items-center justify-between gap-1">
    {items.map(({ id, label, fullLabel, icon: Icon, view, aliases }) => {
     const isActive = active === id || Boolean(aliases?.includes(active));
     return (
      <button key={id} type="button" onClick={() => onNavigate(view)} title={fullLabel} aria-label={fullLabel} className={`crewcheck-bottom-item flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition active:scale-95 ${isActive ? 'is-active' : ''}`}>
       <Icon className="h-5 w-5" />
       {!compact && <span className="crewcheck-bottom-label text-[10px] font-black leading-none">{label}</span>}
      </button>
     );
    })}
    <button type="button" onClick={toggleCompact} className="crewcheck-bottom-compact-toggle" aria-label={compact ? 'Expandir menu inferior' : 'Encolher menu inferior'} title={compact ? 'Expandir menu inferior' : 'Encolher menu inferior'}>{compact ? '+' : '–'}</button>
   </div>
  </nav>
 );
}

function CrewCheckMobileMenu({ active, onNavigate, canAccessAdmin = false, drawerOpen = false, onClose }: { active: CrewCheckBottomActive; onNavigate: (view: string) => void; canAccessAdmin?: boolean; drawerOpen?: boolean; onClose?: () => void }) {
 const [expanded, setExpanded] = useState(() => {
  try { return localStorage.getItem('crewcheck_side_menu_expanded') === '1'; } catch { return false; }
 });
 const [openGroup, setOpenGroup] = useState<string>(() => {
  try { return localStorage.getItem('crewcheck_side_menu_group') || 'operacional'; } catch { return 'operacional'; }
 });
 const [selectedMenuView, setSelectedMenuView] = useState<string>(() => {
  try { return localStorage.getItem('crewcheck_last_menu_view') || ''; } catch { return ''; }
 });
 const [selectedSettingsCategory, setSelectedSettingsCategory] = useState<string>(() => {
  try { return localStorage.getItem('crewcheck_settings_category') || 'profile'; } catch { return 'profile'; }
 });
 useEffect(() => {
  const handler = (event: Event) => {
   const category = String((event as CustomEvent<string>).detail || 'profile');
   setSelectedSettingsCategory(category);
   setSelectedMenuView(`settings:${category}`);
  };
  window.addEventListener('crewcheck:settings-category', handler as EventListener);
  return () => window.removeEventListener('crewcheck:settings-category', handler as EventListener);
 }, []);
 const toggleExpanded = () => setExpanded((current) => {
  const next = !current;
  try { localStorage.setItem('crewcheck_side_menu_expanded', next ? '1' : '0'); } catch {}
  return next;
 });
 const toggleGroup = (key: string) => setOpenGroup((current) => {
  const next = current === key ? '' : key;
  try { localStorage.setItem('crewcheck_side_menu_group', next); } catch {}
  return next;
 });
 const go = (view: string) => {
  setSelectedMenuView(view);
  try { localStorage.setItem('crewcheck_last_menu_view', view); } catch {}
  if (view.startsWith('settings:')) {
   const category = view.split(':')[1] || 'profile';
   setSelectedSettingsCategory(category);
   try { localStorage.setItem('crewcheck_settings_category', category); } catch {}
   window.dispatchEvent(new CustomEvent('crewcheck:settings-category', { detail: category }));
   onNavigate('settings');
   return;
  }
  onNavigate(view);
 };
 const showExpanded = expanded || drawerOpen;
 const groups: Array<{ key: string; label: string; icon: LucideIcon; items: Array<{ label: string; icon: LucideIcon; view: string; activeId?: CrewCheckBottomActive; admin?: boolean; hint?: string }> }> = [
  { key: 'operacional', label: 'Operacional', icon: Plane, items: [
   { label: 'Cockpit', icon: HomeIcon, view: 'home', activeId: 'home', hint: 'visão rápida' },
   { label: 'Escala', icon: CalendarDays, view: 'roster', activeId: 'roster', hint: 'dia atual' },
   { label: 'Importar', icon: CloudUpload, view: 'import', activeId: 'roster', hint: 'PDF/manual' },
   { label: 'iFlight', icon: Monitor, view: 'iflight', activeId: 'iflight', admin: true, hint: 'varredura calendário' },
   { label: 'Saída', icon: Navigation, view: 'departure', activeId: 'vivo', hint: 'deslocamento' },
   { label: 'Meu carro', icon: Car, view: 'parking', activeId: 'more', hint: 'estacionamento' },
   { label: 'Extra', icon: Plane, view: 'departureExtra', activeId: 'vivo', hint: 'vivo de extra' },
   { label: 'Radar', icon: Radar, view: 'flightboard', activeId: 'flightboard', hint: 'voos e portão' },
  ]},
  { key: 'financeiro', label: 'Financeiro', icon: TrendingUp, items: [
   { label: 'Diárias', icon: FileText, view: 'perdiem', activeId: 'more', hint: 'almoço/jantar/ceia' },
   { label: 'Salário', icon: DollarSign, view: 'salary', activeId: 'more', hint: 'prévia variável' },
   { label: 'Moedas', icon: CreditCard, view: 'currency', activeId: 'more', hint: 'conversor' },
  ]},
  { key: 'config', label: 'Configurações', icon: Settings, items: [
   { label: 'Conta', icon: UserRound, view: 'settings:profile', activeId: 'settings', hint: 'perfil e base' },
   { label: 'Assinatura', icon: CreditCard, view: 'settings:billing', activeId: 'settings', hint: 'Premium e cobrança' },
   { label: 'Agenda', icon: CalendarDays, view: 'settings:calendar', activeId: 'settings', hint: 'Google e ICS' },
   { label: 'Aparência', icon: Languages, view: 'settings:preferences', activeId: 'settings', hint: 'tema e idioma' },
   { label: 'Permissões', icon: Shield, view: 'settings:permissions', activeId: 'settings', hint: 'notificação e segundo plano' },
   { label: 'Localização', icon: MapPin, view: 'settings:location', activeId: 'settings', hint: 'GPS, casa e base' },
   { label: 'Telegram', icon: MessageCircle, view: 'settings:telegram', activeId: 'settings', hint: 'bot e preferências' },
   { label: 'Alertas', icon: Bell, view: 'settings:alerts', activeId: 'settings', hint: 'portão, trânsito e radar' },
   { label: 'Financeiro', icon: TrendingUp, view: 'settings:finance', activeId: 'settings', hint: 'diárias e salário' },
   { label: 'Exportações', icon: DownloadIcon, view: 'settings:exports', activeId: 'settings', hint: 'PDF, ICS e Telegram' },
   { label: 'Privacidade', icon: Lock, view: 'settings:privacy', activeId: 'settings', hint: 'LGPD e segurança' },
   { label: 'Ajuda', icon: FileText, view: 'settings:manual', activeId: 'settings', hint: 'manual e suporte' },
   { label: 'Suporte', icon: Mail, view: 'support', activeId: 'more', hint: 'ajuda e manuais' },
  ]},
  { key: 'admin', label: 'Admin', icon: Shield, items: [
   { label: 'Painel Admin', icon: BarChart3, view: 'admin', activeId: 'settings', admin: true, hint: 'gestão completa' },
   { label: 'Sistema', icon: Activity, view: 'systemstatus', activeId: 'settings', admin: true, hint: 'saúde técnica' },
   { label: 'C32F', icon: GraduationCap, view: 'c32f', activeId: 'more', admin: true, hint: 'estudos privados' },
  ]},
 ];
 return (
  <aside className={`crewcheck-premium-sidebar ${showExpanded ? 'is-expanded' : 'is-collapsed'} ${drawerOpen ? 'is-mobile-open' : ''}`} aria-label="Menu principal CrewCheck">
   <div className="crewcheck-sidebar-brand">
    <button type="button" onClick={toggleExpanded} className="crewcheck-sidebar-logo" aria-label={showExpanded ? 'Retrair menu lateral' : 'Expandir menu lateral'} title={showExpanded ? 'Retrair menu' : 'Expandir menu'}>
     <img src="/icons/crewcheck-icon-v2.png" alt="CrewCheck" />
    </button>
    {showExpanded && <div className="min-w-0"><p className="truncate text-sm font-black text-white">CrewCheck</p><p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/55">Premium</p></div>}
    {showExpanded && <button type="button" onClick={drawerOpen ? onClose : toggleExpanded} className="crewcheck-sidebar-collapse" aria-label={drawerOpen ? 'Fechar menu' : 'Retrair menu'}><Menu className="h-4 w-4" /></button>}
   </div>
   <nav className="crewcheck-sidebar-nav">
    {groups.map((group) => {
     const GroupIcon = group.icon;
     const visibleItems = group.items.filter((item) => !item.admin || canAccessAdmin);
     if (!visibleItems.length) return null;
     const groupActive = visibleItems.some((item) => (selectedMenuView && item.view === selectedMenuView) || (item.view.startsWith('settings:') && selectedMenuView === item.view) || (!selectedMenuView && item.activeId === active));
     const groupOpen = showExpanded && (openGroup ? openGroup === group.key : groupActive);
     return (
      <div key={group.key} className={`crewcheck-sidebar-group ${groupOpen ? 'is-open' : ''}`}>
       <button type="button" onClick={() => showExpanded ? toggleGroup(group.key) : setExpanded(true)} className={`crewcheck-sidebar-group-btn ${groupActive ? 'is-active' : ''}`} title={group.label}>
        <GroupIcon className="h-5 w-5" />
        {showExpanded && <span className="min-w-0 flex-1 truncate">{group.label}</span>}
        {showExpanded && <ChevronRight className={`h-4 w-4 transition ${groupOpen ? 'rotate-90' : ''}`} />}
       </button>
       <div className="crewcheck-sidebar-subitems">
        {visibleItems.map((item) => {
         const Icon = item.icon;
         const isActive = selectedMenuView ? item.view === selectedMenuView || (item.view.startsWith('settings:') && item.view === `settings:${selectedSettingsCategory}`) : item.activeId === active;
         return (
          <button key={`${group.key}-${item.label}`} type="button" onClick={() => go(item.view)} className={`crewcheck-sidebar-item ${isActive ? 'is-active' : ''}`} title={item.label}>
           <Icon className="h-5 w-5" />
           {showExpanded && <span className="min-w-0"><b className="block truncate">{item.label}</b>{item.hint && <small className="block truncate">{item.hint}</small>}</span>}
          </button>
         );
        })}
       </div>
      </div>
     );
    })}
   </nav>
   <button type="button" onClick={drawerOpen ? onClose : toggleExpanded} className="crewcheck-sidebar-footer" aria-label={drawerOpen ? 'Fechar menu lateral' : showExpanded ? 'Retrair menu lateral' : 'Expandir menu lateral'}>{drawerOpen ? 'Fechar' : showExpanded ? 'Retrair' : <Menu className="h-5 w-5" />}</button>
  </aside>
 );
}

function CrewCheckFloatingSpeedMenu({ active, onNavigate, canAccessC32FAcademy, hasRoster }: { active: 'home' | 'roster' | 'iflight' | 'departure' | 'settings' | 'more'; onNavigate: (view: string) => void; canAccessC32FAcademy: boolean; hasRoster: boolean }) {
 const [open, setOpen] = useState(false);
 const go = (view: string) => { setOpen(false); onNavigate(view); };
 const quickItems: Array<{ label: string; hint: string; icon: LucideIcon; view: string; premium?: boolean }> = [
  { label: 'Chefe de Cabine', hint: 'grátis · caderno, água, horários', icon: ClipboardList, view: 'chief' },
  { label: 'Checklist Médico', hint: 'grátis · ocorrência e PDF', icon: FileText, view: 'chief' },
  { label: 'Importar escala', hint: 'PDF oficial', icon: CloudUpload, view: 'import' },
  { label: 'Saída Inteligente', hint: 'GPS e transporte', icon: Navigation, view: 'departure' },
  { label: 'Meu carro', hint: 'vaga, piso e GPS', icon: Car, view: 'parking' },
  { label: 'Diárias', hint: 'previsão mensal', icon: FileText, view: 'perdiem' },
  { label: 'Salário', hint: 'previsão variável', icon: TrendingUp, view: 'salary' },
  { label: 'Gerenciador', hint: 'escala ativa', icon: History, view: 'history' },
  { label: 'Ajuda e manuais', hint: 'PWA, suporte e PDFs', icon: Mail, view: 'support' },
  { label: 'Extra', hint: 'grátis quando usar dados locais', icon: Radar, view: 'departureExtra' },
  ...(canAccessC32FAcademy ? [
   { label: 'Admin geral', hint: 'saúde, financeiro e gestão', icon: BarChart3, view: 'admin', premium: true },
   { label: 'Painel técnico', hint: 'serviços, banco e radar', icon: Activity, view: 'systemstatus', premium: true },
   { label: 'C32F', hint: 'estudo privado', icon: GraduationCap, view: 'c32f', premium: true }
  ] : []),
 ];
 return (
  <div className="crewcheck-speed-dial fixed right-4 z-[96] lg:hidden" aria-live="polite">
   {open && (
    <div className="crewcheck-speed-dial-panel mb-3 w-[min(21rem,calc(100vw-2rem))] rounded-[1.55rem] border p-3 shadow-2xl backdrop-blur-2xl">
     <div className="mb-2 flex items-center justify-between px-2">
      <div>
       <p className="text-[10px] font-black uppercase tracking-[0.22em]">Menu completo</p>
       <p className="text-xs font-semibold opacity-70">Acesso rápido aos módulos grátis e premium</p>
      </div>
      <span className="rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em]">v11.0.18</span>
     </div>
     <div className="grid gap-2">
      {quickItems.map(({ label, hint, icon: Icon, view, premium }) => (
       <button key={label} onClick={() => go(view)} className="crewcheck-speed-dial-action flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><b className="block truncate text-sm">{label}</b><small className="block truncate text-[11px] font-semibold opacity-70">{hint}</small></span>
        {premium && <Sparkles className="h-4 w-4 shrink-0 opacity-80" />}
       </button>
      ))}
     </div>
    </div>
   )}
   <button type="button" onClick={() => setOpen((value) => !value)} className={`crewcheck-speed-dial-button flex h-14 w-14 items-center justify-center rounded-[1.25rem] border shadow-2xl transition active:scale-95 ${open ? 'is-open' : ''}`} aria-label={open ? 'Fechar menu completo' : 'Abrir menu completo'}>
    <Menu className="h-6 w-6" />
   </button>
  </div>
 );
}




type ExtraFlightOptionLeg = {
 label?: string;
 flightNumber?: string;
 airlineName?: string;
 airlineCode?: string | null;
 operatingAirlineName?: string | null;
 operatingAirlineCode?: string | null;
 origin: string;
 destination: string;
 departure: string;
 arrival: string;
 terminal?: string | null;
 gate?: string | null;
 status?: string | null;
 source?: string | null;
 aircraft?: string | null;
 duration?: string | null;
 cabin?: string | null;
 bookingClass?: string | null;
 baggage?: string | null;
 note?: string;
};

type ExtraFlightOptionEstimate = {
 kind: 'direct' | 'connection';
 title: string;
 route: string;
 carriers: string;
 leaveAt: string;
 arriveAt: string;
 durationMinutes: number;
 connection?: string;
 confidence: string;
 source?: string;
 selectedDate?: string;
 details?: string;
 advisory?: string;
 live?: boolean;
 priceLabel?: string | null;
 priceSource?: string | null;
 priceConfidence?: string | null;
 seatsAvailable?: number | null;
 baggage?: string | null;
 bookingLinks?: Array<{ label: string; url: string; kind?: string }>;
 rawProvider?: string | null;
 legs?: ExtraFlightOptionLeg[];
};

const CREWCHECK_EXTRA_FLIGHT_HUBS = ['GRU', 'CGH', 'VCP', 'CNF', 'SSA', 'REC', 'GIG', 'SDU', 'FOR', 'POA'];

function estimateBlockMinutesBetweenAirports(from: string, to: string): number {
 const km = haversineKm(from, to);
 if (!km) return 0;
 return Math.max(35, Math.round(km / 760 * 60 + 42));
}

function minutesToDisplay(total: number): string {
 if (!Number.isFinite(total)) return '—';
 const day = ((Math.floor(total / 1440) % 7) + 7) % 7;
 const minute = ((Math.round(total) % 1440) + 1440) % 1440;
 const suffix = day ? `+${day}` : '';
 return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}${suffix}`;
}

function displayTimeIsValid(value?: string | null): boolean {
 const text = String(value || '');
 return Boolean(text && !/(nan|invalid|undefined|null)/i.test(text));
}

function formatBrlTicket(value: number): string {
 if (!Number.isFinite(value)) return 'R$ —';
 return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function estimateTicketPriceRange(origin: string, destination: string, connectionCount = 0): { label: string; source: string; confidence: string } {
 const km = haversineKm(origin, destination) || 650;
 const base = Math.max(289, Math.round(210 + km * 0.42 + connectionCount * 130));
 const low = Math.round(base * 0.9 / 10) * 10;
 const high = Math.round((base * (connectionCount ? 1.55 : 1.35)) / 10) * 10;
 return {
  label: `${formatBrlTicket(low)}–${formatBrlTicket(high)}`,
  source: 'estimativa CrewCheck por distância · confirmar no app/site da companhia',
  confidence: 'estimativa de referência',
 };
}

function extraAirlineSearchLinks(origin: string, destination: string, date?: string): Array<{ label: string; url: string; kind?: string }> {
 const from = normalizeExtraAirport(origin);
 const to = normalizeExtraAirport(destination);
 const day = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? String(date) : new Date().toISOString().slice(0, 10);
 const q = encodeURIComponent(`${from} ${to} ${day} passagem aérea`);
 return [
  { label: 'LATAM', url: 'https://passelivre.appslatam.com/#/', kind: 'airline-official' },
  { label: 'GOL', url: 'https://passelivre.voegol.com.br/Login.aspx', kind: 'airline-official' },
  { label: 'Azul', url: 'https://passelivre.voeazul.com.br/login', kind: 'airline-official' },
  { label: 'Google Voos', url: `https://www.google.com/travel/flights?q=${q}`, kind: 'price-search' },
 ];
}

function extraOptionFlightSignature(item: ExtraFlightOptionEstimate): string {
 const flights = (item.legs || []).map((leg) => String(leg.flightNumber || '').replace(/\s+/g, '').toUpperCase()).filter(Boolean).join('+');
 return flights || `${item.route}|${item.leaveAt}|${item.arriveAt}`;
}

function dedupeExtraOptions(options: ExtraFlightOptionEstimate[]): ExtraFlightOptionEstimate[] {
 const seen = new Set<string>();
 const result: ExtraFlightOptionEstimate[] = [];
 for (const item of options) {
  const key = extraOptionFlightSignature(item);
  if (seen.has(key)) continue;
  seen.add(key);
  result.push(item);
 }
 return result;
}

function safeTargetClockMinutes(targetIso?: string): number {
 const raw = String(targetIso || '');
 const parsed = raw ? new Date(raw) : null;
 if (parsed && Number.isFinite(parsed.getTime())) return parsed.getHours() * 60 + parsed.getMinutes();
 const clock = raw.match(/T(\d{1,2}):(\d{2})/) || raw.match(/\b(\d{1,2}):(\d{2})\b/);
 if (clock) {
  const hour = Math.max(0, Math.min(23, Number(clock[1]) || 0));
  const minute = Math.max(0, Math.min(59, Number(clock[2]) || 0));
  return hour * 60 + minute;
 }
 return 9 * 60;
}

function buildEstimatedLeg(label: string, origin: string, destination: string, departure: number, blockMinutes: number, airlineName: string, note?: string): ExtraFlightOptionLeg {
 return {
  label,
  origin,
  destination,
  departure: minutesToDisplay(departure),
  arrival: minutesToDisplay(departure + blockMinutes),
  airlineName,
  airlineCode: airlineName.includes('LATAM') ? 'LA' : airlineName.includes('GOL') ? 'G3' : airlineName.includes('Azul') ? 'AD' : null,
  flightNumber: 'número real a confirmar',
  terminal: 'não informado',
  gate: 'não informado',
  status: 'Estimado',
  source: 'estimativa CrewCheck',
  cabin: 'Econômica',
  baggage: 'validar regra tarifária',
  note,
 };
}

function buildExtraFlightOptionsForPresentation(originAirport: string, targetAirport: string, targetIso?: string, selectedDate?: string): ExtraFlightOptionEstimate[] {
 const from = String(originAirport || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
 const to = String(targetAirport || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
 if (!from || !to || from === to || !AIRPORT_COORDS[from] || !AIRPORT_COORDS[to]) return [];
 const arriveBuffer = 55;
 const latestArrival = safeTargetClockMinutes(targetIso) - arriveBuffer;
 const options: ExtraFlightOptionEstimate[] = [];
 const directBlock = estimateBlockMinutesBetweenAirports(from, to);
 if (directBlock) {
  const depart = latestArrival - directBlock - 35;
  const leaveAt = minutesToDisplay(depart);
  const arriveAt = minutesToDisplay(depart + directBlock);
  const fare = estimateTicketPriceRange(from, to, 0);
  options.push({
   kind: 'direct',
   title: 'Extra direto',
   route: `${from} → ${to}`,
   carriers: 'LATAM/GOL/Azul conforme disponibilidade',
   leaveAt,
   arriveAt,
   durationMinutes: directBlock,
   confidence: 'estimado · confirmar no app/site da companhia',
   source: 'estimativa CrewCheck',
   selectedDate,
   priceLabel: fare.label,
   priceSource: fare.source,
   priceConfidence: fare.confidence,
   bookingLinks: extraAirlineSearchLinks(from, to, selectedDate),
   details: `Opção direta estimada entre ${from} e ${to}. Use como referência operacional; confirme número de voo, valor, check-in, bagagem e assento no app/site da companhia.`,
   advisory: 'O CrewCheck não inventa voo nem portão. Quando não houver retorno de tarifa, esta linha é uma sugestão de janela para busca com valor estimado.',
   legs: [buildEstimatedLeg('Trecho direto', from, to, depart, directBlock, 'LATAM/GOL/Azul', 'Validar disponibilidade real e política de Extra.')],
  });
 }
 for (const hub of CREWCHECK_EXTRA_FLIGHT_HUBS) {
  if (hub === from || hub === to || !AIRPORT_COORDS[hub]) continue;
  const a = estimateBlockMinutesBetweenAirports(from, hub);
  const b = estimateBlockMinutesBetweenAirports(hub, to);
  if (!a || !b) continue;
  const connection = 60;
  const total = a + connection + b;
  const depart = latestArrival - total - 35;
  const firstArrival = depart + a;
  const secondDeparture = firstArrival + connection;
  const fare = estimateTicketPriceRange(from, to, 1);
  options.push({
   kind: 'connection',
   title: 'Extra com conexão',
   route: `${from} → ${hub} → ${to}`,
   carriers: 'conexão inclusive entre companhias diferentes',
   leaveAt: minutesToDisplay(depart),
   arriveAt: minutesToDisplay(depart + total),
   durationMinutes: total,
   connection: hub,
   confidence: 'estimado · precisa validar bilhete, bagagem, check-in e pontualidade',
   source: 'estimativa CrewCheck',
   selectedDate,
   priceLabel: fare.label,
   priceSource: fare.source,
   priceConfidence: fare.confidence,
   bookingLinks: extraAirlineSearchLinks(from, to, selectedDate),
   details: `Opção com conexão via ${hub}, com janela mínima de conexão estimada em ${connection} min. Confirme número de voo, valor, bilhete e bagagem antes de usar.`,
   advisory: 'Verifique se a conexão é protegida, se há troca de companhia, bagagem, terminal e tempo mínimo de conexão.',
   legs: [
    buildEstimatedLeg('Trecho 1', from, hub, depart, a, 'LATAM/GOL/Azul', `Conectar em ${hub}.`),
    buildEstimatedLeg('Trecho 2', hub, to, secondDeparture, b, 'LATAM/GOL/Azul', `Saída após conexão estimada de ${connection} min.`),
   ],
  });
 }
 return options
  .filter((item) => displayTimeIsValid(item.leaveAt) && displayTimeIsValid(item.arriveAt) && Number.isFinite(item.durationMinutes))
  .sort((a, b) => (a.kind === b.kind ? a.durationMinutes - b.durationMinutes : a.kind === 'direct' ? -1 : 1))
  .slice(0, 7);
}

function restWindowBeforeNextEvent(bundle: SessionRosterBundle | null | undefined, nextEvent?: DashboardNextEvent): string {
 if (!bundle?.roster?.days?.length || !nextEvent?.date) return '';
 const targetDate = String(nextEvent.date || '').match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || '';
 if (!targetDate) return '';
 const target = rosterDateFromString(targetDate).getTime();
 const previousRest = bundle.roster.days
  .filter((day) => rosterDateFromString(day.date).getTime() < target)
  .filter((day) => /\b(DO|DOF|DOP|DOPR|DR|OFF|VC|FOLGA|FERIAS|FÉRIAS)\b/i.test(`${day.type || ''} ${day.pairingCode || ''} ${day.rawText || ''}`))
  .slice(-2);
 if (!previousRest.length) return '';
 const last = previousRest[previousRest.length - 1];
 return `Folga/descanso detectado antes da programação (${last.date}). O CrewCheck permite considerar deslocamento antecipado sem bloquear a busca.`;
}

type SmartDepartureMode = 'AUTO' | 'DRIVE' | 'TRANSIT' | 'RIDE_APP' | 'TWO_WHEELER' | 'DRIVE_FLIGHT' | 'RIDE_APP_FLIGHT' | 'TRANSIT_FLIGHT' | 'MOTO_FLIGHT';

type SmartDepartureScreenPlan = {
 ok?: boolean;
 airport?: string;
 airportName?: string;
 destination?: { lat?: number | null; lng?: number | null; name?: string | null };
 leaveAtLabel?: string;
 leaveAtFullLabel?: string;
 leaveAtDayLabel?: string;
 originSource?: string | null;
 originAddress?: string | null;
 originName?: string | null;
 arrivalDeadlineLabel?: string;
 durationMinutes?: number;
 delayMinutes?: number | null;
 distanceKm?: number | null;
 source?: string;
 mapsUrl?: string;
 humanSourceLabel?: string;
 pickupBufferMinutes?: number | null;
 inVehicleMinutes?: number | null;
 warning?: string | null;
 message?: string;
 marginMinutes?: number;
 isLate?: boolean;
 updatedAt?: string;
 recommendedMode?: string;
 fastestMode?: string;
 recommendedReason?: string;
 routeOptions?: Array<{ mode?: string; label?: string; leaveAtLabel?: string; leaveAtFullLabel?: string; durationMinutes?: number; distanceKm?: number | null; source?: string; humanSourceLabel?: string; firstTransitDeparture?: string | null; routeQuality?: string; pickupBufferMinutes?: number | null; inVehicleMinutes?: number | null; fareLabel?: string | null; fareConfidence?: string | null; rideApps?: Array<{ id?: string; name?: string; status?: string; fareLabel?: string; fareConfidence?: string; etaMinutes?: number; webUrl?: string; deepLink?: string; mapsUrl?: string; source?: string; products?: Array<{ product?: string; estimate?: string; low?: number | null; high?: number | null; currency?: string }> }>; transitSteps?: Array<{ line?: string; mode?: string; from?: string; to?: string; departureLabel?: string; arrivalLabel?: string; headsign?: string; agency?: string; realtime?: boolean }> }>;
 rideApps?: Array<{ id?: string; name?: string; status?: string; fareLabel?: string; fareConfidence?: string; etaMinutes?: number; webUrl?: string; deepLink?: string; mapsUrl?: string; source?: string }>;
 fareLabel?: string | null;
 fareConfidence?: string | null;
 detectedOriginAirport?: string | null;
 nearestOriginAirport?: { code?: string; name?: string; distanceKm?: number } | null;
 distancePolicy?: { thresholdKm?: number; policyDistanceKm?: number; straightDistanceKm?: number; isLongDistance?: boolean; userAllowsFlightAboveThreshold?: boolean; decision?: string; comparedModes?: string[] };
 permissionConfidence?: string;
 metadata?: { permissionConfidence?: string; [key: string]: unknown };
 transitBoard?: Array<{ line?: string; mode?: string; from?: string; to?: string; departureLabel?: string; arrivalLabel?: string; headsign?: string; agency?: string; realtime?: boolean; routeLabel?: string; source?: string }>;
};

const SMART_DEPARTURE_AIRPORTS = [
 ['BSB','Brasília'], ['REC','Recife'], ['GRU','Guarulhos'], ['CGH','Congonhas'], ['GIG','Galeão'], ['SDU','Santos Dumont'], ['CNF','Confins'], ['VCP','Viracopos'], ['SSA','Salvador'], ['FOR','Fortaleza'], ['NAT','Natal'], ['POA','Porto Alegre'], ['CWB','Curitiba'], ['MAO','Manaus'], ['BEL','Belém'], ['FLN','Florianópolis'], ['VIX','Vitória'], ['GYN','Goiânia'], ['MCZ','Maceió'], ['JPA','João Pessoa'], ['AJU','Aracaju'], ['CGB','Cuiabá'], ['CGR','Campo Grande'], ['SLZ','São Luís'], ['THE','Teresina'], ['PVH','Porto Velho'], ['RBR','Rio Branco'], ['BVB','Boa Vista'], ['PMW','Palmas'], ['MCP','Macapá'], ['NVT','Navegantes'], ['JOI','Joinville'], ['LDB','Londrina'], ['MGF','Maringá'], ['RAO','Ribeirão Preto'], ['UDI','Uberlândia'], ['IOS','Ilhéus'], ['BPS','Porto Seguro']
] as const;

const SMART_DEPARTURE_MODE_OPTIONS: Array<{ value: SmartDepartureMode; label: string; hint: string }> = [
 { value: 'AUTO', label: 'Automático', hint: 'compara os meios disponíveis' },
 { value: 'DRIVE', label: 'Carro', hint: 'carro próprio com trânsito' },
 { value: 'TRANSIT', label: 'Transporte público', hint: 'ônibus/metrô quando disponível' },
 { value: 'RIDE_APP', label: 'Uber/99', hint: 'corrida por app com chamada média' },
 { value: 'TWO_WHEELER', label: 'Moto/app', hint: 'estimativa conservadora de moto' },
 { value: 'DRIVE_FLIGHT', label: 'Carro + voo', hint: 'ir ao aeroporto local e seguir de voo' },
 { value: 'RIDE_APP_FLIGHT', label: 'Uber/99 + voo', hint: 'corrida até aeroporto local e voo' },
 { value: 'TRANSIT_FLIGHT', label: 'Transporte + voo', hint: 'transporte até aeroporto local e voo' },
 { value: 'MOTO_FLIGHT', label: 'Moto/app + voo', hint: 'moto/app até aeroporto local e voo' },
];

function smartRouteModeLabel(mode?: string) {
 const value = String(mode || '').toUpperCase();
 const option = SMART_DEPARTURE_MODE_OPTIONS.find((item) => item.value === value);
 if (option) return option.label;
 if (value.includes('FLIGHT')) return 'voo combinado';
 return 'rota';
}

function nearestSmartAirportFromLatLng(lat: number, lng: number): { code: string; distanceKm: number } | null {
 if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
 const rad = Math.PI / 180;
 const origin = [lat, lng] as const;
 const entries = Object.entries(AIRPORT_COORDS || {});
 if (!entries.length) return null;
 const distance = (coords: [number, number]) => {
  const dLat = (coords[0] - origin[0]) * rad;
  const dLon = (coords[1] - origin[1]) * rad;
  const lat1 = origin[0] * rad;
  const lat2 = coords[0] * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
 };
 return entries.map(([code, coords]) => ({ code, distanceKm: Math.round(distance(coords) * 10) / 10 })).sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

function inferSmartDepartureAirport(nextEvent?: DashboardNextEvent, userBase?: string) {
 const supported = SMART_DEPARTURE_AIRPORTS.map(([code]) => code).join('|');
 const pattern = new RegExp(`\\b(${supported})\\b`, 'i');
 const candidates = [nextEvent?.origin, nextEvent?.base, nextEvent?.route, userBase, localStorage.getItem('crewcheck_preferred_airport') || ''];
 for (const candidate of candidates) {
  const match = String(candidate || '').toUpperCase().match(pattern);
  if (match?.[1]) return match[1].toUpperCase();
 }
 return 'BSB';
}

function SmartDepartureScreen({ nextEvent, bundle, userBase, hasRoster, canAccessAdmin = false, onBack, onOpenRoster }: { nextEvent?: DashboardNextEvent; bundle?: SessionRosterBundle | null; userBase?: string; hasRoster: boolean; canAccessAdmin?: boolean; onBack: () => void; onOpenRoster: () => void }) {
 const [airport, setAirport] = useState(() => inferSmartDepartureAirport(nextEvent, userBase));
 const contractualBaseOptions = uniqueAirportOptions(baseAirportOptionsForCrewBase(userBase || nextEvent?.base || 'BSB'));
 const defaultExtraTargetAirport = contractualBaseOptions[0] || 'BSB';
 const [originAirportForExtra, setOriginAirportForExtra] = useState(() => localStorage.getItem('crewcheck_extra_origin_airport') || '');
 const profileVirtualBaseAirport = (() => { const saved = loadLocalProfileSettings(); return saved.hasVirtualBase ? saved.virtualBase : (readPerDiemUserSettings().baseVirtualEnabled ? readPerDiemUserSettings().baseVirtualAirport : ''); })();
 const [extraTargetAirport, setExtraTargetAirport] = useState(() => localStorage.getItem('crewcheck_extra_target_airport') || defaultExtraTargetAirport);
 const [extraFlightDate, setExtraFlightDate] = useState(() => localStorage.getItem('crewcheck_extra_flight_date') || new Date().toISOString().slice(0, 10));
 const [extraBoardRows, setExtraBoardRows] = useState<AirportBoardRow[]>([]);
 const [extraBoardLoading, setExtraBoardLoading] = useState(false);
 const [extraBoardSource, setExtraBoardSource] = useState('');
 const [extraFareOptions, setExtraFareOptions] = useState<ExtraFlightOptionEstimate[]>([]);
 const [extraFareLoading, setExtraFareLoading] = useState(false);
 const [extraFareSource, setExtraFareSource] = useState('');
 const [extraFareMessage, setExtraFareMessage] = useState('');
 const [extraFareUpdatedAt, setExtraFareUpdatedAt] = useState<string | null>(null);
 const [extraFareCacheLabel, setExtraFareCacheLabel] = useState('');
 const [expandedExtraOptionKey, setExpandedExtraOptionKey] = useState<string | null>(null);
 const [selectedExtraOptionKey, setSelectedExtraOptionKey] = useState(() => localStorage.getItem('crewcheck_extra_selected_option_key') || '');
 const [margin, setMargin] = useState(() => Number(localStorage.getItem('crewcheck_departure_margin_minutes') || 15) || 15);
 const [mode, setMode] = useState<SmartDepartureMode>((localStorage.getItem('crewcheck_departure_mode') as SmartDepartureMode) || 'AUTO');
 const [autoFlightOver250, setAutoFlightOver250] = useState(() => localStorage.getItem('crewcheck_auto_flight_over_250') === 'true' || localStorage.getItem('crewcheck_departure_auto_flight_over_250') === 'true');
 const [flightPresentationBuffer, setFlightPresentationBuffer] = useState(() => Number(localStorage.getItem('crewcheck_flight_presentation_buffer_minutes') || 60) || 60);
 const [nearestAirportHint, setNearestAirportHint] = useState(() => localStorage.getItem('crewcheck_nearest_airport_hint') || '');
 const [permission, setPermission] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'>('idle');
 const [nativeStatus, setNativeStatus] = useState<CrewCheckPermissionStatus>(() => readCrewCheckPermissionStatus());
 const [plan, setPlan] = useState<SmartDepartureScreenPlan | null>(() => {
  try { return JSON.parse(localStorage.getItem('crewcheck_departure_last_plan') || 'null'); } catch { return null; }
 });
 const [error, setError] = useState<string | null>(null);
 const [originMode, setOriginMode] = useState<'gps' | 'home' | 'base2'>((localStorage.getItem('crewcheck_departure_origin_mode') as 'gps' | 'home' | 'base2') || 'gps');
 const [homeCep, setHomeCep] = useState(() => localStorage.getItem('crewcheck_home_cep') || '');
 const [homeAddress, setHomeAddress] = useState(() => localStorage.getItem('crewcheck_home_address') || '');
 const [base2Label, setBase2Label] = useState(() => localStorage.getItem('crewcheck_base2_label') || 'Outra base');
 const [base2Cep, setBase2Cep] = useState(() => localStorage.getItem('crewcheck_base2_cep') || '');
 const [base2Address, setBase2Address] = useState(() => localStorage.getItem('crewcheck_base2_address') || '');
 const [addressStatus, setAddressStatus] = useState<string>(() => localStorage.getItem('crewcheck_departure_address_status') || '');
 useEffect(() => { if (!canAccessAdmin && originMode !== 'gps') { setOriginMode('gps'); localStorage.setItem('crewcheck_departure_origin_mode', 'gps'); } }, [canAccessAdmin, originMode]);
 const [addressLoading, setAddressLoading] = useState(false);
 const locationAllowed = nativeStatus.location === true || permission === 'granted';
 const notificationsAllowed = nativeStatus.notifications === true;
 const routeOptions = Array.isArray(plan?.routeOptions) ? plan.routeOptions : [];
 const transitBoard = Array.isArray(plan?.transitBoard) ? plan.transitBoard : routeOptions.flatMap((route) => route.transitSteps || []);
 const isTransitFastest = plan?.recommendedMode === 'TRANSIT' || plan?.fastestMode === 'TRANSIT';
 const isRideFastest = plan?.recommendedMode === 'RIDE_APP' || plan?.fastestMode === 'RIDE_APP';
 const rideBoard = routeOptions.flatMap((route) => route.rideApps || []).filter(Boolean);
 const selectedModeOption = SMART_DEPARTURE_MODE_OPTIONS.find((item) => item.value === mode) || SMART_DEPARTURE_MODE_OPTIONS[0];
 const virtualBaseOptions = profileVirtualBaseAirport ? baseAirportOptionsForCrewBase(profileVirtualBaseAirport) : [];
 const extraDestinationOptions = uniqueAirportOptions([...contractualBaseOptions, ...virtualBaseOptions]);
 const selectedExtraDestination = normalizeExtraAirport(extraTargetAirport) || defaultExtraTargetAirport;
 const extraTargetIso = useMemo(() => extraTargetIsoFromDate(extraFlightDate, nextEvent), [extraFlightDate, nextEvent?.time]);
 const extraFlightOptions = useMemo(() => buildExtraFlightOptionsForPresentation(originAirportForExtra, selectedExtraDestination, extraTargetIso, extraFlightDate), [originAirportForExtra, selectedExtraDestination, extraTargetIso, extraFlightDate]);
 const extraLiveOptions = useMemo(() => liveExtraFlightOptionsFromBoard(extraBoardRows, selectedExtraDestination, extraFlightDate), [extraBoardRows, selectedExtraDestination, extraFlightDate]);
 const displayedExtraFlightOptions = dedupeExtraOptions([
  ...extraLiveOptions,
  ...extraFareOptions,
 ]).slice(0, 10);
 const selectedExtraOption = useMemo(() => displayedExtraFlightOptions.find((item) => stableExtraOptionKey(item) === selectedExtraOptionKey) || null, [displayedExtraFlightOptions, selectedExtraOptionKey]);
 const selectedExtraDepartureIso = useMemo(() => extraOptionTargetIso(selectedExtraOption), [selectedExtraOption]);
 const selectedExtraDepartureAirport = useMemo(() => optionFirstAirport(selectedExtraOption, originAirportForExtra), [selectedExtraOption, originAirportForExtra]);
 const flightPresentationTargetLabel = selectedExtraOption ? `${flightPresentationBuffer} min antes da decolagem` : 'usar margem da escala';
 const canCalculate = Boolean((hasRoster && nextEvent?.targetIso && nextEvent?.requiresDeparture !== false) || selectedExtraOption);
 const restWindowHint = useMemo(() => restWindowBeforeNextEvent(bundle, nextEvent), [bundle, nextEvent]);
 const vivoSectionRef = useRef<HTMLDivElement | null>(null);

 useEffect(() => {
  try {
   const focus = localStorage.getItem('crewcheck_departure_focus');
   if (focus !== 'vivo') return;
   localStorage.removeItem('crewcheck_departure_focus');
   window.setTimeout(() => vivoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 280);
  } catch {}
 }, []);

 const selectExtraOptionForDeparture = useCallback((item: ExtraFlightOptionEstimate) => {
  const key = stableExtraOptionKey(item);
  const departureAirport = optionFirstAirport(item, originAirportForExtra);
  const targetIso = extraOptionTargetIso(item);
  setSelectedExtraOptionKey(key);
  localStorage.setItem('crewcheck_extra_selected_option_key', key);
  localStorage.setItem('crewcheck_extra_selected_option', JSON.stringify(item));
  if (departureAirport) {
   setAirport(departureAirport);
   localStorage.setItem('crewcheck_preferred_airport', departureAirport);
  }
  if (targetIso) localStorage.setItem('crewcheck_extra_selected_target_iso', targetIso);
  toast.success(`Opção ${item.route} selecionada para a Saída Inteligente.`);
 }, [originAirportForExtra]);

 const refreshPermissionStatus = useCallback((event?: Event) => {
  const detail = (event as CustomEvent<CrewCheckPermissionStatus> | undefined)?.detail || {};
  setNativeStatus({ ...readCrewCheckPermissionStatus(), ...detail });
 }, []);



 useEffect(() => {
  const from = normalizeExtraAirport(originAirportForExtra);
  const to = normalizeExtraAirport(selectedExtraDestination);
  if (!from || !to || from === to) {
   setExtraBoardRows([]);
   setExtraBoardSource('');
   return;
  }
  let active = true;
  const controller = new AbortController();
  async function loadExtraBoard() {
   setExtraBoardLoading(true);
   try {
    const params = new URLSearchParams({ airport: from, type: 'departure', limit: '80', diagnostics: '1', apiFirst: '1', date: extraFlightDate });
    const response = await fetch(`/api/airport-board?${params.toString()}`, { cache: 'no-store', signal: controller.signal, headers: crewcheckAuthHeader() });
    const payload = await response.json().catch(() => null);
    if (!active) return;
    const rows = cleanAirportMonitorRows(Array.isArray(payload?.rows) ? payload.rows : []);
    setExtraBoardRows(rows);
    setExtraBoardSource(payload?.source || '');
   } catch {
    if (active) {
     setExtraBoardRows([]);
     setExtraBoardSource('');
    }
   } finally {
    if (active) setExtraBoardLoading(false);
   }
  }
  void loadExtraBoard();
  return () => { active = false; controller.abort(); };
 }, [originAirportForExtra, selectedExtraDestination, extraFlightDate]);

 useEffect(() => {
  const from = normalizeExtraAirport(originAirportForExtra);
  const to = normalizeExtraAirport(selectedExtraDestination);
  if (!from || !to || from === to) {
   setExtraFareOptions([]);
   setExtraFareSource('');
   setExtraFareMessage('');
   setExtraFareUpdatedAt(null);
   setExtraFareCacheLabel('');
   return;
  }
  let active = true;
  const controller = new AbortController();
  async function loadExtraFareOptions() {
   setExtraFareLoading(true);
   try {
    const params = new URLSearchParams({ origin: from, destination: to, date: extraFlightDate, adults: '1', limit: '12', currency: 'BRL', targetIso: extraTargetIso });
    const response = await fetch(`/api/extra-flight-search?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
    const payload = await response.json().catch(() => null) as { ok?: boolean; options?: ExtraFlightOptionEstimate[]; source?: string; message?: string; updatedAt?: string; cache?: { hit?: boolean; shared?: boolean; updatedAt?: string; writtenAt?: string; written?: boolean } } | null;
    if (!active) return;
    const options = Array.isArray(payload?.options) ? payload.options.filter((item) => displayTimeIsValid(item.leaveAt) || item.priceLabel) : [];
    setExtraFareOptions(options);
    setExtraFareSource(payload?.source || '');
    setExtraFareMessage(payload?.message || '');
    setExtraFareUpdatedAt(payload?.cache?.updatedAt || payload?.updatedAt || null);
    setExtraFareCacheLabel(payload?.cache?.hit ? 'cache compartilhado' : payload?.cache?.written ? 'atualizado para todos' : 'consulta protegida');
   } catch {
    if (active) {
     setExtraFareOptions([]);
     setExtraFareSource('');
     setExtraFareMessage('');
     setExtraFareUpdatedAt(null);
     setExtraFareCacheLabel('');
    }
   } finally {
    if (active) setExtraFareLoading(false);
   }
  }
  void loadExtraFareOptions();
  return () => { active = false; controller.abort(); };
 }, [originAirportForExtra, selectedExtraDestination, extraFlightDate, extraTargetIso]);

 const selectedAddress = originMode === 'base2'
  ? { key: 'base2', label: base2Label || 'Outra base', cep: base2Cep, address: base2Address }
  : { key: 'home', label: 'Casa', cep: homeCep, address: homeAddress };

 const saveSelectedAddress = useCallback((result: { lat?: number; lng?: number; formattedAddress?: string; source?: string }, key = selectedAddress.key) => {
  if (typeof result.lat === 'number' && typeof result.lng === 'number') {
   localStorage.setItem(`crewcheck_${key}_lat`, String(result.lat));
   localStorage.setItem(`crewcheck_${key}_lng`, String(result.lng));
  }
  if (result.formattedAddress) localStorage.setItem(`crewcheck_${key}_formatted`, result.formattedAddress);
  if (result.source) localStorage.setItem(`crewcheck_${key}_source`, result.source);
 }, [selectedAddress.key]);

 const applyNearestAirportFromCoords = useCallback((lat: number, lng: number, source = 'GPS') => {
  const nearest = nearestSmartAirportFromLatLng(lat, lng);
  if (!nearest?.code) return null;
  setOriginAirportForExtra(nearest.code);
  localStorage.setItem('crewcheck_extra_origin_airport', nearest.code);
  localStorage.setItem('crewcheck_nearest_airport_hint', `${nearest.code} detectado por ${source} · ${nearest.distanceKm} km`);
  setNearestAirportHint(`${nearest.code} detectado por ${source} · ${nearest.distanceKm} km`);
  if (!selectedExtraOption && !nextEvent?.origin) {
   setAirport(nearest.code);
   localStorage.setItem('crewcheck_preferred_airport', nearest.code);
  }
  return nearest;
 }, [nextEvent?.origin, selectedExtraOption]);

 const detectOriginAirportFromLocation = useCallback(async () => {
  try {
   setPermission('requesting');
   let coords = await requestCrewCheckCurrentLocation();
   if (!coords?.ok) coords = await requestCrewCheckBrowserLocation();
   if (!coords?.ok || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') throw new Error(coords?.error || 'Não consegui acessar a localização agora.');
   setPermission('granted');
   setNativeStatus((current) => ({ ...current, location: true }));
   const nearest = applyNearestAirportFromCoords(coords.lat, coords.lng, 'localização atual');
   if (nearest?.code) toast.success(`Aeroporto local definido como ${nearest.code}.`);
   return nearest;
  } catch (err) {
   const msg = err instanceof Error ? err.message : 'Não consegui detectar o aeroporto local.';
   setPermission('idle');
   toast.error(msg);
   return null;
  }
 }, [applyNearestAirportFromCoords]);

 const validateSelectedAddress = useCallback(async () => {
  if (originMode === 'gps') {
   toast.info('Selecione Casa ou Outra base para validar CEP/endereço.');
   return null;
  }
  const selected = originMode === 'base2'
   ? { key: 'base2', label: base2Label || 'Outra base', cep: base2Cep, address: base2Address }
   : { key: 'home', label: 'Casa', cep: homeCep, address: homeAddress };
  if (!selected.cep && !selected.address.trim()) {
   toast.info('Informe CEP ou endereço completo para validar.');
   return null;
  }
  setAddressLoading(true);
  try {
   const params = new URLSearchParams({ cep: selected.cep || '', address: selected.address || '' });
   const response = await fetch(`/api/smart-departure/address/validate?${params.toString()}`, { cache: 'no-store' });
   const payload = await response.json().catch(() => null) as { ok?: boolean; lat?: number; lng?: number; formattedAddress?: string; message?: string; source?: string } | null;
   if (!response.ok || !payload?.ok || typeof payload.lat !== 'number' || typeof payload.lng !== 'number') throw new Error(payload?.message || 'Não consegui validar o endereço.');
   saveSelectedAddress(payload, selected.key);
   localStorage.setItem('crewcheck_departure_origin_mode', originMode);
   localStorage.setItem('crewcheck_departure_address_status', payload.formattedAddress || 'Endereço validado');
   setAddressStatus(payload.formattedAddress || 'Endereço validado');
   toast.success(`${selected.label}: endereço validado pelo Google.`);
   return { ...payload, key: selected.key, label: selected.label, cep: selected.cep, address: selected.address };
  } catch (err) {
   const msg = err instanceof Error ? err.message : 'Falha ao validar endereço.';
   setAddressStatus(msg);
   toast.error(msg);
   return null;
  } finally {
   setAddressLoading(false);
  }
 }, [base2Address, base2Cep, base2Label, homeAddress, homeCep, originMode, saveSelectedAddress]);

 const runRoutesDiagnostics = useCallback(async () => {
  try {
   const response = await fetch('/api/smart-departure/diagnostics?airport=BSB', { cache: 'no-store' });
   const payload = await response.json().catch(() => null) as { mapsKeyConfigured?: boolean; routes?: unknown; directions?: unknown; errors?: string[] } | null;
   if (payload?.routes || payload?.directions) {
    toast.success('Serviço de rotas respondeu no sistema.');
   } else {
    toast.error(`Routes ainda indisponível: ${(payload?.errors || []).join(' · ') || 'sem detalhe'}`);
   }
  } catch {
   toast.error('Não consegui testar as rotas agora.');
  }
 }, []);

 useEffect(() => {
  refreshPermissionStatus();
  const refresh = (event: Event) => refreshPermissionStatus(event);
  window.addEventListener('crewcheck:native-ready', refresh);
  window.addEventListener('crewcheck:permissions-updated', refresh);
  window.addEventListener('crewcheck:location-permission', refresh);
  window.addEventListener('crewcheck:notification-permission', refresh);
  window.addEventListener('crewcheck:request-background-mode', requestAppBackgroundMode as EventListener);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  const timer = window.setInterval(() => refreshPermissionStatus(), 2500);
  return () => {
   window.removeEventListener('crewcheck:native-ready', refresh);
   window.removeEventListener('crewcheck:permissions-updated', refresh);
   window.removeEventListener('crewcheck:location-permission', refresh);
   window.removeEventListener('crewcheck:notification-permission', refresh);
   window.removeEventListener('crewcheck:request-background-mode', requestAppBackgroundMode as EventListener);
   window.removeEventListener('focus', refresh);
   document.removeEventListener('visibilitychange', refresh);
   window.clearInterval(timer);
  };
 }, [refreshPermissionStatus]);

 const requestAppNotifications = useCallback(() => {
  const immediate = requestCrewCheckNotificationPermission();
  window.setTimeout(() => refreshPermissionStatus(), 700);
  const latest = readCrewCheckPermissionStatus();
  if (immediate || latest.notifications === true) {
   setNativeStatus((current) => ({ ...current, notifications: true }));
   localStorage.setItem('crewcheck_notifications_enabled', 'true');
   toast.success('Notificações do CrewCheck já estão liberadas.');
   const title = 'CrewCheck ativado';
   const body = 'Você receberá alertas de escala, hora de sair e próximo voo quando o app tiver dados suficientes.';
   getCrewCheckNative()?.notify?.(title, body) || notifyCrewCheck(title, body, 'notifications_enabled');
  } else {
   toast.info('Autorize as notificações no aviso do Android. O CrewCheck confirma automaticamente após liberar.');
  }
 }, [refreshPermissionStatus]);

 function requestAppBackgroundMode() {
  const ok = requestCrewCheckBackgroundMode();
  window.setTimeout(() => refreshPermissionStatus(), 900);
  toast.info(ok ? 'Abrindo ajuste de segundo plano. Libere o CrewCheck para melhorar as notificações.' : 'No Android, libere o CrewCheck para funcionar em segundo plano nas configurações do app.');
 }

 const scheduleCurrentDepartureAlert = useCallback(() => {
  const targetIso = selectedExtraOption ? selectedExtraDepartureIso : String(nextEvent?.smartDepartureTargetIso || nextEvent?.targetIso || '');
  if (!targetIso) {
   toast.info('Carregue uma escala ou selecione uma opção de Extra para agendar o alerta.');
   return;
  }
  if (!readCrewCheckPermissionStatus().notifications) requestCrewCheckNotificationPermission();
  const leaveLabel = plan?.leaveAtLabel || 'Sair no horário calculado';
  const target = new Date(targetIso).getTime();
  const reminderAt = Math.max(Date.now() + 60_000, target - 90 * 60_000);
  const targetLabel = selectedExtraOption ? `Extra ${selectedExtraOption.route}` : (nextEvent?.title || 'sua próxima programação');
  const scheduled = scheduleCrewCheckNotification('CrewCheck · hora de sair', `${leaveLabel} para ${targetLabel}.`, reminderAt);
  if (scheduled) toast.success('Alerta de saída agendado pelo CrewCheck.');
  else toast.info('Ative as notificações do app para agendar a saída inteligente.');
 }, [nextEvent?.targetIso, nextEvent?.smartDepartureTargetIso, nextEvent?.title, plan?.leaveAtLabel, selectedExtraDepartureIso, selectedExtraOption]);


 useEffect(() => {
  if (!selectedExtraOption) setAirport(inferSmartDepartureAirport(nextEvent, userBase));
 }, [nextEvent?.targetIso, nextEvent?.origin, nextEvent?.base, nextEvent?.route, userBase, selectedExtraOption]);

 const runGeolocationCalculation = useCallback(async (options: { notifyTelegram?: boolean } = {}) => {
  if (!canCalculate) {
   setError('Importe uma escala, abra uma escala salva ou selecione uma opção de Extra para calcular a hora de sair.');
   return;
  }
  setPermission('requesting');
  setError(null);
  try {
   let coords: { ok?: boolean; lat?: number; lng?: number; accuracy?: number | string; error?: string; permission?: boolean; source?: string } | null = null;
   let originLabel = 'Localização atual';
   let originCep = '';
   let originAddress = '';
   if (originMode !== 'gps') {
    const selected = originMode === 'base2'
     ? { key: 'base2', label: base2Label || 'Outra base', cep: base2Cep, address: base2Address }
     : { key: 'home', label: 'Casa', cep: homeCep, address: homeAddress };
    originLabel = selected.label;
    originCep = selected.cep;
    originAddress = selected.address || localStorage.getItem(`crewcheck_${selected.key}_formatted`) || '';
    const savedLat = Number(localStorage.getItem(`crewcheck_${selected.key}_lat`) || '');
    const savedLng = Number(localStorage.getItem(`crewcheck_${selected.key}_lng`) || '');
    if (Number.isFinite(savedLat) && Number.isFinite(savedLng)) {
     coords = { ok: true, lat: savedLat, lng: savedLng, accuracy: 20, source: 'endereço salvo' };
    } else {
     const validated = await validateSelectedAddress();
     if (validated?.ok && typeof validated.lat === 'number' && typeof validated.lng === 'number') {
      coords = { ok: true, lat: validated.lat, lng: validated.lng, accuracy: 20, source: 'endereço validado' };
      originAddress = validated.formattedAddress || originAddress;
     }
    }
   }
   if (!coords?.ok) {
    coords = await requestCrewCheckCurrentLocation();
    if (!coords?.ok) coords = await requestCrewCheckBrowserLocation();
    originLabel = 'Localização atual';
   }
   if (!coords?.ok || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    setPermission(coords?.permission ? 'denied' : 'unsupported');
    setNativeStatus((current) => ({ ...current, location: false }));
    throw new Error(coords?.error || 'Não consegui puxar sua localização real. Use CEP/endereço salvo ou libere Localização para o CrewCheck e tente novamente.');
   }
   if (originMode === 'gps') applyNearestAirportFromCoords(coords.lat, coords.lng, 'GPS');
   setPermission(originMode === 'gps' ? 'granted' : permission);
   if (originMode === 'gps') setNativeStatus((current) => ({ ...current, location: true }));
   const calculationAirport = selectedExtraOption ? (selectedExtraDepartureAirport || airport) : airport;
   const calculationTargetIso = selectedExtraOption ? (selectedExtraDepartureIso || nextEvent?.smartDepartureTargetIso || nextEvent?.targetIso || '') : String(nextEvent?.smartDepartureTargetIso || nextEvent?.targetIso || '');
   const calculationMargin = selectedExtraOption ? flightPresentationBuffer : margin;
   localStorage.setItem('crewcheck_departure_margin_minutes', String(margin));
   localStorage.setItem('crewcheck_flight_presentation_buffer_minutes', String(flightPresentationBuffer));
   localStorage.setItem('crewcheck_preferred_airport', calculationAirport);
   localStorage.setItem('crewcheck_departure_mode', mode);
   localStorage.setItem('crewcheck_auto_flight_over_250', autoFlightOver250 ? 'true' : 'false');
   localStorage.setItem('crewcheck_departure_auto_flight_over_250', autoFlightOver250 ? 'true' : 'false');
   localStorage.setItem('crewcheck_departure_origin_mode', originMode);
   const params = new URLSearchParams({
    lat: String(coords.lat),
    lng: String(coords.lng),
    accuracy: String(coords.accuracy || ''),
    airport: calculationAirport,
    targetIso: String(calculationTargetIso),
    marginMinutes: String(calculationMargin),
    mode,
    originName: originLabel,
    originCep,
    originAddress,
    preferAddress: originMode === 'gps' ? 'false' : 'true',
    autoFlightOver250: autoFlightOver250 ? 'true' : 'false',
    longDistancePolicy: autoFlightOver250 ? 'flight_if_over_250' : 'ground_only',
    flightPresentationBufferMinutes: selectedExtraOption ? String(flightPresentationBuffer) : '',
   });
   if (options.notifyTelegram) {
    const roundedLat = Math.round(Number(coords.lat) * 1000) / 1000;
    const roundedLng = Math.round(Number(coords.lng) * 1000) / 1000;
    const signature = [calculationAirport, calculationTargetIso, calculationMargin, mode, originMode, roundedLat, roundedLng, selectedExtraOption?.route || ''].join('|');
    const lastSignature = localStorage.getItem('crewcheck_departure_telegram_signature') || '';
    const lastAt = Number(localStorage.getItem('crewcheck_departure_telegram_signature_at') || '0');
    const now = Date.now();
    if (signature !== lastSignature || !Number.isFinite(lastAt) || now - lastAt > 10 * 60_000) {
     params.set('telegramNotify', 'true');
     localStorage.setItem('crewcheck_departure_telegram_signature', signature);
     localStorage.setItem('crewcheck_departure_telegram_signature_at', String(now));
    }
   }
   if (selectedExtraOption) params.set('extraFlight', `${selectedExtraOption.route} · ${selectedExtraOption.leaveAt} · apresentação ${flightPresentationBuffer} min antes`);
   const response = await fetch(`/api/smart-departure?${params.toString()}`, { cache: 'no-store', headers: crewcheckAuthHeader() });
   const payload = await response.json().catch(() => null) as SmartDepartureScreenPlan | null;
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível calcular a saída agora.');
   setPlan(payload);
   localStorage.setItem('crewcheck_departure_location_permission', 'granted');
   localStorage.setItem('crewcheck_departure_last_airport', selectedExtraOption ? (selectedExtraDepartureAirport || airport) : airport);
   localStorage.setItem('crewcheck_departure_last_plan', JSON.stringify(payload));
  } catch (err) {
   setError(err instanceof Error ? err.message : 'Falha ao calcular rota com trânsito.');
  }
 }, [airport, applyNearestAirportFromCoords, autoFlightOver250, base2Address, base2Cep, base2Label, canCalculate, flightPresentationBuffer, homeAddress, homeCep, margin, mode, nextEvent?.targetIso, nextEvent?.smartDepartureTargetIso, originMode, permission, selectedExtraDepartureAirport, selectedExtraDepartureIso, selectedExtraOption, validateSelectedAddress]);

 const calculate = useCallback(() => {
  if (!canCalculate) {
   setError('Importe uma escala, abra uma escala salva ou selecione uma opção de Extra para calcular a hora de sair.');
   return;
  }
  const latestStatus = readCrewCheckPermissionStatus();
  setNativeStatus(latestStatus);
  const native = getCrewCheckNative();
  if (native?.requestLocation && latestStatus.location !== true) {
   setPermission('requesting');
   setError('Toque em Permitir no aviso do Android. Assim que liberar, o CrewCheck recalcula automaticamente.');
   requestCrewCheckLocationPermission();
   window.setTimeout(() => refreshPermissionStatus(), 700);
   window.setTimeout(() => void runGeolocationCalculation({ notifyTelegram: true }), 1600);
   return;
  }
  void runGeolocationCalculation({ notifyTelegram: true });
 }, [canCalculate, refreshPermissionStatus, runGeolocationCalculation]);

 useEffect(() => {
  if (permission === 'requesting' && nativeStatus.location === true) {
   setError(null);
   void runGeolocationCalculation();
  }
 }, [nativeStatus.location, permission, runGeolocationCalculation]);

 useEffect(() => {
  let timer: number | undefined;
  if (canCalculate && (localStorage.getItem('crewcheck_departure_location_permission') === 'granted' || nativeStatus.location === true)) {
   void runGeolocationCalculation();
   timer = window.setInterval(() => void runGeolocationCalculation(), 5 * 60_000);
  }
  return () => { if (timer) window.clearInterval(timer); };
 }, [runGeolocationCalculation, canCalculate, nativeStatus.location]);

 const tomTomRouteFallbackUrl = plan?.destination?.lat && plan?.destination?.lng ? buildTomTomPlanSearchUrl(plan.destination.lat, plan.destination.lng) : 'https://plan.tomtom.com/';
 const googleRouteUrl = plan?.destination?.lat && plan?.destination?.lng ? buildGoogleMapsDestinationUrl(plan.destination.lat, plan.destination.lng) : (plan?.mapsUrl || 'https://www.google.com/maps');
 const isRestOnlyProgram = Boolean(hasRoster && nextEvent?.requiresDeparture === false);
 const smartDepartureHeroTitle = isRestOnlyProgram ? 'Vá descansar' : (plan?.leaveAtLabel || 'Calcular');
 const smartDepartureHeroDescription = isRestOnlyProgram
  ? 'Você está em folga, férias, repouso, EAD ou programação sem deslocamento. O CrewCheck não calcula saída nesse caso e recomenda preservar seu descanso.'
  : 'O CrewCheck compara carro, transporte público, Uber/99, moto/app e, quando autorizado, voo em trajetos longos. A apresentação do voo selecionado pode ser ajustada em X minutos antes da decolagem.';
 const arrivalText = isRestOnlyProgram ? 'Sem deslocamento' : (plan?.arrivalDeadlineLabel || (nextEvent?.time ? `${nextEvent.time} - ${margin} min` : '—'));

 return (
  <div className="min-h-screen overflow-x-hidden overflow-y-auto bg-[#07111F] px-5 py-8 text-white crewcheck-smart-departure-screen">
   <div className="mx-auto max-w-6xl space-y-5">
    <HeaderBack title="Saída Inteligente" subtitle="ultra premium · carro · ônibus/metrô · Uber/99 · auditável" onBack={onBack} />
    <section className="overflow-hidden rounded-[2.2rem] border border-cyan-200/20 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,.24),transparent_34%),linear-gradient(135deg,rgba(255,255,255,.12),rgba(15,23,42,.72))] shadow-2xl shadow-cyan-950/30 backdrop-blur-2xl">
     <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="p-6 md:p-8">
       <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div>
         <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-100/75">hora de sair</p>
         <h1 className="mt-3 text-5xl font-black tracking-tight md:text-7xl">{smartDepartureHeroTitle}</h1>
         <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/90">{smartDepartureHeroDescription}</p>
        </div>
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.8rem] bg-cyan-300/15 text-cyan-100 shadow-xl"><Navigation className="h-10 w-10" /></div>
       </div>

       <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SmartDepartureMetric label="Aeroporto" value={plan?.airport || airport} hint={plan?.airportName || 'base detectada'} />
        <SmartDepartureMetric label="Chegar até" value={arrivalText} hint="antes da apresentação" />
        <SmartDepartureMetric label="Melhor rota" value={isRestOnlyProgram ? 'Descanso' : (plan?.durationMinutes ? `${plan.durationMinutes} min` : '—')} hint={isRideFastest && plan?.pickupBufferMinutes ? `inclui chamada média ${plan.pickupBufferMinutes} min` : isTransitFastest ? 'transporte público' : (plan?.delayMinutes ? `+${plan.delayMinutes} min no trânsito` : 'rota calculada')} />
        <SmartDepartureMetric label="Distância" value={isRestOnlyProgram ? '—' : (plan?.distanceKm ? `${plan.distanceKm} km` : '—')} hint={plan?.humanSourceLabel || 'rota protegida'} />
        <SmartDepartureMetric label="Fonte" value={isRestOnlyProgram ? 'Descanso recomendado' : (plan?.humanSourceLabel || (String(plan?.source || '').match(/Google|Uber|Dados reais/i) ? 'Dados reais' : 'Estimativa'))} hint={plan?.humanSourceLabel === 'Dados reais' ? 'informação em tempo real' : 'cálculo calibrado'} />
       </div>

       <div className="mt-5 flex flex-wrap gap-2">
        <span className={`inline-flex items-center gap-1 rounded-2xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] ${locationAllowed ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-50'}`}><MapPin className="h-3.5 w-3.5" /> {locationAllowed ? 'localização permitida' : 'localização pendente'}</span>
        <span className={`inline-flex items-center gap-1 rounded-2xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] ${notificationsAllowed ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-50'}`}><Bell className="h-3.5 w-3.5" /> {notificationsAllowed ? 'notificações permitidas' : 'notificações pendentes'}</span>
        <span className="inline-flex items-center gap-1 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-50"><Plane className="h-3.5 w-3.5" /> {nearestAirportHint || 'aeroporto local: detectar GPS'}</span>
       </div>

       <div ref={vivoSectionRef} className="mt-5 rounded-[1.7rem] border border-fuchsia-200/20 bg-fuchsia-300/10 p-4 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
         <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-fuchsia-100/70">Extra</p>
          <h3 className="mt-1 text-xl font-black text-fuchsia-50">Chegar à base contratual</h3>
          <p className="mt-2 text-sm leading-6 text-fuchsia-50/80">O destino padrão é a base contratual. Se houver base virtual cadastrada no perfil, ela aparece automaticamente como opção de destino. Em bases com mais de um aeroporto, o CrewCheck mostra todos os aeroportos cabíveis. As opções usam fontes de voos e conexões cabíveis quando houver retorno confiável.</p>
          {restWindowHint && <p className="mt-2 rounded-2xl border border-emerald-200/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-50">{restWindowHint}</p>}
         </div>
         <Badge className="w-fit rounded-full border-0 bg-fuchsia-200 text-[#07111f]">{displayedExtraFlightOptions.length ? 'Fonte real' : 'Aguardando fonte real'}</Badge>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
         <label className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-100/70">Aeroporto onde estou</span>
          <input value={originAirportForExtra} onChange={(event) => { const value = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); setOriginAirportForExtra(value); localStorage.setItem('crewcheck_extra_origin_airport', value); }} placeholder="Ex.: BEL" className="mt-2 w-full rounded-xl border border-white/10 bg-white/90 px-3 py-3 text-sm font-black text-slate-950 outline-none placeholder:text-slate-500" />
          <button type="button" onClick={() => void detectOriginAirportFromLocation()} className="mt-2 w-full rounded-xl border border-fuchsia-200/25 bg-fuchsia-300/15 px-3 py-2 text-[11px] font-black text-fuchsia-50">Detectar aeroporto local pelo GPS</button>
         </label>
         <label className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-100/70">Destino</span>
          <select value={selectedExtraDestination} onChange={(event) => { setExtraTargetAirport(event.target.value); localStorage.setItem('crewcheck_extra_target_airport', event.target.value); }} className="mt-2 w-full rounded-xl border border-white/10 bg-white/90 px-3 py-3 text-sm font-black text-slate-950 outline-none">
           {extraDestinationOptions.map((code) => <option key={code} value={code}>{code}{contractualBaseOptions.includes(code) ? ' · base contratual' : ' · base virtual/perfil'}</option>)}
          </select>
         </label>
         <label className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-100/70">Data da pesquisa</span>
          <input type="date" value={extraFlightDate} onChange={(event) => { setExtraFlightDate(event.target.value); localStorage.setItem('crewcheck_extra_flight_date', event.target.value); }} className="mt-2 w-full rounded-xl border border-white/10 bg-white/90 px-3 py-3 text-sm font-black text-slate-950 outline-none" />
         </label>
         <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-100/70">Base virtual</span>
          <p className="mt-2 text-xs font-bold leading-5 text-fuchsia-50/85">{profileVirtualBaseAirport ? `${profileVirtualBaseAirport} · configurada no Perfil` : 'Não configurada no Perfil.'}</p>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-fuchsia-50/70">Para alterar: Configurações → Perfil. Ela aparece automaticamente como destino.</p>
         </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs font-semibold text-fuchsia-50/80">
         Extra organiza opções reais quando disponíveis, incluindo conexões e cargueiros retornados pelo radar. {extraFareUpdatedAt ? `Última atualização ${new Date(extraFareUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. ` : ''}O preço fica como informação secundária; a compra/consulta deve ser feita no canal da companhia aérea. Selecione uma opção para a Saída Inteligente calcular como chegar ao aeroporto no horário correto.
         {(extraFareLoading || extraBoardLoading) ? <div className="crewcheck-vivo-progress mt-3"><span /></div> : null}
        </div>
        {selectedExtraOption ? (
         <div className="mt-3 rounded-2xl border border-emerald-200/30 bg-emerald-300/12 px-4 py-3 text-xs font-black text-emerald-50">
          Opção selecionada para Saída Inteligente: {selectedExtraOption.route} · decolagem {cleanExtraClock(selectedExtraOption.legs?.[0]?.departure || selectedExtraOption.leaveAt) || selectedExtraOption.leaveAt} · apresentação {flightPresentationBuffer} min antes · aeroporto {selectedExtraDepartureAirport || 'a confirmar'}.
         </div>
        ) : null}

        <div className="mt-4 grid gap-3">
         {displayedExtraFlightOptions.map((item, index) => {
          const key = extraOptionKey(item, index);
          const stableKey = stableExtraOptionKey(item);
          return <ExtraFlightOptionCard key={key} item={item} index={index} expanded={expandedExtraOptionKey === key} canSeeAdmin={canAccessAdmin} selected={selectedExtraOptionKey === stableKey} onSelect={() => selectExtraOptionForDeparture(item)} onToggle={() => setExpandedExtraOptionKey((current) => current === key ? null : key)} />;
         })}
         {!displayedExtraFlightOptions.length && <p className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-slate-300">Informe o aeroporto onde você está para pesquisar voos até {selectedExtraDestination}. Sem retorno confiável, o CrewCheck não cria voo falso nem conexão inventada.</p>}
        </div>
       </div>

       <div className="mt-5 rounded-[1.7rem] border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
         <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/60">base de saída</p>
          <p className="mt-1 text-sm font-bold text-slate-100">{canAccessAdmin ? 'Use GPS, casa ou outra base para calcular distância real.' : 'Use GPS para calcular distância real. Endereço salvo fica em validação interna.'}</p>
         </div>
         {canAccessAdmin ? <button type="button" onClick={runRoutesDiagnostics} className="rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-50">Testar rotas</button> : null}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
         {(canAccessAdmin ? (['gps','home','base2'] as const) : (['gps'] as const)).map((item) => (
          <button key={item} type="button" onClick={() => { setOriginMode(item); localStorage.setItem('crewcheck_departure_origin_mode', item); }} className={`rounded-2xl border px-4 py-3 text-left transition ${originMode === item ? 'border-cyan-200/40 bg-cyan-300/15 text-cyan-50' : 'border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.07]'}`}>
           <p className="text-xs font-black uppercase tracking-[0.16em]">{item === 'gps' ? 'GPS atual' : item === 'home' ? 'Casa' : 'Outra base'}</p>
           <p className="mt-1 text-[11px] font-semibold text-slate-300">{item === 'gps' ? 'usa localização real' : item === 'home' ? (homeAddress || homeCep || 'CEP/endereço opcional') : (base2Label || 'base fora de casa')}</p>
          </button>
         ))}
        </div>
        {originMode !== 'gps' ? (
         <div className="mt-4 grid gap-3 lg:grid-cols-[8rem_minmax(0,1fr)_9rem]">
          {originMode === 'base2' ? <input value={base2Label} onChange={(e) => { setBase2Label(e.target.value); localStorage.setItem('crewcheck_base2_label', e.target.value); }} placeholder="Nome da base" className="rounded-2xl border border-white/10 bg-white/90 px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-cyan-300" /> : null}
          <input value={originMode === 'base2' ? base2Cep : homeCep} onChange={(e) => { originMode === 'base2' ? (setBase2Cep(e.target.value), localStorage.setItem('crewcheck_base2_cep', e.target.value)) : (setHomeCep(e.target.value), localStorage.setItem('crewcheck_home_cep', e.target.value)); }} placeholder="CEP" className="rounded-2xl border border-white/10 bg-white/90 px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-cyan-300" />
          <input value={originMode === 'base2' ? base2Address : homeAddress} onChange={(e) => { originMode === 'base2' ? (setBase2Address(e.target.value), localStorage.setItem('crewcheck_base2_address', e.target.value)) : (setHomeAddress(e.target.value), localStorage.setItem('crewcheck_home_address', e.target.value)); }} placeholder="Endereço completo, se quiser mais precisão" className="rounded-2xl border border-white/10 bg-white/90 px-3 py-3 text-sm font-bold text-slate-900 outline-none focus:border-cyan-300" />
          <button type="button" onClick={() => void validateSelectedAddress()} disabled={addressLoading} className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 disabled:opacity-60">{addressLoading ? 'Validando...' : 'Validar'}</button>
         </div>
        ) : null}
        {addressStatus ? <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-200">{addressStatus}</p> : null}
       </div>

       {plan?.leaveAtFullLabel ? <div className="mt-5 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-lg font-black leading-6 text-cyan-50">{plan.leaveAtFullLabel}</div> : null}
       {plan?.recommendedReason ? <div className="mt-5 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3 text-sm font-bold leading-6 text-emerald-50">CrewCheck recomenda: {plan.recommendedReason}</div> : null}

       {routeOptions.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
         {routeOptions.slice(0, 6).map((route, index) => (
          <div key={`${route.mode}-${route.leaveAtLabel}-${index}`} className={`rounded-3xl border p-4 ${index === 0 ? 'border-emerald-300/25 bg-emerald-300/10' : 'border-white/10 bg-white/[0.05]'}`}>
           <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/60">{index === 0 ? 'opção recomendada' : smartRouteModeLabel(route.mode)}</p>
           <p className="mt-2 text-2xl font-black text-white">{route.leaveAtLabel || '—'}</p>
           <p className="mt-1 text-sm font-bold text-slate-300">{route.durationMinutes || '—'} min · {route.mode === 'RIDE_APP' ? 'chamada + trajeto' : (route.label || 'rota')}</p><p className="mt-2 text-[11px] font-black uppercase tracking-[0.12em] text-cyan-100/70">{route.humanSourceLabel || route.routeQuality || 'Estimativa CrewCheck'}{route.pickupBufferMinutes ? ` · chamada média ${route.pickupBufferMinutes} min` : ''}</p>
           {route.mode === 'TRANSIT' && route.firstTransitDeparture ? <p className="mt-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-emerald-100">Primeiro embarque: {route.firstTransitDeparture}</p> : null}
           {route.mode === 'RIDE_APP' && route.fareLabel ? <p className="mt-2 rounded-2xl bg-white/10 px-3 py-2 text-xs font-black text-emerald-100">Estimativa: {route.fareLabel} · {route.fareConfidence || 'confirmar no app'}</p> : null}
           {route.mode === 'RIDE_APP' && route.rideApps?.length ? <div className="mt-3 flex flex-wrap gap-2">{route.rideApps.slice(0, 2).map((app) => <a key={app.id || app.name} href={app.webUrl || app.deepLink || app.mapsUrl || '#'} target="_blank" rel="noreferrer" className="rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-50">Abrir {app.name || 'app'}</a>)}</div> : null}
          </div>
         ))}
        </div>
       ) : null}


       {rideBoard.length ? (
        <div className="mt-5 rounded-[2rem] border border-cyan-300/25 bg-cyan-300/[0.08] p-4">
         <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/80">corrida por app</p>
          <span className="rounded-full border border-cyan-300/25 bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-50">Uber / 99 · confirmar no app</span>
         </div>
         <div className="mt-3 grid gap-2 md:grid-cols-2">
          {rideBoard.slice(0, 4).map((app, index) => (
           <div key={`${app.id}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
            <div className="flex items-start justify-between gap-2">
             <p className="text-sm font-black text-cyan-50">{app.name || 'Corrida'}</p>
             <span className="rounded-xl bg-white/10 px-2 py-1 text-xs font-black text-emerald-100">{app.fareLabel || 'confirmar'}</span>
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-cyan-50/75">{app.status || 'Confirmar no app'}{app.etaMinutes ? ` · ${app.etaMinutes} min` : ''}</p>
            <p className="text-[11px] font-bold text-slate-300">{app.fareConfidence || app.source || 'Estimativa CrewCheck'}</p>
            <div className="mt-3 flex flex-wrap gap-2">
             <a href={app.webUrl || app.deepLink || '#'} target="_blank" rel="noreferrer" className="rounded-2xl border border-cyan-200/25 bg-cyan-300/12 px-3 py-2 text-xs font-black text-cyan-50">Abrir {app.name || 'app'}</a>
             {app.mapsUrl ? <a href={app.mapsUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-black text-slate-100">Ver rota</a> : null}
            </div>
           </div>
          ))}
         </div>
         <p className="mt-3 text-xs leading-5 text-cyan-50/60">O CrewCheck exibe estimativa auditável e abre o app oficial com origem/destino preenchidos. O valor final sempre deve ser confirmado no aplicativo da corrida.</p>
        </div>
       ) : null}

       {transitBoard.length ? (
        <div className="mt-5 rounded-[2rem] border border-cyan-300/20 bg-cyan-300/[0.08] p-4">
         <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/75">horários ônibus/metrô</p>
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100">tempo real quando disponível</span>
         </div>
         <div className="mt-3 grid gap-2 md:grid-cols-2">
          {transitBoard.slice(0, 8).map((step, index) => (
           <div key={`${step.line}-${step.departureLabel}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
            <div className="flex items-start justify-between gap-2">
             <p className="text-sm font-black text-cyan-50">{step.mode || 'Transporte'} {step.line ? `· ${step.line}` : ''}</p>
             <span className="rounded-xl bg-white/10 px-2 py-1 text-xs font-black text-emerald-100">{step.departureLabel || 'a confirmar'}</span>
            </div>
            <p className="mt-1 text-xs font-semibold leading-5 text-cyan-50/75">{step.from || 'origem'} → {step.to || 'destino'}{step.arrivalLabel ? ` · chega ${step.arrivalLabel}` : ''}</p>
            {step.headsign ? <p className="text-[11px] font-bold text-slate-400">Sentido {step.headsign}</p> : null}
           </div>
          ))}
         </div>
         <p className="mt-3 text-xs leading-5 text-cyan-50/60">Os horários dependem da cobertura da operadora no Google Transit. Quando não houver tempo real, o CrewCheck usa a grade oficial prevista e mostra fallback conservador.</p>
        </div>
       ) : null}

       {error ? <div className="mt-5 rounded-3xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-bold leading-6 text-amber-50">{error}</div> : null}
       {plan?.warning ? <div className="crewcheck-maps-warning mt-5 rounded-3xl border px-4 py-3 text-sm font-bold leading-6">{plan.warning}</div> : null}
       {plan?.isLate ? <div className="mt-5 rounded-3xl border border-rose-300/30 bg-rose-400/15 px-4 py-3 text-sm font-black leading-6 text-rose-50">Atenção: pela estimativa atual, a saída recomendada é agora.</div> : null}

       <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button onClick={calculate} disabled={permission === 'requesting' || !canCalculate} className="cc-button-primary rounded-2xl px-6 py-4 text-sm font-black shadow-xl transition active:scale-95 disabled:opacity-50">{permission === 'requesting' ? 'Aguardando permissão...' : (locationAllowed ? 'Calcular / recalcular agora' : 'Ativar localização e calcular')}</button>
        <button type="button" onClick={() => openGoogleDestination(googleRouteUrl, tomTomRouteFallbackUrl)} className="crewcheck-secondary-cta rounded-2xl px-6 py-4 text-center text-sm font-black transition"><ExternalLink className="mr-2 inline h-4 w-4" /> Abrir no Google Maps</button>
        {rideBoard[0]?.webUrl ? <a href={rideBoard[0].webUrl} target="_blank" rel="noreferrer" className="rounded-2xl border border-cyan-200/25 bg-cyan-300/12 px-6 py-4 text-center text-sm font-black text-cyan-50 transition hover:bg-cyan-300/18"><Car className="mr-2 inline h-4 w-4" /> Abrir corrida</a> : null}
        <button onClick={requestAppNotifications} className="rounded-2xl border border-emerald-200/25 bg-emerald-300/10 px-6 py-4 text-sm font-black text-emerald-50 transition hover:bg-emerald-300/15"><Bell className="mr-2 inline h-4 w-4" /> {notificationsAllowed ? 'Notificações permitidas' : 'Ativar notificações'}</button>
        <button onClick={scheduleCurrentDepartureAlert} className="rounded-2xl border border-cyan-200/20 bg-cyan-300/10 px-6 py-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/15"><Clock className="mr-2 inline h-4 w-4" /> Agendar hora de sair</button>
        <button onClick={onOpenRoster} className="rounded-2xl border border-white/10 px-6 py-4 text-sm font-black text-slate-100 transition hover:bg-white/10"><CalendarDays className="mr-2 inline h-4 w-4" /> Ver escala</button>
       </div>
      </div>

      <aside className="border-t border-white/10 bg-white/[0.045] p-6 lg:border-l lg:border-t-0">
       <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/70">Configuração rápida</p>
       <div className="mt-5 space-y-4">
        <SmartDepartureField label="Aeroporto/base da apresentação">
         <select value={airport} onChange={(event) => { setAirport(event.target.value); localStorage.setItem('crewcheck_preferred_airport', event.target.value); }} className="w-full rounded-2xl border border-white/10 bg-[#07111F]/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-cyan-300">
          {SMART_DEPARTURE_AIRPORTS.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
         </select>
        </SmartDepartureField>
        <SmartDepartureField label="Margem de chegada">
         <select value={margin} onChange={(event) => setMargin(Number(event.target.value))} className="w-full rounded-2xl border border-white/10 bg-[#07111F]/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-cyan-300">
          {[15,20,25,30,40,60].map((item) => <option key={item} value={item}>{item} minutos antes</option>)}
         </select>
        </SmartDepartureField>
        <SmartDepartureField label="Transporte">
         <select value={mode} onChange={(event) => { const value = event.target.value as SmartDepartureMode; setMode(value); localStorage.setItem('crewcheck_departure_mode', value); }} className="w-full rounded-2xl border border-white/10 bg-[#07111F]/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-cyan-300">
          {SMART_DEPARTURE_MODE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label} · {item.hint}</option>)}
         </select>
         <p className="mt-2 text-[11px] font-semibold normal-case leading-5 tracking-normal text-cyan-50/65">Selecionado: {selectedModeOption.label}. No Automático, o CrewCheck escolhe o melhor deslocamento disponível e só considera voo quando a opção de longa distância estiver liberada.</p>
        </SmartDepartureField>
        <SmartDepartureField label="Longa distância">
         <button type="button" onClick={() => { const next = !autoFlightOver250; setAutoFlightOver250(next); localStorage.setItem('crewcheck_auto_flight_over_250', next ? 'true' : 'false'); localStorage.setItem('crewcheck_departure_auto_flight_over_250', next ? 'true' : 'false'); }} className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${autoFlightOver250 ? 'border-emerald-300/35 bg-emerald-300/15 text-emerald-50' : 'border-white/10 bg-[#07111F]/70 text-slate-200'}`}>
          {autoFlightOver250 ? 'Voo permitido em trajetos longos' : 'Voo desligado em trajetos longos'}
          <span className="mt-1 block text-[11px] font-semibold leading-5 text-slate-300">O voo só será considerado quando esta opção estiver ligada; caso contrário, o CrewCheck mantém as alternativas terrestres.</span>
         </button>
        </SmartDepartureField>
        <SmartDepartureField label="Voo selecionado · apresentação">
         <select value={flightPresentationBuffer} onChange={(event) => { const value = Number(event.target.value); setFlightPresentationBuffer(value); localStorage.setItem('crewcheck_flight_presentation_buffer_minutes', String(value)); }} className="w-full rounded-2xl border border-white/10 bg-[#07111F]/70 px-4 py-3 text-sm font-black text-white outline-none focus:border-cyan-300">
          {[45,55,60,75,90,120].map((item) => <option key={item} value={item}>{item} minutos antes da decolagem</option>)}
         </select>
         <p className="mt-2 text-[11px] font-semibold normal-case leading-5 tracking-normal text-cyan-50/65">{flightPresentationTargetLabel}. A Saída Inteligente calcula a chegada ao aeroporto de origem antes da decolagem do voo escolhido.</p>
        </SmartDepartureField>
       </div>
       <div className="mt-6 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm leading-6 text-emerald-50/90">
        <b>LGPD:</b> a localização é usada sob permissão e apenas para calcular essa rota. As credenciais dos serviços ficam protegidas e não aparecem no aplicativo.
       </div>
       <div className="mt-4 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-xs leading-6 text-cyan-50/80">
        <b>Central de confiança:</b> o CrewCheck mostra se a rota veio do Google Routes, Directions, consulta de corrida, app oficial ou fallback conservador. Quando o dado não for confirmado, o card sinaliza para confirmar no app oficial.
       </div>
       <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-xs leading-6 text-slate-300">
        Dica premium: no modo Automático o CrewCheck compara trânsito, transporte público, Uber/99 e moto/app. O voo só entra em trajetos longos quando a opção estiver ativada pelo usuário.
        {plan?.distancePolicy ? <span className="mt-2 block text-cyan-50">Decisão operacional: {plan.distancePolicy.decision === 'flight' ? 'voo combinado' : 'deslocamento terrestre'}.</span> : null}
       </div>
      </aside>
     </div>
    </section>
   </div>
  </div>
 );
}

function SmartDepartureField({ label, children }: { label: string; children: ReactNode }) {
 return <label className="block space-y-2 text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70"><span>{label}</span>{children}</label>;
}

function SmartDepartureMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
 return <div className="crewcheck-smart-metric rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-xl shadow-black/10"><p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-cyan-100/60">{label}</p><p className="crewcheck-smart-metric-value mt-2 text-2xl font-black tracking-tight text-white">{value}</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-300">{hint}</p></div>;
}

function IFlightBetaUserPanel({ onBack, onOpenImport, onOpenSupport }: { onBack: () => void; onOpenImport: () => void; onOpenSupport: () => void }) {
 return (
  <div className="min-h-screen overflow-x-hidden overflow-y-auto bg-[#07111F] px-5 py-8 text-white">
   <div className="mx-auto max-w-4xl">
    <HeaderBack title="iFlight automático" subtitle="Recurso em desenvolvimento" onBack={onBack} />
    <div className="mt-6 overflow-hidden rounded-[2rem] border border-orange-300/20 bg-white/[0.06] shadow-2xl shadow-black/25 backdrop-blur-2xl">
     <div className="bg-gradient-to-r from-orange-300/20 via-cyan-300/10 to-fuchsia-300/20 p-6 md:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
       <div>
        <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-100/80">beta privado</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">Upload automático via iFlight ainda está em validação.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200/85">Por segurança e LGPD, o CrewCheck ainda não libera a sincronização automática completa para usuários finais. Quando estiver estável, ela aparecerá aqui sem precisar atualizar sua conta.</p>
       </div>
       <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.7rem] bg-orange-300/15 text-orange-100"><Plane className="h-10 w-10" /></div>
      </div>
     </div>
     <div className="grid gap-4 p-5 md:grid-cols-3 md:p-7">
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"><Shield className="mb-3 h-7 w-7 text-emerald-200" /><b>Credenciais protegidas</b><p className="mt-2 text-sm leading-6 text-slate-300">Senha e MFA corporativos não são salvos pelo CrewCheck.</p></div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"><FileText className="mb-3 h-7 w-7 text-cyan-200" /><b>PDF manual liberado</b><p className="mt-2 text-sm leading-6 text-slate-300">Use PDF exportado pelo CrewTopia ou CrewRosterReport/AIMS enquanto o iFlight automático fica em validação privada.</p></div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5"><AlertTriangle className="mb-3 h-7 w-7 text-amber-200" /><b>Fase de testes</b><p className="mt-2 text-sm leading-6 text-slate-300">Encontrou divergência? Envie o PDF/print pela aba Suporte.</p></div>
     </div>
     <div className="flex flex-col gap-3 border-t border-white/10 p-5 md:flex-row md:p-7">
      <button onClick={onOpenImport} className="rounded-2xl bg-white px-6 py-3 text-sm font-black text-[#07111F] shadow-lg transition hover:bg-cyan-50"><CloudUpload className="mr-2 inline h-4 w-4" /> Importar PDF agora</button>
      <button type="button" onClick={onOpenSupport} className="rounded-2xl border border-white/10 px-6 py-3 text-center text-sm font-black text-cyan-50 transition hover:bg-white/10"><Mail className="mr-2 inline h-4 w-4" /> Enviar feedback</button>
     </div>
    </div>
   </div>
  </div>
 );
}

function ImportScreen({ userLabel, roleSelection, onRoleSelectionChange, isDragging, isProcessing, error, fileName, fileInputRef, isAdmin, onOpenIFlight, onBack, onDrop, onDragOver, onDragLeave, onFileInput, onDemoMode, onLogout }: {
 userLabel: string;
 roleSelection: CrewRoleSelection;
 onRoleSelectionChange: (value: CrewRoleSelection) => void;
 isDragging: boolean;
 isProcessing: boolean;
 error: string | null;
 fileName: string | null;
 fileInputRef: RefObject<HTMLInputElement>;
 isAdmin: boolean;
 onOpenIFlight: () => void;
 onBack: () => void;
 onDrop: (event: DragEvent) => void;
 onDragOver: (event: DragEvent) => void;
 onDragLeave: () => void;
 onFileInput: (event: ChangeEvent<HTMLInputElement>) => void;
 onDemoMode: () => void;
 onLogout: () => void;
}) {
 const cloudFileInputRef = useRef<HTMLInputElement | null>(null);
 const openCloudImport = () => {
  const nativeBridge = (window as any).AndroidCrewCheckNative;
  if (nativeBridge?.openGoogleDrivePdfPicker) {
   try { nativeBridge.openGoogleDrivePdfPicker(); return; } catch {}
  }
  cloudFileInputRef.current?.click();
  try { window.setTimeout(() => { if (document.visibilityState === 'visible' && !isProcessing) window.open('https://drive.google.com/drive/my-drive?hl=pt-br', '_blank', 'noopener,noreferrer'); }, 650); } catch {}
 };
 return (
  <div className="min-h-screen overflow-x-hidden overflow-y-auto bg-[#07111F] text-white crewcheck-import-screen">
   <div className="pointer-events-none fixed inset-0">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.35),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(236,72,153,0.25),transparent_32%),linear-gradient(135deg,#07111F_0%,#0B1730_45%,#0A1020_100%)]" />
    <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.85) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.85) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
   </div>

   <div className="relative z-10">
    <header className="container py-6">
     <div className="flex items-center justify-between gap-4 crewcheck-light-card rounded-3xl border border-white/10 bg-white/[0.06] px-5 py-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <button onClick={onBack} className="flex items-center gap-3 text-left">
       <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-cyan-100"><ArrowLeft className="h-5 w-5" /></div>
       <div>
        <h1 className="text-lg font-black tracking-tight">Nova escala</h1>
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-100/70">PDF oficial · CrewTopia/AIMS · LGPD</p>
       </div>
      </button>
      <div className="hidden items-center gap-2 md:flex">
       <Badge className="border-white/10 bg-white/10 text-cyan-100 hover:bg-white/10"><Lock className="mr-1.5 h-3.5 w-3.5" /> Conta protegida</Badge>
       <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-cyan-100"><UserRound className="h-4 w-4" /><span className="max-w-[11rem] truncate">{userLabel}</span></div>
       <button onClick={onLogout} className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-cyan-100 hover:bg-white/15"><LogOut className="mr-1 inline h-3.5 w-3.5" /> Sair</button>
      </div>
     </div>
    </header>

    <main className="container pb-16 pt-6 md:pb-24 md:pt-10">
     <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(28rem,0.8fr)] xl:grid-cols-[minmax(0,1fr)_minmax(30rem,0.74fr)]">
      <div className="cc-import-hero-panel">
       <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm text-cyan-100 shadow-lg shadow-cyan-950/30"><Sparkles className="h-4 w-4" /> Upload direto de PDF oficial com LGPD</div>
       <h2 className="max-w-4xl text-4xl font-black leading-[1.04] tracking-tight md:text-6xl">Envie sua escala em PDF e veja tudo organizado em segundos.</h2>
       <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200/80">Aceita PDF exportado pelo CrewTopia, CrewRosterReport/AIMS ou arquivo oficial disponível para o usuário. O CrewCheck interpreta voos, folgas, sobreavisos, pernoites, treinamentos, rotina e alertas.</p>
       <div className="mt-8 grid max-w-3xl grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon={Radar} value="PDF" label="CrewTopia/AIMS" />
        <Kpi icon={Shield} value="ACT" label="piloto ou comissário" />
        <Kpi icon={CalendarDays} value="Google" label="calendário sem duplicar" />
        <Kpi icon={Dumbbell} value="Rotina" label="sugestão dentro da escala" />
       </div>
      </div>

      <Card className="crewcheck-light-card relative overflow-hidden rounded-[2rem] border-white/10 bg-white/[0.08] p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-2xl">
       <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-amber-300" />
       <div className="crewcheck-light-card rounded-[1.5rem] border border-white/10 bg-[#0B1730]/70 p-5 md:p-7">
        <div className="mb-5 flex items-center justify-between gap-4">
         <div><p className="text-sm font-semibold text-cyan-100">Upload seguro</p><h3 className="text-2xl font-black tracking-tight">Analisar escala</h3></div>
         <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200"><FileText className="h-6 w-6" /></div>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
         <label className="crewcheck-primary-cta relative inline-flex cursor-pointer items-center justify-center gap-3 rounded-[1.35rem] px-5 py-4 text-sm font-black shadow-2xl transition active:scale-[0.99]"><input ref={fileInputRef} type="file" accept="application/pdf,.pdf,application/octet-stream" onChange={onFileInput} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /><FileText className="h-5 w-5" />Importar PDF agora</label>
         <button type="button" onClick={openCloudImport} className="crewcheck-secondary-cta relative inline-flex cursor-pointer items-center justify-center gap-3 rounded-[1.35rem] px-5 py-4 text-sm font-black shadow-xl transition active:scale-[0.99]"><input ref={cloudFileInputRef} type="file" accept="application/pdf,.pdf,application/octet-stream" onChange={onFileInput} className="hidden" /><CloudUpload className="h-5 w-5" />Google Drive / iCloud</button>
        </div>

        <div className="mb-5 rounded-[1.2rem] border border-amber-300/20 bg-amber-300/10 p-4 text-sm leading-6 text-amber-50/90">
         <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" /><p><strong>Fase de testes privados:</strong> o CrewCheck ainda não tem data oficial de lançamento. As informações podem conter divergências; confira sempre com sua escala oficial. Se encontrar erro, abra a aba <strong>Suporte</strong> e envie o PDF ou print para ajustarmos o sistema.</p></div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2">
         <div className="rounded-[1.2rem] border border-emerald-300/20 bg-emerald-300/10 p-4"><p className="text-sm font-black text-emerald-100">Importação de PDF oficial</p><p className="mt-1 text-xs leading-5 text-emerald-50/80">Selecione o PDF exportado pelo CrewTopia, CrewRosterReport/AIMS ou fonte oficial disponível.</p></div>
         <div className="rounded-[1.2rem] border border-cyan-300/15 bg-cyan-300/10 p-4"><p className="text-sm font-black text-cyan-100">Sincronização privada</p><p className="mt-1 text-xs leading-5 text-cyan-50/80">A escala fica vinculada à sua conta e não aparece para outros usuários do CrewCheck.</p></div>
        </div>

        <div className="crewcheck-light-card mb-5 rounded-[1.2rem] border border-white/10 bg-white/[0.06] p-4">
         <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-cyan-100">ACT aplicável</p><p className="text-xs leading-5 text-slate-300">O sistema tenta identificar pelo PDF, mas você pode forçar a função correta.</p></div><Badge className="border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/10">2025/2027</Badge></div>
         <select value={roleSelection} onChange={(event) => onRoleSelectionChange(event.target.value as CrewRoleSelection)} className="h-12 w-full rounded-2xl border border-white/15 bg-[#07111F] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300">
          <option value="auto">Detectar automaticamente pela escala</option>
          <option value="cabin">Aplicar ACT Comissários</option>
          <option value="pilot">Aplicar ACT Pilotos</option>
         </select>
        </div>

        <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className={`crewcheck-light-card crewcheck-import-dropzone-v1109 relative rounded-[1.35rem] border-2 border-dashed p-8 text-center transition-all duration-300 ${isDragging ? 'scale-[1.015] border-cyan-300 bg-cyan-300/10' : 'border-white/15 bg-white/[0.04] hover:border-fuchsia-300/60 hover:bg-white/[0.07]'} ${isProcessing ? 'pointer-events-none opacity-70' : ''}`}>
         {isProcessing ? (
          <div className="flex flex-col items-center gap-4 py-6"><div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-300 border-t-transparent" /><div><p className="text-lg font-bold">Interpretando {fileName || 'PDF'}...</p><p className="mt-1 text-sm text-slate-300">Lendo cabeçalho, trechos, jornadas, folgas e totais.</p></div></div>
         ) : (
          <div className="flex flex-col items-center gap-5 py-4">
           <div className="flex h-20 w-20 items-center justify-center rounded-[1.7rem] bg-gradient-to-br from-cyan-300 to-fuchsia-400 text-[#07111F] shadow-xl shadow-cyan-500/25"><Upload className="h-9 w-9" /></div>
           <div><p className="text-xl font-black">Arraste sua escala em PDF aqui</p><p className="mt-2 text-sm text-slate-300">CrewRosterReport, CrewTopia ou AIMS — PDF oficial salvo em Arquivos</p></div>
           <div className="flex flex-col items-center gap-3 sm:flex-row"><label className="crewcheck-premium-file-button relative inline-flex cursor-pointer items-center justify-center gap-3 px-7 py-4 text-sm font-black shadow-lg transition active:scale-[0.99]"><input ref={fileInputRef} type="file" accept="application/pdf,.pdf,application/octet-stream" onChange={onFileInput} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /><FileText className="h-5 w-5" />Escolher PDF no dispositivo <ChevronRight className="h-5 w-5" /></label><button type="button" onClick={onDemoMode} className="rounded-[1.35rem] border border-cyan-300/25 bg-cyan-300/10 px-6 py-4 text-sm font-black text-cyan-50 shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-300/15"><Sparkles className="mr-2 inline h-4 w-4" />Ver demonstração</button></div>
           <p className="max-w-md text-xs leading-5 text-slate-400">No iPad/iPhone, use o PDF oficial salvo em Arquivos. Para evitar escala fora de ordem, o CrewCheck prioriza a leitura segura do servidor e não usa leitura local quando isso puder gerar erro. A demonstração usa dados fictícios e é desativada ao importar sua primeira escala real.</p>
          </div>
         )}
        </div>

        {error && <div className="mt-4 flex gap-3 rounded-2xl border border-red-300/20 bg-red-500/10 p-4 text-left text-red-100"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm leading-6">{error}</p></div>}

        <div className="mt-5 grid gap-3 text-sm text-slate-200/85">
         <TrustLine icon={CheckCircle2} text="Leitura segura pelo CrewCheck com apoio local no app." />
         <TrustLine icon={CheckCircle2} text="Gera painel, alertas, rotina, PDF, calendário e sincronização." />
         <TrustLine icon={CheckCircle2} text="Salvamento privado sem duplicar histórico." />
        </div>
       </div>
      </Card>
     </section>
    </main>
   </div>
  </div>
 );
}


type FlightBoardType = 'departure' | 'arrival';

type ExternalRadarLink = { label: string; url: string; kind?: string };

type AirportBoardRow = {
 flightNumber: string;
 airlineCode?: string | null;
 airlineName?: string | null;
 destination?: string | null;
 origin?: string | null;
 gate?: string | null;
 terminal?: string | null;
 scheduledTime?: string | null;
 confirmedTime?: string | null;
 status?: string | null;
 type?: FlightBoardType;
 externalLinks?: ExternalRadarLink[];
 source?: string | null;
 relatedAirport?: string | null;
 arrivalTime?: string | null;
 departureTime?: string | null;
 priceLabel?: string | null;
 priceSource?: string | null;
 priceConfidence?: string | null;
 trafficScope?: AirportBoardTrafficFilter;
 serviceType?: string | null;
 isCargo?: boolean | null;
};

type RadarDiagnostic = { provider?: string; endpoint?: string; baseUrl?: string; ok?: boolean; status?: number; reason?: string; count?: number; throttled?: boolean; waitMs?: number; cached?: boolean };


const BOARD_AIRPORTS = [
 { code: 'BSB', city: 'Brasília' },
 { code: 'GRU', city: 'Guarulhos' },
 { code: 'CGH', city: 'Congonhas' },
 { code: 'SDU', city: 'Santos Dumont' },
 { code: 'GIG', city: 'Galeão' },
 { code: 'CNF', city: 'Confins' },
 { code: 'VCP', city: 'Viracopos' },
 { code: 'SSA', city: 'Salvador' },
 { code: 'REC', city: 'Recife' },
 { code: 'FOR', city: 'Fortaleza' },
 { code: 'NAT', city: 'Natal' },
 { code: 'POA', city: 'Porto Alegre' },
 { code: 'CWB', city: 'Curitiba' },
 { code: 'MAO', city: 'Manaus' },
];

const BOARD_AIRLINES = [
 { code: '', label: 'Todas' },
 { code: 'LA', label: 'LATAM' },
 { code: 'G3', label: 'GOL' },
 { code: 'AD', label: 'Azul' },
 { code: 'TP', label: 'TAP' },
 { code: 'CM', label: 'Copa' },
 { code: 'AA', label: 'American' },
];

const BOARD_AIRPORT_COORDS: Record<string, { lat: number; lon: number; city: string }> = {
 BSB: { lat: -15.8711, lon: -47.9186, city: 'Brasília' },
 GRU: { lat: -23.4356, lon: -46.4731, city: 'Guarulhos' },
 CGH: { lat: -23.6267, lon: -46.6554, city: 'Congonhas' },
 SDU: { lat: -22.9105, lon: -43.1631, city: 'Santos Dumont' },
 GIG: { lat: -22.8099, lon: -43.2506, city: 'Galeão' },
 CNF: { lat: -19.6357, lon: -43.9669, city: 'Confins' },
 VCP: { lat: -23.0074, lon: -47.1345, city: 'Viracopos' },
 SSA: { lat: -12.9086, lon: -38.3225, city: 'Salvador' },
 REC: { lat: -8.1265, lon: -34.9236, city: 'Recife' },
 FOR: { lat: -3.7763, lon: -38.5326, city: 'Fortaleza' },
 NAT: { lat: -5.7681, lon: -35.3761, city: 'Natal' },
 POA: { lat: -29.9944, lon: -51.1714, city: 'Porto Alegre' },
 CWB: { lat: -25.5327, lon: -49.1758, city: 'Curitiba' },
 MAO: { lat: -3.0386, lon: -60.0497, city: 'Manaus' },
};

const BRAZILIAN_AIRPORT_IATA = new Set([
 'AJU','BEL','BPS','BSB','CGB','CGH','CGR','CNF','CWB','FLN','FOR','GIG','GRU','GYN','IGU','IOS','JPA','MAO','MCZ','MCP','MOC','NAT','NVT','PMW','POA','PVH','RAO','REC','SDU','SLZ','SSA','THE','UDI','VCP','VIX','XAP'
]);

const CARGO_AIRLINE_HINTS = new Set(['5X','FX','M3','QT','CV','K4','0S','SID','TTL','TOTAL','FDX','UPS','GTI','ABX','BOX','N8','KZ','CK','CARGOLUX','SWR']);

function normalizeAirportCodeForScope(value?: string | null): string {
 return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function isBrazilianAirportForScope(value?: string | null): boolean {
 const code = normalizeAirportCodeForScope(value);
 return Boolean(code && BRAZILIAN_AIRPORT_IATA.has(code));
}

function isCargoAirportBoardRow(row?: AirportBoardRow | null): boolean {
 if (!row) return false;
 if (row.isCargo === true || row.trafficScope === 'cargo') return true;
 const text = `${row.airlineCode || ''} ${row.airlineName || ''} ${row.flightNumber || ''} ${row.source || ''} ${row.serviceType || ''}`.toUpperCase();
 if ([...CARGO_AIRLINE_HINTS].some((hint) => new RegExp(`\b${hint}\b`, 'i').test(text))) return true;
 return /(CARGO|FREIGHT|CARGUEIR|SIDERAL|TOTAL LINHAS AEREAS|TOTAL CARGO|LATAM CARGO|ABSA|FEDEX|UPS|ATLAS AIR|CARGOLUX)/i.test(text);
}

type AirportBoardTrafficFilter = 'all' | 'domestic' | 'international' | 'cargo' | 'unknown';
type AirportBoardTimeFilter = 'all' | 'morning' | 'afternoon' | 'night';

function classifyAirportBoardRow(row: AirportBoardRow): AirportBoardTrafficFilter {
 if (row.trafficScope && ['domestic','international','cargo','unknown'].includes(row.trafficScope)) return row.trafficScope;
 if (isCargoAirportBoardRow(row)) return 'cargo';
 const origin = normalizeAirportCodeForScope(row.origin);
 const destination = normalizeAirportCodeForScope(row.destination);
 if (!origin || !destination) return 'unknown';
 const originBR = isBrazilianAirportForScope(origin);
 const destinationBR = isBrazilianAirportForScope(destination);
 if (originBR && destinationBR) return 'domestic';
 if (originBR || destinationBR) return 'international';
 return 'international';
}

function trafficScopeLabel(scope: AirportBoardTrafficFilter): string {
 if (scope === 'domestic') return 'Doméstico';
 if (scope === 'international') return 'Internacional';
 if (scope === 'cargo') return 'Cargueiro';
 if (scope === 'unknown') return 'A classificar';
 return 'Todos';
}

function trafficScopeBadgeClass(scope: AirportBoardTrafficFilter): string {
 if (scope === 'domestic') return 'border-emerald-200/20 bg-emerald-300/10 text-emerald-100';
 if (scope === 'international') return 'border-sky-200/20 bg-sky-300/10 text-sky-100';
 if (scope === 'cargo') return 'border-amber-200/30 bg-amber-300/15 text-amber-100';
 if (scope === 'unknown') return 'border-slate-200/20 bg-white/10 text-slate-200';
 return 'border-cyan-200/20 bg-cyan-300/10 text-cyan-100';
}

function airportDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
 const toRad = (value: number) => value * Math.PI / 180;
 const r = 6371;
 const dLat = toRad(lat2 - lat1);
 const dLon = toRad(lon2 - lon1);
 const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
 return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestBoardAirportFromCoords(lat: number, lon: number) {
 return Object.entries(BOARD_AIRPORT_COORDS)
  .map(([code, info]) => ({ code, ...info, distanceKm: airportDistanceKm(lat, lon, info.lat, info.lon) }))
  .sort((a, b) => a.distanceKm - b.distanceKm)[0] || null;
}

function normalizeAirlineIdentity(...values: Array<string | null | undefined>) {
 const source = values.filter(Boolean).join(' ').toUpperCase();
 if (/\b(LA|JJ|TAM)\b/.test(source) || source.includes('LATAM')) return { code: 'LA', label: 'LATAM', logo: '/assets/airlines/latam.png', badge: '/assets/airlines/latam-badge.png', missingLogo: false };
 if (/\b(G3|GLO)\b/.test(source) || source.includes('GOL')) return { code: 'G3', label: 'GOL', logo: '/assets/airlines/gol.png', badge: '/assets/airlines/gol-badge.png', missingLogo: false };
 if (/\b(AD|AZU)\b/.test(source) || source.includes('AZUL')) return { code: 'AD', label: 'Azul', logo: '/assets/airlines/azul.png', badge: '/assets/airlines/azul-badge.png', missingLogo: false };
 if (/\b(TP|TAP)\b/.test(source) || source.includes('TAP')) return { code: 'TP', label: 'TAP', logo: '/assets/airlines/tap.png', badge: '/assets/airlines/tap-badge.png', missingLogo: false };
 if (/\b(TTL|TTL|TOTAL)\b/.test(source) || source.includes('TOTAL')) return { code: 'TTL', label: 'Total', logo: '/assets/airlines/total.png', badge: '/assets/airlines/total-badge.png', missingLogo: false };
 if (/\b(SID|SIDERAL|0S)\b/.test(source) || source.includes('SIDERAL')) return { code: 'SID', label: 'Sideral', logo: '/assets/airlines/sideral.png', badge: '/assets/airlines/sideral-badge.png', missingLogo: false };
 const label = values.find(Boolean) || 'Cia aérea';
 return { code: String(values[0] || '').toUpperCase(), label, logo: '/assets/airlines/crewcheck-airline.svg', badge: '/assets/airlines/crewcheck-airline.svg', missingLogo: true };
}


function displayFlightNumberForLogo(flightNumber?: string | null, code?: string | null, name?: string | null): string {
 const raw = String(flightNumber || '').replace(/\s+/g, '').toUpperCase();
 if (!raw) return '—';
 const identity = normalizeAirlineIdentity(code, name, raw);
 const prefixesByIdentity: Record<string, string[]> = {
  LA: ['LA', 'JJ'],
  G3: ['G3'],
  AD: ['AD'],
  TP: ['TP'],
  TTL: ['TTL', 'T0', '9T'],
  SID: ['SID', '0S'],
 };
 const prefixes = prefixesByIdentity[identity.code] || [String(code || '').toUpperCase()].filter(Boolean);
 for (const prefix of prefixes.sort((a, b) => b.length - a.length)) {
  if (prefix && raw.startsWith(prefix) && /^\d/.test(raw.slice(prefix.length))) return raw.slice(prefix.length);
 }
 return raw;
}

function AirlineLogoBadge({ code, name, compact = false }: { code?: string | null; name?: string | null; compact?: boolean }) {
 const identity = normalizeAirlineIdentity(code, name);
 if (!identity.logo) {
  return <span className={`inline-flex items-center justify-center rounded-full px-3 py-1 font-black ${compact ? 'text-[10px]' : 'text-xs'} ${airlineTheme(identity.code)}`}>{identity.label}</span>;
 }
 return (
  <span className={`crewcheck-airline-logo-badge inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white ${compact ? 'is-compact h-12 min-w-24 max-w-[9.5rem] px-3' : 'h-14 min-w-32 max-w-[11rem] px-4'}`} title={identity.label}>
   <img src={identity.logo} alt={identity.label} className={`crewcheck-airline-logo-img ${compact ? 'max-h-8 max-w-[7.2rem]' : 'max-h-10 max-w-[9rem]'} object-contain`} loading="lazy" />
  </span>
 );
}

function airlineNameForEmail(code?: string | null, name?: string | null) {
 return normalizeAirlineIdentity(code, name).label;
}


function buildFlightBoardFallbackFromRoster(airport: string, type: FlightBoardType, airlineFilter = ''): AirportBoardRow[] {
 try {
  const roster = JSON.parse(sessionStorage.getItem('crewcheck_roster') || 'null') as CrewRoster | null;
  const rows: AirportBoardRow[] = [];
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  for (const day of roster?.days || []) {
   const date = parseDatePtBrOrIsoForBoard(day.date);
   const dateKey = date.toISOString().slice(0, 10);
   for (const leg of day.legs || []) {
    const flightNumber = String(leg.flightNumber || '').trim();
    if (!flightNumber) continue;
    const code = flightNumber.replace(/\s+/g, '').slice(0, 2).toUpperCase();
    if (airlineFilter && code !== airlineFilter) continue;
    const isDeparture = String(leg.origin || '').toUpperCase() === airport;
    const isArrival = String(leg.destination || '').toUpperCase() === airport;
    if ((type === 'departure' && !isDeparture) || (type === 'arrival' && !isArrival)) continue;
    rows.push({
     flightNumber,
     airlineCode: code,
     airlineName: code === 'LA' ? 'LATAM' : code || 'Cia',
     destination: leg.destination || '',
     origin: leg.origin || '',
     gate: '—',
     terminal: '—',
     scheduledTime: type === 'departure' ? leg.departureTime : leg.arrivalTime,
     confirmedTime: type === 'departure' ? leg.departureTime : leg.arrivalTime,
     status: dateKey < todayKey ? 'Realizado' : dateKey === todayKey ? 'Escala atual' : 'Previsto',
     type,
     externalLinks: [{ label: 'Abrir busca do voo', url: `https://www.google.com/search?q=${encodeURIComponent(flightNumber + ' flight status')}`, kind: 'search' }],
    });
   }
  }
  return rows.sort((a, b) => String(a.confirmedTime || '').localeCompare(String(b.confirmedTime || ''))).slice(0, 80);
 } catch { return []; }
}

function parseDatePtBrOrIsoForBoard(value: string): Date {
 const raw = String(value || '').trim();
 const pt = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
 if (pt) return new Date(Number(pt[3].length === 2 ? `20${pt[3]}` : pt[3]), Number(pt[2]) - 1, Number(pt[1]));
 const iso = new Date(raw);
 return Number.isFinite(iso.getTime()) ? iso : new Date();
}


function stripBoardAccent(value: string): string {
 return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function airportMonitorStatusLabel(status?: string | null): string {
 const s = stripBoardAccent(status || '');
 if (!s) return 'Confirmado';
 if (s.includes('ultima chamada') || s.includes('last call')) return 'Última chamada';
 if (s.includes('embarque imediato') || s.includes('boarding') || s.includes('embarque')) return 'Embarque imediato';
 if (s.includes('encerrado') || s.includes('finalizado') || s.includes('closed')) return 'Voo finalizado';
 if (s.includes('cancel')) return 'Cancelado';
 if (s.includes('atras') || s.includes('delay')) return 'Atrasado';
 if (s.includes('pousou') || s.includes('landed') || s.includes('arrived')) return 'Voo finalizado';
 if (s.includes('decol') || s.includes('departed') || s.includes('airborne')) return 'Voo finalizado';
 if (s.includes('program') || s.includes('sched') || s.includes('previst')) return 'Confirmado';
 if (s.includes('no horario') || s.includes('on time')) return 'No horário';
 return String(status || 'Confirmado');
}

function isAirportBoardFinalized(row: AirportBoardRow): boolean {
 const s = stripBoardAccent(row.status || '');
 return /(voo finalizado|finalizado|encerrado|decolad|pousou|realizado|departed|arrived|landed|closed)/i.test(s);
}

function cleanAirportMonitorRows(rows: AirportBoardRow[]): AirportBoardRow[] {
 return (Array.isArray(rows) ? rows : [])
  .map((row) => ({ ...row, status: airportMonitorStatusLabel(row.status) }))
  .filter((row) => row.flightNumber || row.destination || row.origin)
  .filter((row) => !isAirportBoardFinalized(row))
  .sort((a, b) => String(a.confirmedTime || a.scheduledTime || '99:99').localeCompare(String(b.confirmedTime || b.scheduledTime || '99:99')));
}

function normalizeExtraAirport(value?: string | null): string {
 return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function baseAirportOptionsForCrewBase(base?: string | null): string[] {
 const code = normalizeExtraAirport(base);
 if (['GIG', 'SDU', 'RIO', 'RJ'].includes(code)) return ['GIG', 'SDU'];
 if (['GRU', 'CGH', 'VCP', 'SAO', 'SPO', 'SP'].includes(code)) return ['CGH', 'GRU', 'VCP'];
 if (['CNF', 'PLU', 'BHZ', 'BH'].includes(code)) return ['CNF'];
 if (['REC', 'JPA'].includes(code)) return [code];
 if (code && AIRPORT_COORDS[code]) return [code];
 return ['BSB'];
}

function uniqueAirportOptions(values: string[]): string[] {
 return values.map(normalizeExtraAirport).filter((value) => value && AIRPORT_COORDS[value]).filter((value, index, arr) => arr.indexOf(value) === index);
}

function extraTargetIsoFromDate(dateIso: string, nextEvent?: DashboardNextEvent): string {
 const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || '')) ? String(dateIso) : new Date().toISOString().slice(0, 10);
 const shouldUseNextEventTime = Boolean(nextEvent?.requiresDeparture !== false && nextEvent?.targetIso);
 const rawTime = shouldUseNextEventTime ? (String(nextEvent?.time || '').match(/\b(\d{1,2}):(\d{2})\b/) || []) : [];
 const hour = String(Math.max(0, Math.min(23, Number(rawTime[1] || 9) || 9))).padStart(2, '0');
 const minute = String(Math.max(0, Math.min(59, Number(rawTime[2] || 0) || 0))).padStart(2, '0');
 return `${date}T${hour}:${minute}:00-03:00`;
}

function liveExtraFlightOptionsFromBoard(rows: AirportBoardRow[], targetAirport: string, selectedDate: string): ExtraFlightOptionEstimate[] {
 const target = normalizeExtraAirport(targetAirport);
 return cleanAirportMonitorRows(rows)
  .filter((row) => normalizeExtraAirport(row.destination) === target)
  .slice(0, 6)
  .map((row) => {
   const origin = normalizeExtraAirport(row.origin) || 'ORIGEM';
   const departure = row.confirmedTime || row.scheduledTime || '—';
   const carrier = row.airlineName || row.airlineCode || 'Companhia exibida no monitor';
   const status = airportMonitorStatusLabel(row.status);
   const flight = row.flightNumber || 'Voo a confirmar';
   return {
    kind: 'direct' as const,
    title: 'Extra direto · monitor/radar',
    route: `${origin} → ${target}`,
    carriers: `${carrier}${row.flightNumber ? ` · ${row.flightNumber}` : ''}`,
    leaveAt: departure,
    arriveAt: row.arrivalTime || 'validar no bilhete',
    durationMinutes: 0,
    confidence: `monitor/radar · ${selectedDate} · portão ${row.gate || 'não informado'} · ${status}`,
    source: row.source || 'Radar CrewCheck',
    selectedDate,
    live: true,
    priceLabel: row.priceLabel || null,
    priceSource: row.priceSource || 'Preço não retornado pelo monitor; confirmar no canal da companhia.',
    priceConfidence: row.priceConfidence || 'consultar companhia',
    bookingLinks: extraAirlineSearchLinks(origin, target, selectedDate),
    details: `Voo retornado por monitor/radar para ${origin} → ${target}. Portão e terminal só aparecem quando o provedor informar. Preço exibido apenas quando o provedor retornar valor; caso contrário, confirme no canal da companhia.`,
    advisory: 'Confirme aceitação do Extra, valor da passagem, assento, check-in, bagagem e eventual troca de terminal.',
    legs: [{
     label: 'Voo relacionado',
     flightNumber: flight,
     airlineName: carrier,
     origin,
     destination: target,
     departure,
     arrival: row.arrivalTime || 'validar no bilhete',
     terminal: row.terminal || 'não informado',
     gate: row.gate || 'não informado',
     status,
     source: row.source || 'Radar CrewCheck',
     note: 'Informação vinda do monitor/radar. Horário de chegada pode não estar disponível no painel de partidas.',
    }],
   };
  });
}

function extraOptionKey(item: ExtraFlightOptionEstimate, index: number): string {
 return `${item.title}|${item.route}|${item.leaveAt}|${item.arriveAt}|${index}`;
}

function stableExtraOptionKey(item: ExtraFlightOptionEstimate): string {
 return `${extraOptionFlightSignature(item)}|${item.route}|${item.leaveAt}|${item.arriveAt}`.toUpperCase();
}

function cleanExtraClock(value?: string | null): string {
 const raw = String(value || '');
 const match = raw.match(/(\d{1,2}):(\d{2})(?:\+(\d))?/);
 if (!match) return '';
 return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}${match[3] ? `+${match[3]}` : ''}`;
}

function formatExtraDateBadge(dateIso?: string | null): string {
 const raw = String(dateIso || '');
 if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 'dia do voo';
 const [year, month, day] = raw.split('-').map(Number);
 const date = new Date(year, month - 1, day);
 const weekday = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
 return `${weekday}, ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function extraOptionTargetIso(item?: ExtraFlightOptionEstimate | null): string {
 if (!item) return '';
 const dateIso = String(item.selectedDate || new Date().toISOString().slice(0, 10));
 const firstLeg = item.legs?.[0];
 const clockRaw = cleanExtraClock(firstLeg?.departure || item.leaveAt);
 const clock = clockRaw.match(/(\d{2}):(\d{2})(?:\+(\d))?/);
 if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !clock) return '';
 const base = new Date(`${dateIso}T00:00:00-03:00`);
 base.setDate(base.getDate() + Number(clock[3] || 0));
 const y = base.getFullYear();
 const m = String(base.getMonth() + 1).padStart(2, '0');
 const d = String(base.getDate()).padStart(2, '0');
 return `${y}-${m}-${d}T${clock[1]}:${clock[2]}:00-03:00`;
}

function optionFirstAirport(item?: ExtraFlightOptionEstimate | null, fallback = ''): string {
 return normalizeExtraAirport(item?.legs?.[0]?.origin || item?.route?.split('→')?.[0] || fallback);
}

function ExtraFlightOptionCard({ item, index, expanded, onToggle, selected, onSelect, canSeeAdmin = false }: { item: ExtraFlightOptionEstimate; index: number; expanded: boolean; onToggle: () => void; selected?: boolean; onSelect?: () => void; canSeeAdmin?: boolean }) {
 const legs = item.legs || [];
 const totalLabel = item.durationMinutes ? `${item.durationMinutes} min` : 'tempo a validar';
 const priceLabel = item.priceLabel || 'consultar';
 const primaryFlights = legs.map((leg) => displayFlightNumberForLogo(leg.flightNumber, leg.airlineCode || leg.operatingAirlineCode, leg.airlineName || item.carriers)).filter((value) => value && value !== '—' && !/número real/i.test(String(value))).join(' + ');
 const firstLeg = legs[0];
 const isEstimatedFare = /estimativa/i.test(`${item.priceConfidence || ''} ${item.priceSource || ''} ${item.source || ''}`);
 const hasRealFare = Boolean(item.priceLabel && !isEstimatedFare);
 const dateBadge = formatExtraDateBadge(item.selectedDate);
 const departLabel = cleanExtraClock(firstLeg?.departure || item.leaveAt) || '—';
 const arriveLabel = cleanExtraClock(legs[legs.length - 1]?.arrival || item.arriveAt) || '—';
 const occupation = item.seatsAvailable ? `${item.seatsAvailable}` : '—';
 const gateLabel = firstLeg?.gate || firstLeg?.terminal || 'A confirmar';
 const carrierLabel = firstLeg?.airlineName || item.carriers || 'Companhia a confirmar';
 const compactFare = item.priceLabel ? `${hasRealFare ? 'Tarifa consultada' : 'Referência'}: ${priceLabel}` : 'Tarifa nos canais da companhia';
 return (
  <div role="button" tabIndex={0} onClick={onToggle} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(); } }} className={`group cursor-pointer rounded-[2rem] border bg-white p-4 text-slate-950 shadow-xl shadow-slate-950/5 transition hover:-translate-y-0.5 hover:shadow-2xl dark:border-white/10 dark:bg-white/[0.07] dark:text-white ${selected ? 'ring-2 ring-cyan-300/70 border-cyan-300/40' : 'border-slate-200/80'}`}>
   <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
     <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500 dark:text-cyan-100/60">{index === 0 ? 'melhor opção' : item.live ? 'opção real' : item.kind === 'direct' ? 'opção direta' : 'conexão cabível'}</p>
     <h4 className="mt-2 truncate text-3xl font-black leading-none tracking-tight text-slate-950 dark:text-white">{primaryFlights || item.title.replace(/^Extra\s*/i, '').replace(/·.*$/, '').trim() || 'Voo a validar'}</h4>
     <p className="mt-2 text-sm font-black text-slate-700 dark:text-slate-200">{carrierLabel} · {item.route}</p>
    </div>
    <div className="flex shrink-0 flex-col items-end gap-2">
     <AirlineLogoBadge code={firstLeg?.airlineCode || firstLeg?.operatingAirlineCode || undefined} name={carrierLabel} />
     <div className="rounded-[1.4rem] bg-slate-50 px-4 py-3 text-right text-xs font-black leading-5 text-slate-700 shadow-inner dark:bg-white/10 dark:text-slate-100">
      <p>{dateBadge}</p>
      <p>dia do voo</p>
     </div>
    </div>
   </div>

   <div className="mt-5 grid grid-cols-2 gap-3">
    <div className="min-h-[8rem] rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
     <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500 dark:text-cyan-100/60">Dia</p>
     <p className="mt-4 whitespace-pre-line text-2xl font-black leading-tight text-slate-950 dark:text-white">{dateBadge.replace(',', ',\n')}</p>
     <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">dia da apresentação</p>
    </div>
    <div className="min-h-[8rem] rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
     <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500 dark:text-cyan-100/60">Sai</p>
     <p className="mt-4 text-3xl font-black leading-tight text-slate-950 dark:text-white">{departLabel}</p>
     <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">embarque</p>
    </div>
    <div className="min-h-[7rem] rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
     <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500 dark:text-cyan-100/60">Chega</p>
     <p className="mt-4 text-3xl font-black leading-tight text-slate-950 dark:text-white">{arriveLabel}</p>
     <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">{dateBadge}</p>
    </div>
    <div className="min-h-[7rem] rounded-[1.6rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.055]">
     <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-500 dark:text-cyan-100/60">Portão</p>
     <p className="mt-4 text-3xl font-black leading-tight text-slate-950 dark:text-white">{gateLabel}</p>
     <p className="mt-2 text-sm font-bold text-slate-600 dark:text-slate-300">quando disponível</p>
    </div>
    {canSeeAdmin ? <div className="min-h-[7rem] rounded-[1.6rem] border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-200/20 dark:bg-amber-300/10">
     <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-700 dark:text-amber-100">Ocupação admin</p>
     <p className="mt-4 text-3xl font-black leading-tight text-amber-950 dark:text-amber-50">{occupation}</p>
     <p className="mt-2 text-sm font-bold text-amber-800/70 dark:text-amber-100/80">teste interno</p>
    </div> : null}
   </div>

   {legs.length ? (
    <div className="mt-4 rounded-[1.4rem] border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-black/20">
     <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500 dark:text-cyan-100/60">voos relacionados</p>
     <div className="mt-2 grid gap-2">
      {legs.slice(0, 4).map((leg, legIndex) => (
       <div key={`${leg.origin}-${leg.destination}-${legIndex}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm dark:bg-white/[0.06] dark:text-slate-200">
        <span className="font-black text-slate-950 dark:text-white">{displayFlightNumberForLogo(leg.flightNumber, leg.airlineCode || leg.operatingAirlineCode, leg.airlineName || carrierLabel) || `Trecho ${legIndex + 1}`}</span>
        <span className="inline-flex items-center gap-2"><AirlineLogoBadge compact code={leg.airlineCode || leg.operatingAirlineCode || undefined} name={leg.airlineName || carrierLabel} /> {airlineNameForEmail(leg.airlineCode || leg.operatingAirlineCode, leg.airlineName || carrierLabel)}</span>
        <span>{leg.origin} → {leg.destination}</span>
        <span>{cleanExtraClock(leg.departure) || '—'} → {cleanExtraClock(leg.arrival) || '—'}</span>
       </div>
      ))}
     </div>
    </div>
   ) : null}

   <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
     <p>{item.live ? 'Opção real encontrada para a rota.' : (item.source?.toLowerCase().includes('google flights') || item.rawProvider?.toLowerCase().includes('google') ? 'Opção real encontrada para a rota.' : 'Opção cabível para apresentação, sujeita à validação.')}</p>
     {item.kind === 'connection' ? <p className="text-xs font-bold text-amber-700 dark:text-amber-100">Conexão cabível: valide bilhete, bagagem, terminal e tempo mínimo, principalmente entre companhias diferentes.</p> : null}
     <p className="font-black text-slate-800 dark:text-slate-100">{compactFare}</p>
    </div>
    <div className="flex flex-wrap gap-2">
     <button type="button" onClick={(event) => { event.stopPropagation(); onSelect?.(); }} className={`rounded-2xl px-4 py-3 text-xs font-black transition active:scale-95 ${selected ? 'bg-emerald-300 text-emerald-950' : 'bg-slate-950 text-white dark:bg-cyan-300 dark:text-slate-950'}`}>
      {selected ? 'Selecionado para saída' : 'Usar na Saída'}
     </button>
     <button type="button" onClick={(event) => { event.stopPropagation(); onToggle(); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-black text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100">
      {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
     </button>
    </div>
   </div>

   {expanded ? (
    <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-black/25">
     <p className="text-sm font-bold leading-6 text-slate-700 dark:text-slate-100">{item.details || 'Detalhes da opção selecionada.'}</p>
     <div className="mt-3 grid gap-2 sm:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.055]"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-emerald-100/60">passagem</p><p className="mt-1 text-sm font-black text-slate-950 dark:text-emerald-50">{compactFare}</p><p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-300">{item.priceSource || 'Confirmar no canal da companhia.'}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.055]"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-cyan-100/60">janela</p><p className="mt-1 text-sm font-black text-slate-950 dark:text-cyan-50">{departLabel} → {arriveLabel}</p><p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-300">{totalLabel} · {item.confidence}</p></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.055]"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:text-fuchsia-100/60">confirmação</p><p className="mt-1 text-sm font-black text-slate-950 dark:text-fuchsia-50">{canSeeAdmin ? (item.source || 'CrewCheck') : 'Canal da companhia'}</p><p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-300">{canSeeAdmin ? (item.rawProvider || item.priceConfidence || 'dados operacionais') : 'confirme bilhete, portão e regras no canal oficial'}</p></div>
     </div>
     {item.advisory ? <p className="mt-3 rounded-2xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-950 dark:border-amber-200/20 dark:bg-amber-300/10 dark:text-amber-50">{item.advisory}</p> : null}
     {legs.length ? (
      <div className="mt-3 grid gap-2">
       {legs.map((leg, legIndex) => (
        <div key={`${leg.origin}-${leg.destination}-${legIndex}-expanded`} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.055]">
         <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black text-slate-950 dark:text-white">{leg.label || `Trecho ${legIndex + 1}`} · {displayFlightNumberForLogo(leg.flightNumber, leg.airlineCode || leg.operatingAirlineCode, leg.airlineName || carrierLabel) || 'voo a validar'} · {leg.origin} → {leg.destination}</p>
          <span className="rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-white dark:bg-white dark:text-slate-950">{leg.status || 'A confirmar'}</span>
         </div>
         <div className="mt-2 grid gap-2 text-xs font-bold text-slate-600 dark:text-slate-200 sm:grid-cols-4">
          <span className="inline-flex items-center gap-2">Companhia: <AirlineLogoBadge compact code={leg.airlineCode || leg.operatingAirlineCode || undefined} name={leg.airlineName || carrierLabel} /></span>
          <span>Hora: {cleanExtraClock(leg.departure) || '—'} → {cleanExtraClock(leg.arrival) || '—'}</span>
          <span>Terminal: {leg.terminal || 'não informado'}</span>
          <span>Portão: {leg.gate || 'não informado'}</span>
          <span>Aeronave: {leg.aircraft || 'não informado'}</span>
          <span>Duração: {leg.duration || 'não informado'}</span>
          <span>Operado por: {leg.operatingAirlineName || leg.airlineName || 'não informado'}</span>
          <span>Bagagem: {leg.baggage || 'validar'}</span>
         </div>
         {leg.note ? <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-300">{leg.note}</p> : null}
        </div>
       ))}
      </div>
     ) : null}
     {item.bookingLinks?.length ? (
      <div className="mt-3 flex flex-wrap gap-2">
       {item.bookingLinks.slice(0, 4).map((link) => <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="rounded-2xl border border-cyan-200/30 bg-cyan-50 px-3 py-2 text-xs font-black text-cyan-950 dark:border-cyan-200/20 dark:bg-cyan-300/10 dark:text-cyan-50">{link.label}</a>)}
      </div>
     ) : null}
    </div>
   ) : null}
  </div>
 );
}


function airportBoardTimeBucket(row: AirportBoardRow): AirportBoardTimeFilter {
 const raw = String(row.confirmedTime || row.scheduledTime || '').match(/\b(\d{1,2}):(\d{2})\b/);
 if (!raw) return 'all';
 const hour = Number(raw[1]);
 if (!Number.isFinite(hour)) return 'all';
 if (hour >= 5 && hour < 12) return 'morning';
 if (hour >= 12 && hour < 18) return 'afternoon';
 return 'night';
}

function airportBoardTimeLabel(key: AirportBoardTimeFilter): string {
 if (key === 'morning') return 'Manhã';
 if (key === 'afternoon') return 'Tarde';
 if (key === 'night') return 'Noite';
 return 'Dia todo';
}

function FlightBoardScreen({ onBack, isAdmin = false }: { onBack: () => void; isAdmin?: boolean }) {
 const [airport, setAirport] = useState(() => {
  try { return localStorage.getItem('crewcheck_radar_preferred_airport') || 'BSB'; } catch { return 'BSB'; }
 });
 const [type, setType] = useState<FlightBoardType>('departure');
 const [airline, setAirline] = useState('');
 const [trafficFilter, setTrafficFilter] = useState<AirportBoardTrafficFilter>('all');
 const [timeFilter, setTimeFilter] = useState<AirportBoardTimeFilter>('all');
 const [query, setQuery] = useState('');
 const [boardDate, setBoardDate] = useState(() => todayIsoForAirportClient('BSB'));
 const [rows, setRows] = useState<AirportBoardRow[]>([]);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [updatedAt, setUpdatedAt] = useState<string | null>(null);
 const [boardSource, setBoardSource] = useState('');
 const [boardMessage, setBoardMessage] = useState('');
 const [boardCacheLabel, setBoardCacheLabel] = useState('');
 const [boardDiagnostics, setBoardDiagnostics] = useState<RadarDiagnostic[]>([]);
 const [providerReady, setProviderReady] = useState(false);
 const [externalSources, setExternalSources] = useState<ExternalRadarLink[]>([]);
 const [providerStatus, setProviderStatus] = useState<Record<string, boolean>>({});
 const [radarWarmLoading, setRadarWarmLoading] = useState(false);
 const [locatingAirport, setLocatingAirport] = useState(false);
 const [geoAirportLabel, setGeoAirportLabel] = useState('');
 const [timeSettings, setTimeSettings] = useState(() => loadLocalProfileSettings());
 useEffect(() => {
  const sync = () => setTimeSettings(loadLocalProfileSettings());
  window.addEventListener('storage', sync);
  window.addEventListener('crewcheck:timezone-updated', sync as EventListener);
  return () => { window.removeEventListener('storage', sync); window.removeEventListener('crewcheck:timezone-updated', sync as EventListener); };
 }, []);
 const airportLabel = BOARD_AIRPORTS.find((item) => item.code === airport)?.city || airport;

 const setAirportPremium = useCallback((code: string, source: 'manual' | 'gps' = 'manual', label = '') => {
  const next = String(code || 'BSB').toUpperCase();
  setAirport(next);
  try {
   localStorage.setItem('crewcheck_radar_preferred_airport', next);
   if (source === 'gps') localStorage.setItem('crewcheck_radar_auto_location', '1');
  } catch {}
  if (label) setGeoAirportLabel(label);
 }, []);

 const detectAirportFromLocation = useCallback((silent = false) => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
   if (!silent) toast.error('Localização indisponível neste dispositivo.');
   return;
  }
  setLocatingAirport(true);
  navigator.geolocation.getCurrentPosition((position) => {
   const nearest = nearestBoardAirportFromCoords(position.coords.latitude, position.coords.longitude);
   setLocatingAirport(false);
   if (!nearest) {
    if (!silent) toast.error('Não consegui definir o aeroporto mais próximo.');
    return;
   }
   setAirportPremium(nearest.code, 'gps', `GPS: ${nearest.city} · ${Math.round(nearest.distanceKm)} km`);
   if (!silent) toast.success(`Radar ajustado para ${nearest.code} (${nearest.city}).`);
  }, (error) => {
   setLocatingAirport(false);
   if (!silent) toast.error(error?.message || 'Permita a localização para definir o aeroporto automaticamente.');
  }, { enableHighAccuracy: false, timeout: 9000, maximumAge: 15 * 60 * 1000 });
 }, [setAirportPremium]);

 useEffect(() => {
  try {
   if (localStorage.getItem('crewcheck_radar_auto_location') === '1') detectAirportFromLocation(true);
  } catch {}
 }, [detectAirportFromLocation]);

 const loadBoard = useCallback(async (forceRefresh = false) => {
  setLoading(true);
  setError('');
  try {
   const today = todayIsoForAirportClient(airport);
   if (boardDate !== today) setBoardDate(today);
   const params = new URLSearchParams({ airport, type, limit: '100', diagnostics: '1', date: today, apiFirst: '1', timeBasis: 'airport-local', displayTimeZone: preferredSystemTimeZone(timeSettings) });
   if (forceRefresh) params.set('refresh', '1');
   if (airline) params.set('airline', airline);
   const response = await fetch(`/api/airport-board?${params.toString()}`, { cache: 'no-store', headers: crewcheckAuthHeader() });
   const payload = await response.json().catch(() => null);
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Monitor aeroportuário indisponível.');
   const apiRows = cleanAirportMonitorRows(Array.isArray(payload.rows) ? payload.rows : []);
   setRows(apiRows);
   setUpdatedAt(payload.updatedAt || new Date().toISOString());
   setBoardSource(String(payload.source || 'Monitor oficial/provedor aeroportuário'));
   setBoardMessage(apiRows.length ? String(payload.message || 'Dados carregados do radar CrewCheck.') : 'Sem retorno confiável para estes filtros. O CrewCheck não mistura escala como se fosse radar.');
   setBoardCacheLabel(payload?.cache?.hit ? 'cache compartilhado' : payload?.cache?.written ? 'atualizado para todos' : (forceRefresh ? 'consulta atualizada agora' : 'consulta protegida'));
   setBoardDiagnostics(Array.isArray(payload.diagnostics) ? payload.diagnostics : []);
   setExternalSources([]);
   setProviderStatus(payload.providerStatus || {});
   setProviderReady(Boolean(apiRows.length || payload.providerReady));
  } catch (err) {
   setError(err instanceof Error ? err.message : 'Não foi possível carregar o monitor aeroportuário.');
   setRows([]);
   setBoardSource('');
   setBoardMessage('Radar sem fallback de escala: aguardando dados oficiais/provedor.');
   setBoardCacheLabel('');
   setBoardDiagnostics([]);
   setExternalSources([]);
   setProviderStatus({});
   setProviderReady(false);
  } finally {
   setLoading(false);
  }
 }, [airport, type, airline, boardDate, timeSettings]);

 useEffect(() => {
  void loadBoard(false);
 }, [loadBoard]);

 const warmRadarNetwork = useCallback(async () => {
  setRadarWarmLoading(true);
  try {
   const response = await fetch('/api/radar/day-cache/refresh', {
    method: 'POST',
    headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
    body: JSON.stringify({ airports: BOARD_AIRPORTS.map((item) => item.code), types: [type] }),
   });
   const payload = await response.json().catch(() => null);
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Falha ao atualizar cache compartilhado.');
   toast.success(`Radar atualizado para ${payload.results?.length || 0} painel(is).`);
   void loadBoard(false);
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a rede do radar.');
  } finally {
   setRadarWarmLoading(false);
  }
 }, [type, loadBoard]);

 const segmentedRows = rows.map((row) => ({ ...row, trafficScope: classifyAirportBoardRow(row) }));
 const trafficCounts = segmentedRows.reduce<Record<AirportBoardTrafficFilter, number>>((acc, row) => {
  const scope = classifyAirportBoardRow(row);
  acc.all += 1;
  acc[scope] += 1;
  return acc;
 }, { all: 0, domestic: 0, international: 0, cargo: 0, unknown: 0 });
 const visibleTrafficFilters: Array<{ key: AirportBoardTrafficFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'domestic', label: 'Domésticos' },
  { key: 'international', label: 'Internacionais' },
  { key: 'cargo', label: 'Cargueiros' },
  ...(isAdmin ? [{ key: 'unknown' as AirportBoardTrafficFilter, label: 'A classificar' }] : []),
 ];
 const visibleTimeFilters: Array<{ key: AirportBoardTimeFilter; label: string }> = [
  { key: 'all', label: 'Dia todo' },
  { key: 'morning', label: 'Manhã' },
  { key: 'afternoon', label: 'Tarde' },
  { key: 'night', label: 'Noite' },
 ];
 const filteredRows = segmentedRows.filter((row) => {
  const scope = classifyAirportBoardRow(row);
  const haystack = `${row.flightNumber || ''} ${row.airlineCode || ''} ${row.airlineName || ''} ${row.destination || ''} ${row.origin || ''} ${row.status || ''} ${trafficScopeLabel(scope)}`.toLowerCase();
  const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());
  const matchesTraffic = trafficFilter === 'all' || scope === trafficFilter;
  const matchesTime = timeFilter === 'all' || airportBoardTimeBucket(row) === timeFilter;
  return matchesQuery && matchesTraffic && matchesTime;
 });

 return (
  <div className="crewcheck-flightboard-screen min-h-screen overflow-x-hidden bg-[#061425] px-4 py-6 pb-32 text-white sm:px-6 lg:px-8">
   <div className="mx-auto max-w-7xl">
    <HeaderBack
     title="Monitores de Voos"
     subtitle="monitores de aeroporto · portão · status em tempo real"
     onBack={onBack}
     action={<div className="flex flex-wrap gap-2"><button onClick={() => detectAirportFromLocation(false)} disabled={locatingAirport} className="rounded-2xl border border-cyan-200/20 bg-white/10 px-4 py-2 text-xs font-black text-cyan-50 disabled:opacity-60"><MapPin className={`mr-2 inline h-4 w-4 ${locatingAirport ? 'animate-pulse' : ''}`} />Usar localização</button><button onClick={() => void loadBoard(true)} className="cc-button-primary rounded-2xl px-4 py-2 text-xs font-black"><RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Atualizar agora</button><button onClick={() => void warmRadarNetwork()} disabled={radarWarmLoading} className="rounded-2xl border border-cyan-200/20 bg-white/10 px-4 py-2 text-xs font-black text-cyan-50 disabled:opacity-60"><Database className={`mr-2 inline h-4 w-4 ${radarWarmLoading ? 'animate-pulse' : ''}`} />Atualizar rede</button></div>}
    />

    <section className="mt-6 overflow-hidden rounded-[2.2rem] border border-cyan-300/20 bg-[radial-gradient(circle_at_20%_0%,rgba(14,165,233,.35),transparent_35%),linear-gradient(135deg,rgba(8,47,73,.92),rgba(2,6,23,.98))] shadow-2xl shadow-black/35">
     <div className="border-b border-cyan-200/10 px-5 py-5 sm:px-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
       <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-100"><Monitor className="h-4 w-4" /> Torre CrewCheck</div>
        <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">{type === 'departure' ? 'Partidas' : 'Chegadas'} · {airport}</h2>
        <p className="mt-2 text-sm text-cyan-50/75">{airportLabel} · filtros por localidade, companhia aérea e busca livre.</p>
        <div className="mt-3 flex flex-wrap gap-2">
         <span className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-50">Voos do dia · portão quando disponível</span>
         <span className={`rounded-full border px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] ${providerReady ? 'border-emerald-200/30 bg-emerald-300/15 text-emerald-50' : 'border-amber-200/30 bg-amber-300/15 text-amber-50'}`}>{providerReady ? 'Radar disponível' : 'Aguardando dados'}</span>
         <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-white/80">Atualização compartilhada</span>
         <span className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-50">Radar: dia local do aeroporto · sistema: {timeZoneModeLabel(timeSettings)}</span>
         {geoAirportLabel ? <span className="rounded-full border border-cyan-200/25 bg-cyan-300/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-cyan-50">{geoAirportLabel}</span> : null}
         {isAdmin && providerStatus.flightstats ? <span className="rounded-full border border-indigo-200/30 bg-indigo-300/15 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-indigo-50">Fonte premium ativa</span> : null}
         {isAdmin && boardSource ? <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.16em] text-white/70">Admin: {boardSource}</span> : null}
        </div>
       </div>
       <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <select value={airport} onChange={(event) => setAirportPremium(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white outline-none backdrop-blur-xl">
         {BOARD_AIRPORTS.map((item) => <option key={item.code} value={item.code} className="bg-slate-950">{item.code} · {item.city}</option>)}
        </select>
        <select value={airline} onChange={(event) => setAirline(event.target.value)} className="h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white outline-none backdrop-blur-xl">
         {BOARD_AIRLINES.map((item) => <option key={item.code || 'all'} value={item.code} className="bg-slate-950">{item.label}</option>)}
        </select>
        <input type="date" value={boardDate} readOnly title="Radar carrega somente voos do dia" className="h-12 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white outline-none backdrop-blur-xl opacity-90" />
        <div className="col-span-2 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/10 p-1 sm:col-span-1 sm:w-64">
         <button onClick={() => setType('departure')} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${type === 'departure' ? 'bg-cyan-300 text-[#07111f]' : 'text-cyan-100 hover:bg-white/10'}`}>Partidas</button>
         <button onClick={() => setType('arrival')} className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${type === 'arrival' ? 'bg-cyan-300 text-[#07111f]' : 'text-cyan-100 hover:bg-white/10'}`}>Chegadas</button>
        </div>
       </div>
       <div className="mt-4 flex flex-wrap gap-2">
        {visibleTrafficFilters.map((item) => (
         <button key={item.key} type="button" onClick={() => setTrafficFilter(item.key)} className={`rounded-2xl border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${trafficFilter === item.key ? trafficScopeBadgeClass(item.key) : 'border-white/10 bg-white/5 text-cyan-50/70 hover:bg-white/10'}`}>
          {item.label} <span className="ml-1 opacity-75">{trafficCounts[item.key]}</span>
         </button>
        ))}
        <span className="hidden h-8 w-px bg-white/10 sm:inline-block" />
        {visibleTimeFilters.map((item) => (
         <button key={item.key} type="button" onClick={() => setTimeFilter(item.key)} className={`rounded-2xl border px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${timeFilter === item.key ? 'border-fuchsia-200/30 bg-fuchsia-300/15 text-fuchsia-50' : 'border-white/10 bg-white/5 text-cyan-50/70 hover:bg-white/10'}`}>
          {item.label}
         </button>
        ))}
       </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
       <label className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm text-cyan-50 shadow-inner shadow-black/20">
        <Search className="h-4 w-4 shrink-0 text-cyan-200" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar voo, destino/origem, companhia ou status..." className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-cyan-100/40" />
       </label>
       <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-xs font-bold text-cyan-50/75"><SlidersHorizontal className="h-4 w-4 text-cyan-200" /> {trafficScopeLabel(trafficFilter)} · {airportBoardTimeLabel(timeFilter)} · {filteredRows.length} voo(s) · atualizado {updatedAt ? formatCrewDateTime(updatedAt, timeSettings) : '—'}{boardCacheLabel ? ` · ${boardCacheLabel}` : ''}</div>
      </div>
     </div>

     <div className="hidden overflow-hidden lg:block">
      <div className="grid grid-cols-[7rem_11rem_minmax(12rem,1fr)_7rem_6rem_7rem_7rem_minmax(10rem,1fr)] border-b border-cyan-200/10 bg-black/25 px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-cyan-100">
       <span>Voo</span><span>Companhia</span><span>{type === 'departure' ? 'Destino' : 'Origem'}</span><span>Perfil</span><span>Terminal</span><span>Portão</span><span>Hora</span><span>Status</span>
      </div>
      {loading && !filteredRows.length ? <BoardLoading /> : filteredRows.length ? filteredRows.map((row, index) => <AirportBoardDesktopRow key={`${row.flightNumber}-${index}`} row={row} type={type} />) : <BoardEmpty error={error} />}
     </div>

     <div className="grid gap-3 p-4 lg:hidden">
      {loading && !filteredRows.length ? <BoardLoading /> : filteredRows.length ? filteredRows.map((row, index) => <AirportBoardMobileCard key={`${row.flightNumber}-${index}`} row={row} type={type} />) : <BoardEmpty error={error} />}
     </div>
    </section>

    <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-xs leading-5 text-slate-300">
     <MapPin className="mr-2 inline h-4 w-4 text-cyan-200" /> O Radar organiza voos domésticos, internacionais e cargueiros sem refazer consulta ao alternar as abas. Portão, status e terminal aparecem somente quando houver dado confiável. As informações aeroportuárias podem variar; confirme sempre com os monitores oficiais do aeroporto.
     {isAdmin && !filteredRows.length && boardDiagnostics.length ? (
      <div className="mt-3 rounded-2xl border border-amber-200/20 bg-amber-300/10 p-3 text-amber-50">
       <strong>Diagnóstico premium:</strong> {boardDiagnostics.slice(0, 5).map((item, index) => (
        <span key={index} className="block">{item.provider || 'Provedor'} {item.endpoint || ''}: {item.ok ? `${item.count ?? 0} item(ns)` : (item.throttled ? 'aguardando limite do serviço' : (item.reason || `HTTP ${item.status || 'erro'}`))}</span>
       ))}
      </div>
     ) : null}
    </div>
   </div>
  </div>
 );
}

function airlineTheme(code?: string | null) {
 const normalized = String(code || '').toUpperCase();
 if (['LA', 'JJ', 'TAM'].includes(normalized)) return 'bg-violet-700 text-white';
 if (['G3', 'GLO'].includes(normalized)) return 'bg-orange-500 text-white';
 if (['AD', 'AZU'].includes(normalized)) return 'bg-blue-700 text-white';
 if (['TP', 'TAP'].includes(normalized)) return 'bg-emerald-400 text-[#07111f]';
 if (['CM', 'CMP'].includes(normalized)) return 'bg-sky-700 text-white';
 if (['AA', 'AAL'].includes(normalized)) return 'bg-white text-slate-900';
 return 'bg-cyan-300 text-[#07111f]';
}

function statusTheme(status?: string | null) {
 const text = String(status || '').toLowerCase();
 if (text.includes('cancel')) return 'text-rose-200';
 if (text.includes('atras') || text.includes('delay')) return 'text-amber-200';
 if (text.includes('chamada') || text.includes('embar')) return 'text-orange-200';
 if (text.includes('finalizado') || text.includes('encerrado') || text.includes('decol') || text.includes('pous') || text.includes('land')) return 'text-sky-200';
 return 'text-emerald-200';
}

function rowDestination(row: AirportBoardRow, type: FlightBoardType) {
 return type === 'departure' ? (row.destination || '—') : (row.origin || '—');
}

function AirportBoardDesktopRow({ row, type }: { row: AirportBoardRow; type: FlightBoardType }) {
 const scope = classifyAirportBoardRow(row);
 return (
  <div className="grid grid-cols-[7rem_11rem_minmax(12rem,1fr)_7rem_6rem_7rem_7rem_minmax(10rem,1fr)] items-center border-b border-cyan-200/5 bg-cyan-950/20 px-5 py-3 text-xl font-black text-white odd:bg-white/[0.035]">
   <span>{displayFlightNumberForLogo(row.flightNumber, row.airlineCode, row.airlineName)}</span>
   <span><AirlineLogoBadge code={row.airlineCode} name={row.airlineName || row.flightNumber} /></span>
   <span className="truncate text-yellow-200">{rowDestination(row, type)}</span>
   <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${trafficScopeBadgeClass(scope)}`}>{trafficScopeLabel(scope)}</span>
   <span>{row.terminal || '—'}</span>
   <span>{row.gate || '—'}</span>
   <span>{row.confirmedTime || row.scheduledTime || '—'}</span>
   <span className={statusTheme(row.status)}>{airportMonitorStatusLabel(row.status)}</span>
  </div>
 );
}

function AirportBoardMobileCard({ row, type }: { row: AirportBoardRow; type: FlightBoardType }) {
 const scope = classifyAirportBoardRow(row);
 return (
  <div className="rounded-3xl border border-cyan-200/10 bg-white/[0.07] p-4 shadow-xl shadow-black/20">
   <div className="flex items-start justify-between gap-3">
    <div><p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/55">{type === 'departure' ? 'Destino' : 'Origem'}</p><h3 className="mt-1 text-2xl font-black text-yellow-200">{rowDestination(row, type)}</h3></div>
    <AirlineLogoBadge compact code={row.airlineCode} name={row.airlineName || row.flightNumber} />
   </div>
   <div className="mt-4 grid grid-cols-4 gap-2 text-center">
    <BoardPill label="Voo" value={displayFlightNumberForLogo(row.flightNumber, row.airlineCode, row.airlineName)} />
    <BoardPill label="Terminal" value={row.terminal || '—'} />
    <BoardPill label="Portão" value={row.gate || '—'} />
    <BoardPill label="Hora" value={row.confirmedTime || row.scheduledTime || '—'} />
   </div>
   <p className={`mt-4 text-lg font-black ${statusTheme(row.status)}`}>{airportMonitorStatusLabel(row.status)}</p>
  </div>
 );
}

function BoardPill({ label, value }: { label: string; value: string }) {
 return <div className="rounded-2xl border border-cyan-200/10 bg-black/20 px-3 py-2"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/50">{label}</p><p className="mt-1 text-base font-black text-white">{value}</p></div>;
}

function BoardLoading() {
 return <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-8 text-center text-cyan-100"><Loader2 className="h-10 w-10 animate-spin" /><p className="font-black">Atualizando painel de voos...</p></div>;
}

function BoardEmpty({ error }: { error?: string }) {
 return <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 p-8 text-center text-cyan-100"><Building2 className="h-10 w-10" /><p className="font-black">Nenhum voo encontrado com estes filtros.</p><p className="max-w-lg text-sm text-cyan-50/65">{error || 'Sem retorno do monitor oficial/provedor aeroportuário para estes filtros. O fallback pela escala foi desativado para manter o radar fidedigno.'}</p></div>;
}

function formatRosterStorageSize(bytes?: number | null): string {
 const value = Number(bytes || 0);
 if (!value) return 'sem arquivo original';
 if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
 return `${(value / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function HistoryScreen({ rosters, loading, dbStatus, openingId, onBack, onOpen, onActivate, onDelete, onRefresh }: {
 rosters: SavedRosterSummary[];
 loading: boolean;
 dbStatus: DatabaseStatus | null;
 openingId: string | null;
 onBack: () => void;
 onOpen: (id: string) => void;
 onActivate: (id: string) => void;
 onDelete: (id: string) => void;
 onRefresh: () => void;
}) {
 const dbOnline = Boolean(dbStatus?.connected || dbStatus?.ok);
 const storage = dbStatus?.storage;
 const activeRoster = rosters.find((item) => item.isActive) || null;
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
   <div className="mx-auto max-w-5xl">
    <HeaderBack title="Gerenciador de Escalas" subtitle={dbOnline ? 'Escala ativa, histórico e nuvem privada' : 'Histórico local/offline'} onBack={onBack} action={<button onClick={onRefresh} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-cyan-100"><RefreshCw className="mr-2 inline h-4 w-4" />Atualizar</button>} />
    <div className="mt-5 grid gap-3 md:grid-cols-3">
     <div className="rounded-[1.4rem] border border-cyan-200/15 bg-cyan-300/10 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/70">Escala ativa</p>
      <h3 className="mt-2 text-lg font-black text-white">{activeRoster ? monthLabel(activeRoster.month, activeRoster.year) : 'nenhuma definida'}</h3>
      <p className="mt-1 text-xs font-semibold text-cyan-50/70">{activeRoster?.sourceFileName || 'Escolha uma escala abaixo para ativar.'}</p>
     </div>
     <div className="rounded-[1.4rem] border border-emerald-200/15 bg-emerald-300/10 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-100/70">Cloud Storage</p>
      <h3 className="mt-2 text-lg font-black text-white">{storage?.configured ? 'Supabase privado' : 'pendente'}</h3>
      <p className="mt-1 text-xs font-semibold text-emerald-50/70">{storage?.configured ? 'PDF original salvo em bucket privado quando configurado.' : 'Configure as variáveis do Supabase no Render.'}</p>
     </div>
     <div className="rounded-[1.4rem] border border-violet-200/15 bg-violet-300/10 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-100/70">Organização</p>
      <h3 className="mt-2 text-lg font-black text-white">{rosters.length} escala(s)</h3>
      <p className="mt-1 text-xs font-semibold text-violet-50/70">Exclua importações erradas e mantenha só a escala correta como ativa.</p>
     </div>
    </div>
    {loading ? <StateCard icon={Loader2} title="Buscando escalas" text="Carregando histórico salvo..." spin /> : rosters.length ? (
     <div className="mt-6 grid gap-3">
      {rosters.map((item) => {
       const busy = openingId === item.id;
       return (
        <div key={item.id} className={`rounded-3xl border p-5 shadow-2xl shadow-black/10 ${item.isActive ? 'border-cyan-200/40 bg-cyan-300/10' : 'border-white/10 bg-white/[0.05]'}`}>
         <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
           <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/70">{monthLabel(item.month, item.year)} · {item.base || 'Base'}</p>
            {item.isActive && <span className="rounded-full bg-cyan-300 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#07111f]">Ativa</span>}
            {item.storageReady && <span className="rounded-full bg-emerald-300/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-100">Cloud</span>}
            {item.importStatus === 'processed_storage_pending' && <span className="rounded-full bg-amber-300/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100">Storage pendente</span>}
           </div>
           <h3 className="mt-1 truncate text-lg font-black">{item.crewName || 'Tripulante'}</h3>
           <p className="mt-1 text-sm text-slate-400">{item.sourceFileName || 'Escala salva'} · score {item.score ?? '-'} · {formatRosterStorageSize(item.sourceFileSizeBytes)}</p>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
           <button type="button" onClick={() => onOpen(item.id)} disabled={busy} className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-[#07111f] disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir'}</button>
           <button type="button" onClick={() => onActivate(item.id)} disabled={busy || item.isActive} className="rounded-2xl border border-cyan-200/25 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-50 disabled:opacity-40">Tornar ativa</button>
           <button type="button" onClick={() => onDelete(item.id)} disabled={busy} className="rounded-2xl border border-rose-200/20 bg-rose-400/10 px-3 py-2 text-sm font-black text-rose-100 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
          </div>
         </div>
        </div>
       );
      })}
     </div>
    ) : <StateCard icon={FolderOpen} title="Nenhuma escala salva" text="Importe uma escala uma vez; ela ficará disponível aqui após o login. Se a importação falhar, ela deve aparecer como pendente em versões futuras." />}
   </div>
  </div>
 );
}

function NotesPanel({ onBack }: { onBack: () => void }) {
 const [note, setNote] = useState(() => localStorage.getItem('crewcheck_personal_notes') || '');
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
   <div className="mx-auto max-w-3xl">
    <HeaderBack title="Notas" subtitle="Anotações locais do tripulante" onBack={onBack} />
    <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.05] p-5">
     <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: observar pernoite, descanso, Extra, treinamento, pendência pessoal..." className="min-h-[18rem] w-full rounded-2xl border border-white/10 bg-[#07111f] p-4 text-sm leading-6 text-white outline-none focus:border-cyan-300" />
     <div className="mt-4 flex justify-end"><Button onClick={() => { localStorage.setItem('crewcheck_personal_notes', note); toast.success('Notas salvas neste dispositivo.'); }} className="rounded-2xl bg-cyan-300 text-[#07111f] hover:bg-cyan-200"><StickyNote className="h-4 w-4" /> Salvar notas</Button></div>
    </div>
   </div>
  </div>
 );
}

function SettingsHomePanel({ userLabel, userEmail, profileSettings, avatar, pendingOffline, hasRoster, canAccessAdmin, themeMode, onThemeModeChange, onProfileSettingsChange, onAvatarChange, onBack, onOpenIFlight, onOpenImport, onOpenResultsSettings, onOpenPerDiem, onOpenSalary, onExportPdf, onExportIcs, onSyncPending, onSyncTelegramRoster, onLogout }: {
 userLabel: string;
 userEmail: string;
 profileSettings: LocalProfileSettings;
 avatar: string;
 pendingOffline: number;
 hasRoster: boolean;
 canAccessAdmin: boolean;
 themeMode: CrewThemeMode;
 onThemeModeChange: (mode: CrewThemeMode) => void;
 onProfileSettingsChange: (settings: LocalProfileSettings) => void;
 onAvatarChange: (value: string) => void;
 onBack: () => void;
 onOpenIFlight: () => void;
 onOpenImport: () => void;
 onOpenResultsSettings: () => void;
 onOpenPerDiem: () => void;
 onOpenSalary: () => void;
 onExportPdf: () => void;
 onExportIcs: () => void;
 onSyncPending: () => void;
 onSyncTelegramRoster: () => void;
 onLogout: () => void;
}) {
 type SettingsCategoryKey = 'profile' | 'billing' | 'calendar' | 'preferences' | 'permissions' | 'location' | 'telegram' | 'alerts' | 'finance' | 'exports' | 'privacy' | 'manual';
 const settingsCategoryKeys: SettingsCategoryKey[] = ['profile', 'billing', 'calendar', 'preferences', 'permissions', 'location', 'telegram', 'alerts', 'finance', 'exports', 'privacy', 'manual'];
 const [activeCategory, setActiveCategory] = useState<SettingsCategoryKey>(() => {
  try {
   const requested = localStorage.getItem('crewcheck_settings_category') as SettingsCategoryKey | null;
   if (requested && settingsCategoryKeys.includes(requested)) return requested;
  } catch {}
  return 'profile';
 });
 const [settingsPulse, setSettingsPulse] = useState<SettingsCategoryKey | null>(null);
 const settingsContentRef = useRef<HTMLElement | null>(null);

 function openSettingsCategory(key: SettingsCategoryKey, options: { silent?: boolean } = {}) {
  if (!settingsCategoryKeys.includes(key)) return;
  setActiveCategory(key);
  setSettingsPulse(key);
  try { localStorage.setItem('crewcheck_settings_category_last', key); } catch {}
  if (!options.silent) toast.success('Abrindo configuração.');
  window.setTimeout(() => {
   settingsContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
   setSettingsPulse(null);
  }, 90);
 }

 useEffect(() => {
  const openRequested = (requested?: SettingsCategoryKey | null, silent = true) => {
   if (requested && settingsCategoryKeys.includes(requested)) {
    openSettingsCategory(requested, { silent });
    return true;
   }
   return false;
  };
  try {
   const requested = localStorage.getItem('crewcheck_settings_category') as SettingsCategoryKey | null;
   if (openRequested(requested, true)) localStorage.removeItem('crewcheck_settings_category');
  } catch {}
  const onExternalCategory = (event: Event) => {
   const key = (event as CustomEvent<SettingsCategoryKey>).detail;
   openRequested(key, false);
  };
  window.addEventListener('crewcheck:settings-category', onExternalCategory as EventListener);
  return () => window.removeEventListener('crewcheck:settings-category', onExternalCategory as EventListener);
 }, []);
 const [preview, setPreview] = useState(avatar);
 const [isSaving, setIsSaving] = useState(false);
 const [profileForm, setProfileForm] = useState<LocalProfileSettings>(profileSettings);
 const [language, setLanguage] = useState<CrewLanguage>(() => getSavedLanguage());
 const [googleSettings, setGoogleSettings] = useState<GoogleCalendarSettings>(() => loadGoogleCalendarSettings());
 const [calendars, setCalendars] = useState<GoogleCalendarOption[]>([]);
 const [googleConnected, setGoogleConnected] = useState(() => hasGoogleCalendarToken());
 const [googleBusy, setGoogleBusy] = useState(false);
 const [clientIdOverride, setClientIdOverride] = useState(() => getGoogleClientIdOverride());
 const googleConfigured = isGoogleCalendarConfigured();
 const hasEnvClientId = hasGoogleClientIdFromEnv();
 const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
 const [billingBusy, setBillingBusy] = useState(false);
 const [emailRecipient, setEmailRecipient] = useState(userEmail || '');
 const [emailSubject, setEmailSubject] = useState('CrewCheck — compartilhamento premium');
 const [emailMessage, setEmailMessage] = useState(() => `Olá,\n\nSegue o resumo enviado pelo CrewCheck.\n\nStatus: ${hasRoster ? 'escala carregada' : 'sem escala carregada neste momento'}.\n\nEsta mensagem foi enviada diretamente pela plataforma CrewCheck.`);
 const [emailSending, setEmailSending] = useState(false);
 const [supportSending, setSupportSending] = useState(false);
 const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
 const [telegramBusy, setTelegramBusy] = useState(false);
 const [telegramUsername, setTelegramUsername] = useState(() => normalizeTelegramUsernameInput(localStorage.getItem('crewcheck_profile_telegram_username') || ''));
 const [telegramConciergeName, setTelegramConciergeName] = useState(() => String(localStorage.getItem('crewcheck_telegram_concierge_name') || 'CrewCheck Concierge').replace(/\s+/g, ' ').trim().slice(0, 32));
 const [settingsPermissionStatus, setSettingsPermissionStatus] = useState<CrewCheckPermissionStatus>(() => readCrewCheckPermissionStatus());
const supportIsPremium = Boolean(billingStatus?.premiumAccess);
 const supportIsPaidPremium = Boolean(supportIsPremium && !['trialing', 'trial_expired'].includes(String(billingStatus?.status || '').toLowerCase()));
 const annualSubscriber = String(billingStatus?.plan?.id || '').includes('annual');

 function rememberTelegramUsername(value?: string | null) {
  const cleaned = normalizeTelegramUsernameInput(value);
  if (!cleaned) return;
  setTelegramUsername(cleaned);
  try { localStorage.setItem('crewcheck_profile_telegram_username', cleaned); } catch {}
 }

 function applyTelegramPayload(payload?: TelegramStatus | null) {
  if (!payload) return;
  setTelegramStatus(payload);
  rememberTelegramUsername(payload.chat?.username || payload.expectedUsername || '');
  const nextConciergeName = typeof payload.preferences?.conciergeName === 'string' ? payload.preferences.conciergeName.replace(/\s+/g, ' ').trim().slice(0, 32) : '';
  if (nextConciergeName) {
   setTelegramConciergeName(nextConciergeName);
   try { localStorage.setItem('crewcheck_telegram_concierge_name', nextConciergeName); } catch {}
  }
 }

 function updateTelegramUsername(value: string) {
  const cleaned = normalizeTelegramUsernameInput(value);
  setTelegramUsername(cleaned);
  try { localStorage.setItem('crewcheck_profile_telegram_username', cleaned); } catch {}
 }



 async function refreshTelegramStatus(silent = false) {
  try {
   const response = await fetch('/api/telegram/status', { headers: crewcheckAuthHeader(), cache: 'no-store' });
   const payload = await response.json().catch(() => null) as TelegramStatus | null;
   if (payload) applyTelegramPayload(payload);
   if (payload?.connected && hasCurrentRosterSession()) void onSyncTelegramRoster();
   if (!silent && payload?.connected) toast.success('Telegram Premium conectado.');
  } catch (error) {
   if (!silent) toast.error(error instanceof Error ? error.message : 'Não foi possível verificar o Telegram Premium agora.');
  }
 }

 async function connectTelegram() {
  setTelegramBusy(true);
  try {
   const response = await fetch('/api/telegram/connect', { method: 'POST', headers: crewcheckAuthHeader({ 'content-type': 'application/json' }), body: JSON.stringify({ telegramUsername }), cache: 'no-store' });
   const payload = await response.json().catch(() => null) as TelegramStatus | null;
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Telegram indisponível.');
   applyTelegramPayload(payload);
   if (payload.connected) {
    await Promise.resolve(onSyncTelegramRoster());
    toast.success('Telegram Premium já está conectado e a escala foi sincronizada quando disponível.');
    return;
   }
   if (payload.connectUrl) {
    await Promise.resolve(onSyncTelegramRoster());
    window.location.href = payload.connectUrl;
    toast.success('Abrindo Telegram. Toque em Iniciar para ativar o canal Premium.');
   } else if (payload.code) {
    await navigator.clipboard?.writeText(payload.code).catch(() => undefined);
    toast.info('Não consegui abrir o link automático. Código copiado como alternativa.');
   } else {
    toast.info('Conexão preparada. Abra o bot do CrewCheck no Telegram para finalizar.');
   }
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível conectar o Telegram Premium.');
  } finally {
   setTelegramBusy(false);
  }
 }

 async function testTelegram() {
  setTelegramBusy(true);
  try {
   const response = await fetch('/api/telegram/test', { method: 'POST', headers: crewcheckAuthHeader({ 'content-type': 'application/json' }), body: JSON.stringify({}), cache: 'no-store' });
   const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível enviar teste.');
   toast.success('Teste Premium enviado no Telegram.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o teste do Telegram Premium.');
  } finally {
   setTelegramBusy(false);
  }
 }

 async function saveTelegramPreferences(next: Record<string, boolean | string>) {
  setTelegramStatus((current) => ({ ...(current || {}), preferences: next }));
  try {
   const response = await fetch('/api/telegram/preferences', { method: 'POST', headers: crewcheckAuthHeader({ 'content-type': 'application/json' }), body: JSON.stringify({ preferences: next }), cache: 'no-store' });
   const payload = await response.json().catch(() => null) as TelegramStatus | null;
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível salvar a preferência.');
   applyTelegramPayload(payload);
   return payload;
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a preferência do Telegram Premium.');
   return null;
  }
 }

 async function saveTelegramPreference(key: string, value: boolean) {
  const next = { ...(telegramStatus?.preferences || {}), [key]: value } as Record<string, boolean | string>;
  await saveTelegramPreferences(next);
 }

 async function saveTelegramConciergeName() {
  const cleaned = String(telegramConciergeName || 'CrewCheck Concierge').replace(/\s+/g, ' ').trim().slice(0, 32) || 'CrewCheck Concierge';
  setTelegramConciergeName(cleaned);
  try { localStorage.setItem('crewcheck_telegram_concierge_name', cleaned); } catch {}
  const next = { ...(telegramStatus?.preferences || {}), conciergeName: cleaned } as Record<string, boolean | string>;
  const payload = await saveTelegramPreferences(next);
  if (payload?.ok) toast.success('Nome do Concierge salvo.');
 }

 async function openPremiumWhatsAppSupport() {
  try {
   const response = await fetch('/api/support/whatsapp-link', { headers: crewcheckAuthHeader(), cache: 'no-store' });
   const payload = await response.json().catch(() => null);
   if (!response.ok || !payload?.ok || !payload?.url) throw new Error(payload?.message || 'WhatsApp premium indisponível.');
   window.open(payload.url, '_blank', 'noopener,noreferrer');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível abrir o WhatsApp premium.');
  }
 }

 
 async function sendSupportTicketFromSettings() {
  if (!supportIsPremium) {
   toast.info('O suporte direto é exclusivo para assinantes Premium. O plano gratuito mantém acesso ao manual e FAQ.');
   return;
  }
  setSupportSending(true);
  try {
   const response = await fetch('/api/support/contact', {
    method: 'POST',
    headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
    body: JSON.stringify({
     subject: 'Suporte CrewCheck',
     version: APP_VERSION,
     pageUrl: window.location.href,
     message: `Olá, preciso de ajuda com o CrewCheck.

Usuário: ${userLabel || 'CrewCheck'}
Base: ${profileForm.base || 'não informada'}

Contexto: mensagem enviada pela área de Ajuda do CrewCheck.`,
    }),
   });
   const payload = await response.json().catch(() => null);
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível enviar ao suporte.');
   toast.success('Mensagem enviada ao suporte CrewCheck.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Falha ao enviar suporte.');
  } finally {
   setSupportSending(false);
  }
 }

 async function sendPlatformEmail(kind: 'summary' | 'pdf' | 'ics' = 'summary') {
  const to = (emailRecipient || userEmail || '').trim();
  if (!to || !to.includes('@')) {
   toast.error('Informe um e-mail válido.');
   return;
  }
  setEmailSending(true);
  try {
   const subject = emailSubject.trim() || 'CrewCheck — compartilhamento premium';
   const message = [
    emailMessage.trim() || 'Segue informação enviada pelo CrewCheck.',
    '',
    `Tipo solicitado: ${kind === 'pdf' ? 'PDF premium' : kind === 'ics' ? 'Calendário ICS' : 'Resumo operacional'}.`,
    `Usuário: ${userLabel || 'CrewCheck'}.`,
    `Data/hora: ${new Date().toLocaleString('pt-BR')}.`,
    '',
    'Observação: quando houver anexo, utilize também os botões PDF premium ou Calendário ICS para gerar o arquivo localmente.',
   ].join('\n');
   const html = `<div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#0f172a;background:#f8fafc;padding:24px"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #dbe7f3;border-radius:24px;padding:24px"><p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#0891b2;font-weight:800">CrewCheck Premium</p><h1 style="margin:6px 0 12px;font-size:24px;color:#0f172a">Compartilhamento por e-mail</h1><p style="white-space:pre-line;color:#334155">${message.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch] || ch))}</p><p style="margin-top:20px;font-size:12px;color:#64748b">Mensagem enviada automaticamente pela plataforma CrewCheck.</p></div></div>`;
   const response = await fetch('/api/email/share', {
    method: 'POST',
    headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
    body: JSON.stringify({ to, subject, message, html }),
   });
   const payload = await response.json().catch(() => null);
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível enviar o e-mail.');
   toast.success(`E-mail enviado para ${to}.`);
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Falha ao enviar e-mail.');
  } finally {
   setEmailSending(false);
  }
 }


 function refreshSettingsPermissions() {
  setSettingsPermissionStatus(readCrewCheckPermissionStatus());
 }

 async function requestSettingsLocationPermission() {
  try {
   let result = await requestCrewCheckCurrentLocation();
   if (!result?.ok) result = await requestCrewCheckBrowserLocation();
   refreshSettingsPermissions();
   if (result?.ok) { toast.success('Localização ativada para o CrewCheck.'); return; }
   toast.info(result?.error || 'Libere a localização nas permissões do navegador ou Android.');
  } catch (error) {
   refreshSettingsPermissions();
   toast.error(error instanceof Error ? error.message : 'Não consegui solicitar a localização agora.');
  }
 }

 function requestSettingsNotificationPermission() {
  const ok = requestCrewCheckNotificationPermission();
  window.setTimeout(refreshSettingsPermissions, 800);
  if (ok || readCrewCheckPermissionStatus().notifications === true) {
   try { localStorage.setItem('crewcheck_notifications_enabled', 'true'); } catch {}
   toast.success('Notificações ativadas para alertas importantes.');
   notifyCrewCheck('CrewCheck ativado', 'Notificações liberadas para escala, Saída Inteligente, radar e Telegram.', 'settings_notifications_enabled');
  } else {
   toast.info('Autorize as notificações no aviso do Android/navegador.');
  }
 }

 function requestSettingsBackgroundPermission() {
  const ok = requestCrewCheckBackgroundMode();
  window.setTimeout(refreshSettingsPermissions, 900);
  toast.info(ok ? 'Abrindo ajuste de segundo plano. Libere o CrewCheck para melhorar os alertas.' : 'No Android, permita funcionamento em segundo plano nas configurações do app.');
 }

 async function refreshBillingStatus(silent = false) {
  try {
   const status = await getBillingStatus();
   setBillingStatus(status);
   if (!silent) toast.success('Assinatura atualizada.');
  } catch (error) {
   if (!silent) toast.error(error instanceof Error ? error.message : 'Não consegui carregar a assinatura.');
  }
 }

 useEffect(() => {
  void refreshBillingStatus(true);
 }, []);

 useEffect(() => {
  void refreshTelegramStatus(true);
 }, []);

 useEffect(() => {
  refreshSettingsPermissions();
  const refresh = () => refreshSettingsPermissions();
  window.addEventListener('crewcheck:native-ready', refresh);
  window.addEventListener('crewcheck:permissions-updated', refresh);
  window.addEventListener('crewcheck:location-permission', refresh);
  window.addEventListener('crewcheck:notification-permission', refresh);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  return () => {
   window.removeEventListener('crewcheck:native-ready', refresh);
   window.removeEventListener('crewcheck:permissions-updated', refresh);
   window.removeEventListener('crewcheck:location-permission', refresh);
   window.removeEventListener('crewcheck:notification-permission', refresh);
   window.removeEventListener('focus', refresh);
   document.removeEventListener('visibilitychange', refresh);
  };
 }, []);

 useEffect(() => {
  setPreview(avatar);
 }, [avatar]);

 function persistGoogle(next: GoogleCalendarSettings) {
  const saved = saveGoogleCalendarSettings(next);
  setGoogleSettings(saved);
  toast.success('Configuração do Google Calendar salva.');
 }

 async function handleConnectGoogle() {
  if (!isGoogleCalendarConfigured()) {
   toast.error('Configure o Google Client ID para ativar o Google Calendar direto.');
   return;
  }
  setGoogleBusy(true);
  try {
   await connectGoogleCalendar('consent select_account');
   setGoogleConnected(true);
   const items = await listGoogleCalendars();
   setCalendars(items);
   const current = loadGoogleCalendarSettings();
   if (!current.selectedCalendarId && items[0]) persistGoogle({ ...current, selectedCalendarId: items[0].id, selectedCalendarName: items[0].summary });
   toast.success('Google Calendar conectado.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não consegui conectar ao Google Calendar.');
  } finally {
   setGoogleBusy(false);
  }
 }

 async function handleRefreshCalendars() {
  setGoogleBusy(true);
  try {
   const items = await listGoogleCalendars();
   setCalendars(items);
   toast.success('Calendários atualizados.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não consegui atualizar os calendários.');
  } finally {
   setGoogleBusy(false);
  }
 }

 function handleSaveClientId() {
  saveGoogleClientIdOverride(clientIdOverride);
  toast.success('Identificação Google salvo/removido neste dispositivo.');
 }

 const calendarOptions = (() => {
  const map = new Map<string, GoogleCalendarOption>();
  map.set(googleSettings.selectedCalendarId || 'primary', { id: googleSettings.selectedCalendarId || 'primary', summary: googleSettings.selectedCalendarName || 'Calendário principal' });
  map.set('primary', { id: 'primary', summary: 'Calendário principal', primary: true, accessRole: 'owner' });
  calendars.forEach((calendar) => map.set(calendar.id, calendar));
  return Array.from(map.values());
 })();

 async function handleAvatarInput(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) {
   toast.error('Escolha uma imagem válida.');
   return;
  }
  if (file.size > 5 * 1024 * 1024) {
   toast.error('A imagem precisa ter até 5 MB.');
   return;
  }
  setIsSaving(true);
  try {
   const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Imagem inválida.'));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem.'));
    reader.readAsDataURL(file);
   });
   setPreview(dataUrl);
   onAvatarChange(dataUrl);
   toast.success('Foto de perfil atualizada.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não consegui salvar a imagem.');
  } finally {
   setIsSaving(false);
  }
 }

 function removeAvatar() {
  setPreview('');
  onAvatarChange('');
  toast.success('Foto removida.');
 }

 function saveProfile() {
  onProfileSettingsChange(profileForm);
 }

 async function handleStartTrial(cpfCnpj: string): Promise<BillingStatus | null> {
  setBillingBusy(true);
  try {
   const status = await startPremiumTrial({
    cpfCnpj,
    acknowledgedSafetyNotice: true,
    safetyNoticeVersion: PREMIUM_SAFETY_NOTICE_VERSION,
   });
   setBillingStatus(status);
   toast.success(status.message || 'Teste Premium ativado. A cobrança fica programada para depois do período grátis.');
   return status;
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar o teste premium.');
   return null;
  } finally {
   setBillingBusy(false);
  }
 }

 async function handleSubscribe(planId: 'premium_monthly' | 'premium_annual', cpfCnpj: string, billingType: BillingCheckoutBillingType = 'UNDEFINED'): Promise<BillingCheckoutResponse | null> {
  setBillingBusy(true);
  try {
   const result = await createBillingCheckout(planId, billingType, {
    cpfCnpj,
    acknowledgedSafetyNotice: true,
    safetyNoticeVersion: PREMIUM_SAFETY_NOTICE_VERSION,
   });
   if (result.billing) setBillingStatus(result.billing);
   toast.success(result.message || 'Cobrança criada. Escolha a forma de pagamento no checkout seguro.');
   return result;
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível criar a cobrança.');
   return null;
  } finally {
   setBillingBusy(false);
  }
 }

 async function handleRegularizeTrial(cpfCnpj: string): Promise<BillingStatus | null> {
  setBillingBusy(true);
  try {
   const status = await regularizePremiumTrial({
    cpfCnpj,
    acknowledgedSafetyNotice: true,
    safetyNoticeVersion: PREMIUM_SAFETY_NOTICE_VERSION,
   });
   setBillingStatus(status);
   toast.success(status.message || 'Assinatura regularizada.');
   return status;
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível regularizar a assinatura.');
   return null;
  } finally {
   setBillingBusy(false);
  }
 }

 async function handleCancelBilling() {
  if (!window.confirm('Cancelar a assinatura premium? O plano básico gratuito continuará disponível.')) return;
  setBillingBusy(true);
  try {
   const status = await cancelBillingSubscription();
   setBillingStatus(status);
   toast.success(status.message || 'Cancelamento registrado.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não foi possível cancelar a assinatura.');
  } finally {
   setBillingBusy(false);
  }
 }

 function handleLanguageChange(next: CrewLanguage) {
  setLanguage(saveCrewLanguage(next));
  applyDocumentLanguage();
  toast.success('Idioma salvo neste dispositivo.');
  window.setTimeout(() => window.dispatchEvent(new Event('crewcheck:language-change')), 0);
 }

 const categories: Array<{ key: SettingsCategoryKey; title: string; text: string; icon: LucideIcon; badge?: string; tone: string }> = [
  { key: 'profile', title: 'Conta', text: 'perfil, foto e base', icon: UserRound, badge: profileForm.base || 'local', tone: 'from-cyan-300 to-blue-500' },
  { key: 'billing', title: 'Assinatura', text: 'gerenciar Premium', icon: CreditCard, badge: billingStatus?.premiumAccess ? 'premium' : 'grátis', tone: 'from-amber-200 to-orange-500' },
  { key: 'calendar', title: 'Agenda', text: 'Google Calendar e ICS', icon: CalendarDays, badge: googleConnected ? 'conectada' : 'opcional', tone: 'from-blue-300 to-indigo-500' },
  { key: 'preferences', title: 'Aparência', text: 'tema, idioma e fuso', icon: Languages, badge: themeMode === 'system' ? 'auto' : themeMode, tone: 'from-violet-300 to-fuchsia-500' },
  { key: 'permissions', title: 'Permissões', text: 'GPS, notificações e segundo plano', icon: Shield, badge: settingsPermissionStatus.notifications ? 'ativo' : 'permissões', tone: 'from-sky-300 to-blue-500' },
  { key: 'location', title: 'Localização', text: 'GPS, casa, base e trânsito', icon: MapPin, badge: settingsPermissionStatus.location ? 'GPS' : 'rota', tone: 'from-cyan-300 to-teal-500' },
  { key: 'telegram', title: 'Telegram', text: 'conexão e preferências', icon: MessageCircle, badge: telegramStatus?.connected ? 'conectado' : 'bot', tone: 'from-blue-300 to-cyan-500' },
  { key: 'alerts', title: 'Alertas', text: 'saída, radar, portão e trânsito', icon: Bell, badge: 'alertas', tone: 'from-rose-300 to-orange-500' },
  { key: 'finance', title: 'Financeiro', text: 'diárias e salário', icon: TrendingUp, badge: 'previsões', tone: 'from-lime-300 to-emerald-500' },
  { key: 'exports', title: 'Exportar', text: 'PDF, agenda e fila', icon: DownloadIcon, badge: hasRoster ? 'pronto' : 'sem escala', tone: 'from-sky-300 to-cyan-500' },
  { key: 'privacy', title: 'Privacidade', text: 'LGPD e segurança', icon: Shield, badge: 'local', tone: 'from-slate-200 to-slate-500' },
  { key: 'manual', title: 'Ajuda', text: 'manuais, suporte e Android', icon: FileText, badge: 'ajuda', tone: 'from-amber-300 to-orange-500' },
 ];

 const current = categories.find((item) => item.key === activeCategory) || categories[0];

 const copySupportSummary = () => {
  const text = `CrewCheck v${APP_VERSION}\nUsuário: ${userLabel}\nE-mail: ${userEmail || 'não informado'}\nBase: ${profileForm.base || 'não informada'}\nCategoria: ${current.title}`;
  navigator.clipboard?.writeText(text)?.then(() => toast.success('Resumo copiado.')).catch(() => toast.info('Não consegui copiar automaticamente.'));
 };

 function renderCategoryContent() {
  if (activeCategory === 'profile') {
   return (
    <SettingsCategoryCard eyebrow="Perfil local" title="Quem aparece no CrewCheck" description="Esses dados ficam salvos apenas neste dispositivo e ajudam a identificar chefe de cabine, base e exportações.">
     <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
       <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.7rem] border border-cyan-200/20 bg-gradient-to-br from-cyan-300/25 to-blue-500/10">
        {preview ? <img src={preview} alt="Foto do perfil" className="h-full w-full object-cover" /> : <UserRound className="h-10 w-10 text-cyan-100" />}
       </div>
       <div>
        <h3 className="text-2xl font-black">{profileForm.displayName || userLabel || 'Tripulante'}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">Perfil minimalista para exibição, cálculos e relatórios.</p>
       </div>
      </div>
      <Badge className="w-fit rounded-full border-0 bg-cyan-300/15 text-cyan-100">{profileForm.base || 'Base opcional'}</Badge>
     </div>
     <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#07111f] shadow-lg shadow-cyan-950/25 transition hover:bg-cyan-200 active:scale-[0.99]">
       <Camera className="h-5 w-5" /> {isSaving ? 'Salvando...' : 'Trocar foto'}
       <input type="file" accept="image/*,.heic,.heif" onChange={handleAvatarInput} disabled={isSaving} className="sr-only" />
      </label>
      <button onClick={removeAvatar} disabled={!preview} className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-black text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40">
       <Trash2 className="h-5 w-5" /> Remover foto
      </button>
     </div>
     <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <ProfileField label="Nome exibido" value={profileForm.displayName} placeholder="Nome que aparecerá no app" onChange={(value) => setProfileForm({ ...profileForm, displayName: value })} />
      <ProfileField label="Descrição" value={profileForm.company} placeholder="Descrição opcional" onChange={(value) => setProfileForm({ ...profileForm, company: value })} />
      <ProfileField label="Base contratual" value={profileForm.base} placeholder="Informe sigla da base com três letras" uppercase onChange={(value) => setProfileForm({ ...profileForm, base: value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })} />
      <ProfileField label="Função" value={profileForm.rank} placeholder="CCM, chefe, piloto..." onChange={(value) => setProfileForm({ ...profileForm, rank: value })} />
     </div>
     <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
      <button type="button" onClick={() => setProfileForm({ ...profileForm, hasVirtualBase: !profileForm.hasVirtualBase })} className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${profileForm.hasVirtualBase ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-50' : 'border-white/10 bg-white/10 text-slate-100'}`}>
       <span><b>Possuo base virtual</b><p className="mt-1 text-xs font-semibold opacity-75">A base virtual aparece como destino no Extra e é considerada nas diárias.</p></span>
       <span className={`rounded-full px-3 py-1 text-xs font-black ${profileForm.hasVirtualBase ? 'bg-cyan-200 text-[#07111f]' : 'bg-white/10 text-slate-200'}`}>{profileForm.hasVirtualBase ? 'Sim' : 'Não'}</span>
      </button>
      {profileForm.hasVirtualBase && <div className="mt-3"><ProfileField label="Sigla da base virtual" value={profileForm.virtualBase} placeholder="Informe sigla da base com três letras" uppercase onChange={(value) => setProfileForm({ ...profileForm, virtualBase: value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) })} /><p className="mt-2 text-xs font-semibold leading-5 text-slate-400">Ex.: SP/SAO exibe CGH, GRU e VCP; RIO/RJ exibe GIG e SDU; aeroportos como GRU, CGH, GIG e SDU expandem automaticamente para a base correspondente.</p></div>}
     </div>
     <button type="button" onClick={() => setProfileForm({ ...profileForm, isInstructor: !profileForm.isInstructor })} className={`mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] ${profileForm.isInstructor ? 'border-amber-300/30 bg-amber-300/12 text-amber-50' : 'border-white/10 bg-white/10 text-slate-100'}`}>
      <span><b>Sou instrutor</b><p className="mt-1 text-xs font-semibold opacity-75">Usa a janela de BIDS/PBS dos instrutores por padrão.</p></span>
      <span className={`rounded-full px-3 py-1 text-xs font-black ${profileForm.isInstructor ? 'bg-amber-200 text-[#3b2500]' : 'bg-white/10 text-slate-200'}`}>{profileForm.isInstructor ? 'Ativo' : 'Não'}</span>
     </button>
     <button onClick={saveProfile} className="mt-5 w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#07111f] shadow-lg transition hover:bg-cyan-50">Salvar perfil</button>
    </SettingsCategoryCard>
   );
  }

  if (activeCategory === 'billing') {
   return (
    <BillingSettingsCard
     status={billingStatus}
     busy={billingBusy}
     onRefresh={() => void refreshBillingStatus()}
     onStartTrial={handleStartTrial}
     onSubscribe={handleSubscribe}
     onRegularizeTrial={handleRegularizeTrial}
     onCancel={handleCancelBilling}
    />
   );
  }

  if (activeCategory === 'calendar') {
   return (
    <SettingsCategoryCard eyebrow="Agenda automática" title="Google Calendar e exportação ICS" description="Escolha o calendário, evite duplicidade e mantenha voos, rotina e alertas sincronizados quando desejar.">
     <div className="grid gap-3 sm:grid-cols-2">
      <button onClick={handleConnectGoogle} disabled={!googleConfigured || googleBusy} className="rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#07111f] transition hover:bg-cyan-200 disabled:opacity-50">{googleConnected ? 'Reconectar Google' : 'Conectar Google'}</button>
      <button onClick={handleRefreshCalendars} disabled={!googleConfigured || googleBusy} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/15 disabled:opacity-50"><RefreshCw className={`mr-2 inline h-4 w-4 ${googleBusy ? 'animate-spin' : ''}`} /> Atualizar calendários</button>
     </div>
     <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">Calendário padrão</span><select value={googleSettings.selectedCalendarId || 'primary'} onChange={(event) => { const selected = calendarOptions.find((c) => c.id === event.target.value); persistGoogle({ ...googleSettings, selectedCalendarId: event.target.value, selectedCalendarName: selected?.summary || event.target.value }); }} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-3 text-sm font-bold text-white outline-none focus:border-cyan-300">{calendarOptions.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? ' · principal' : ''}</option>)}</select></label>
      <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">Modo de exportação</span><select value={googleSettings.exportMode || 'all'} onChange={(event) => persistGoogle({ ...googleSettings, exportMode: event.target.value as GoogleCalendarSyncMode })} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-3 text-sm font-bold text-white outline-none focus:border-cyan-300"><option value="all">Tudo: voos, atividades, folgas e rotina</option><option value="flights">Somente voos</option><option value="gym">Somente academia</option><option value="routine">Somente rotina</option></select></label>
     </div>
     <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm text-slate-200"><input type="checkbox" checked={googleSettings.autoSync} onChange={(event) => persistGoogle({ ...googleSettings, autoSync: event.target.checked })} className="mt-1" /><span><strong>Sincronizar após importar escala.</strong><br /><span className="text-slate-400">A autorização fica no navegador e pode expirar. Reconecte quando necessário.</span></span></label>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm text-slate-200"><input type="checkbox" checked={Boolean(googleSettings.includeFinancialNotes)} onChange={(event) => persistGoogle({ ...googleSettings, includeFinancialNotes: event.target.checked })} className="mt-1" /><span><strong>Incluir diárias e ganhos nas observações.</strong><br /><span className="text-slate-400">Adiciona estimativas financeiras do CrewCheck no detalhe do evento. O usuário decide.</span></span></label>
     </div>
     {!hasEnvClientId && <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4"><p className="text-sm font-bold text-amber-50">Identificação Google opcional neste dispositivo</p><input value={clientIdOverride} onChange={(event) => setClientIdOverride(event.target.value)} placeholder="Cole o Identificação Google temporariamente" className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300" /><button onClick={handleSaveClientId} className="mt-3 rounded-2xl bg-amber-200 px-5 py-3 text-sm font-black text-[#07111f]">Salvar identificação local</button></div>}
    </SettingsCategoryCard>
   );
  }

  if (activeCategory === 'preferences') {
   return (
    <div className="space-y-5">
     <ThemeSettingsCard themeMode={themeMode} onThemeModeChange={onThemeModeChange} />
     <CrewCheckColorSettingsCard />

     <SettingsCategoryCard eyebrow="Horário padrão" title="Fuso horário do CrewCheck" description="Por padrão, a escala, Cockpit, relatórios, Saída Inteligente e cálculos usam Brasília/BSB. O Radar sempre consulta o dia local do aeroporto para bater melhor com os monitores.">
      <div className="grid gap-3 sm:grid-cols-2">
       <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">Exibir horários do sistema em</span><select value={profileForm.timeMode || 'BSB'} onChange={(event) => { const next = { ...profileForm, timeMode: event.target.value as CrewTimeMode }; setProfileForm(next); onProfileSettingsChange(next); window.dispatchEvent(new Event('crewcheck:timezone-updated')); toast.success('Fuso atualizado.'); }} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300"><option value="BSB">Brasília / BSB (padrão)</option><option value="LOCAL">Horário local do dispositivo</option><option value="UTC">UTC</option><option value="CUSTOM">Fuso específico</option></select></label>
       <label className="block"><span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">Fuso específico</span><select value={profileForm.customTimeZone || CREWCHECK_DEFAULT_TIMEZONE} disabled={(profileForm.timeMode || 'BSB') !== 'CUSTOM'} onChange={(event) => { const next = { ...profileForm, customTimeZone: event.target.value }; setProfileForm(next); onProfileSettingsChange(next); window.dispatchEvent(new Event('crewcheck:timezone-updated')); toast.success('Fuso específico salvo.'); }} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300 disabled:opacity-50">{CREWCHECK_TIMEZONE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      </div>
      <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-300/10 p-4 text-sm font-bold leading-6 text-cyan-50">Atual: {timeZoneModeLabel(profileForm)}. O Radar não usa escala como fallback e carrega somente voos do dia local do aeroporto selecionado.</div>
     </SettingsCategoryCard>
     <SettingsCategoryCard eyebrow="Idioma" title="Linguagem do sistema" description="A preferência fica salva neste dispositivo e vale para as telas principais.">
      <select value={language} onChange={(event) => handleLanguageChange(event.target.value as CrewLanguage)} className="h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300"><option value="pt">Português</option><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="it">Italiano</option><option value="de">Deutsch</option></select>
     </SettingsCategoryCard>
    </div>
   );
  }

  if (activeCategory === 'permissions') {
   const gpsOn = settingsPermissionStatus.location === true;
   const notificationsOn = settingsPermissionStatus.notifications === true || (typeof Notification !== 'undefined' && Notification.permission === 'granted');
   const backgroundOn = settingsPermissionStatus.background === true || settingsPermissionStatus.batteryUnrestricted === true;
   return (
    <SettingsCategoryCard eyebrow="Permissões do aparelho" title="Ative o que o CrewCheck precisa para trabalhar por você" description="GPS e notificações são opcionais, mas liberam Saída Inteligente, lembretes, radar, portão, trânsito e avisos relevantes fora do app.">
     <div className="grid gap-3 sm:grid-cols-3">
      <button type="button" onClick={() => void requestSettingsLocationPermission()} className={`rounded-[1.35rem] border p-4 text-left transition active:scale-[0.99] ${gpsOn ? 'border-emerald-300/40 bg-emerald-300/12 text-emerald-50' : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50'}`}><MapPin className="mb-3 h-5 w-5" /><b>Localização</b><p className="mt-1 text-xs font-semibold opacity-75">{gpsOn ? 'GPS liberado' : 'Toque para liberar GPS'}</p></button>
      <button type="button" onClick={requestSettingsNotificationPermission} className={`rounded-[1.35rem] border p-4 text-left transition active:scale-[0.99] ${notificationsOn ? 'border-emerald-300/40 bg-emerald-300/12 text-emerald-50' : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-50'}`}><Bell className="mb-3 h-5 w-5" /><b>Notificações</b><p className="mt-1 text-xs font-semibold opacity-75">{notificationsOn ? 'Alertas liberados' : 'Ativar alertas do app'}</p></button>
      <button type="button" onClick={requestSettingsBackgroundPermission} className={`rounded-[1.35rem] border p-4 text-left transition active:scale-[0.99] ${backgroundOn ? 'border-emerald-300/40 bg-emerald-300/12 text-emerald-50' : 'border-white/10 bg-white/[0.055] text-slate-100'}`}><Activity className="mb-3 h-5 w-5" /><b>Segundo plano</b><p className="mt-1 text-xs font-semibold opacity-75">{backgroundOn ? 'Ajuste detectado' : 'Melhora alertas futuros'}</p></button>
     </div>
     <div className="mt-5 grid gap-3 sm:grid-cols-2"><StatusTile icon={Navigation} title="Saída Inteligente" text="usa GPS/rotas quando liberado" /><StatusTile icon={Plane} title="Radar e portão" text="avisa quando houver dado útil" /><StatusTile icon={MessageCircle} title="Telegram" text="canal extra por vontade do usuário" /><StatusTile icon={Shield} title="Privacidade" text="permissões podem ser removidas no Android" /></div>
     <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-slate-300">O CrewCheck não obriga localização nem Telegram. Quando o usuário negar, o sistema continua funcionando com estimativas e mostra claramente quando algo é estimado.</p>
    </SettingsCategoryCard>
   );
  }

  if (activeCategory === 'location') {
   return (
    <SettingsCategoryCard eyebrow="Localização e trânsito" title="Origem, rotas, trânsito e aeroporto local" description="Central para definir como a Saída Inteligente deve calcular o deslocamento: GPS, casa, outra base, aeroporto local, modal e dados de trânsito quando disponíveis.">
     <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => void requestSettingsLocationPermission()} className="rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#07111f]"><MapPin className="mr-2 inline h-4 w-4" />Liberar/atualizar GPS</button><button type="button" onClick={() => { try { localStorage.setItem('crewcheck_next_home_view', 'departure'); } catch {} window.location.href = '/?view=departure'; }} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-sm font-black text-cyan-50"><Navigation className="mr-2 inline h-4 w-4" />Abrir Saída Inteligente</button></div>
     <div className="mt-5 grid gap-3 sm:grid-cols-2"><SettingsMiniInfo title="GPS do dispositivo" text="melhor para sair de onde você está agora." icon={MapPin} /><SettingsMiniInfo title="Casa/CEP/endereço" text="melhor para rotina e previsibilidade." icon={HomeIcon} /><SettingsMiniInfo title="Outra base" text="útil para base virtual ou deslocamento dirigido." icon={Building2} /><SettingsMiniInfo title="Trânsito e modal" text="carro, Uber/99, transporte público, moto/app e voo." icon={Car} /></div>
     <p className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-300/10 p-4 text-sm font-bold leading-6 text-cyan-50">Os campos de CEP, endereço, modal e aeroporto ficam dentro da Saída Inteligente para evitar configuração duplicada. Esta tela serve como central de permissões e orientação.</p>
    </SettingsCategoryCard>
   );
  }

  if (activeCategory === 'alerts') {
   const telegramPrefs = telegramStatus?.preferences || {};
   const alertItems: Array<[string, string, string]> = [['smartDeparture','Saída Inteligente','hora de sair, margem, modal e rota'], ['gateStatus','Portão e terminal','portão, terminal, embarque e última chamada'], ['traffic','Trânsito e rota','tempo estimado, fonte, atraso e alternativa'], ['radar','Radar de voo','somente mudança útil: status, portão, terminal ou previsão'], ['radarImportantOnly','Radar anti-spam','silencia Programado repetido sem portão/alteração'], ['irregularities','Irregularidades','descanso, jornada e alertas críticos'], ['dailySummary','Resumo diário','programação do dia e pontos de atenção'], ['weeklySummary','Resumo semanal','diárias, salário estimado e pendências'], ['concierge','Concierge por texto e voz','responder por texto ou áudio sobre escala, portão, saída, diárias e rotina'], ['roster','Escala','importação, alteração e próximo evento']];
   return (
    <SettingsCategoryCard eyebrow="Central de alertas" title="Escolha o que vale notificar" description="O usuário decide o nível de aviso. O CrewCheck evita spam e prioriza alertas úteis: hora de sair, portão, trânsito, status de voo, última chamada e irregularidades. Status Programado sem mudança real fica silencioso.">
     <div className="grid gap-3 sm:grid-cols-2">{alertItems.map(([key, title, text]) => (<button key={key} type="button" disabled={telegramStatus?.configured === false} onClick={() => void saveTelegramPreference(key, !(telegramPrefs as Record<string, boolean>)[key])} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] disabled:opacity-50 ${(telegramPrefs as Record<string, boolean>)[key] !== false ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-50' : 'border-white/10 bg-white/10 text-slate-200'}`}><span><b>{title}</b><br /><span className="text-xs font-semibold opacity-70">{text}</span></span><span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${(telegramPrefs as Record<string, boolean>)[key] !== false ? 'bg-cyan-200 text-[#07111f]' : 'bg-white/10 text-slate-300'}`}>{(telegramPrefs as Record<string, boolean>)[key] !== false ? 'Ativo' : 'Off'}</span></button>))}</div>
     <div className="mt-5 grid gap-3 sm:grid-cols-4"><button type="button" onClick={requestSettingsNotificationPermission} className="rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#07111f]">Ativar push</button><button type="button" onClick={onSyncTelegramRoster} disabled={!hasRoster} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-sm font-black text-cyan-50 disabled:opacity-50">Sincronizar escala</button><button type="button" onClick={() => void testTelegram()} disabled={telegramBusy || !telegramStatus?.connected} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-4 text-sm font-black text-emerald-50 disabled:opacity-50">Testar Telegram</button><button type="button" onClick={() => void refreshTelegramStatus()} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-black text-white">Atualizar status</button></div>
    </SettingsCategoryCard>
   );
  }

  
if (activeCategory === 'telegram') {
   const telegramPrefs = telegramStatus?.preferences || {};
   const telegramConnected = Boolean(telegramStatus?.connected);
   const telegramConfigured = telegramStatus?.configured !== false;
   const syncedRoster = telegramStatus?.syncedRoster;
   return (
    <div className="space-y-5">
     <SettingsCategoryCard eyebrow="Permissões" title="Localização, notificações e Saída Inteligente" description="O CrewCheck usa sua localização apenas sob permissão para calcular hora de sair, transporte público, carro e corrida por app.">
      <div className="grid gap-3 sm:grid-cols-3"><StatusTile icon={MapPin} title="Localização" text="necessária para rota real" /><StatusTile icon={Bell} title="Notificações" text="hora de sair e alertas" /><StatusTile icon={Navigation} title="Segundo plano" text="melhora alertas futuros" /></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><button onClick={() => void requestSettingsLocationPermission()} className="rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#07111f]">Verificar localização</button><button onClick={requestSettingsNotificationPermission} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-sm font-black text-cyan-50">Verificar notificações</button><button onClick={requestSettingsBackgroundPermission} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-4 text-sm font-black text-emerald-50">Permitir segundo plano</button></div>
      <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-slate-300">Quando uma permissão não estiver liberada, o app usa estimativa conservadora e sinaliza claramente a fonte do cálculo. No Android, liberar segundo plano ajuda o CrewCheck a entregar lembretes mesmo quando o app estiver fechado.</p>
     </SettingsCategoryCard>

     <SettingsCategoryCard eyebrow="Telegram Premium" title="Alertas importantes fora do app" description="Canal executivo de alertas e perguntas por texto ou áudio: escala, portão, Saída Inteligente, radar, diárias, rotina e irregularidades com limites no gratuito e experiência completa no Premium.">
      <div className="flex flex-col gap-3 rounded-[1.6rem] border border-cyan-200/20 bg-cyan-300/10 p-4 sm:flex-row sm:items-center sm:justify-between">
       <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100/65">Status</p>
        <h3 className="mt-1 text-2xl font-black text-white">{telegramConnected ? 'Telegram Concierge conectado' : telegramConfigured ? 'Telegram Concierge disponível' : 'Telegram não configurado'}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-300">{telegramConnected ? `Conectado ${telegramStatus?.chat?.username ? `com @${telegramStatus.chat.username}` : telegramStatus?.chat?.maskedId ? `ao chat ${telegramStatus.chat.maskedId}` : 'ao bot CrewCheck'}.` : telegramConfigured ? 'Informe seu usuário do Telegram uma vez. O app abre o bot e conclui a conexão com aparência Premium, sem código manual.' : 'Configure TELEGRAM_BOT_TOKEN no Render para ativar este canal.'}</p>
        {telegramConnected && <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] ${syncedRoster?.available ? 'border-emerald-300/30 bg-emerald-300/12 text-emerald-50' : 'border-amber-300/30 bg-amber-300/12 text-amber-50'}`}>{syncedRoster?.available ? `Escala no Concierge${syncedRoster.periodMonth ? ` · ${String(syncedRoster.periodMonth).padStart(2, '0')}/${syncedRoster.periodYear || '----'}` : ''}` : 'Escala ainda não confirmada no servidor'}</p>}
       </div>
       <div className="flex flex-wrap gap-2">
        <button onClick={() => void refreshTelegramStatus()} disabled={telegramBusy} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-black text-white disabled:opacity-60"><RefreshCw className={`mr-2 inline h-4 w-4 ${telegramBusy ? 'animate-spin' : ''}`} />Atualizar</button>
        <button onClick={() => void connectTelegram()} disabled={telegramBusy || !telegramConfigured} className="rounded-2xl bg-cyan-300 px-4 py-3 text-xs font-black text-[#07111f] disabled:opacity-60"><MessageCircle className="mr-2 inline h-4 w-4" />{telegramConnected ? 'Reconectar' : 'Conectar Telegram'}</button>
        <button onClick={() => void testTelegram()} disabled={telegramBusy || !telegramConnected} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-4 py-3 text-xs font-black text-emerald-50 disabled:opacity-60"><Bell className="mr-2 inline h-4 w-4" />Enviar teste</button>
       </div>
      </div>
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4">
       <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">Usuário do Telegram</span>
        <div className="mt-2 flex h-12 items-center rounded-2xl border border-white/10 bg-[#07111f] px-4 text-white focus-within:border-cyan-300/60">
         <span className="select-none text-sm font-black text-cyan-100">@</span>
         <input value={telegramUsername} onChange={(event) => updateTelegramUsername(event.target.value)} disabled={!telegramConfigured || telegramConnected} className="h-full min-w-0 flex-1 bg-transparent px-1 text-sm font-bold outline-none disabled:opacity-60" placeholder="seu_usuario" autoComplete="off" />
        </div>
       </label>
       <p className="mt-2 text-xs leading-5 text-slate-400">O @ já é fixo. O usuário não consegue digitar outro @. Ao conectar, o CrewCheck abre o bot com link seguro e a associação acontece automaticamente quando o usuário toca em Iniciar.</p>
      </div>
      <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-300/10 p-4">
       <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
         <span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">Nome do Concierge · Premium</span>
         <input value={telegramConciergeName} onChange={(event) => setTelegramConciergeName(event.target.value.replace(/\s+/g, ' ').slice(0, 32))} disabled={!telegramConfigured || !supportIsPremium} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-black text-white outline-none focus:border-cyan-300/60 disabled:opacity-55" placeholder="CrewCheck Concierge" maxLength={32} />
        </label>
        <button type="button" onClick={() => void saveTelegramConciergeName()} disabled={!telegramConfigured || !supportIsPremium} className="rounded-2xl bg-cyan-300 px-5 py-4 text-xs font-black text-[#07111f] disabled:opacity-50">Salvar nome</button>
       </div>
       <p className="mt-2 text-xs leading-5 text-slate-400">No Premium, o usuário pode chamar o assistente pelo nome escolhido. No gratuito, o backend mantém o nome padrão CrewCheck Concierge.</p>
      </div>
      {telegramStatus?.code && !telegramConnected && <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-slate-300">Conexão Premium pronta para {telegramUsername ? <b className="text-cyan-100">@{telegramUsername}</b> : 'este usuário'}. Caso o Telegram não abra, toque novamente em <b>Conectar Telegram</b>. O código técnico fica reservado apenas como alternativa de suporte.</div>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
       {[
        ['smartDeparture', 'Saída Inteligente', 'hora de sair e rota recalculada'],
        ['roster', 'Escala', 'importação e alteração detectada'],
        ['radar', 'Radar de voo', 'mudança útil de status, portão, terminal ou previsão'],
        ['radarImportantOnly', 'Radar anti-spam', 'não repetir Programado sem alteração real'],
        ['concierge', 'Concierge texto e voz', 'responder perguntas digitadas ou faladas no Telegram'],
        ['conciergeVoice', 'Perguntas por áudio', 'transcrever áudio recebido no Telegram'],
        ['conciergeAudioReplies', 'Responder áudio com áudio', 'quando o usuário manda áudio, responder em MP3'],
        ['gateStatus', 'Portão e terminal', 'mudança de portão, terminal e status operacional'],
        ['traffic', 'Trânsito e rota', 'tempo de deslocamento, fonte e alertas de rota'],
        ['irregularities', 'Irregularidades', 'alertas críticos e atenção'],
        ['dailySummary', 'Resumo diário', 'visão rápida do dia'],
        ['weeklySummary', 'Resumo semanal', 'diárias e ganhos da semana'],
       ].map(([key, title, text]) => (
        <button key={key} type="button" disabled={!telegramConfigured} onClick={() => void saveTelegramPreference(key, !(telegramPrefs as Record<string, boolean>)[key])} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-left transition active:scale-[0.99] disabled:opacity-50 ${(telegramPrefs as Record<string, boolean>)[key] !== false ? 'border-cyan-300/30 bg-cyan-300/12 text-cyan-50' : 'border-white/10 bg-white/10 text-slate-200'}`}>
         <span><b>{title}</b><br /><span className="text-xs font-semibold opacity-70">{text}</span></span>
         <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${(telegramPrefs as Record<string, boolean>)[key] !== false ? 'bg-cyan-200 text-[#07111f]' : 'bg-white/10 text-slate-300'}`}>{(telegramPrefs as Record<string, boolean>)[key] !== false ? 'Ativo' : 'Off'}</span>
        </button>
       ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-400">Para evitar excesso de mensagens, o CrewCheck envia apenas alertas relevantes. O Radar não repete Programado sem mudança real de status, portão, terminal ou previsão. O Concierge por texto e voz permite perguntar sobre escala, portão, saída, diárias e rotina. No gratuito, as respostas são limitadas; no Premium, ficam completas.</p>
     </SettingsCategoryCard>
    </div>
   );
  }

  if (activeCategory === 'finance') {
   return (
    <SettingsCategoryCard eyebrow="Valores" title="Diárias, ceia e salário" description="Acesse previsões em telas próprias, com cálculo explicável e botões de exportação quando houver escala carregada.">
     <div className="grid gap-3 sm:grid-cols-3"><button onClick={onOpenPerDiem} className="rounded-2xl bg-emerald-200 px-5 py-4 text-sm font-black text-[#07111f]">Diárias</button><button onClick={onOpenPerDiem} className="rounded-2xl bg-cyan-200 px-5 py-4 text-sm font-black text-[#07111f]">Ceia</button><button onClick={onOpenSalary} className="rounded-2xl bg-violet-200 px-5 py-4 text-sm font-black text-[#07111f]">Salário</button></div>
     <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-6 text-slate-300">As telas financeiras mostram resumo, memória de cálculo e exportação/compartilhamento quando fizer sentido.</div>
    </SettingsCategoryCard>
   );
  }

  if (activeCategory === 'exports') {
   return (
    <SettingsCategoryCard eyebrow="Exportações" title="Compartilhar e salvar" description="Use quando quiser enviar a escala, relatório financeiro ou agenda por PDF, calendário, fila de sincronização ou e-mail interno do CrewCheck.">
     <div className="grid gap-3 sm:grid-cols-3"><button onClick={onExportPdf} className="rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#07111f]">PDF premium</button><button onClick={onExportIcs} className="rounded-2xl bg-blue-200 px-5 py-4 text-sm font-black text-[#07111f]">Calendário ICS</button><button onClick={onSyncPending} className="rounded-2xl bg-violet-200 px-5 py-4 text-sm font-black text-[#07111f]">Sincronizar fila</button></div>
     <div className="mt-5 rounded-[1.6rem] border border-cyan-200/20 bg-white/[0.055] p-4 shadow-xl shadow-black/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
       <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/65">E-mail interno</p>
        <h3 className="mt-1 text-2xl font-black text-white">Enviar direto pela plataforma</h3>
        <p className="mt-1 text-sm leading-6 text-slate-300">Use o envio interno configurado no CrewCheck. O destinatário padrão é o e-mail cadastrado do usuário.</p>
       </div>
       <span className="rounded-full border border-emerald-200/25 bg-emerald-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-50">sem abrir app externo</span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
       <label className="block"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/60">Destinatário</span><input value={emailRecipient} onChange={(event) => setEmailRecipient(event.target.value)} placeholder={userEmail || 'email@exemplo.com'} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-500" /></label>
       <label className="block"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/60">Assunto</span><input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white outline-none" /></label>
      </div>
      <label className="mt-3 block"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/60">Mensagem</span><textarea value={emailMessage} onChange={(event) => setEmailMessage(event.target.value)} rows={5} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none" /></label>
      <div className="mt-4 flex flex-wrap gap-2">
       <button onClick={() => void sendPlatformEmail('summary')} disabled={emailSending} className="rounded-2xl bg-cyan-300 px-5 py-3 text-xs font-black text-slate-950 disabled:opacity-60"><Mail className="mr-2 inline h-4 w-4" />{emailSending ? 'Enviando...' : 'Enviar resumo'}</button>
       <button onClick={() => void sendTelegramExport(emailSubject || 'CrewCheck · Exportação', emailMessage, 'summary')} className="rounded-2xl bg-sky-200 px-5 py-3 text-xs font-black text-slate-950"><MessageCircle className="mr-2 inline h-4 w-4" />Enviar pelo Telegram</button>
       <button onClick={() => { onExportPdf(); void sendPlatformEmail('pdf'); }} disabled={emailSending} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-xs font-black text-cyan-50 disabled:opacity-60">Gerar PDF + avisar por e-mail</button>
       <button onClick={() => { onExportPdf(); void sendTelegramExport('CrewCheck · PDF gerado', `${emailMessage}

PDF premium gerado no dispositivo.`, 'pdf'); }} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-xs font-black text-cyan-50">Gerar PDF + avisar Telegram</button>
       <button onClick={() => { onExportIcs(); void sendPlatformEmail('ics'); }} disabled={emailSending} className="rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-xs font-black text-cyan-50 disabled:opacity-60">Gerar ICS + avisar por e-mail</button>
       <button onClick={() => { onExportIcs(); void sendTelegramExport('CrewCheck · Calendário ICS gerado', `${emailMessage}

Calendário ICS gerado no dispositivo.`, 'ics'); }} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-3 text-xs font-black text-cyan-50">Gerar ICS + avisar Telegram</button>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-400">Para anexos completos, o CrewCheck prepara o resumo e também aciona a geração local do PDF/calendário quando selecionado.</p>
     </div>
     <p className="mt-4 text-sm leading-6 text-slate-400">{hasRoster ? 'Escala carregada. Exportações disponíveis.' : 'Importe ou abra uma escala para liberar PDF e calendário completos.'} {pendingOffline > 0 ? `${pendingOffline} pendência(s) offline aguardando sincronização.` : 'Nenhuma pendência offline agora.'}</p>
    </SettingsCategoryCard>
   );
  }

  if (activeCategory === 'privacy') {
   return (
    <SettingsCategoryCard eyebrow="LGPD" title="Privacidade sem ruído técnico" description="Informações corporativas sensíveis não ficam salvas no CrewCheck. A senha e MFA sempre permanecem no portal oficial.">
     <div className="grid gap-3 sm:grid-cols-2"><StatusTile icon={Lock} title="Senha corporativa" text="não armazenada" /><StatusTile icon={Shield} title="Perfil" text="salvo localmente" /><StatusTile icon={Database} title="Histórico" text="pode funcionar offline" /><StatusTile icon={FileText} title="Importação" text="PDF oficial" /></div>
     <button onClick={() => window.open('/privacy.html', '_blank', 'noopener,noreferrer')} className="mt-5 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-black text-white">Abrir política de privacidade</button>
    </SettingsCategoryCard>
   );
  }

  return (
   <SettingsCategoryCard eyebrow="Ajuda premium" title="Manuais, suporte e Android" description="O CrewCheck foi desenhado para tripulantes e segue em expansão para diferentes operações. O plano gratuito mantém manuais e FAQ; suporte direto é Premium.">
    <div className="mb-5 overflow-hidden rounded-[1.8rem] border border-cyan-200/20 bg-gradient-to-br from-cyan-300/12 via-white/[0.06] to-blue-500/10 p-5">
     <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
       <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/65">Android oficial</p>
       <h4 className="mt-1 text-2xl font-black text-white">Baixar CrewCheck no Google Play</h4>
       <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Atalho visível para instalar o app Android. O badge se adapta ao modo claro/escuro.</p>
      </div>
      <button type="button" onClick={() => window.open('/apk', '_blank', 'noopener,noreferrer')} className="crewcheck-google-play-button rounded-2xl bg-white px-4 py-3 shadow-xl shadow-black/20 transition hover:scale-[1.01]">
       <img src="/assets/stores/google-play-pt-br-light.png" alt="Disponível no Google Play" className="crewcheck-play-badge-light h-16 w-auto" />
       <img src="/assets/stores/google-play-pt-br-dark.png" alt="Disponível no Google Play" className="crewcheck-play-badge-dark h-16 w-auto" />
      </button>
     </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
     <button onClick={() => window.open('/manual.html', '_blank', 'noopener,noreferrer')} className="rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#07111f]"><FileText className="mr-2 inline h-4 w-4" /> Abrir manual web</button>
     <button onClick={() => window.open('/manuals/manual-completo-crewcheck-premium-v1.pdf', '_blank', 'noopener,noreferrer')} className="rounded-2xl bg-cyan-200 px-5 py-4 text-sm font-black text-[#07111f]"><DownloadIcon className="mr-2 inline h-4 w-4" /> Manual completo PDF</button>
     <button onClick={() => window.open('/manuals/crewcheck-sincronizacao-calendario.pdf', '_blank', 'noopener,noreferrer')} className="crewcheck-calendar-guide-link rounded-2xl bg-emerald-100 px-5 py-4 text-sm font-black text-[#07111f]"><CalendarDays className="mr-2 inline h-4 w-4" /> Guia calendário PDF</button>
     <button onClick={() => window.open('/manuals/crewcheck-novas-funcionalidades-v11.pdf', '_blank', 'noopener,noreferrer')} className="rounded-2xl bg-violet-200 px-5 py-4 text-sm font-black text-[#07111f]"><Sparkles className="mr-2 inline h-4 w-4" /> Novidades v11</button>
     <button onClick={() => void sendSupportTicketFromSettings()} disabled={supportSending || !supportIsPremium} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-center text-sm font-black text-cyan-50 disabled:opacity-60"><Mail className="mr-2 inline h-4 w-4" /> {supportSending ? 'Enviando...' : supportIsPremium ? 'Falar com suporte' : 'Suporte Premium'}</button>
     <button onClick={() => void openPremiumWhatsAppSupport()} disabled={!supportIsPaidPremium} className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 px-5 py-4 text-center text-sm font-black text-emerald-50 disabled:opacity-60"><MessageCircle className="mr-2 inline h-4 w-4" /> WhatsApp Premium</button>
     {annualSubscriber && <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-5 py-4 text-sm font-bold leading-5 text-amber-50"><Sparkles className="mr-2 inline h-4 w-4" /> Assinante anual: envie recomendações de melhorias com prioridade.</div>}
    </div>
    <button onClick={copySupportSummary} className="mt-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-black text-white">Copiar resumo para suporte</button>
   </SettingsCategoryCard>
  );
 }

 return (
  <div className="min-h-screen bg-[#08111f] pb-28 text-white crewcheck-settings-screen crewcheck-settings-categories-premium crewcheck-settings-scroll-fix">
   <div className="pointer-events-none fixed inset-0 opacity-90"><div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(14,165,233,0.18),transparent_28rem),radial-gradient(circle_at_90%_5%,rgba(37,99,235,0.14),transparent_30rem),linear-gradient(180deg,#08111f_0%,#07111f_50%,#020817_100%)]" /></div>
   <div className="relative z-10 mx-auto max-w-7xl px-5 py-7 crewcheck-settings-page-inner">
    <HeaderBack title="Configurações" subtitle="Submenus completos e intuitivos" onBack={onBack} />
    <div className="mt-5 rounded-[2rem] border border-cyan-200/18 bg-white/[0.07] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl">
     <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div><p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/65">CrewCheck v{APP_VERSION}</p><h2 className="mt-1 text-3xl font-black tracking-tight">Configurações completas</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Submenus completos para conta, permissões, localização, Telegram, alertas, agenda, financeiro, exportações e privacidade.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={onOpenImport} className="crewcheck-premium-button crewcheck-premium-button-primary rounded-2xl bg-cyan-300 px-4 py-3 text-xs font-black text-[#07111f]">Importar escala</button><button onClick={onLogout} className="crewcheck-premium-button crewcheck-premium-button-ghost rounded-2xl border border-white/10 px-4 py-3 text-xs font-black text-white">Sair</button></div>
     </div>
    </div>
    <div className="mt-6 grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
     <aside className="space-y-3 lg:sticky lg:top-6 lg:self-start crewcheck-settings-category-list">
      {categories.map(({ key, title, text, icon: Icon, badge, tone }) => {
       const active = activeCategory === key;
       return <button key={key} onClick={() => openSettingsCategory(key)} className={`flex w-full items-center gap-3 rounded-[1.35rem] border p-3 text-left transition active:scale-[0.99] ${active ? 'border-cyan-300/50 bg-cyan-300/14 shadow-xl shadow-cyan-950/20' : 'border-white/10 bg-white/[0.045] hover:bg-white/[0.075]'} ${settingsPulse === key ? 'ring-2 ring-cyan-200/70 scale-[1.01]' : ''}`}><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-[#06101d] shadow-lg`}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-black text-white">{title}</span><span className="block truncate text-xs font-semibold text-slate-400">{text}</span></span>{badge && <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100">{badge}</span>}</button>;
      })}
     </aside>
     <main ref={settingsContentRef} className="min-w-0 scroll-mt-6 crewcheck-settings-content-panel">{renderCategoryContent()}</main>
    </div>
   </div>
  </div>
 );
}

function SettingsMiniInfo({ title, text, icon: Icon }: { title: string; text: string; icon: LucideIcon }) {
 return <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4"><Icon className="mb-3 h-5 w-5 text-cyan-200" /><p className="text-sm font-black text-white">{title}</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-400">{text}</p></div>;
}

function SettingsCategoryCard({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
 return <section className="rounded-[2rem] border border-white/10 bg-white/[0.065] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-6"><p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/60">{eyebrow}</p><h3 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h3><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p><div className="mt-5">{children}</div></section>;
}


function QrCodeIcon() {
 return <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true"><path fill="currentColor" d="M3 3h7v7H3V3Zm2 2v3h3V5H5Zm9-2h7v7h-7V3Zm2 2v3h3V5h-3ZM3 14h7v7H3v-7Zm2 2v3h3v-3H5Zm10-2h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v3h-2v-3Zm3-1h3v2h-1v2h-2v-4Zm-5-4h2v2h-2v-2Zm0 5h2v2h-2v-2Z" /></svg>;
}

function BillingSettingsCard({ status, busy, onRefresh, onStartTrial, onSubscribe, onRegularizeTrial, onCancel }: {
 status: BillingStatus | null;
 busy: boolean;
 onRefresh: () => void;
 onStartTrial: (cpfCnpj: string) => Promise<BillingStatus | null>;
 onSubscribe: (planId: 'premium_monthly' | 'premium_annual', cpfCnpj: string, billingType: BillingCheckoutBillingType) => Promise<BillingCheckoutResponse | null>;
 onRegularizeTrial: (cpfCnpj: string) => Promise<BillingStatus | null>;
 onCancel: () => void;
}) {
 const plans = status?.plans || [];
 const monthly = plans.find((plan) => plan.id === 'premium_monthly') || { id: 'premium_monthly', name: 'Premium mensal', value: 19.9, currency: 'BRL', cycle: 'MONTHLY', description: 'Premium completo com radar, Extra e e-mail interno.' };
 const annual = plans.find((plan) => plan.id === 'premium_annual') || { id: 'premium_annual', name: 'Premium anual', value: 179.9, currency: 'BRL', cycle: 'YEARLY', description: 'Premium completo com desconto anual.' };
 const free = plans.find((plan) => plan.id === 'free') || { id: 'free', name: 'Básico gratuito', value: 0, currency: 'BRL', cycle: 'FREE', description: 'Escala e recursos essenciais sem cobrança.' };
 const annualSavings = Math.max(0, Number(monthly.value || 0) * 12 - Number(annual.value || 0));
 const promoMonths = Number(status?.pricePolicy?.monthlyPromoMonths || monthly.promoDurationMonths || 6);
 const promoEndLabel = status?.pricePolicy?.promoEndsAt ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(`${status.pricePolicy.promoEndsAt}T12:00:00`)) : '19/07';
 const monthlyRegularAfterPromo = status?.pricePolicy?.monthlyRegularValueAfterPromo || monthly.regularValueAfterPromo || monthly.originalValue || 19.9;
 const annualRegularAfterPromo = status?.pricePolicy?.annualRegularValueAfterPromo || annual.regularValueAfterPromo || annual.originalValue || 179.9;
 const monthlyPromoDetail = `Assine até ${promoEndLabel}: valor promocional garantido por ${promoMonths} meses. Depois: ${formatBillingValue(monthlyRegularAfterPromo, monthly.currency)}/mês.`;
 const annualPromoDetail = `Assine até ${promoEndLabel}: desconto no primeiro ano. Renovação: ${formatBillingValue(annualRegularAfterPromo, annual.currency)}/ano, salvo nova promoção vigente.`;
 const activeLabel = status ? billingStatusLabel(status.status) : 'Carregando';
 const premium = Boolean(status?.premiumAccess);
 const isLifetime = String(status?.status || '').toLowerCase() === 'lifetime' || status?.plan?.id === 'premium_lifetime';
 const endDate = isLifetime ? null : (status?.trialExpiresAt || status?.premiumExpiresAt || null);
 const endLabel = endDate ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(endDate)) : null;
 const [checkoutPlan, setCheckoutPlan] = useState<'premium_trial' | 'premium_regularize' | 'premium_monthly' | 'premium_annual' | null>(null);
 const [checkoutPhase, setCheckoutPhase] = useState<'form' | 'creating' | 'ready' | 'done'>('form');
 const [checkoutResult, setCheckoutResult] = useState<BillingCheckoutResponse | null>(null);
 const [checkoutMessage, setCheckoutMessage] = useState('');
 const [checkoutFrameOpen, setCheckoutFrameOpen] = useState(false);
 const [checkoutReadyView, setCheckoutReadyView] = useState<'options' | 'pix'>('options');
 const [checkoutBillingType, setCheckoutBillingType] = useState<BillingCheckoutBillingType>('UNDEFINED');
 const [cpfInput, setCpfInput] = useState('');
 const [safetyNoticeAccepted, setSafetyNoticeAccepted] = useState(false);
 const [planDetailsOpen, setPlanDetailsOpen] = useState(false);
 const cpfDigits = normalizeCpfInput(cpfInput);
 const selectedPlan = checkoutPlan === 'premium_annual' ? annual : monthly;
 const checkoutIsTrial = checkoutPlan === 'premium_trial';
 const checkoutIsRegularization = checkoutPlan === 'premium_regularize';
 const checkoutIsPaidPlan = checkoutPlan === 'premium_monthly' || checkoutPlan === 'premium_annual';
 const payment = checkoutResult?.payment || null;
 const pixQrCode = payment?.pixQrCode || null;
 const pixPayload = String(pixQrCode?.payload || '');
 const qrImageSrc = pixQrCode?.encodedImage ? `data:image/png;base64,${pixQrCode.encodedImage}` : '';
 const checkoutUrl = payment?.invoiceUrl || checkoutResult?.checkoutUrl || null;
 const dueDateRaw = payment?.dueDate || checkoutResult?.firstDueDate || null;
 const dueDateLabel = dueDateRaw ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${dueDateRaw}T12:00:00`)) : null;
 const paymentValueLabel = payment?.value ? formatBillingValue(payment.value, selectedPlan.currency) : formatBillingValue(selectedPlan.value, selectedPlan.currency);
 const paymentMethodOptions: Array<{ type: BillingCheckoutBillingType; title: string; description: string; badge: string }> = [
  { type: 'UNDEFINED', title: 'Pagamento completo', description: 'Mantém as formas de pagamento disponíveis: Pix, boleto e cartão quando liberados.', badge: 'Recomendado' },
  { type: 'PIX', title: 'Pix dentro do app', description: 'Mostra QR Code e Pix copia e cola dentro do CrewCheck quando disponível.', badge: 'Rápido' },
  { type: 'CREDIT_CARD', title: 'Cartão recorrente', description: 'Você informa o cartão no ambiente seguro de pagamento. O CrewCheck não coleta dados do cartão.', badge: 'Crédito/débito' },
  { type: 'BOLETO', title: 'Boleto', description: 'Gera boleto e página segura de pagamento para conclusão.', badge: 'Alternativo' },
 ];
 const selectedPaymentMethod = paymentMethodOptions.find((option) => option.type === checkoutBillingType) || paymentMethodOptions[0];
 const pixAvailable = Boolean(qrImageSrc || pixPayload);
 const canShowPixPanel = checkoutReadyView === 'pix' && pixAvailable;
 const secureCheckoutLabel = checkoutBillingType === 'CREDIT_CARD' ? 'Abrir cartão seguro' : checkoutBillingType === 'BOLETO' ? 'Abrir boleto seguro' : 'Abrir checkout seguro';
 const paymentActionLabel = checkoutIsTrial ? 'Iniciar teste grátis' : checkoutIsRegularization ? 'Regularizar assinatura' : checkoutBillingType === 'PIX' ? 'Criar cobrança Pix' : checkoutBillingType === 'CREDIT_CARD' ? 'Criar assinatura no cartão' : checkoutBillingType === 'BOLETO' ? 'Criar cobrança boleto' : 'Criar pagamento seguro';
 const creatingMethodText = checkoutBillingType === 'PIX' ? 'gerando Pix' : checkoutBillingType === 'CREDIT_CARD' ? 'preparando cartão' : checkoutBillingType === 'BOLETO' ? 'gerando boleto' : 'preparando opções';

 function openCpfCheckout(planId: 'premium_trial' | 'premium_regularize' | 'premium_monthly' | 'premium_annual') {
  setCheckoutPlan(planId);
  setCheckoutPhase('form');
  setCheckoutResult(null);
  setCheckoutMessage('');
  setCheckoutFrameOpen(false);
  setCheckoutReadyView('options');
  setCheckoutBillingType('UNDEFINED');
  setCpfInput('');
  setSafetyNoticeAccepted(false);
 }

 function closeCheckoutModal() {
  if (checkoutPhase === 'creating') return;
  setCheckoutPlan(null);
  setCheckoutPhase('form');
  setCheckoutResult(null);
  setCheckoutMessage('');
  setCheckoutFrameOpen(false);
  setCheckoutReadyView('options');
  setCheckoutBillingType('UNDEFINED');
  setCpfInput('');
  setSafetyNoticeAccepted(false);
 }

 async function copyPixPayload() {
  if (!pixPayload) {
   toast.info('O Pix copia e cola ainda não está disponível. Use o botão de pagamento seguro.');
   return;
  }
  try {
   await navigator.clipboard?.writeText(pixPayload);
   toast.success('Pix copia e cola copiado.');
  } catch {
   toast.info('Não consegui copiar automaticamente. Selecione e copie o código exibido.');
  }
 }

 async function confirmCpfCheckout() {
  if (!checkoutPlan || checkoutPhase === 'creating') return;
  if (cpfDigits.length !== 11) {
   toast.error('Informe um CPF válido com 11 dígitos para continuar.');
   return;
  }
  if (!safetyNoticeAccepted) {
   toast.error('Leia e confirme a ciência sobre uso auxiliar do CrewCheck antes de assinar.');
   return;
  }
  setCheckoutPhase('creating');
  setCheckoutMessage(checkoutIsPaidPlan ? `Criando cobrança ${selectedPaymentMethod.title.toLowerCase()} sem abrir pop-up. Isso pode levar alguns segundos.` : 'Criando uma cobrança segura dentro do CrewCheck. Isso pode levar alguns segundos.');
  setCheckoutResult(null);
  setCheckoutFrameOpen(false);
  setCheckoutReadyView('options');
  if (checkoutPlan === 'premium_trial') {
   const result = await onStartTrial(cpfDigits);
   if (result) {
    setCheckoutMessage(result.message || 'Teste Premium liberado. A primeira cobrança fica programada para depois do período grátis.');
    setCheckoutPhase('done');
   } else {
    setCheckoutPhase('form');
    setCheckoutMessage('');
   }
   return;
  }
  if (checkoutPlan === 'premium_regularize') {
   const result = await onRegularizeTrial(cpfDigits);
   if (result) {
    setCheckoutMessage(result.message || 'Assinatura regularizada. Atualize o status quando concluir o pagamento.');
    setCheckoutPhase('done');
   } else {
    setCheckoutPhase('form');
    setCheckoutMessage('');
   }
   return;
  }
  const result = await onSubscribe(checkoutPlan, cpfDigits, checkoutBillingType);
  if (result) {
   setCheckoutResult(result);
   setCheckoutReadyView('options');
   setCheckoutMessage(result.message || 'Cobrança criada. Escolha cartão, débito, boleto ou Pix no checkout seguro.');
   setCheckoutPhase('ready');
  } else {
   setCheckoutPhase('form');
   setCheckoutMessage('');
  }
 }

 const checkoutTitle = checkoutIsRegularization ? 'Regularizar Premium' : checkoutIsTrial ? 'Teste grátis Premium' : selectedPlan.name;
 const checkoutSubtitle = checkoutIsRegularization
  ? 'Confirme o CPF para manter o Premium ativo. O sistema cria a cobrança sem abrir nova aba automaticamente.'
  : checkoutIsTrial
   ? `Informe o CPF para liberar o teste. A primeira cobrança fica programada para depois de ${status?.trialDays || 7} dias.`
   : 'Escolha a forma de cobrança. O CrewCheck mostra apenas o essencial e só exibe Pix se você tocar nessa opção.';

 return (
  <SettingsCategoryCard eyebrow="Assinatura" title="Premium CrewCheck" description={`Mais do que ver escala: organização de rotina, descanso priorizado e tempo de qualidade. Mensal promocional por ${promoMonths} meses para contratações até 19 de julho.`}>
   <div className="rounded-[2rem] border border-amber-200/25 bg-gradient-to-br from-amber-200/16 via-white/[0.055] to-cyan-300/10 p-5 shadow-2xl shadow-black/20">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
     <div>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-100/70">Status atual</p>
      <h4 className="mt-1 text-3xl font-black text-white">{activeLabel}</h4>
      <p className="mt-2 text-sm leading-6 text-slate-300">{isLifetime ? 'Premium Unlimited liberado. Esta conta não gera cobrança nem precisa iniciar teste.' : premium ? 'Recursos premium liberados nesta conta.' : 'Você está no plano básico gratuito. CPF não é necessário no modo grátis.'} {endLabel ? `Validade prevista: ${endLabel}.` : ''}</p>
     </div>
     <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onRefresh} disabled={busy} className="crewcheck-premium-button crewcheck-premium-button-ghost rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-black text-white disabled:opacity-50"><RefreshCw className={`mr-2 inline h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Atualizar</button>
      {status?.trialEligible && <button type="button" onClick={() => openCpfCheckout('premium_trial')} disabled={busy || !status?.asaasConfigured} className="crewcheck-premium-button crewcheck-premium-button-warm rounded-2xl px-4 py-3 text-xs font-black disabled:opacity-50"><Sparkles className="mr-2 inline h-4 w-4" /> Teste grátis</button>}
     </div>
    </div>
    {!status?.asaasConfigured && !isLifetime && <div className="mt-4 rounded-2xl border border-amber-200/30 bg-amber-200/12 p-4 text-sm leading-6 text-amber-50"><AlertTriangle className="mr-2 inline h-4 w-4" /> Pagamento online temporariamente indisponível. Tente novamente mais tarde.</div>}
    {isLifetime && <div className="mt-4 rounded-2xl border border-emerald-200/30 bg-emerald-300/12 p-4 text-sm font-bold leading-6 text-emerald-50"><Shield className="mr-2 inline h-4 w-4" /> Premium Unlimited: sem cobrança enquanto a conta estiver autorizada.</div>}
    {!premium && !isLifetime && <div className="mt-4 rounded-2xl border border-cyan-200/25 bg-cyan-300/10 p-4 text-sm font-bold leading-6 text-cyan-50"><Shield className="mr-2 inline h-4 w-4" /> No plano gratuito, o CrewCheck não pede CPF. Ele só aparece se você iniciar teste grátis, assinar ou regularizar uma cobrança.</div>}
    {status?.needsAsaasRegularization && !isLifetime && <div className="mt-4 rounded-2xl border border-rose-200/35 bg-rose-300/14 p-4 text-sm leading-6 text-rose-50 shadow-xl shadow-rose-950/20">
     <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
       <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-100/75">Atualização necessária</p>
       <p className="mt-1 font-bold">{status.regularizationMessage || 'Confirme a assinatura para manter o Premium ativo após o teste.'}</p>
       {status.regularizationFirstDueDate && <p className="mt-1 text-xs font-semibold text-rose-50/75">Primeira cobrança programada: {new Intl.DateTimeFormat('pt-BR').format(new Date(`${status.regularizationFirstDueDate}T12:00:00`))}.</p>}
      </div>
      <button type="button" onClick={() => openCpfCheckout('premium_regularize')} disabled={busy || !status?.asaasConfigured} className="shrink-0 rounded-2xl bg-white px-4 py-3 text-xs font-black text-[#7f1d1d] disabled:opacity-50">Regularizar agora</button>
     </div>
    </div>}
   </div>

   <div className="mt-5 rounded-[1.8rem] border border-cyan-200/20 bg-cyan-300/10 p-4 text-sm font-bold leading-6 text-cyan-50"><Sparkles className="mr-2 inline h-4 w-4" /> Premium Unlimited: agradecemos aos primeiros apoiadores que ajudaram a manter o CrewCheck em desenvolvimento. Essa nomenclatura será preservada nas contas já autorizadas.</div>

   <div className="mt-5 rounded-[2rem] border border-cyan-200/25 bg-[#07111f]/70 p-5 shadow-xl shadow-cyan-950/20">
    <div className="grid gap-4 lg:grid-cols-[1.15fr_.85fr] lg:items-center">
     <div>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/65">Checkout premium</p>
      <h4 className="mt-1 text-2xl font-black text-white">Pague com confiança, sem pop-up automático</h4>
      <p className="mt-2 text-sm leading-6 text-slate-300">O CrewCheck cria a cobrança, mantém a tela com status claro e deixa cartão, débito, boleto ou Pix organizados em opções. Dados do cartão ficam somente no ambiente seguro de pagamento.</p>
     </div>
     <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
      <StatusTile icon={Lock} title="Seguro" text="sem dados técnicos" />
      <StatusTile icon={Loader2} title="Com status" text="não parece travado" />
      <StatusTile icon={CreditCard} title="Opções de pagamento" text="cartão, boleto e Pix" />
     </div>
    </div>
   </div>

   <div className="mt-5 grid gap-4 lg:grid-cols-3">
    <PlanCard
     title={free.name}
     price={formatBillingValue(free.value, free.currency)}
     caption="Uso básico sem cobrança"
     features={["Importar PDF da escala oficial", "Programação a seguir e escala por dia", "Cálculo local de diárias e salário", "Rotina, descanso e relatórios locais", "Moedas, estacionamento e legenda", "Manual, modo demonstração e suporte básico"]}
     footer="Sem CPF, sem cartão e sem cobrança no modo gratuito."
    />
    <PlanCard
     highlight
     title={monthly.name}
     price={`${formatBillingValue(monthly.value, monthly.currency)}/mês`} originalPrice={`${formatBillingValue(monthly.originalValue || 19.9, monthly.currency)}/mês`} promoEndsAt={promoEndLabel} promoDetail={monthlyPromoDetail}
     caption="Recursos com suporte e serviços externos"
     features={["Tudo do plano gratuito", "Radar com portão/status quando disponível", "Sincronização e alertas avançados", "Suporte prioritário", "Ajuda a manter a estrutura do projeto"]}
     actionLabel="Assinar mensal"
     onAction={() => openCpfCheckout('premium_monthly')}
     disabled={busy || !status?.asaasConfigured}
     footer={`Promoção por ${promoMonths} meses para contratações até ${promoEndLabel}. Depois, ${formatBillingValue(monthlyRegularAfterPromo, monthly.currency)}/mês.`}
    />
    <PlanCard
     title={annual.name}
     price={`${formatBillingValue(annual.value, annual.currency)}/ano`} originalPrice={`${formatBillingValue(annual.originalValue || 179.9, annual.currency)}/ano`} promoEndsAt={promoEndLabel} promoDetail={annualPromoDetail}
     caption={annualSavings > 0 ? `Desconto de lançamento: economiza ${formatBillingValue(annualSavings, annual.currency)} no primeiro ano` : 'Pagamento anual com desconto premium'}
     features={["Tudo do Premium mensal", "Pagamento anual com desconto", "Suporte e melhorias priorizadas", "Menos renovações durante o ano", "Apoio à continuidade do CrewCheck"]}
     actionLabel="Assinar anual"
     onAction={() => openCpfCheckout('premium_annual')}
     disabled={busy || !status?.asaasConfigured}
     footer={`Promoção no primeiro ano. Renovação: ${formatBillingValue(annualRegularAfterPromo, annual.currency)}/ano.`}
    />
   </div>

   <div className="mt-5 flex justify-center">
    <button type="button" onClick={() => setPlanDetailsOpen(!planDetailsOpen)} className="rounded-2xl border border-cyan-200/25 bg-cyan-300/10 px-5 py-3 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/15">
     {planDetailsOpen ? 'Ocultar detalhes dos planos' : 'Saiba mais sobre os planos'}
    </button>
   </div>

   {planDetailsOpen && <>
    <PremiumMissionStory monthlyValue={formatBillingValue(monthly.value, monthly.currency)} trialDays={status?.trialDays || 7} />
    <PremiumTrustPromise />
    <BillingComparisonTable free={free} monthly={monthly} annual={annual} trialDays={status?.trialDays || 7} />
   </>}

   <div className="mt-5 grid gap-4 xl:grid-cols-2">
    <Version11FeatureBox
     eyebrow="Plano gratuito"
     title="Recursos locais sem cobrança"
     description="Ferramentas locais ficam disponíveis sem cobrança para organizar a escala, rotina, descanso e relatórios básicos."
     items={[
      'Escala organizada por dia',
      'Exportação para calendário externo',
      'Programação a seguir com leitura clara',
      'Legenda de códigos da escala',
      'Privacidade configurável',
      'Suporte gratuito e manual'
     ]}
    />
    <Version11FeatureBox
     popular
     eyebrow="Assinatura"
     title="Premium para recursos com custo de manutenção"
     description="O plano gratuito reúne ferramentas locais. O Premium mantém consultas externas, sincronizações, suporte e evolução contínua."
     items={[
      'Consulta de voo/portão quando houver serviço externo',
      'Radar com atualização e histórico aprimorados',
      'Suporte direto e prioridade de correções',
      'Estrutura, armazenamento e segurança',
      'Integrações externas quando disponíveis',
      'Futuras integrações crew'
     ]}
    />
   </div>

   {!isLifetime && (premium || status?.hasBillingSubscription) && <button type="button" onClick={onCancel} disabled={busy} className="mt-5 w-full rounded-2xl border border-rose-300/20 bg-rose-300/10 px-5 py-4 text-sm font-black text-rose-50 disabled:opacity-50">Cancelar assinatura premium</button>}

   {checkoutPlan && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/65 p-4 backdrop-blur-md sm:items-center">
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-cyan-200/25 bg-[#07111f] p-5 shadow-2xl shadow-black/45">
     <div className="flex items-start justify-between gap-3">
      <div>
       <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">Pagamento interno</p>
       <h4 className="mt-1 text-2xl font-black text-white">{checkoutTitle}</h4>
       <p className="mt-2 text-sm leading-6 text-slate-300">{checkoutSubtitle}</p>
      </div>
      <button type="button" onClick={closeCheckoutModal} disabled={checkoutPhase === 'creating'} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Fechar</button>
     </div>

     {checkoutPhase === 'form' && <>
      <div className="mt-5 rounded-2xl border border-amber-200/25 bg-amber-200/10 p-4">
       <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100/80">Confirmação</p>
       <p className="mt-2 text-xs font-semibold leading-5 text-amber-50/90">Ferramenta auxiliar. Confirme sempre sua escala e informações oficiais.</p>
       <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/10 p-3 text-xs font-bold leading-5 text-white">
        <input type="checkbox" checked={safetyNoticeAccepted} onChange={(event) => setSafetyNoticeAccepted(event.target.checked)} className="mt-1" />
        <span>Li e estou ciente de que devo conferir as informações nos canais oficiais da companhia.</span>
       </label>
      </div>
      {checkoutIsPaidPlan && <div className="mt-5 rounded-[1.5rem] border border-cyan-200/20 bg-cyan-300/10 p-4">
       <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
         <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/65">Forma de cobrança</p>
         <p className="mt-1 text-xs font-semibold leading-5 text-cyan-50/80">Mantém as formas de pagamento disponíveis. Nenhum dado de cartão é digitado no CrewCheck.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/80">{selectedPaymentMethod.badge}</span>
       </div>
       <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {paymentMethodOptions.map((option) => {
         const active = checkoutBillingType === option.type;
         return (
          <button
           key={option.type}
           type="button"
           onClick={() => setCheckoutBillingType(option.type)}
           className={`rounded-2xl border p-4 text-left transition ${active ? 'border-cyan-200 bg-cyan-200 text-[#07111f] shadow-xl shadow-cyan-950/20' : 'border-white/10 bg-white/[0.055] text-white hover:bg-white/[0.09]'}`}
          >
           <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-black">{option.title}</span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${active ? 'bg-[#07111f] text-cyan-100' : 'bg-white/10 text-slate-300'}`}>{option.badge}</span>
           </div>
           <p className={`mt-2 text-xs font-semibold leading-5 ${active ? 'text-[#123047]' : 'text-slate-300'}`}>{option.description}</p>
          </button>
         );
        })}
       </div>
      </div>}
      <label className="mt-5 block">
       <span className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/60">CPF para teste ou assinatura</span>
       <input
        autoFocus
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        aria-label="CPF para cobrança"
        value={formatCpfInput(cpfInput)}
        onChange={(event) => setCpfInput(event.target.value)}
        placeholder="000.000.000-00"
        className="mt-2 h-14 w-full rounded-2xl border border-cyan-200/20 bg-white/10 px-4 text-lg font-black text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
       />
      </label>
      <div className="mt-4 rounded-2xl border border-cyan-200/20 bg-cyan-300/10 p-4 text-xs font-semibold leading-5 text-cyan-50/90">O CPF só é pedido neste momento porque você escolheu iniciar teste, assinar ou regularizar cobrança. Ele fica visível durante a digitação para conferência e depois não aparece no status do sistema.</div>
      <button type="button" onClick={() => void confirmCpfCheckout()} disabled={busy || cpfDigits.length !== 11 || !safetyNoticeAccepted} className="crewcheck-premium-button crewcheck-premium-button-primary mt-5 w-full rounded-2xl px-5 py-4 text-sm font-black transition disabled:opacity-50">{paymentActionLabel}</button>
     </>}

     {checkoutPhase === 'creating' && <div className="mt-6 rounded-[1.8rem] border border-cyan-200/25 bg-cyan-300/10 p-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-200 text-[#07111f]"><Loader2 className="h-8 w-8 animate-spin" /></div>
      <h5 className="mt-4 text-xl font-black text-white">Criando cobrança segura</h5>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-300">{checkoutMessage || 'Conectando ao provedor de pagamento. A tela continua ativa e o usuário não fica sem resposta.'}</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
       <StatusTile icon={Shield} title="1. Proteção" text="sem exposição de dados" />
       <StatusTile icon={CreditCard} title="2. Cobrança" text={creatingMethodText} />
       <StatusTile icon={CheckCircle2} title="3. Retorno" text={checkoutBillingType === 'PIX' ? 'mostra QR Code' : 'abre seguro'} />
      </div>
     </div>}

     {checkoutPhase === 'ready' && checkoutIsPaidPlan && <div className="mt-6 space-y-4">
      <div className="rounded-[1.8rem] border border-emerald-200/25 bg-emerald-300/10 p-5">
       <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-100/75">Informações de pagamento recebidas</p>
       <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <StatusTile icon={CreditCard} title="Valor" text={paymentValueLabel} />
        <StatusTile icon={Clock} title="Vencimento" text={dueDateLabel || '7 dias após contratação'} />
        <StatusTile icon={Shield} title="Privacidade" text="sem CPF na tela" />
       </div>
       <p className="mt-4 text-sm leading-6 text-emerald-50/90">{checkoutMessage || 'Cobrança criada. Escolha cartão, débito, boleto ou Pix no checkout seguro.'}</p>
      </div>

      {checkoutReadyView === 'options' && <div className="grid gap-3 md:grid-cols-3">
       <button type="button" onClick={() => checkoutUrl && window.open(checkoutUrl, '_blank', 'noopener,noreferrer')} disabled={!checkoutUrl} className="crewcheck-payment-option-card rounded-[1.5rem] border border-cyan-200/25 bg-cyan-300/10 p-5 text-left transition hover:bg-cyan-300/15 disabled:opacity-50">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-200 text-[#07111f]"><CreditCard className="h-6 w-6" /></div>
        <p className="mt-4 text-sm font-black text-white">Cartão ou débito recorrente</p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">Abre manualmente o ambiente seguro de pagamento. O CrewCheck não exibe nem coleta dados de cartão.</p>
        <span className="mt-4 inline-flex rounded-full bg-white px-3 py-2 text-[11px] font-black text-[#07111f]"><ExternalLink className="mr-1.5 h-4 w-4" /> Abrir cartão seguro</span>
       </button>
       <button type="button" onClick={() => pixAvailable ? setCheckoutReadyView('pix') : checkoutUrl && window.open(checkoutUrl, '_blank', 'noopener,noreferrer')} className="crewcheck-payment-option-card rounded-[1.5rem] border border-emerald-200/25 bg-emerald-300/10 p-5 text-left transition hover:bg-emerald-300/15">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-200 text-[#07111f]"><QrCodeIcon /></div>
        <p className="mt-4 text-sm font-black text-white">Pix</p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{pixAvailable ? 'Mostra QR Code e copia e cola somente se o usuário escolher Pix.' : 'Pix disponível no ambiente de pagamento quando liberado.'}</p>
        <span className="mt-4 inline-flex rounded-full border border-emerald-200/35 px-3 py-2 text-[11px] font-black text-emerald-50">{pixAvailable ? 'Ver Pix dentro do app' : 'Abrir checkout'}</span>
       </button>
       <button type="button" onClick={() => checkoutUrl && window.open(checkoutUrl, '_blank', 'noopener,noreferrer')} disabled={!checkoutUrl} className="crewcheck-payment-option-card rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-5 text-left transition hover:bg-white/[0.09] disabled:opacity-50">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#07111f]"><FileText className="h-6 w-6" /></div>
        <p className="mt-4 text-sm font-black text-white">Boleto / demais opções</p>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">Mantém as opções disponíveis sem abrir pop-up automático.</p>
        <span className="mt-4 inline-flex rounded-full border border-white/15 px-3 py-2 text-[11px] font-black text-slate-100">{secureCheckoutLabel}</span>
       </button>
      </div>}

      {canShowPixPanel && <div className="space-y-3">
       <button type="button" onClick={() => setCheckoutReadyView('options')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-xs font-black text-white">Voltar para opções de pagamento</button>
       <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="rounded-[1.5rem] border border-white/10 bg-white p-4 text-center text-[#07111f]">
         {qrImageSrc ? <img src={qrImageSrc} alt="QR Code Pix" className="mx-auto h-52 w-52 rounded-xl object-contain" /> : <div className="flex h-52 items-center justify-center rounded-xl bg-slate-100 p-4 text-sm font-black text-slate-500">Use o Pix copia e cola</div>}
         <p className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Pix QR Code</p>
        </div>
        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-4">
         <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/65">Pix copia e cola</p>
         <textarea readOnly value={pixPayload || 'Pix copia e cola ainda não disponível. Use o checkout seguro.'} className="mt-3 h-28 w-full resize-none rounded-2xl border border-white/10 bg-[#020817] p-3 text-xs font-semibold leading-5 text-slate-100 outline-none" />
         <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={() => void copyPixPayload()} disabled={!pixPayload} className="rounded-2xl bg-cyan-200 px-4 py-3 text-xs font-black text-[#07111f] disabled:opacity-50">Copiar Pix</button>
          <button type="button" onClick={onRefresh} disabled={busy} className="rounded-2xl border border-emerald-200/30 bg-emerald-300/10 px-4 py-3 text-xs font-black text-emerald-50 disabled:opacity-50"><RefreshCw className={`mr-2 inline h-4 w-4 ${busy ? 'animate-spin' : ''}`} /> Já paguei / atualizar</button>
         </div>
        </div>
       </div>
      </div>}

      <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-4">
       <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-cyan-100"><Shield className="h-5 w-5" /></div>
        <div>
         <p className="text-sm font-black text-white">Sem dados pessoais expostos no CrewCheck</p>
         <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">O checkout interno mostra apenas valor, vencimento e opções. Dados cadastrais de pagamento não são embutidos dentro do sistema.</p>
        </div>
       </div>
      </div>
     </div>}

     {checkoutPhase === 'done' && <div className="mt-6 rounded-[1.8rem] border border-emerald-200/25 bg-emerald-300/10 p-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-200 text-[#07111f]"><CheckCircle2 className="h-8 w-8" /></div>
      <h5 className="mt-4 text-xl font-black text-white">Tudo certo</h5>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-emerald-50/90">{checkoutMessage || 'Solicitação registrada com sucesso.'}</p>
      <button type="button" onClick={closeCheckoutModal} className="mt-5 rounded-2xl bg-white px-5 py-4 text-sm font-black text-[#07111f]">Voltar ao CrewCheck</button>
     </div>}
    </div>
   </div>}
  </SettingsCategoryCard>
 );
}

type CrewCheckPlanLike = {
 id?: string;
 name: string;
 value: number;
 currency: string;
 cycle?: string;
 description?: string;
};

function PremiumMissionStory({ monthlyValue, trialDays }: { monthlyValue: string; trialDays: number }) {
 return (
  <div className="mt-5 overflow-hidden rounded-[2rem] border border-cyan-200/25 bg-gradient-to-br from-cyan-300/14 via-white/[0.055] to-emerald-300/10 p-5 shadow-2xl shadow-black/20">
   <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
    <div>
     <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/70">Por que o Premium existe</p>
     <h4 className="mt-2 text-3xl font-black tracking-tight text-white">Mais tempo de qualidade. Menos desgaste tentando decifrar a escala.</h4>
     <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">O CrewCheck foi criado para transformar escala em planejamento: próxima programação, deslocamento, descanso, rotina, diárias, salário, radar e calendário no mesmo lugar. A ideia não é só mostrar voos; é ajudar o tripulante a gastar menos energia com organização e proteger o descanso quando ele é mais necessário.</p>
     <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <StatusTile icon={Clock} title="Descanso primeiro" text="rotina ajustada ao cansaço" />
      <StatusTile icon={Navigation} title="Menos ansiedade" text="próximo passo mais claro" />
      <StatusTile icon={Shield} title="Projeto honesto" text="sem promessa operacional oficial" />
     </div>
    </div>
    <div className="rounded-[1.7rem] border border-white/10 bg-[#020817]/45 p-4">
     <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100/70">Transparência</p>
     <h5 className="mt-2 text-xl font-black text-white">A assinatura mantém o projeto no ar</h5>
     <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">Servidores, banco de dados, segurança, processamento de PDF, suporte, melhorias, consultas de voos e integrações têm custo mensal. O valor de {monthlyValue}/mês ajuda a manter o CrewCheck sustentável sem transformar o app em algo inacessível.</p>
     <div className="mt-4 rounded-2xl border border-emerald-200/25 bg-emerald-300/10 p-4 text-sm font-bold leading-6 text-emerald-50"><Sparkles className="mr-2 inline h-4 w-4" /> Teste por {trialDays} dias antes da primeira cobrança. Use na sua rotina real e veja se faz sentido para você.</div>
    </div>
   </div>
  </div>
 );
}

function PremiumTrustPromise() {
 const items = [
  { icon: Shield, title: 'Sem pegadinha', text: 'cancelamento claro e dados de cobrança protegidos' },
  { icon: CreditCard, title: 'Sem cartão no CrewCheck', text: 'cartão/débito ficam no ambiente seguro de pagamento' },
  { icon: MessageCircle, title: 'Compromisso de suporte', text: 'problemas de cobrança são tratados com transparência' },
 ];
 return (
  <div className="mt-5 rounded-[1.8rem] border border-amber-200/25 bg-amber-200/10 p-5 shadow-xl shadow-black/15">
   <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
    <div className="max-w-3xl">
     <p className="text-xs font-black uppercase tracking-[0.22em] text-amber-100/75">Teste com confiança</p>
     <h4 className="mt-1 text-2xl font-black text-white">Se o CrewCheck não fizer sentido para sua rotina, você não fica preso.</h4>
     <p className="mt-2 text-sm font-semibold leading-6 text-amber-50/85">O Premium é para quem sente valor no dia a dia. Se houver problema de cobrança, falha de acesso ou arrependimento logo após a primeira cobrança, o suporte analisa o caso com boa-fé e busca a melhor solução, inclusive cancelamento ou estorno quando cabível.</p>
    </div>
    <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:w-[34rem] xl:grid-cols-1">
     {items.map(({ icon: Icon, title, text }) => <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.07] p-3"><p className="text-sm font-black text-white"><Icon className="mr-2 inline h-4 w-4 text-amber-100" />{title}</p><p className="mt-1 text-xs font-semibold leading-5 text-amber-50/75">{text}</p></div>)}
    </div>
   </div>
  </div>
 );
}

function BillingComparisonTable({ free, monthly, annual, trialDays }: { free: CrewCheckPlanLike; monthly: CrewCheckPlanLike; annual: CrewCheckPlanLike; trialDays: number }) {
 const rows = [
  { label: 'Valor', free: formatBillingValue(free.value, free.currency), monthly: `${formatBillingValue(monthly.value, monthly.currency)}/mês`, annual: `${formatBillingValue(annual.value, annual.currency)}/ano` },
  { label: 'Cobrança', free: 'Nenhuma', monthly: 'Mensal, cancelável', annual: 'Anual com desconto' },
  { label: 'Teste grátis', free: `${trialDays} dias Premium`, monthly: 'Primeira cobrança após o teste', annual: 'Use mensal para testar antes do anual' },
  { label: 'Escala e Cockpit', free: 'Essencial', monthly: 'Completo', annual: 'Completo' },
  { label: 'Saída Inteligente', free: 'Recursos locais e GPS', monthly: 'serviços externos quando disponíveis', annual: 'serviços externos quando disponíveis' },
  { label: 'Escala organizada', free: 'Cards premium por dia e detalhes claros', monthly: 'Mesmo recurso + sustentabilidade', annual: 'Mesmo recurso + sustentabilidade' },
  { label: 'Rotina e descanso', free: 'Sugestões completas sem serviço pago', monthly: 'Prioridade em melhorias', annual: 'Prioridade em melhorias' },
  { label: 'Relatórios de bordo', free: 'OTP, gerais, MAAS/WCH e PDF local', monthly: 'Suporte e evolução do módulo', annual: 'Suporte e evolução do módulo' },
  { label: 'Extra', free: 'Cálculo local e simulações', monthly: 'Fontes externas quando disponíveis', annual: 'Fontes externas quando disponíveis' },
  { label: 'Radar de voos', free: 'Resumo local/manual', monthly: 'Portão, status e atualização por serviço externo', annual: 'Portão, status e atualização por serviço externo' },
  { label: 'Diárias, salário e moedas', free: 'Cálculo e conversor sem serviço pago', monthly: 'Histórico e continuidade do serviço', annual: 'Histórico e continuidade do serviço' },
  { label: 'Agenda e histórico', free: 'Histórico por usuário e exportação local', monthly: 'Sincronização quando disponível', annual: 'Sincronização quando disponível' },
  { label: 'Suporte', free: 'Manual e FAQ', monthly: 'Suporte Premium', annual: 'Suporte + prioridade em melhorias' },
  { label: 'Indicado para', free: 'Teste e uso ocasional', monthly: 'Uso frequente sem compromisso', annual: 'Melhor custo-benefício' },
 ];
 const columns = [
  { key: 'free', title: free.name, badge: 'Grátis' },
  { key: 'monthly', title: monthly.name, badge: 'Flexível' },
  { key: 'annual', title: annual.name, badge: 'Melhor valor' },
 ] as const;
 return (
  <div className="mt-6 rounded-[1.8rem] border border-cyan-200/18 bg-white/[0.055] p-4 shadow-2xl shadow-black/15 backdrop-blur-2xl sm:p-5">
   <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
    <div>
     <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">Comparativo de versões</p>
     <h4 className="mt-1 text-2xl font-black text-white">Veja o que está incluído em cada opção</h4>
     <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">O plano gratuito reúne as ferramentas locais. O Premium mantém recursos com custo de manutenção, sincronizações, suporte e evolução do CrewCheck.</p>
    </div>
    <Badge className="w-fit rounded-full border-0 bg-emerald-300/15 text-emerald-100">Cancelável quando quiser</Badge>
   </div>

   <div className="mt-5 overflow-x-auto rounded-[1.35rem] border border-white/10">
    <div className="min-w-[720px]">
    <div className="grid grid-cols-[1.08fr_repeat(3,minmax(0,1fr))] bg-white/[0.08] text-[0.68rem] font-black uppercase tracking-[0.14em] text-cyan-100/70">
     <div className="p-3">Recurso</div>
     {columns.map((column) => <div key={column.key} className="border-l border-white/10 p-3"><span className="block text-white">{column.title}</span><span className="mt-1 inline-flex rounded-full bg-cyan-300/15 px-2 py-1 text-[0.6rem] text-cyan-100">{column.badge}</span></div>)}
    </div>
    {rows.map((row, index) => (
     <div key={row.label} className={`grid grid-cols-[1.08fr_repeat(3,minmax(0,1fr))] text-sm ${index % 2 ? 'bg-white/[0.035]' : 'bg-white/[0.015]'}`}>
      <div className="p-3 font-black text-white">{row.label}</div>
      <div className="border-l border-white/10 p-3 font-semibold leading-5 text-slate-300">{row.free}</div>
      <div className="border-l border-white/10 p-3 font-semibold leading-5 text-cyan-50">{row.monthly}</div>
      <div className="border-l border-white/10 p-3 font-semibold leading-5 text-emerald-50">{row.annual}</div>
     </div>
    ))}
    </div>
   </div>

   <div className="mt-4 grid gap-3 md:grid-cols-3">
    <StatusTile icon={Shield} title="Uso individual" text="O Premium é pessoal e pode bloquear escala de terceiros para proteger o sistema." />
    <StatusTile icon={CreditCard} title="CPF no momento certo" text="CPF só aparece ao iniciar teste, assinatura ou regularização." />
    <StatusTile icon={Sparkles} title="Assinatura transparente" text="Teste antes da cobrança e cancele quando quiser." />
   </div>
  </div>
 );
}


function Version11FeatureBox({ eyebrow, title, description, items, popular }: { eyebrow: string; title: string; description: string; items: string[]; popular?: boolean }) {
 return (
  <div className={`relative overflow-hidden rounded-[1.85rem] border p-5 shadow-2xl shadow-black/15 ${popular ? 'border-amber-200/35 bg-gradient-to-br from-amber-200/14 via-white/[0.055] to-cyan-300/10' : 'border-cyan-200/20 bg-white/[0.045]'}`}>
   {popular && <div className="absolute right-4 top-4 rounded-full bg-amber-200 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#07111f]">mais popular</div>}
   <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/65">{eyebrow}</p>
   <h4 className="mt-2 pr-20 text-2xl font-black text-white">{title}</h4>
   <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{description}</p>
   <div className="mt-4 grid gap-2 sm:grid-cols-2">
    {items.map((item) => <p key={item} className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 py-2 text-xs font-bold leading-5 text-slate-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" /> {item}</p>)}
   </div>
  </div>
 );
}

function PlanCard({ title, price, caption, features, actionLabel, onAction, disabled, highlight, originalPrice, promoEndsAt, promoDetail, footer }: {
 title: string;
 price: string;
 originalPrice?: string;
 promoEndsAt?: string;
 promoDetail?: string;
 caption: string;
 features: string[];
 actionLabel?: string;
 onAction?: () => void;
 disabled?: boolean;
 highlight?: boolean;
 footer: string;
}) {
 return (
  <div className={`crewcheck-premium-plan-card ${highlight ? 'is-highlight' : ''} flex min-h-[22rem] flex-col rounded-[1.75rem] border p-5 shadow-2xl shadow-black/15 ${highlight ? 'border-cyan-200/50 bg-cyan-300/12 ring-1 ring-cyan-200/30' : 'border-white/10 bg-white/[0.045]'}`}>
   <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/60">{caption}</p>
   <h4 className="mt-2 text-2xl font-black text-white">{title}</h4>
   <div className="mt-2">
    {originalPrice && originalPrice !== price ? <p className="text-sm font-black text-slate-400 line-through">{originalPrice}</p> : null}
    <p className="text-3xl font-black text-white">{price}</p>
    {originalPrice && originalPrice !== price ? <><p className="mt-2 inline-flex rounded-full bg-rose-400 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-rose-950/20">50% OFF até {promoEndsAt || '19/07'}</p>{promoDetail ? <p className="mt-3 rounded-2xl border border-amber-200/20 bg-amber-200/10 p-3 text-xs font-bold leading-5 text-amber-50">{promoDetail}</p> : null}</> : null}
   </div>
   <div className="mt-5 space-y-3">
    {features.map((feature) => <p key={feature} className="flex items-start gap-2 text-sm font-semibold leading-5 text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" /> {feature}</p>)}
   </div>
   <div className="mt-auto pt-5">
    {actionLabel && <button type="button" onClick={onAction} disabled={disabled} className="crewcheck-premium-button crewcheck-premium-button-primary w-full rounded-2xl px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50"><span>{actionLabel}</span><ChevronRight className="h-4 w-4" /></button>}
    <p className="mt-3 text-xs font-semibold leading-5 text-slate-400">{footer}</p>
   </div>
  </div>
 );
}

function StatusTile({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
 return <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><Icon className="mb-3 h-6 w-6 text-cyan-200" /><p className="font-black text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{text}</p></div>;
}

function ThemeSettingsCard({ themeMode, onThemeModeChange }: { themeMode: CrewThemeMode; onThemeModeChange: (mode: CrewThemeMode) => void }) {
 const options: { value: CrewThemeMode; title: string; text: string; icon: LucideIcon }[] = [
  { value: 'light', title: 'Claro', text: 'Interface branca e limpa', icon: Sun },
  { value: 'dark', title: 'Escuro', text: 'Visual premium noturno', icon: Moon },
  { value: 'system', title: 'Sistema', text: 'Segue Android/navegador', icon: Monitor },
 ];
 return (
  <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:p-6">
   <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
    <div>
     <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/60">aparência</p>
     <h3 className="mt-1 text-2xl font-black">Tema claro e escuro</h3>
     <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Escolha o tema do CrewCheck. A preferência fica salva neste dispositivo e vale para o app, web, dashboard, resultados e configurações.</p>
    </div>
    <Badge className="rounded-full border-0 bg-cyan-300/15 text-cyan-100">{themeMode === 'system' ? 'Automático' : themeMode === 'light' ? 'Claro' : 'Escuro'}</Badge>
   </div>
   <div className="mt-5 grid gap-3 sm:grid-cols-3">
    {options.map(({ value, title, text, icon: Icon }) => {
     const active = themeMode === value;
     return (
      <button key={value} type="button" onClick={() => onThemeModeChange(value)} className={`rounded-[1.35rem] border p-4 text-left transition active:scale-[0.99] ${active ? 'border-cyan-300/60 bg-cyan-300/15 text-cyan-50 shadow-lg shadow-cyan-950/25' : 'border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]'}`}>
       <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active ? 'bg-cyan-300 text-[#07111f]' : 'bg-white/10 text-cyan-200'}`}><Icon className="h-5 w-5" /></div>
        <div>
         <p className="font-black">{title}</p>
         <p className="mt-0.5 text-xs leading-4 text-slate-400">{text}</p>
        </div>
       </div>
      </button>
     );
    })}
   </div>
  </div>
 );
}


function applyCrewCheckVisualColorsLocal() {
 try {
  const root = document.documentElement;
  const map: Array<[string, string, string]> = [
   ['crewcheck_color_flight_bg', '--cc-scale-flight-bg', '#e0f2fe'],
   ['crewcheck_color_flight_fg', '--cc-scale-flight-fg', '#082f49'],
   ['crewcheck_color_extra_bg', '--cc-scale-extra-bg', '#e2e8f0'],
   ['crewcheck_color_extra_fg', '--cc-scale-extra-fg', '#0f172a'],
   ['crewcheck_color_routine_bg', '--cc-routine-pill-bg', '#ffffff'],
   ['crewcheck_color_routine_fg', '--cc-routine-pill-fg', '#0f172a'],
   ['crewcheck_color_safe_bg', '--cc-routine-safe-bg', '#d1fae5'],
   ['crewcheck_color_safe_fg', '--cc-routine-safe-fg', '#064e3b'],
  ];
  for (const [key, cssVar, fallback] of map) root.style.setProperty(cssVar, localStorage.getItem(key) || fallback);
 } catch {}
}

function CrewCheckColorSettingsCard() {
 const defaults = {
  flightBg: localStorage.getItem('crewcheck_color_flight_bg') || '#e0f2fe',
  flightFg: localStorage.getItem('crewcheck_color_flight_fg') || '#082f49',
  extraBg: localStorage.getItem('crewcheck_color_extra_bg') || '#e2e8f0',
  extraFg: localStorage.getItem('crewcheck_color_extra_fg') || '#0f172a',
  routineBg: localStorage.getItem('crewcheck_color_routine_bg') || '#ffffff',
  routineFg: localStorage.getItem('crewcheck_color_routine_fg') || '#0f172a',
  safeBg: localStorage.getItem('crewcheck_color_safe_bg') || '#d1fae5',
  safeFg: localStorage.getItem('crewcheck_color_safe_fg') || '#064e3b',
 };
 const [colors, setColors] = useState(defaults);
 function save(next = colors) {
  const pairs: Array<[keyof typeof next, string]> = [
   ['flightBg','crewcheck_color_flight_bg'], ['flightFg','crewcheck_color_flight_fg'],
   ['extraBg','crewcheck_color_extra_bg'], ['extraFg','crewcheck_color_extra_fg'],
   ['routineBg','crewcheck_color_routine_bg'], ['routineFg','crewcheck_color_routine_fg'],
   ['safeBg','crewcheck_color_safe_bg'], ['safeFg','crewcheck_color_safe_fg'],
  ];
  pairs.forEach(([field, key]) => localStorage.setItem(key, String(next[field])));
  applyCrewCheckVisualColorsLocal();
  window.dispatchEvent(new Event('crewcheck:visual-colors-change'));
  toast.success('Cores da escala e rotina salvas.');
 }
 function update(field: keyof typeof colors, value: string) {
  const next = { ...colors, [field]: value };
  setColors(next);
  save(next);
 }
 const rows: Array<[keyof typeof colors, string]> = [
  ['flightBg','Fundo voo normal'], ['flightFg','Fonte voo normal'], ['extraBg','Fundo Extra'], ['extraFg','Fonte Extra'],
  ['routineBg','Fundo cards rotina'], ['routineFg','Fonte cards rotina'], ['safeBg','Fundo sem choque'], ['safeFg','Fonte sem choque'],
 ];
 return (
  <SettingsCategoryCard eyebrow="Personalização visual" title="Cores da escala e dos cards" description="Defina cor de fundo e fonte dos cards de escala e dos selos de rotina, confiança, choque de horário e tipo de atividade.">
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {rows.map(([field, label]) => <label key={field} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><span className="block text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/70">{label}</span><input type="color" value={colors[field]} onChange={(event) => update(field, event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-transparent" /></label>)}
   </div>
   <div className="mt-4 flex flex-wrap gap-2"><span className="rounded-full px-3 py-2 text-xs font-black" style={{ background: colors.routineBg, color: colors.routineFg }}>confiança alta</span><span className="rounded-full px-3 py-2 text-xs font-black" style={{ background: colors.safeBg, color: colors.safeFg }}>sem choque</span><span className="rounded-full px-3 py-2 text-xs font-black" style={{ background: colors.flightBg, color: colors.flightFg }}>voo normal</span></div>
  </SettingsCategoryCard>
 );
}

function ProfileField({ label, value, placeholder, onChange, uppercase = false }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; uppercase?: boolean }) {
 return (
  <label className="block">
   <span className="text-xs font-black uppercase tracking-[0.14em] text-cyan-100/60">{label}</span>
   <input value={uppercase ? String(value || '').toUpperCase() : value} onChange={(event) => onChange(uppercase ? event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : event.target.value)} placeholder={placeholder} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-semibold text-white outline-none placeholder:text-slate-600 focus:border-cyan-300" />
  </label>
 );
}

function QuickConfigButton({ icon: Icon, title, text, onClick, tone }: { icon: LucideIcon; title: string; text: string; onClick: () => void; tone: 'cyan' | 'blue' | 'slate' | 'orange' | 'emerald' | 'violet' }) {
 const tones: Record<typeof tone, string> = {
  cyan: 'from-cyan-300/20 to-blue-500/10 text-cyan-100',
  blue: 'from-blue-300/20 to-indigo-500/10 text-blue-100',
  slate: 'from-slate-200/15 to-slate-600/10 text-slate-100',
  orange: 'from-orange-300/20 to-amber-500/10 text-orange-100',
  emerald: 'from-emerald-300/20 to-teal-500/10 text-emerald-100',
  violet: 'from-violet-300/20 to-fuchsia-500/10 text-violet-100',
 };
 return (
  <button onClick={onClick} className={`w-full rounded-[1.7rem] border border-white/10 bg-gradient-to-br ${tones[tone]} p-5 text-left shadow-xl shadow-black/20 transition hover:border-cyan-200/30 hover:bg-white/[0.08]`}>
   <Icon className="mb-4 h-8 w-8" />
   <h3 className="text-lg font-black">{title}</h3>
   <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
  </button>
 );
}


function SystemStatusScreen({ onBack }: { onBack: () => void }) {
 const [loading, setLoading] = useState(false);
 const [radar, setRadar] = useState<any>(null);
 const [db, setDb] = useState<any>(null);
 const [auth, setAuth] = useState<any>(null);
 const [billingHealth, setBillingHealth] = useState<any>(null);
 const [links, setLinks] = useState<any>(null);
 const [billingDashboard, setBillingDashboard] = useState<any>(null);
 const [systemDashboard, setSystemDashboard] = useState<any>(null);
 async function load() {
  setLoading(true);
  try {
   const token = getToken();
   const headers = token ? { authorization: `Bearer ${token}` } : undefined;
   const [radarPayload, dbPayload, authPayload, billingPayload, linksPayload, billingDashboardPayload, systemDashboardPayload] = await Promise.all([
    fetch('/api/radar-health?airport=BSB&type=departure', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha radar' })),
    fetch('/api/db/status', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha banco' })),
    fetch('/api/auth/config', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha auth' })),
    fetch('/api/billing/health', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha Asaas' })),
    fetch('/api/app-links', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha links' })),
    fetch('/api/admin/billing/dashboard', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha financeiro' })),
    fetch('/api/admin/system-dashboard', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha sistema' })),
   ]);
   setRadar(radarPayload);
   setDb(dbPayload);
   setAuth(authPayload);
   setBillingHealth(billingPayload);
   setLinks(linksPayload);
   setBillingDashboard(billingDashboardPayload);
   setSystemDashboard(systemDashboardPayload);
  } finally {
   setLoading(false);
  }
 }
 useEffect(() => { void load(); }, []);
 const tiles = [
  { title: 'Banco de dados', ok: Boolean(db?.ok && db?.connected !== false), detail: db?.database || db?.database_name || db?.engine || db?.message || 'verificando' },
  { title: 'Radar / voos', ok: Boolean(radar?.ok), detail: radar?.source || radar?.message || 'BSB departure health' },
  { title: 'Google Flights', ok: Boolean(radar?.hasSerpAPI || radar?.hasSearchAPI), detail: (radar?.hasSerpAPI || radar?.hasSearchAPI) ? 'fonte de voos configurada' : 'não configurado' },
  { title: 'Financeiro Asaas', ok: Boolean(billingDashboard?.ok), detail: billingDashboard?.ok ? `${billingDashboard?.totals?.activePremiumUsers || 0} premium · ${billingDashboard?.totals?.pastDue || 0} inadimplente(s)` : 'dashboard indisponível' },
  { title: 'Lucro estimado', ok: Boolean(systemDashboard?.finance), detail: systemDashboard?.finance ? `${formatMoney(systemDashboard.finance.monthlyProfit || 0)} / mês · margem ${systemDashboard.finance.profitMarginPercent === null || systemDashboard.finance.profitMarginPercent === undefined ? '—' : `${Number(systemDashboard.finance.profitMarginPercent).toFixed(1)}%`}` : 'configure custos' },
  { title: 'MRR / ARR', ok: Boolean(systemDashboard?.finance), detail: systemDashboard?.finance ? `${formatMoney(systemDashboard.finance.mrr || 0)} MRR · ${formatMoney(systemDashboard.finance.arr || 0)} ARR` : 'sem dados financeiros' },
  { title: 'Logos de companhias', ok: true, detail: 'Companhias sem logo usam selo CrewCheck e aparecem para revisão admin' },
  { title: 'Asaas / cobrança', ok: Boolean(billingHealth?.ok), detail: billingHealth?.message || (billingHealth?.configured ? 'configurado, aguardando teste' : 'chave de cobrança ausente') },
  { title: 'APK / Google Play', ok: Boolean(links?.androidPlayUrl), detail: links?.androidPlayUrl || 'configure CREWCHECK_ANDROID_PLAY_URL' },
  { title: 'E-mail e captcha', ok: Boolean(auth?.ok), detail: `E-mail: ${auth?.emailVerificationRequired ? 'validação ativa' : 'sem validação'} · Captcha: ${auth?.captchaRequired ? 'ativo' : 'opcional'}` },
 ];
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
   <div className="mx-auto max-w-5xl">
    <HeaderBack title="Status do Sistema" subtitle="Painel administrativo: serviços, banco, radar e segurança" onBack={onBack} />
    <section className="mt-6 rounded-[2rem] border border-cyan-200/20 bg-gradient-to-br from-cyan-300/15 via-white/[0.06] to-blue-500/10 p-5 shadow-2xl shadow-black/25">
     <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/65">Admin only</p><h2 className="mt-1 text-3xl font-black">Saúde operacional CrewCheck</h2><p className="mt-2 text-sm leading-6 text-slate-300">Use para validar banco, e-mail, financeiro, Google Flights e radar sem expor detalhes internos.</p></div>
      <button onClick={() => void load()} disabled={loading} className="rounded-2xl bg-cyan-200 px-5 py-4 text-sm font-black text-[#07111f] disabled:opacity-60"><RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
     </div>
    </section>
    <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
     {tiles.map((tile) => <div key={tile.title} className={`rounded-[1.5rem] border p-4 shadow-xl ${tile.ok ? 'border-emerald-200/25 bg-emerald-300/10' : 'border-amber-200/25 bg-amber-300/10'}`}><div className="flex items-center justify-between gap-3"><p className="text-sm font-black text-white">{tile.title}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tile.ok ? 'bg-emerald-200 text-emerald-950' : 'bg-amber-200 text-amber-950'}`}>{tile.ok ? 'OK' : 'Atenção'}</span></div><p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{String(tile.detail || 'sem detalhe')}</p></div>)}
    </div>
    <section className="mt-5 grid gap-4 lg:grid-cols-3">
     <div className="rounded-[1.7rem] border border-emerald-200/20 bg-emerald-300/10 p-5 shadow-xl shadow-black/20">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/70">Faturamento previsto</p>
      <h3 className="mt-2 text-3xl font-black text-white">{formatMoney(systemDashboard?.finance?.mrr || billingDashboard?.forecast?.mrr || 0)}</h3>
      <p className="mt-2 text-sm font-semibold text-emerald-50/75">MRR estimado · ARR {formatMoney(systemDashboard?.finance?.arr || billingDashboard?.forecast?.arr || 0)}</p>
     </div>
     <div className="rounded-[1.7rem] border border-cyan-200/20 bg-cyan-300/10 p-5 shadow-xl shadow-black/20">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/70">Custos configurados</p>
      <h3 className="mt-2 text-3xl font-black text-white">{formatMoney(systemDashboard?.finance?.fixedCosts || billingDashboard?.forecast?.fixedCosts || 0)}</h3>
      <p className="mt-2 text-sm font-semibold text-cyan-50/75">Inclui hospedagem, voos, e-mail, mapas, domínio e outros custos informados.</p>
     </div>
     <div className="rounded-[1.7rem] border border-violet-200/20 bg-violet-300/10 p-5 shadow-xl shadow-black/20">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/70">Lucro real estimado</p>
      <h3 className="mt-2 text-3xl font-black text-white">{formatMoney(systemDashboard?.finance?.monthlyProfit || billingDashboard?.forecast?.monthlyProfit || 0)}</h3>
      <p className="mt-2 text-sm font-semibold text-violet-50/75">Baseado em assinaturas ativas, inadimplência e custos configurados.</p>
     </div>
    </section>
    <section className="mt-5 rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-4">
     <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">Serviços monitorados</p>
     <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {(systemDashboard?.services || []).map((svc: any) => <div key={svc.key || svc.label} className={`rounded-2xl border p-3 ${svc.ok ? 'border-emerald-200/20 bg-emerald-300/10' : 'border-amber-200/20 bg-amber-300/10'}`}><p className="text-sm font-black text-white">{svc.label}</p><p className="mt-1 text-xs leading-5 text-slate-300">{svc.detail}</p></div>)}
     </div>
    </section>
    <section className="mt-5 rounded-[1.7rem] border border-white/10 bg-white/[0.045] p-4">
     <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">Diagnóstico</p>
     <pre className="mt-3 max-h-[24rem] overflow-auto rounded-2xl bg-black/35 p-4 text-xs leading-5 text-cyan-50">{JSON.stringify({ radar, db, auth, billingHealth, billingDashboard, systemDashboard, links }, null, 2)}</pre>
    </section>
   </div>
  </div>
 );
}

function MorePanel({ onBack, onNavigate, onLogout, pendingOffline, hasRoster, canAccessC32FAcademy }: { onBack: () => void; onNavigate: (view: string) => void; onLogout: () => void; pendingOffline: number; hasRoster: boolean; canAccessC32FAcademy: boolean }) {
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
   <div className="mx-auto max-w-4xl">
    <HeaderBack title="Mais funções" subtitle="Menu completo do CrewCheck" onBack={onBack} />
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
     <MenuAction icon={Sparkles} title="Tutorial Premium" text="Rever o guia inicial do CrewCheck" onClick={() => onNavigate('tutorial')} />
     <MenuAction icon={CloudUpload} title="Importar nova escala" text="PDF CrewRosterReport/AIMS ou Telegram" onClick={() => onNavigate('import')} />
     <MenuAction icon={CreditCard} title="Assinatura" text="Gerenciar Premium, planos e cobrança" onClick={() => onNavigate('billing')} />
     {canAccessC32FAcademy && <MenuAction icon={Plane} title="iFlight Admin" text="AutoPull admin" onClick={() => onNavigate('iflight')} />}
     <MenuAction icon={History} title="Gerenciador de Escalas" text="Ver ativa, reprocessar ou excluir" onClick={() => onNavigate('history')} />
     <MenuAction icon={Bell} title="Alertas" text="Irregularidades e avisos" onClick={() => onNavigate('alerts')} />
     <MenuAction icon={Monitor} title="Monitores de Voos" text="Painel estilo aeroporto, por localidade e companhia" onClick={() => onNavigate('flightboard')} />
     <MenuAction icon={Clock} title="Galaxy Watch" text="Atalho curto /w para relógio Samsung/Wear OS" onClick={() => { window.location.href = '/w'; }} />
     <MenuAction icon={Clock} title="Apple Watch" text="Atalho curto /aw para abrir escala compacta" onClick={() => { window.location.href = '/aw'; }} />
     <MenuAction icon={DownloadIcon} title="Baixar Android / APK" text="Abrir Google Play teste ou atalho /apk" onClick={() => { window.open('/apk', '_blank', 'noopener,noreferrer'); }} />
     <MenuAction icon={Navigation} title="Saída Inteligente" text="Hora de sair com trânsito real e margem de 15 min" onClick={() => onNavigate('departure')} />
     <MenuAction icon={ClipboardList} title="Chefe de Cabine IA" text="Caderno de bordo, água, horários, check-in e relatório" onClick={() => onNavigate('chief')} />
     <MenuAction icon={FileText} title="Checklist Médico" text="Formulário de ocorrência, PDF e compartilhamento" onClick={() => onNavigate('chief')} />
     <MenuAction icon={Sparkles} title="Sugestões dos colegas" text="Formulário interno para melhorias do CrewCheck" onClick={() => onNavigate('chief')} />
     <MenuAction icon={FileText} title="Previsão de Diárias" text="Café, almoço, jantar, ceia e total estimado pela escala" onClick={() => onNavigate('perdiem')} />
     <MenuAction icon={DollarSign} title="Conversor de Moedas" text="Cotação do dia e conversão de diárias internacionais" onClick={() => onNavigate('currency')} />
     <MenuAction icon={Car} title="Onde estacionei" text="Salve vaga, setor, piso e GPS do carro" onClick={() => onNavigate('parking')} />
     <MenuAction icon={Clock} title="Conferência de Ceia" text="Só conta se voo ou reserva cruzar 00:00–01:00" onClick={() => onNavigate('perdiem')} />
     <MenuAction icon={TrendingUp} title="Previsão de Salário" text="Bruto, líquido, descontos e holerite opcional" onClick={() => onNavigate('salary')} />
     <MenuAction icon={Radar} title="Extra" text="Melhor opção, voos reais e conexões cabíveis" onClick={() => onNavigate('departureExtra')} />
     {canAccessC32FAcademy && <MenuAction icon={BarChart3} title="Dashboard Admin" text="Saúde, financeiro, usuários e gerenciamento" onClick={() => onNavigate('admin')} />}
     {canAccessC32FAcademy && <MenuAction icon={Activity} title="Status do Sistema" text="serviços, banco, e-mail, mapas e radar" onClick={() => onNavigate('systemstatus')} />}
     {canAccessC32FAcademy && <MenuAction icon={GraduationCap} title="C32F / Check A32F" text="Apostila, revisão rápida e mapas A32F" onClick={() => onNavigate('c32f')} />}
     <MenuAction icon={BarChart3} title="Relatórios" text="Métricas e PDF" onClick={() => onNavigate('reports')} />
     <MenuAction icon={FileText} title="Exportar tudo em PDF" text={hasRoster ? "Relatório completo da escala atual" : "Importe/abra uma escala primeiro"} onClick={() => onNavigate('pdf')} />
     <MenuAction icon={CalendarDays} title="Exportar tudo para calendário" text="ICS completo com lembretes" onClick={() => onNavigate('ics')} />
     <MenuAction icon={CalendarDays} title="Google Calendar" text="Sincronismo automático sem duplicidade" onClick={() => onNavigate('google')} />
     <MenuAction icon={CalendarDays} title="Calendário" text="Visual, ICS e Google" onClick={() => onNavigate('calendar')} />
     <MenuAction icon={Settings} title="Configurações" text="Conta, rotina e Google" onClick={() => onNavigate('settings')} />
     <MenuAction icon={ExternalLink} title="Google Play" text="Página de teste do app Android" onClick={() => { window.open('/apk', '_blank', 'noopener,noreferrer'); }} />
     <MenuAction icon={Mail} title="Suporte" text="Enviar erro, PDF ou print" onClick={() => onNavigate('support')} />
     <MenuAction icon={Database} title="Atualizar ICS offline" text={`${pendingOffline} pendência(s)`} onClick={() => onNavigate('sync')} />
     <MenuAction icon={LogOut} title="Sair" text="Encerrar sessão" onClick={onLogout} />
    </div>
    <div className="mt-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/10 px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">
     Premium · LGPD · Offline-first
    </div>
   </div>
  </div>
 );
}


function C32FStudyPanel({ onBack, onOpenRoster }: { onBack: () => void; onOpenRoster: () => void }) {
 const [pdfUrl, setPdfUrl] = useState<string | null>(null);
 const [pdfStatus, setPdfStatus] = useState<'loading' | 'ready' | 'error'>('loading');
 const [pdfPage, setPdfPage] = useState(1);
 const [pdfZoom, setPdfZoom] = useState<'page-width' | 'page-fit' | '100' | '125' | '150'>('page-width');
 const [c32fViewMode, setC32fViewMode] = useState<'reader' | 'pdf'>('reader');

 useEffect(() => {
  let active = true;
  let objectUrl = '';

  async function loadProtectedPdf() {
   try {
    setPdfStatus('loading');
    const token = getToken();
    const response = await fetch('/api/c32f/apostila-pdf', {
     headers: token ? { authorization: `Bearer ${token}` } : {},
     cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    if (active) {
     setPdfUrl(objectUrl);
     setPdfStatus('ready');
    } else {
     URL.revokeObjectURL(objectUrl);
    }
   } catch {
    if (active) setPdfStatus('error');
   }
  }

  loadProtectedPdf();
  return () => {
   active = false;
   if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
 }, []);

 const modules = [
  { title: 'Revisão relâmpago', tag: 'decorar', text: '2.000 ft: Tripulação a seus postos. 500 ft: Posição de impacto. 11.500 ft: Airbus bright + cintos + luzes de emergência. 14.000 ft: queda automática das máscaras.' },
  { title: 'Primeiros socorros', tag: 'AMPLA/RPPP', text: 'AMPLA: Alergias, Medicações, Passado médico, Líquidos/alimentos, Associação ao evento. RPPP: Respiração, Pulso, Pele, Pupilas.' },
  { title: 'RCP e DEA', tag: 'crítico', text: 'Treine o fluxo de avaliação, acionamento do DEA, segurança da cena e situações em que o atendimento é assumido ou interrompido conforme manual vigente.' },
  { title: 'Combate ao fogo', tag: 'cabine', text: 'Funções: combatente, assistente, comunicador e suporte. Revise porta quente/fria, bin, áreas ocultas, rescaldo e vigilância contínua.' },
  { title: 'Evacuação A32F', tag: 'mapas', text: 'Revise A319, A320, A321 e A321neo. Atenção: A321 clássico usa referência central A4/A5; no A321neo mantém A3 na dianteira direita.' },
  { title: 'Kits e oxigênio', tag: 'equip.', text: 'Diferencie KIM, KPS, KPU e KME. Associe cada kit à finalidade prática e revise máscaras, cilindros e fluxo de despressurização.' },
 ];

 const quickQuestions = [
  'Consigo falar os callouts principais sem olhar?',
  'Sei explicar ATAC: Atendente, Transportador, Assistente e Comunicador?',
  'Sei diferenciar porta quente e porta fria em ocorrência de fogo?',
  'Sei quando bloquear uma saída insegura e redirecionar fluxo?',
  'Sei explicar a diferença operacional entre A321 clássico e A321neo?',
 ];


 const readerTables = [
  {
   title: 'Quadro premium de memorização rápida',
   subtitle: 'Transformado em tabela larga e legível para estudo direto no sistema, sem depender do zoom do PDF.',
   columns: ['Tema', 'O que decorar'],
   rows: [
    ['Callouts', '“Tripulação a seus postos” • “Posição de impacto” • “Tripulação, evacuar” • “Permaneçam sentados”. Treine falando em voz alta, sem ler.'],
    ['Despressurização', 'Airbus: 11.500 ft = cabine em bright, avisos de cintos e luzes de emergência. 14.000 ft = queda automática das máscaras.'],
    ['Combate ao fogo', 'Memorize os papéis: combatente, assistente, comunicador e suporte. Depois revise base do fogo, distância, rescaldo e vigilância.'],
    ['Primeiros socorros', 'AMPLA, RPPP, ATAC e DEA. Use como roteiro mental para avaliação, comunicação e continuidade do atendimento.'],
    ['Kits', 'KIM, KPS, KPU e KME. Diferencie finalidade, abertura e uso prático de cada kit.'],
    ['Evacuação A32F', 'A321 clássico: atenção ao centro A4/A5. A321neo: mantém A3 na dianteira direita. Revise mapas e lógica do OK de cabine.'],
   ],
   notes: [
    'Use este quadro como aquecimento de 5 minutos antes de estudar o PDF original.',
    'Quando errar um tema, volte ao PDF na página correspondente para conferir a fonte completa.',
   ],
  },
  {
   title: 'Despressurização e descida de emergência · marcos críticos',
   subtitle: 'Quadro refeito com linhas maiores para evitar cortes e perda de informação no iPad/desktop.',
   columns: ['Marco / frota', 'Sinal verificado ou ação esperada'],
   rows: [
    ['Airbus · ~11.500 ft', 'Cabine em BRIGHT, avisos de atar cintos ligados e luzes de emergência acesas.'],
    ['Airbus · ~14.000 ft', 'Queda automática das máscaras. Revise também a lógica de comunicação e altitude segura.'],
    ['B777/B787 · ~10.000 ft', 'Acende aviso de atar cintos com respectivo chime.'],
    ['B777/B787 · ~14.000 ft', 'Queda automática das máscaras, cabine em BRIGHT e chimes específicos da frota.'],
    ['Após “Tripulação, altitude segura”', 'Checar cabine, lavatórios e áreas críticas; comunicar situação geral conforme fluxo do manual vigente.'],
   ],
   notes: [
    'Memorização-chave: 11.500 ft, 14.000 ft, 2.000 ft e 500 ft.',
    'Em caso de divergência operacional, prevalecem o manual e comunicações oficiais vigentes.',
   ],
  },
  {
   title: 'Combate ao fogo · papéis da equipe',
   subtitle: 'Resumo organizado para prova oral/check: quem faz o quê e o que não esquecer.',
   columns: ['Função', 'Responsabilidade prática'],
   rows: [
    ['Combatente', 'Atua diretamente sobre o foco; usa extintor adequado; mira na base do fogo; mantém segurança e comunica necessidade de suporte.'],
    ['Assistente', 'Prepara equipamentos, substitui extintor, auxilia PBE, observa evolução e antecipa recursos.'],
    ['Comunicador', 'Mantém cockpit/chefe de equipe informado com localização, tipo de fogo, recursos usados e evolução.'],
    ['Suporte', 'Controla passageiros, isola área, preserva corredor, evita pânico e organiza contingência.'],
    ['Rescaldo e vigilância', 'Mesmo após aparente extinção, manter rescaldo e vigilância contínua para evitar reignição.'],
   ],
   notes: [
    'Regra prática: atacar a base do fogo e manter distância operacional segura conforme manual.',
    'Fogo oculto, bin e PED/bateria exigem atenção reforçada à vigilância pós-extinção.',
   ],
  },
  {
   title: 'Extintores · aplicação e checagem mental',
   subtitle: 'Versão legível dos pontos mais cobrados sobre tipos, uso e cuidados.',
   columns: ['Tipo', 'Uso / característica principal'],
   rows: [
    ['BCF 1301 · lixeira do lavatório', 'Disparo automático na lixeira do lavatório quando a temperatura atinge aproximadamente 77 °C.'],
    ['Halon / BCF 1211', 'Indicado para classes B e C; pode ser usado em classe A com rescaldo posterior.'],
    ['Kidde / Air Total', 'Verificar fixação, manômetro/área verde, lacre e etiqueta; duração média costuma ser curta, então planeje o uso.'],
    ['P3 HAFEX / Halotron BrX', 'Agente limpo substituto do Halon 1211, com mesma lógica prática de combate.'],
    ['Halon MAIP', 'Manter lógica operacional de checagem, identificação e aplicação conforme item específico do manual.'],
   ],
   notes: [
    'A pergunta de prova costuma misturar tipo de fogo, extintor, PBE e rescaldo.',
    'Nunca trate extinção aparente como final do procedimento: monitore e comunique.',
   ],
  },
  {
   title: 'PBE · função, ativação e sinais de atenção',
   subtitle: 'Quadro expandido para leitura mais limpa que o PDF em tela pequena.',
   columns: ['Modelo / ponto', 'Checagem ou ativação resumida'],
   rows: [
    ['Função geral', 'Proteção respiratória contra fumaça, gases e partículas durante combate ao fogo ou ambiente contaminado.'],
    ['Scott', 'Verificar fixação, data de fabricação e indicador de umidade pelo visor; confirmar condição aceitável conforme padrão do manual.'],
    ['Puritan', 'Verificar fixação e integridade do vácuo da embalagem; vestir e acionar/ajustar conforme tiras indicadas.'],
    ['Drager', 'Verificar fixação, embalagem lacrada e data; ativação conforme mecanismo do modelo.'],
    ['Air Liquide', 'Verificar fixação, data e indicador; ativação ocorre durante abertura/vestimenta, conforme modelo.'],
   ],
   notes: [
    'Associe PBE + extintor + comunicação + suporte de cabine.',
    'Se o modelo mudar na aeronave, prevalece a checagem do equipamento instalado.',
   ],
  },
  {
   title: 'Primeiros socorros · AMPLA e RPPP',
   subtitle: 'Roteiro de avaliação em formato de card/tabela para decorar antes do C32F.',
   columns: ['Item', 'Pergunta ou observação prática'],
   rows: [
    ['A · Alergias', 'Perguntar alergias conhecidas, reações prévias e relação com o evento atual.'],
    ['M · Medicações', 'Verificar medicamentos em uso, dose, horário e se houve uso recente.'],
    ['P · Passado médico', 'Investigar histórico relevante e condições conhecidas.'],
    ['L · Líquidos/alimentos', 'Checar última ingestão de líquidos/alimentos e possíveis gatilhos.'],
    ['A · Associação ao evento', 'Relacionar sinais, sintomas, início e fatores desencadeantes.'],
    ['RPPP', 'Respiração, Pulso, Pele e Pupilas: observar padrão, frequência, cor, temperatura, sudorese e alterações.'],
   ],
   notes: [
    'AMPLA é roteiro de entrevista; RPPP é roteiro de observação clínica.',
    'Documente e comunique conforme fluxo operacional vigente.',
   ],
  },
  {
   title: 'Kits médicos e biossegurança',
   subtitle: 'Quadro refeito para diferenciar finalidade prática de cada kit.',
   columns: ['Kit', 'Finalidade resumida'],
   rows: [
    ['KPS · Kit Primeiros Socorros', 'Itens de curativo e apoio inicial; associe a atendimentos simples e suporte básico.'],
    ['KPU · Kit de Precaução Universal', 'Biossegurança: barreira de proteção, limpeza/absorção e proteção da tripulação/passageiros.'],
    ['KIM · Kit Insumos Médicos', 'Pode ser aberto pela tripulação de cabine; contém insumos médicos de apoio conforme manual vigente.'],
    ['KME · Kit Médico de Emergência', 'Recurso de atendimento médico avançado conforme política operacional; revisar condição de abertura/uso e comunicação.'],
   ],
   notes: [
    'Pergunta típica: qual kit usar, quem pode abrir e qual comunicação fazer.',
    'Não confundir kit de biossegurança com kit de atendimento médico.',
   ],
  },
  {
   title: 'Ressuscitação cardiopulmonar · leitura ampliada',
   subtitle: 'Quadro reformatado para leitura mais nítida em tablet, iPad e desktop.',
   columns: ['Paciente', 'Compressões / ventilações'],
   rows: [
    ['Adulto / adolescente', '05 ciclos de 30 compressões x 02 ventilações; compressões com as duas mãos na metade inferior do esterno.'],
    ['Criança', '10 ciclos de 15 compressões x 02 ventilações; geralmente com uma mão (ou duas, conforme o porte físico).'],
    ['Bebê', '10 ciclos de 15 compressões x 01 ventilação; dois dedos no centro do tórax, logo abaixo da linha mamilar.'],
    ['Neonatal', '10 ciclos de 03 compressões x 01 ventilação; dois polegares sobre o esterno, envolvendo o tórax com as mãos.'],
   ],
   notes: [
    'Seguir sempre o procedimento vigente do manual e da RTM-C aplicável.',
    'Se houver diferença entre este quadro e uma publicação oficial posterior, prevalece a publicação oficial.',
   ],
  },
  {
   title: 'Sobrevivência no mar, deserto e gelo · revisão ampliada',
   subtitle: 'Tabela reformulada em linhas mais longas para leitura confortável dentro do CrewCheck.',
   columns: ['Ambiente', 'Ações e cuidados prioritários'],
   rows: [
    ['Mar', 'Manter organização do grupo; utilizar coletes, auxílio à flutuação e slide raft; priorizar sinalização visível; economizar água e energia.'],
    ['Deserto', 'Primeiros socorros, abrigo/sombra, proteção contra calor/sol, planejamento, racionamento de água e sinalização.'],
    ['Gelo / frio intenso', 'Abrigo e isolamento térmico; proteger extremidades; monitorar hipotermia/congelamento; reduzir vento e conservar calor corporal.'],
    ['Selva', 'Aplicar SAFA + D + A: Sinalização, Abrigo, Fogo, Água, Descanso e Alimentação.'],
   ],
   notes: [
    'Mar: sinalização visível + preservação do grupo + controle de água e energia.',
    'Deserto: abrigo/sombra e água são críticos.',
    'Gelo: abrigo, calor corporal e proteção ao vento/congelamento são críticos.',
   ],
  },
 ];

 const readerBlocks = [
  {
   title: 'Plano de revisão em 30 minutos',
   bullets: [
    '5 min · Callouts e vozes de comando.',
    '5 min · Despressurização e oxigênio.',
    '5 min · Combate ao fogo e funções da equipe.',
    '5 min · RCP/DEA, ATAC e situações de interrupção/assunção do atendimento.',
    '5 min · Mapas de evacuação A32F.',
    '5 min · KIM, KPS, KPU, KME, PBE, extintores e ELT.',
   ],
  },
  {
   title: 'Prioridade máxima de memorização',
   bullets: [
    'AMPLA e RPPP.',
    'ATAC e funções de atendimento.',
    '2.000 ft, 500 ft, 11.500 ft e 14.000 ft.',
    'Porta quente / porta fria no lavatório.',
    'Fogo em bin com PED/bateria de lítio.',
    'A321 clássico x A321neo na distribuição de funções.',
   ],
  },
  {
   title: 'Evacuação A32F · pontos de fala',
   bullets: [
    'Treinar lógica de fluxo, bloqueio de saída insegura e redirecionamento.',
    'Revisar “quem encontra quem” no OK de cabine por configuração.',
    'Não decorar apenas mapa: explique a lógica da função e da confirmação.',
    'A321 clássico e A321neo costumam gerar confusão: revise em separado.',
   ],
  },
  {
   title: 'Como usar esta tela premium',
   bullets: [
    'Use “Leitura guiada” como estudo principal no celular/iPad.',
    'Use “PDF original” para conferir paginação e fidelidade visual.',
    'Use “Abrir PDF em nova aba” quando quiser zoom livre do navegador.',
    'Na véspera do C32F, revise apenas os quadros de memorização e durma bem.',
   ],
  },
 ];

 const pdfChapters = [
  { label: 'Capa V6', page: 1 },
  { label: 'Índice visual', page: 2 },
  { label: 'Dashboard de estudo', page: 3 },
  { label: 'Checklist premium', page: 4 },
  { label: 'Parte I · Base', page: 9 },
  { label: 'Parte II · Crítico', page: 27 },
  { label: 'Apêndice V5 · Master', page: 35 },
 ];

 async function downloadProtectedPdf() {
  try {
   const token = getToken();
   const response = await fetch('/api/c32f/apostila-pdf?download=1', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
   });
   if (!response.ok) throw new Error(`HTTP ${response.status}`);
   const blob = await response.blob();
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.download = 'Apostila_C32F_Check_A32F_V6.pdf';
   document.body.appendChild(link);
   link.click();
   link.remove();
   window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
   toast.error('Não foi possível baixar a apostila C32F. Faça login novamente e tente de novo.');
  }
 }


 function openPdfInNewTab() {
  if (!pdfUrl) return;
  window.open(`${pdfUrl}#page=${pdfPage}&zoom=${pdfZoom}`, '_blank', 'noopener,noreferrer');
 }

 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 pb-32 text-white">
   <div className="mx-auto max-w-6xl">
    <HeaderBack title="C32F / Check A32F" subtitle="Sistema privado de estudo" onBack={onBack} action={<Button onClick={onOpenRoster} className="rounded-2xl bg-cyan-300 text-[#07111f] hover:bg-cyan-200">Ver escala</Button>} />

    <section className="mt-6 overflow-hidden rounded-[2.2rem] border border-cyan-300/20 bg-gradient-to-br from-cyan-300/18 via-white/[0.07] to-fuchsia-400/10 p-6 shadow-2xl shadow-black/30">
     <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
       <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/70">Academia CrewCheck · privado</p>
       <h2 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">C32F Premium · Leitura guiada da Apostila V6</h2>
       <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200/90">A apostila foi transformada em quadros legíveis dentro do CrewCheck. Use a leitura guiada para estudar sem cortes e o PDF original para conferência integral.</p>
      </div>
      <div className="rounded-[1.4rem] border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-50/90">
       Acesso liberado somente para a conta administradora autorizada. Em caso de divergência, prevalecem manuais e comunicações oficiais vigentes.
      </div>
     </div>
    </section>

    <section className="mt-6 grid gap-5 xl:grid-cols-[19rem_1fr]">
     <aside className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/20 xl:sticky xl:top-4 xl:h-fit">
      <div className="mb-4 flex items-center gap-3">
       <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-300 text-[#07111f]"><FileText className="h-5 w-5" /></div>
       <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">C32F V6</p>
        <h3 className="font-black">Estudo guiado</h3>
       </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
       <button
        type="button"
        onClick={() => setC32fViewMode('reader')}
        className={`rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${c32fViewMode === 'reader' ? 'border-cyan-200 bg-cyan-300 text-[#07111f]' : 'border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.09]'}`}
       >
        Leitura guiada
       </button>
       <button
        type="button"
        onClick={() => setC32fViewMode('pdf')}
        className={`rounded-2xl border px-4 py-3 text-center text-sm font-black transition ${c32fViewMode === 'pdf' ? 'border-cyan-200 bg-cyan-300 text-[#07111f]' : 'border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.09]'}`}
       >
        PDF original
       </button>
      </div>

      <div className="mt-4 grid gap-2">
       {pdfChapters.map((chapter) => (
        <button
         key={chapter.label}
         type="button"
         onClick={() => { setPdfPage(chapter.page); setC32fViewMode('pdf'); }}
         className={`rounded-2xl border px-4 py-3 text-left text-sm font-black transition ${pdfPage === chapter.page ? 'border-cyan-200 bg-cyan-300 text-[#07111f]' : 'border-white/10 bg-white/[0.05] text-slate-100 hover:bg-white/[0.09]'}`}
        >
         <span className="block text-[10px] uppercase tracking-[0.16em] opacity-70">Página {chapter.page}</span>
         {chapter.label}
        </button>
       ))}
      </div>

      <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-black/15 p-3">
       <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100/70">Zoom do PDF</label>
       <select value={pdfZoom} onChange={(e) => setPdfZoom(e.target.value as any)} className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none">
        <option value="page-width">Ajustar à largura</option>
        <option value="page-fit">Ajustar à página</option>
        <option value="100">100%</option>
        <option value="125">125%</option>
        <option value="150">150%</option>
       </select>
      </div>

      <div className="mt-4 grid gap-2">
       <Button onClick={downloadProtectedPdf} disabled={pdfStatus !== 'ready'} className="w-full rounded-2xl bg-white text-[#07111f] hover:bg-cyan-50">
        <DownloadIcon className="h-4 w-4" /> Baixar apostila
       </Button>
       <Button onClick={openPdfInNewTab} disabled={pdfStatus !== 'ready'} variant="outline" className="w-full rounded-2xl border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.10]">
        <ExternalLink className="h-4 w-4" /> Abrir PDF em nova aba
       </Button>
      </div>
     </aside>

     <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/20">
      <div className="flex flex-col gap-3 border-b border-white/10 bg-black/15 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
       <div>
        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/70">{c32fViewMode === 'reader' ? 'Leitura guiada premium' : 'Visualizador integrado'}</p>
        <h3 className="text-lg font-black">{c32fViewMode === 'reader' ? 'Conteúdo reformatado para leitura mais nítida' : `Apostila Premium V6 · Página ${pdfPage}`}</h3>
        <p className="mt-1 text-sm text-slate-300">{c32fViewMode === 'reader' ? 'Quadros críticos reescritos em linhas maiores, com melhor centralização e leitura dentro do CrewCheck.' : 'Se o PDF ficar pequeno no dispositivo, use o zoom ou troque para Leitura guiada.'}</p>
       </div>
       <div className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-200">
        {c32fViewMode === 'reader' ? 'Modo leitura' : pdfStatus === 'ready' ? 'PDF carregado' : pdfStatus === 'loading' ? 'Carregando PDF' : 'Falha ao carregar'}
       </div>
      </div>

      {c32fViewMode === 'reader' ? (
       <div className="max-h-[78vh] overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
         <div className="grid gap-4">
          {readerTables.map((table) => (
           <article key={table.title} className="rounded-[1.7rem] border border-white/10 bg-slate-950/45 p-4 md:p-5">
            <h4 className="text-lg font-black text-white md:text-xl">{table.title}</h4>
            <p className="mt-1 text-sm leading-6 text-slate-300">{table.subtitle}</p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-cyan-300/15 bg-white/[0.03]">
             <table className="min-w-full text-left text-sm">
              <thead className="bg-cyan-300 text-[#07111f]">
               <tr>
                {table.columns.map((column) => <th key={column} className="px-4 py-3 font-black">{column}</th>)}
               </tr>
              </thead>
              <tbody>
               {table.rows.map((row) => (
                <tr key={row[0]} className="border-t border-white/10 align-top">
                 <td className="w-[26%] px-4 py-3 font-black text-white">{row[0]}</td>
                 <td className="px-4 py-3 leading-7 text-slate-200">{row[1]}</td>
                </tr>
               ))}
              </tbody>
             </table>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/10 p-4">
             <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-100/80">Memorização rápida</p>
             <ul className="mt-3 grid gap-2 text-sm leading-6 text-amber-50/90">
              {table.notes.map((note) => <li key={note}>• {note}</li>)}
             </ul>
            </div>
           </article>
          ))}
         </div>

         <div className="grid gap-4">
          {readerBlocks.map((block) => (
           <article key={block.title} className="rounded-[1.7rem] border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/10">
            <h4 className="text-lg font-black text-white">{block.title}</h4>
            <div className="mt-4 grid gap-2">
             {block.bullets.map((bullet) => (
              <div key={bullet} className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-200">{bullet}</div>
             ))}
            </div>
           </article>
          ))}
          <article className="rounded-[1.7rem] border border-emerald-300/15 bg-emerald-300/10 p-5">
           <h4 className="text-lg font-black text-emerald-50">Sugestão de uso</h4>
           <ul className="mt-4 grid gap-2 text-sm leading-6 text-emerald-50/90">
            <li>• Use a <b>Leitura guiada</b> para revisar tabelas críticas de forma mais legível.</li>
            <li>• Use o <b>PDF original</b> quando quiser conferir a paginação e o conteúdo integral.</li>
            <li>• Em tablet/iPad, o modo leitura costuma ficar mais claro do que o visualizador nativo do PDF.</li>
           </ul>
          </article>
         </div>
        </div>
       </div>
      ) : (
       <div className="h-[78vh] min-h-[34rem] bg-slate-950/70 p-3 md:p-5">
        {pdfStatus === 'ready' && pdfUrl ? (
         <div className="mx-auto h-full w-full max-w-[1100px] overflow-hidden rounded-[1.6rem] bg-white shadow-2xl shadow-black/30 ring-1 ring-white/10">
          <iframe key={`${pdfUrl}-${pdfPage}-${pdfZoom}`} title="Apostila Premium C32F V6" src={`${pdfUrl}#page=${pdfPage}&zoom=${pdfZoom}`} className="h-full w-full border-0 bg-white" />
         </div>
        ) : (
         <div className="flex h-full items-center justify-center p-6 text-center">
          <div className="max-w-md rounded-[2rem] border border-white/10 bg-white/[0.06] p-6">
           <Loader2 className={`mx-auto h-8 w-8 ${pdfStatus === 'loading' ? 'animate-spin text-cyan-200' : 'text-amber-200'}`} />
           <h3 className="mt-4 text-xl font-black">{pdfStatus === 'loading' ? 'Carregando apostila privada...' : 'Não foi possível abrir o PDF'}</h3>
           <p className="mt-2 text-sm leading-6 text-slate-300">{pdfStatus === 'loading' ? 'O CrewCheck está validando seu login antes de exibir a apostila C32F.' : 'Confirme se você está logado como administrador autorizado e tente atualizar a página.'}</p>
          </div>
         </div>
        )}
       </div>
      )}
     </div>
    </section>

    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
     {modules.map((item) => (
      <article key={item.title} className="crewcheck-light-card rounded-[1.8rem] border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/20">
       <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200"><GraduationCap className="h-6 w-6" /></div>
        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">{item.tag}</span>
       </div>
       <h3 className="text-lg font-black">{item.title}</h3>
       <p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
      </article>
     ))}
    </section>

    <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
     <div className="crewcheck-light-card rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20">
      <h3 className="text-xl font-black">Checklist de prova/check</h3>
      <div className="mt-4 grid gap-3">
       {quickQuestions.map((question, index) => (
        <div key={question} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
         <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-cyan-300 text-sm font-black text-[#07111f]">{index + 1}</span>
         <p className="text-sm leading-6 text-slate-200">{question}</p>
        </div>
       ))}
      </div>
     </div>

     <div className="crewcheck-light-card rounded-[2rem] border border-amber-300/20 bg-amber-400/10 p-5 shadow-2xl shadow-black/20">
      <h3 className="text-xl font-black text-amber-50">Quando aparecer C32F na escala</h3>
      <p className="mt-3 text-sm leading-6 text-amber-50/85">O CrewCheck trata C32F como Check de Competência A32F, separado de voo, folga e Extra. Ele deve aparecer como treinamento/check, entrar no calendário como atividade de solo e servir como gatilho para revisão desta academia.</p>
      <div className="mt-4 rounded-2xl border border-amber-200/20 bg-black/15 p-4 text-sm leading-6 text-amber-50/90">
       Sugestão de rotina: nos 7 dias anteriores, revise um bloco por dia. Na véspera, use apenas revisão rápida e sono.
      </div>
     </div>
    </section>
   </div>
  </div>
 );
}


type PerDiemType = 'CAFE' | 'ALMOCO' | 'JANTAR' | 'CEIA';
type PerDiemCurrency = 'BRL' | 'USD' | 'EUR' | 'GBP';

type PerDiemEntry = {
 date: string;
 dutyCode: string;
 flightKey?: string;
 type: PerDiemType;
 label: string;
 window: string;
 value: number;
 currency: PerDiemCurrency;
 currencyLabel: string;
 countryLabel?: string;
 international: boolean;
 confidence: 'alta' | 'estimada';
 reason: string;
 displayMealSummary?: string;
 displayCount?: number;
 displayDateRange?: string;
 paymentHintOverride?: string;
};

type SalaryDeductionLine = { label: string; value: number; detail?: string };

type PayslipCalibration = {
 fileName: string;
 parsedAt: string;
 gross?: number;
 discounts?: number;
 net?: number;
 baseSalary?: number;
 recurringDeductions?: number;
 lines?: SalaryDeductionLine[];
};

type DirectDiscountOverride = {
 total: number;
 note?: string;
 updatedAt: string;
};

type PerDiemReceivedSample = {
 id: string;
 paymentDate: string;
 amount: number;
 note?: string;
 createdAt: string;
};

const CREW_PERDIEM_RECEIVED_SAMPLES_KEY = 'crewcheck_perdiem_received_samples_v10895';
const CREW_PERDIEM_REAL_WEEK_TOTALS: Record<string, number> = {
 '13/05/2026-19/05/2026': 875.52,
 '20/05/2026-26/05/2026': 656.54,
 '27/05/2026-02/06/2026': 684.00,
 '03/06/2026-09/06/2026': 547.20,
 '10/06/2026-16/06/2026': 738.72,
 '17/06/2026-23/06/2026': 1094.40,
};

const CREW_PERDIEM_DEFAULT_SAMPLES: PerDiemReceivedSample[] = [
 { id: 'seed-2026-06-25', paymentDate: '2026-06-25', amount: 1094.40, note: 'Demonstrativo LATAM 17/06–23/06 · 10 refeições principais · auditoria oficial', createdAt: '2026-06-25T12:00:00.000Z' },
 { id: 'seed-2026-06-03', paymentDate: '2026-06-03', amount: 684.00, note: 'Informado pelo administrador', createdAt: '2026-06-03T12:00:00.000Z' },
 { id: 'seed-2026-06-18', paymentDate: '2026-06-18', amount: 738.72, note: 'Informado pelo administrador · diferença sistêmica compatível com 3 cafés', createdAt: '2026-06-18T12:00:00.000Z' },
 { id: 'seed-2026-06-11', paymentDate: '2026-06-11', amount: 547.20, note: 'Informado pelo administrador', createdAt: '2026-06-11T12:00:00.000Z' },
 { id: 'seed-2026-05-28', paymentDate: '2026-05-28', amount: 656.54, note: 'Informado pelo administrador', createdAt: '2026-05-28T12:00:00.000Z' },
 { id: 'seed-2026-05-21', paymentDate: '2026-05-21', amount: 875.52, note: 'Informado pelo administrador', createdAt: '2026-05-21T12:00:00.000Z' },
];

function readPerDiemReceivedSamples(): PerDiemReceivedSample[] {
 try {
  const raw = localStorage.getItem(CREW_PERDIEM_RECEIVED_SAMPLES_KEY);
  if (!raw) return CREW_PERDIEM_DEFAULT_SAMPLES;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return CREW_PERDIEM_DEFAULT_SAMPLES;
  return parsed.map((item) => ({
   id: String(item.id || `${Date.now()}_${Math.random().toString(36).slice(2)}`),
   paymentDate: String(item.paymentDate || ''),
   amount: Number(item.amount || 0),
   note: String(item.note || ''),
   createdAt: String(item.createdAt || new Date().toISOString()),
  })).filter((item) => item.paymentDate && item.amount > 0);
 } catch {
  return CREW_PERDIEM_DEFAULT_SAMPLES;
 }
}

function savePerDiemReceivedSamples(samples: PerDiemReceivedSample[]): PerDiemReceivedSample[] {
 const normalized = samples
  .map((item) => ({ ...item, amount: Number(item.amount || 0) }))
  .filter((item) => item.paymentDate && item.amount > 0)
  .slice(0, 80);
 try { localStorage.setItem(CREW_PERDIEM_RECEIVED_SAMPLES_KEY, JSON.stringify(normalized)); } catch {}
 return normalized;
}

type AdminPreciseSalaryBreakdown = {
 fgtsBase: number;
 fgts: number;
 inssBase: number;
 irBase: number;
 inss: number;
 irrf: number;
 vgbl: number;
 fixedDiscounts: number;
 coparticipation: number;
 discountLines: SalaryDeductionLine[];
 estimatedDiscounts: number;
 netPrecise: number;
 disclaimer: string;
};

type FlightPayEstimate = {
 date: string;
 flightNumber: string;
 route: string;
 departureTime?: string;
 arrivalTime?: string;
 km: number;
 period: 'Diurno' | 'Noturno' | 'DFS diurno' | 'DFS noturno';
 rate: number;
 amount: number;
 note: string;
};

type SalaryForecast = {
 baseSalary: number;
 dayKm: number;
 nightKm: number;
 dfsDayKm: number;
 dfsNightKm: number;
 flightPay: number;
 flightPayEstimates: FlightPayEstimate[];
 reserveHours: number;
 standbyHours: number;
 reservePay: number;
 standbyPay: number;
 trainingPay: number;
 ccmChiefBonusCount: number;
 ccmChiefBonusPay: number;
 instructorBonusCount: number;
 instructorBonusPay: number;
 dsrPay: number;
 gross: number;
 estimatedDiscounts: number;
 estimatedNet: number;
 adminBreakdown?: AdminPreciseSalaryBreakdown;
 confidence: string;
};

const CREW_DIEM_MAIN_VALUE = 109.44;
const CREW_DIEM_BREAKFAST_VALUE = 27.36;
const CREW_DIEM_DOMESTIC_CURRENCY: PerDiemCurrency = 'BRL';

type InternationalPerDiemRule = {
 country: string;
 group: string;
 currency: PerDiemCurrency;
 mainValue: number;
 source: string;
};

const CREW_INTERNATIONAL_PER_DIEM_RULES: Record<string, InternationalPerDiemRule> = {
 NORTH_AMERICA: { country: 'América do Norte', group: 'América do Norte', currency: 'USD', mainValue: 25.70, source: 'ACT 2025/2027, cláusula 2.4.2' },
 MEXICO: { country: 'México', group: 'México', currency: 'USD', mainValue: 23.00, source: 'ACT 2025/2027, cláusula 2.4.2' },
 SOUTH_AMERICA_CARIBBEAN: { country: 'América do Sul/Caribe', group: 'América do Sul e Caribe', currency: 'USD', mainValue: 21.00, source: 'ACT 2025/2027, cláusula 2.4.2' },
 ARGENTINA: { country: 'Argentina', group: 'Argentina', currency: 'USD', mainValue: 22.05, source: 'ACT 2025/2027, cláusula 2.4.2' },
 CHILE: { country: 'Chile', group: 'Chile', currency: 'USD', mainValue: 25.15, source: 'ACT 2025/2027, cláusula 2.4.2' },
 UNITED_KINGDOM: { country: 'Inglaterra/Reino Unido', group: 'Inglaterra', currency: 'GBP', mainValue: 24.00, source: 'ACT 2025/2027, cláusula 2.4.2' },
 EUROPE: { country: 'Europa', group: 'Europa', currency: 'EUR', mainValue: 23.00, source: 'ACT 2025/2027, cláusula 2.4.2' },
 AFRICA: { country: 'África', group: 'África', currency: 'USD', mainValue: 24.70, source: 'ACT 2025/2027, cláusula 2.4.2' },
 OTHER: { country: 'Demais países', group: 'Demais países', currency: 'USD', mainValue: 21.05, source: 'ACT 2025/2027, cláusula 2.4.2' },
};

const CREW_AIRPORT_INTERNATIONAL_RULE: Record<string, keyof typeof CREW_INTERNATIONAL_PER_DIEM_RULES> = {
 EZE: 'ARGENTINA', AEP: 'ARGENTINA', COR: 'ARGENTINA', MDZ: 'ARGENTINA',
 SCL: 'CHILE',
 MEX: 'MEXICO', CUN: 'MEXICO', GDL: 'MEXICO', MTY: 'MEXICO',
 MIA: 'NORTH_AMERICA', JFK: 'NORTH_AMERICA', EWR: 'NORTH_AMERICA', BOS: 'NORTH_AMERICA', LAX: 'NORTH_AMERICA', MCO: 'NORTH_AMERICA', ATL: 'NORTH_AMERICA', DFW: 'NORTH_AMERICA', YYZ: 'NORTH_AMERICA', YUL: 'NORTH_AMERICA',
 LHR: 'UNITED_KINGDOM', LGW: 'UNITED_KINGDOM',
 MAD: 'EUROPE', BCN: 'EUROPE', LIS: 'EUROPE', OPO: 'EUROPE', CDG: 'EUROPE', ORY: 'EUROPE', FRA: 'EUROPE', MUC: 'EUROPE', AMS: 'EUROPE', FCO: 'EUROPE', MXP: 'EUROPE', ZRH: 'EUROPE',
 JNB: 'AFRICA', CPT: 'AFRICA',
 MVD: 'SOUTH_AMERICA_CARIBBEAN', ASU: 'SOUTH_AMERICA_CARIBBEAN', LIM: 'SOUTH_AMERICA_CARIBBEAN', BOG: 'SOUTH_AMERICA_CARIBBEAN', UIO: 'SOUTH_AMERICA_CARIBBEAN', GYE: 'SOUTH_AMERICA_CARIBBEAN', CCS: 'SOUTH_AMERICA_CARIBBEAN', PTY: 'SOUTH_AMERICA_CARIBBEAN', SJO: 'SOUTH_AMERICA_CARIBBEAN', PUJ: 'SOUTH_AMERICA_CARIBBEAN', SDQ: 'SOUTH_AMERICA_CARIBBEAN', HAV: 'SOUTH_AMERICA_CARIBBEAN',
};
const CREW_SALARY_BASE = 3076.64;
const CREW_KM_DAY_RATE = 0.058547;
// Regra operacional CrewCheck: sábado comum não dobra KM.
// O KM dobra apenas em domingo ou feriado nacional brasileiro.
// Se houver domingo + feriado + noturno, aplica somente 2x; nunca quadruplica.
const CREW_KM_MULTIPLIER_RULE = 'DOMINGO_OU_FERIADO_NACIONAL_2X_SEM_QUADRUPLICAR';
const CREW_KM_NIGHT_RATE = 0.117094;
const CREW_KM_DFS_DAY_RATE = 0.117094;
const CREW_KM_DFS_NIGHT_RATE = 0.117094;
const CREW_RESERVE_HOUR_RATE = 49.765;
const CREW_STANDBY_HOUR_RATE = 16.588;
const CREW_TRAINING_INDEMNITY = 328.32;
const CREW_CCM_CHIEF_BONUS = 54.99;
const CREW_INSTRUCTOR_BONUS = 0; // Instrutor só entra quando houver valor/regra confirmados; treinamento comum usa indenização separada.
const CREW_DSR_FACTOR = 0.32;
const CREW_HISTORICAL_DISCOUNT_FACTOR = 0.61;
const CREW_HISTORICAL_MONTHLY_AVERAGE = { gross: 9779.73, net: 3818.78, discounts: 5960.95, sampleMonths: 4 };
const CREW_ADMIN_ORGANIC_COMPENSATION = 512.77;
const CREW_ADMIN_IRRF_TOP_RATE = 0.275;
const CREW_ADMIN_IRRF_DEDUCTION = 909.00;
const CREW_ADMIN_VGBL_RATE = 0.03;
const CREW_ADMIN_INSS_CAP = 988.07;
const CREW_ADMIN_INSS_EFFECTIVE_RATE = 0.116;
const CREW_ADMIN_COPARTICIPATION_AVG = 84.82;
const CREW_ADMIN_FIXED_DEDUCTIONS: SalaryDeductionLine[] = [
 { label: 'Parcela/crédito trabalhador MCT1', value: 1809.98, detail: 'histórico recorrente' },
 { label: 'Parcela/crédito trabalhador MCT2', value: 213.97, detail: 'histórico recorrente' },
 { label: 'Assistência Médica Amil', value: 565.86 },
 { label: 'Cota adicional Staff Travel', value: 183.00 },
 { label: 'Mensalidade Gympass', value: 199.99, detail: 'valor mais recente' },
 { label: 'Contribuição confed./assist. aeronautas', value: 109.44 },
 { label: 'Mensalidade sindicato aeronautas', value: 62.81 },
 { label: 'Odonto agregados', value: 49.74 },
 { label: 'Assistência odontológica família', value: 17.63 },
 { label: 'Cartão Saúde', value: 14.90 },
 { label: 'Mensalidade Grêmio', value: 9.23 },
];

const CREW_DIEM_WINDOWS: { type: PerDiemType; label: string; start: number; end: number; value: number }[] = [
 { type: 'CAFE', label: 'Café da manhã', start: 5 * 60, end: 8 * 60, value: CREW_DIEM_BREAKFAST_VALUE },
 { type: 'ALMOCO', label: 'Almoço', start: 11 * 60, end: 13 * 60, value: CREW_DIEM_MAIN_VALUE },
 { type: 'JANTAR', label: 'Jantar', start: 19 * 60, end: 20 * 60, value: CREW_DIEM_MAIN_VALUE },
 { type: 'CEIA', label: 'Ceia', start: 0, end: 60, value: CREW_DIEM_MAIN_VALUE },
];

const AIRPORT_COORDS: Record<string, [number, number]> = {
 BSB: [-15.8697, -47.9208], GRU: [-23.4356, -46.4731], CGH: [-23.6261, -46.6564], VCP: [-23.0074, -47.1345], GIG: [-22.8099, -43.2506], SDU: [-22.9105, -43.1631],
 CNF: [-19.6244, -43.9719], REC: [-8.1265, -34.9236], NAT: [-5.7681, -35.3761], SSA: [-12.9086, -38.3225], FOR: [-3.7763, -38.5326], POA: [-29.9944, -51.1714],
 CWB: [-25.5285, -49.1758], GYN: [-16.6320, -49.2207], MAO: [-3.0386, -60.0497], BEL: [-1.3793, -48.4763], FLN: [-27.6705, -48.5477], VIX: [-20.2581, -40.2864],
 MCZ: [-9.5108, -35.7917], JPA: [-7.1458, -34.9486], CPV: [-7.2699, -35.8964], MAB: [-5.3686, -49.1380], AJU: [-10.9840, -37.0703], THE: [-5.0606, -42.8235], SLZ: [-2.5854, -44.2341], CGB: [-15.6529, -56.1167], CGR: [-20.4694, -54.6703],
 BPS: [-16.4386, -39.0809], IOS: [-14.8159, -39.0332], IGU: [-25.5961, -54.4872], NVT: [-26.8794, -48.6514], JOI: [-26.2245, -48.7974], LDB: [-23.3336, -51.1301], UDI: [-18.8828, -48.2253], RAO: [-21.1342, -47.7742],
};

function formatMoney(value: number): string {
 return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPerDiemCurrency(value: number, currency: PerDiemCurrency = 'BRL'): string {
 if (currency === 'BRL') return formatMoney(value);
 if (currency === 'USD') return `U$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
 const locale = currency === 'GBP' ? 'en-GB' : 'pt-PT';
 return value.toLocaleString(locale, { style: 'currency', currency });
}

function emptyPerDiemCurrencyTotals(): Record<PerDiemCurrency, number> {
 return { BRL: 0, USD: 0, EUR: 0, GBP: 0 };
}

function addPerDiemCurrencyTotal(target: Record<PerDiemCurrency, number>, currency: PerDiemCurrency, value: number) {
 target[currency] = Number((target[currency] + value).toFixed(2));
}

function formatPerDiemTotals(totals: Record<PerDiemCurrency, number>): string {
 const order: PerDiemCurrency[] = ['BRL', 'USD', 'EUR', 'GBP'];
 const parts = order.filter((currency) => Math.abs(totals[currency] || 0) > 0.004).map((currency) => formatPerDiemCurrency(totals[currency], currency));
 return parts.length ? parts.join(' + ') : formatMoney(0);
}

function summarizePerDiemEntriesByCurrency(entries: PerDiemEntry[]): string {
 const totals = emptyPerDiemCurrencyTotals();
 for (const entry of entries) addPerDiemCurrencyTotal(totals, entry.currency, entry.value);
 return formatPerDiemTotals(totals);
}

function summarizePerDiemType(entries: PerDiemEntry[], type: PerDiemType): string {
 return summarizePerDiemEntriesByCurrency(entries.filter((entry) => entry.type === type));
}

function loadPayslipCalibration(): PayslipCalibration | null {
 try {
  const raw = localStorage.getItem('crewcheck_admin_payslip_calibration_v1');
  return raw ? JSON.parse(raw) as PayslipCalibration : null;
 } catch { return null; }
}

function savePayslipCalibration(value: PayslipCalibration | null): PayslipCalibration | null {
 try {
  if (value) localStorage.setItem('crewcheck_admin_payslip_calibration_v1', JSON.stringify(value));
  else localStorage.removeItem('crewcheck_admin_payslip_calibration_v1');
 } catch {}
 return value;
}

function loadDirectDiscountOverride(): DirectDiscountOverride | null {
 try {
  const raw = localStorage.getItem('crewcheck_direct_discount_override_v1');
  if (!raw) return null;
  const parsed = JSON.parse(raw) as DirectDiscountOverride;
  return Number.isFinite(parsed.total) && parsed.total >= 0 ? parsed : null;
 } catch { return null; }
}

function saveDirectDiscountOverride(value: DirectDiscountOverride | null): DirectDiscountOverride | null {
 try {
  if (value) localStorage.setItem('crewcheck_direct_discount_override_v1', JSON.stringify(value));
  else localStorage.removeItem('crewcheck_direct_discount_override_v1');
 } catch {}
 return value;
}

function applyDirectDiscountOverrideToForecast(forecast: SalaryForecast, override: DirectDiscountOverride | null): SalaryForecast {
 if (!override || !Number.isFinite(override.total)) return forecast;
 const total = Math.max(0, Number(override.total));
 const net = Math.max(0, forecast.gross - total);
 if (forecast.adminBreakdown) {
  return {
   ...forecast,
   estimatedDiscounts: total,
   estimatedNet: net,
   adminBreakdown: {
    ...forecast.adminBreakdown,
    fixedDiscounts: total,
    estimatedDiscounts: total,
    netPrecise: net,
    discountLines: [{ label: 'Descontos informados pelo usuário', value: total, detail: override.note || 'valor total informado, sem detalhar rubricas' }],
    disclaimer: `${forecast.adminBreakdown.disclaimer} Descontos substituídos pelo valor total informado pelo usuário, sem detalhamento de rubricas.`,
   },
  };
 }
 return {
  ...forecast,
  estimatedDiscounts: total,
  estimatedNet: net,
  confidence: `${forecast.confidence} Descontos substituídos pelo valor total informado pelo usuário, sem detalhamento.`,
 };
}

function parseBrazilMoneyInput(value: string): number | null {
 const normalized = String(value || '').replace(/\s/g, '').replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.');
 const number = Number(normalized);
 return Number.isFinite(number) && number >= 0 ? number : null;
}

function downloadBlobFile(filename: string, blob: Blob) {
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = filename;
 document.body.appendChild(a);
 a.click();
 a.remove();
 setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadTextFile(filename: string, content: string) {
 downloadBlobFile(filename, new Blob([content], { type: 'text/plain;charset=utf-8' }));
}

function buildFinancialPdfBlob(title: string, content: string): Blob {
 const doc = new jsPDF({ unit: 'mm', format: 'a4' });
 const pageWidth = doc.internal.pageSize.getWidth();
 const pageHeight = doc.internal.pageSize.getHeight();
 let y = 18;
 doc.setFillColor(9, 40, 70);
 doc.rect(0, 0, pageWidth, 28, 'F');
 doc.setTextColor(255, 255, 255);
 doc.setFont('helvetica', 'bold');
 doc.setFontSize(16);
 doc.text('CrewCheck Finance', 14, 13);
 doc.setFontSize(10);
 doc.text(title, 14, 21);
 y = 40;
 doc.setTextColor(20, 32, 48);
 doc.setFont('helvetica', 'normal');
 doc.setFontSize(10);
 const lines = doc.splitTextToSize(content, pageWidth - 28);
 for (const line of lines) {
  if (y > pageHeight - 18) {
   doc.addPage();
   y = 18;
  }
  doc.text(String(line), 14, y);
  y += 5;
 }
 doc.setFontSize(8);
 doc.setTextColor(100, 116, 139);
 doc.text('Previsão operacional. Confira sempre com os demonstrativos oficiais.', 14, pageHeight - 10);
 return doc.output('blob');
}

function openShareUrl(url: string) {
 try {
  const native = getCrewCheckNative();
  if (native?.openExternal) {
   native.openExternal(url);
   return;
  }
 } catch {}
 window.open(url, '_blank', 'noopener,noreferrer');
}

async function shareOrDownloadFinancialSummary(filename: string, content: string) {
 try {
  if (navigator.share) {
   await navigator.share({ title: 'CrewCheck Finance', text: content });
   return;
  }
 } catch {}
 downloadTextFile(filename, content);
}

function shareFinancialByWhatsApp(content: string) {
 openShareUrl(`https://wa.me/?text=${encodeURIComponent(content)}`);
}

function shareFinancialByEmail(title: string, content: string) {
 window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(content)}`;
}

async function sendTelegramExport(title: string, content: string, kind: 'summary' | 'pdf' | 'ics' | 'financial' = 'summary') {
 try {
  const excerpt = String(content || '').replace(/\s+/g, ' ').trim().slice(0, 850);
  const response = await fetch('/api/telegram/share', {
   method: 'POST',
   headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
   body: JSON.stringify({ title, content: excerpt, kind }),
   cache: 'no-store',
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; message?: string } | null;
  if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Telegram indisponível.');
  toast.success(payload.message || 'Exportação enviada pelo Telegram.');
 } catch (error) {
  toast.error(error instanceof Error ? error.message : 'Não foi possível exportar pelo Telegram.');
 }
}

function exportFinancialPdf(filename: string, title: string, content: string) {
 downloadBlobFile(filename.replace(/\.txt$/i, '.pdf'), buildFinancialPdfBlob(title, content));
 toast.success('PDF financeiro gerado.');
}

function FinanceShareActions({ filename, title, content }: { filename: string; title: string; content: string }) {
 return (
  <div className="flex flex-wrap justify-end gap-2">
   <Button onClick={() => void shareOrDownloadFinancialSummary(filename, content)} className="rounded-2xl bg-emerald-200 px-3 py-3 text-xs font-black text-[#07111f] hover:bg-emerald-100">Compartilhar</Button>
   <Button onClick={() => shareFinancialByWhatsApp(content)} className="rounded-2xl bg-green-300 px-3 py-3 text-xs font-black text-[#07111f] hover:bg-green-200">WhatsApp</Button>
   <Button onClick={() => shareFinancialByEmail(title, content)} className="rounded-2xl bg-sky-200 px-3 py-3 text-xs font-black text-[#07111f] hover:bg-sky-100">E-mail</Button>
   <Button onClick={() => void sendTelegramExport(title, content, 'financial')} className="rounded-2xl bg-cyan-200 px-3 py-3 text-xs font-black text-[#07111f] hover:bg-cyan-100">Telegram</Button>
   <Button onClick={() => exportFinancialPdf(filename, title, content)} className="rounded-2xl bg-violet-200 px-3 py-3 text-xs font-black text-[#07111f] hover:bg-violet-100">PDF</Button>
  </div>
 );
}

function financialPeriodLabel(bundle: SessionRosterBundle | null): string {
 const first = bundle?.roster.days?.[0]?.date;
 const last = bundle?.roster.days?.[bundle?.roster.days.length - 1]?.date;
 return first && last ? `${first} a ${last}` : 'período atual';
}

async function parsePayslipCalibrationPdf(file: File): Promise<PayslipCalibration> {
 const dataBase64 = await fileToBase64Payload(file);
 const response = await fetch('/api/parse-payslip', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ filename: file.name, dataBase64 }),
 });
 const payload = await response.json().catch(() => null);
 if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não consegui ler o holerite.');
 return {
  fileName: file.name,
  parsedAt: new Date().toISOString(),
  gross: payload.gross,
  discounts: payload.discounts,
  net: payload.net,
  baseSalary: payload.baseSalary,
  recurringDeductions: payload.recurringDeductions,
  lines: payload.lines || [],
 };
}

function applyPayslipCalibrationToForecast(forecast: SalaryForecast, calibration: PayslipCalibration | null): SalaryForecast {
 if (!calibration || !forecast.adminBreakdown) return forecast;
 const admin = forecast.adminBreakdown;
 const calibratedRecurring = Number.isFinite(calibration.recurringDeductions || NaN) ? Number(calibration.recurringDeductions) : admin.fixedDiscounts + admin.coparticipation;
 const calculatedCore = admin.inss + admin.irrf + admin.vgbl;
 const estimatedDiscounts = Math.max(0, calculatedCore + calibratedRecurring);
 const netPrecise = Math.max(0, forecast.gross - estimatedDiscounts);
 const calibrationLine: SalaryDeductionLine = { label: 'Calibração por holerite PDF', value: calibratedRecurring, detail: calibration.fileName };
 return {
  ...forecast,
  adminBreakdown: {
   ...admin,
   fixedDiscounts: calibratedRecurring,
   estimatedDiscounts,
   netPrecise,
   discountLines: [...admin.discountLines.filter((line) => !/Parcela|Assistência|Cota|Gympass|Odonto|Cartão|Mensalidade|Contribuição|Coparticipação/i.test(line.label)), calibrationLine],
   disclaimer: `${admin.disclaimer} Calibrado com holerite local ${calibration.fileName}; o PDF não é enviado a terceiros e a calibração fica neste dispositivo.`,
  },
 };
}


function parseTimeToMinutes(value: string | null | undefined): number | null {
 const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
 if (!match) return null;
 const hours = Number(match[1]);
 const minutes = Number(match[2]);
 if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
 return ((hours * 60 + minutes) % 1440 + 1440) % 1440;
}

function displayMinutes(value: number): string {
 const total = ((Math.round(value) % 1440) + 1440) % 1440;
 return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function dayKey(date: Date): string {
 return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function addDays(date: Date, days: number): Date {
 const copy = new Date(date);
 copy.setDate(copy.getDate() + days);
 return copy;
}

function easterDate(year: number): Date {
 const a = year % 19;
 const b = Math.floor(year / 100);
 const c = year % 100;
 const d = Math.floor(b / 4);
 const e = b % 4;
 const f = Math.floor((b + 8) / 25);
 const g = Math.floor((b - f + 1) / 3);
 const h = (19 * a + b - d - g + 15) % 30;
 const i = Math.floor(c / 4);
 const k = c % 4;
 const l = (32 + 2 * e + 2 * i - h - k) % 7;
 const m = Math.floor((a + 11 * h + 22 * l) / 451);
 const month = Math.floor((h + l - 7 * m + 114) / 31);
 const day = ((h + l - 7 * m + 114) % 31) + 1;
 return new Date(year, month - 1, day);
}

function isKnownBrazilPaymentHoliday(date: Date): boolean {
 const d = date.getDate();
 const m = date.getMonth() + 1;
 const fixed = new Set(['1/1','21/4','1/5','7/9','12/10','2/11','15/11','20/11','25/12']);
 if (fixed.has(`${d}/${m}`)) return true;
 const easter = easterDate(date.getFullYear());
 const movable = [addDays(easter, -48), addDays(easter, -47), addDays(easter, -2), addDays(easter, 60)];
 return movable.some((holiday) => holiday.getFullYear() === date.getFullYear() && holiday.getMonth() === date.getMonth() && holiday.getDate() === date.getDate());
}

function estimatePaymentDateAfterWeeklyClose(endDate: Date): { date: Date; adjusted: boolean; reason: string } {
 const thursday = addDays(endDate, 2);
 if (thursday.getDay() === 4 && isKnownBrazilPaymentHoliday(thursday)) {
  return { date: addDays(thursday, -1), adjusted: true, reason: 'quinta com feriado/ponto facultativo conhecido; pagamento antecipado para quarta' };
 }
 let payment = thursday;
 let adjusted = false;
 while (payment.getDay() === 0 || payment.getDay() === 6 || isKnownBrazilPaymentHoliday(payment)) {
  payment = addDays(payment, -1);
  adjusted = true;
 }
 return { date: payment, adjusted, reason: adjusted ? 'ajustado para dia útil anterior' : 'pagamento estimado na quinta' };
}

function isFinancialStandbyOnly(day: CrewRoster['days'][number]): boolean {
 const code = String(day.pairingCode || day.type || '').toUpperCase();
 return /^(HSB|HSBE|SOBREAVISO)$/.test(code) && !day.legs?.length;
}

function isFinancialReserve(day: CrewRoster['days'][number]): boolean {
 const code = String(day.pairingCode || day.type || '').toUpperCase();
 return /^(ASB|RES|RESERVA)$/.test(code);
}

function isFinancialTraining(day: CrewRoster['days'][number]): boolean {
 const code = String(day.pairingCode || day.type || '').toUpperCase();
 return /^(CBF|EMER|C32F|CRM|MT|TRE|TRAIN|TREINAMENTO)$/.test(code) || String(day.type || '').toUpperCase() === 'TRAINING';
}

function isFinancialFlight(day: CrewRoster['days'][number]): boolean {
 return Boolean(day.legs?.length);
}

function isPerDiemEligibleForWindow(day: CrewRoster['days'][number], mealType: PerDiemType): boolean {
 if (isFinancialStandbyOnly(day)) return false;
 if (mealType === 'CEIA') return isFinancialFlight(day) || isFinancialReserve(day);
 return isFinancialFlight(day) || isFinancialReserve(day) || isFinancialTraining(day);
}

type PerDiemSegmentKind = 'flight' | 'reserve' | 'training' | 'layover';

type PerDiemOperationalSegment = {
 date: string;
 start: number;
 end: number;
 absStart: number;
 absEnd: number;
 code: string;
 flightKey?: string;
 kind: PerDiemSegmentKind;
 confidence: 'alta' | 'estimada';
 reason: string;
 currency: PerDiemCurrency;
 currencyLabel: string;
 countryLabel?: string;
 international: boolean;
 internationalRule?: InternationalPerDiemRule;
};

type PerDiemAnchor = {
 day: CrewRoster['days'][number];
 startAbs: number;
 endAbs: number;
 origin?: string;
 destination?: string;
 code: string;
 flightKey?: string;
};

const CREW_DIEM_TRUST_NOTE = 'Valores nacionais corrigidos para R$ 109,44 por refeição principal e R$ 27,36 para café. O CrewCheck não deve inferir valor unitário dividindo total recebido; ele calcula quantidade pela escala e aplica a tabela configurada. Motor CrewCheck calibrado por demonstrativos LATAM reais e ACT 2025/2027: pernoite fora da base gera almoço/jantar quando cruza as janelas; café entra quando voo/reserva/jornada ativa cruza 05:00–08:00, mas não por pernoite puro; ceia só entra em voo/reserva/tripulante extra quando a apresentação/atividade cruza 00:00–01:00. Base virtual e pernoite dirigido ficam configuráveis para evitar falso positivo.';

type PerDiemUserSettings = {
 baseVirtualEnabled: boolean;
 baseVirtualAirport: string;
 directedLayoverEnabled: boolean;
};

const CREW_PERDIEM_SETTINGS_KEY = 'crewcheck_perdiem_user_settings_v10885';

function readPerDiemUserSettings(): PerDiemUserSettings {
 const fallback: PerDiemUserSettings = { baseVirtualEnabled: false, baseVirtualAirport: '', directedLayoverEnabled: false };
 try {
  const raw = typeof window !== 'undefined' ? window.localStorage.getItem(CREW_PERDIEM_SETTINGS_KEY) : null;
  if (!raw) return fallback;
  const parsed = JSON.parse(raw) as Partial<PerDiemUserSettings>;
  return {
   baseVirtualEnabled: Boolean(parsed.baseVirtualEnabled),
   baseVirtualAirport: String(parsed.baseVirtualAirport || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3),
   directedLayoverEnabled: Boolean(parsed.directedLayoverEnabled),
  };
 } catch {
  return fallback;
 }
}

function savePerDiemUserSettings(next: PerDiemUserSettings): PerDiemUserSettings {
 const normalized: PerDiemUserSettings = {
  baseVirtualEnabled: Boolean(next.baseVirtualEnabled),
  baseVirtualAirport: String(next.baseVirtualAirport || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3),
  directedLayoverEnabled: Boolean(next.directedLayoverEnabled),
 };
 try { if (typeof window !== 'undefined') window.localStorage.setItem(CREW_PERDIEM_SETTINGS_KEY, JSON.stringify(normalized)); } catch {}
 return normalized;
}

function virtualBaseForPerDiem(): string {
 const settings = readPerDiemUserSettings();
 return settings.baseVirtualEnabled ? normalizedAirportCode(settings.baseVirtualAirport) : '';
}

function isSuppressedBaseVirtualLayover(airport: string): boolean {
 const virtualBase = virtualBaseForPerDiem();
 return Boolean(virtualBase && normalizedAirportCode(airport) === virtualBase);
}

function shouldTreatDirectedLayover(day?: CrewRoster['days'][number] | null): boolean {
 const settings = readPerDiemUserSettings();
 if (!settings.directedLayoverEnabled) return false;
 const text = `${day?.type || ''} ${day?.pairingCode || ''} ${day?.hotel || ''} ${day?.rawText || ''}`.toUpperCase();
 return /PERNOITE\s+DIRIGIDO|HOTEL|ACOMOD|ACOMODA/.test(text);
}



type OfficialPerDiemCalibrationRow = {
 date: string;
 type: PerDiemType;
 dutyCode: string;
 value: number;
 source: string;
};

type OfficialInternationalPerDiemCalibrationRow = {
 key: string;
 startDate: string;
 endDate: string;
 type: PerDiemType;
 dutyCode: string;
 flightKey: string;
 countryLabel: string;
 currency: PerDiemCurrency;
 value: number;
 mealSummary: string;
 count: number;
 source: string;
 reason: string;
 matchAirports: string[];
};

// Demonstrativos internacionais oficiais enviados pelo usuário. Mantém o cálculo
// fiel ao contracheque/relatório quando a escala mostra o trecho internacional
// como uma sequência de voos + inativo e o sistema poderia quebrar em vários cards.
const CREW_OFFICIAL_INTERNATIONAL_DIEM_CALIBRATION: OfficialInternationalPerDiemCalibrationRow[] = [
 {
  key: 'EZE-2026-05-LA3953',
  startDate: '09/05/2026',
  endDate: '12/05/2026',
  type: 'JANTAR',
  dutyCode: 'Inativo internacional · Buenos Aires / Ezeiza',
  flightKey: 'Buenos Aires (EZE) · LA3953/090526',
  countryLabel: 'Argentina · Buenos Aires',
  currency: 'USD',
  value: 88.20,
  mealSummary: '2 jantares · 1 almoço · 1 ceia',
  count: 4,
  source: 'Demonstrativo internacional informado pelo usuário · LA3953/090526/EZE',
  reason: 'Agrupado como uma única diária internacional porque o trecho para Buenos Aires foi um inativo/pernoite. O valor oficial informado foi aproximadamente U$ 88,20; a memória fica descritiva para não duplicar refeições por voo e pernoite.',
  matchAirports: ['EZE', 'AEP'],
 },
];

// Demonstrativos oficiais LATAM enviados pelo usuário. Estes dados servem como
// base de reconciliação para evitar falsas estimativas quando a escala mensal
// não traz todo o contexto do fechamento semanal anterior/posterior.
const CREW_OFFICIAL_DOMESTIC_DIEM_CALIBRATION: OfficialPerDiemCalibrationRow[] = [
 // Demonstrativo 13/05/2026 – 19/05/2026 · pagamento 21/05 · total R$ 875,52
 { date: '14/05/2026', type: 'JANTAR', dutyCode: 'LA 3590', value: 109.44, source: 'Demonstrativo LATAM 13/05–19/05' },
 { date: '15/05/2026', type: 'ALMOCO', dutyCode: 'PERNOITE POA', value: 109.44, source: 'Demonstrativo LATAM 13/05–19/05' },
 { date: '15/05/2026', type: 'JANTAR', dutyCode: 'LA 3012', value: 109.44, source: 'Demonstrativo LATAM 13/05–19/05' },
 { date: '15/05/2026', type: 'CEIA', dutyCode: 'LA 3500', value: 109.44, source: 'Demonstrativo LATAM 13/05–19/05' },
 { date: '16/05/2026', type: 'JANTAR', dutyCode: 'PERNOITE MAB', value: 109.44, source: 'Demonstrativo LATAM 13/05–19/05' },
 { date: '16/05/2026', type: 'ALMOCO', dutyCode: 'PERNOITE MAB', value: 109.44, source: 'Demonstrativo LATAM 13/05–19/05' },
 { date: '17/05/2026', type: 'ALMOCO', dutyCode: 'LA 3721', value: 109.44, source: 'Demonstrativo LATAM 13/05–19/05' },
 { date: '18/05/2026', type: 'JANTAR', dutyCode: 'ASB', value: 109.44, source: 'Demonstrativo LATAM 13/05–19/05' },

 // Demonstrativo 20/05/2026 – 26/05/2026 · pagamento 28/05 · total R$ 656,64
 { date: '21/05/2026', type: 'ALMOCO', dutyCode: 'CRMBSB', value: 109.44, source: 'Demonstrativo LATAM 20/05–26/05' },
 { date: '22/05/2026', type: 'JANTAR', dutyCode: 'LA 3867', value: 109.44, source: 'Demonstrativo LATAM 20/05–26/05' },
 { date: '22/05/2026', type: 'CEIA', dutyCode: 'LA 3494', value: 109.44, source: 'Demonstrativo LATAM 20/05–26/05' },
 { date: '23/05/2026', type: 'JANTAR', dutyCode: 'PERNOITE JPA', value: 109.44, source: 'Demonstrativo LATAM 20/05–26/05' },
 { date: '23/05/2026', type: 'ALMOCO', dutyCode: 'PERNOITE JPA', value: 109.44, source: 'Demonstrativo LATAM 20/05–26/05' },
 { date: '24/05/2026', type: 'ALMOCO', dutyCode: 'LA 4700', value: 109.44, source: 'Demonstrativo LATAM 20/05–26/05' },

 // Demonstrativo 27/05/2026 – 02/06/2026 · pagamento 03/06 · total R$ 547,20
 { date: '29/05/2026', type: 'ALMOCO', dutyCode: 'LA 4648', value: 109.44, source: 'Demonstrativo LATAM 27/05–02/06' },
 { date: '29/05/2026', type: 'JANTAR', dutyCode: 'LA 3425', value: 109.44, source: 'Demonstrativo LATAM 27/05–02/06' },
 { date: '30/05/2026', type: 'JANTAR', dutyCode: 'LA 3992', value: 109.44, source: 'Demonstrativo LATAM 27/05–02/06' },
 { date: '31/05/2026', type: 'JANTAR', dutyCode: 'PERNOITE NAT', value: 109.44, source: 'Demonstrativo LATAM 27/05–02/06' },
 { date: '31/05/2026', type: 'ALMOCO', dutyCode: 'PERNOITE NAT', value: 109.44, source: 'Demonstrativo LATAM 27/05–02/06' },
 { date: '01/06/2026', type: 'CAFE', dutyCode: 'LA 4676', value: 27.36, source: 'Demonstrativo LATAM 27/05–02/06' },
 { date: '02/06/2026', type: 'ALMOCO', dutyCode: 'CBF/EMER', value: 109.44, source: 'Demonstrativo LATAM 27/05–02/06' },

 // Demonstrativo 03/06/2026 – 09/06/2026 · pagamento 11/06 · total R$ 547,20
 { date: '03/06/2026', type: 'JANTAR', dutyCode: 'ASB', value: 109.44, source: 'Demonstrativo LATAM 03/06–09/06' },
 { date: '07/06/2026', type: 'JANTAR', dutyCode: 'LA 4737', value: 109.44, source: 'Demonstrativo LATAM 03/06–09/06' },
 { date: '08/06/2026', type: 'ALMOCO', dutyCode: 'PERNOITE CGH', value: 109.44, source: 'Demonstrativo LATAM 03/06–09/06' },
 { date: '08/06/2026', type: 'JANTAR', dutyCode: 'C32F', value: 109.44, source: 'Demonstrativo LATAM 03/06–09/06' },
 { date: '09/06/2026', type: 'JANTAR', dutyCode: 'ASB', value: 109.44, source: 'Demonstrativo LATAM 03/06–09/06' },

 // Demonstrativo 17/06/2026 – 23/06/2026 · pagamento 25/06 · total depositado R$ 1.094,40
 // Auditoria oficial enviada em PDF: 10 refeições principais, sem café; DO 18/06 e 19/06 sem diária.
 { date: '17/06/2026', type: 'ALMOCO', dutyCode: 'LA 3732 BSB-FOR', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '17/06/2026', type: 'JANTAR', dutyCode: 'LA 3743 FOR-BSB', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '20/06/2026', type: 'ALMOCO', dutyCode: 'LA 3280 BSB-VCP', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '20/06/2026', type: 'JANTAR', dutyCode: 'LA 3573 PMW-BSB', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '21/06/2026', type: 'JANTAR', dutyCode: 'LA 3819 FLN-BSB', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '21/06/2026', type: 'CEIA', dutyCode: 'LA 3500 BSB-MAB', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '22/06/2026', type: 'ALMOCO', dutyCode: 'PERNOITE MAB', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '22/06/2026', type: 'JANTAR', dutyCode: 'PERNOITE MAB', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '23/06/2026', type: 'ALMOCO', dutyCode: 'LA 3980 BSB-CPV', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
 { date: '23/06/2026', type: 'JANTAR', dutyCode: 'PERNOITE CPV', value: 109.44, source: 'Demonstrativo LATAM 17/06–23/06' },
];

function domesticWeekKeyForDate(dateString: string): string {
 const date = rosterDateFromString(dateString);
 const day = date.getDay();
 const daysSinceWednesday = (day - 3 + 7) % 7;
 const startDate = addDays(date, -daysSinceWednesday);
 const endDate = addDays(startDate, 6);
 return `${dayKey(startDate)}-${dayKey(endDate)}`;
}

function isOfficialBrunoRoster(bundle: SessionRosterBundle | null): boolean {
 const roster = bundle?.roster;
 if (!roster?.days?.length) return false;
 const identity = `${roster.crewName || ''} ${roster.crewId || ''} ${roster.base || ''}`.toUpperCase();
 return (identity.includes('BRUNO') && identity.includes('SARAIVA')) || identity.includes('4453812') || identity.includes('04453812');
}

function isOfficialBrunoPerDiemCalibrationEnabled(bundle: SessionRosterBundle | null): boolean {
 const roster = bundle?.roster;
 if (!isOfficialBrunoRoster(bundle) || !roster?.days?.length) return false;
 const rosterWeekKeys = new Set((roster.days || []).map((day) => domesticWeekKeyForDate(day.date)));
 return CREW_OFFICIAL_DOMESTIC_DIEM_CALIBRATION.some((row) => rosterWeekKeys.has(domesticWeekKeyForDate(row.date)));
}

function officialRowToPerDiemEntry(row: OfficialPerDiemCalibrationRow): PerDiemEntry {
 const window = CREW_DIEM_WINDOWS.find((item) => item.type === row.type) || CREW_DIEM_WINDOWS[0];
 return {
  date: row.date,
  dutyCode: row.dutyCode,
  type: row.type,
  label: window.label,
  window: `${displayMinutes(window.start)} – ${displayMinutes(window.end)}`,
  value: row.value,
  currency: 'BRL',
  currencyLabel: 'Brasil · R$',
  international: false,
  confidence: 'alta',
  reason: `${row.source}: lançamento oficial de diária nacional usado como calibração prioritária. O demonstrativo oficial prevalece quando a escala mensal não contém todo o contexto do fechamento semanal, quando há pernoite que atravessa dias ou quando a estimativa gerou divergência.`,
 };
}

function rosterDateWithinRange(date: string, startDate: string, endDate: string): boolean {
 const current = rosterDateFromString(date).getTime();
 return current >= rosterDateFromString(startDate).getTime() && current <= rosterDateFromString(endDate).getTime();
}

function rosterHasInternationalCalibration(row: OfficialInternationalPerDiemCalibrationRow, bundle: SessionRosterBundle | null): boolean {
 const roster = bundle?.roster;
 if (!isOfficialBrunoRoster(bundle) || !roster?.days?.length) return false;
 return (roster.days || []).some((day) => {
  if (!rosterDateWithinRange(day.date, row.startDate, row.endDate)) return false;
  const source = `${day.pairingCode || ''} ${day.type || ''} ${day.hotel || ''} ${day.rawText || ''} ${(day.legs || []).map((leg) => `${leg.origin || ''} ${leg.destination || ''} ${leg.flightNumber || ''}`).join(' ')}`.toUpperCase();
  return row.matchAirports.some((airport) => source.includes(airport));
 });
}

function officialInternationalRowToPerDiemEntry(row: OfficialInternationalPerDiemCalibrationRow): PerDiemEntry {
 return {
  date: row.startDate,
  dutyCode: row.dutyCode,
  flightKey: row.flightKey,
  type: row.type,
  label: 'Buenos Aires · inativo internacional',
  window: `${row.startDate} – ${row.endDate}`,
  value: row.value,
  currency: row.currency,
  currencyLabel: `${row.countryLabel} · ${row.currency}`,
  countryLabel: row.countryLabel,
  international: true,
  confidence: 'alta',
  reason: `${row.source}: ${row.reason}`,
  displayMealSummary: row.mealSummary,
  displayCount: row.count,
  displayDateRange: `${row.startDate} → ${row.endDate}`,
  paymentHintOverride: 'Campo único calibrado pelo demonstrativo internacional informado; não entra no fechamento nacional semanal.',
 };
}

function internationalCalibrationOwnsEntry(entry: PerDiemEntry, row: OfficialInternationalPerDiemCalibrationRow): boolean {
 if (!entry.international || entry.currency !== row.currency) return false;
 if (!rosterDateWithinRange(entry.date, row.startDate, row.endDate)) return false;
 const source = `${entry.dutyCode || ''} ${entry.flightKey || ''} ${entry.countryLabel || ''} ${entry.currencyLabel || ''} ${entry.reason || ''}`.toUpperCase();
 const hasAirportOrCountry = row.matchAirports.some((airport) => source.includes(airport)) || source.includes('ARGENTINA') || source.includes('BUENOS AIRES');
 return hasAirportOrCountry || row.matchAirports.includes('EZE');
}

function reconcileInternationalPerDiemWithOfficialDemonstratives(entries: PerDiemEntry[], bundle: SessionRosterBundle | null): PerDiemEntry[] {
 const applicableRows = CREW_OFFICIAL_INTERNATIONAL_DIEM_CALIBRATION.filter((row) => rosterHasInternationalCalibration(row, bundle));
 if (!applicableRows.length) return entries;
 const kept = entries.filter((entry) => !applicableRows.some((row) => internationalCalibrationOwnsEntry(entry, row)));
 const officialEntries = applicableRows.map(officialInternationalRowToPerDiemEntry);
 return [...kept, ...officialEntries];
}

function reconcileDomesticPerDiemWithOfficialDemonstratives(entries: PerDiemEntry[], bundle: SessionRosterBundle | null): PerDiemEntry[] {
 if (!isOfficialBrunoPerDiemCalibrationEnabled(bundle)) return entries;
 const rosterWeekKeys = new Set((bundle?.roster?.days || []).map((day) => domesticWeekKeyForDate(day.date)));
 const officialRows = CREW_OFFICIAL_DOMESTIC_DIEM_CALIBRATION.filter((row) => rosterWeekKeys.has(domesticWeekKeyForDate(row.date)));
 if (!officialRows.length) return entries;
 const overrideWeekKeys = new Set(officialRows.map((row) => domesticWeekKeyForDate(row.date)));
 const kept = entries.filter((entry) => entry.international || !overrideWeekKeys.has(domesticWeekKeyForDate(entry.date)));
 const officialEntries = officialRows.map(officialRowToPerDiemEntry);
 return [...kept, ...officialEntries];
}


function reconcileDomesticPerDiemWithRealWeekTotals(entries: PerDiemEntry[]): PerDiemEntry[] {
 const out = [...entries];
 const domestic = out.filter((entry) => !entry.international && entry.currency === 'BRL');
 for (const [weekKey, officialAmount] of Object.entries(CREW_PERDIEM_REAL_WEEK_TOTALS)) {
  const weekEntries = domestic.filter((entry) => domesticWeekKeyForDate(entry.date) === weekKey);
  if (!weekEntries.length) continue;
  const currentAmount = Number(weekEntries.reduce((sum, entry) => sum + entry.value, 0).toFixed(2));
  const diff = Number((officialAmount - currentAmount).toFixed(2));
  if (diff <= 0.5) continue;
  const missingCafes = Math.round(diff / CREW_DIEM_BREAKFAST_VALUE);
  const cafeDiff = Number((missingCafes * CREW_DIEM_BREAKFAST_VALUE).toFixed(2));
  if (missingCafes < 1 || missingCafes > 8 || Math.abs(cafeDiff - diff) > 0.08) continue;
  const [start] = weekKey.split('-');
  const startDate = rosterDateFromString(start);
  const existingCafeDates = new Set(weekEntries.filter((entry) => entry.type === 'CAFE').map((entry) => entry.date));
  for (let i = 0; i < missingCafes; i += 1) {
   let chosen = dayKey(addDays(startDate, i));
   for (let offset = 0; offset < 7; offset += 1) {
    const candidate = dayKey(addDays(startDate, offset));
    if (!existingCafeDates.has(candidate)) {
     chosen = candidate;
     existingCafeDates.add(candidate);
     break;
    }
   }
   out.push({
    date: chosen,
    dutyCode: 'AJUSTE CAFÉ',
    type: 'CAFE',
    label: 'Café da manhã',
    window: '05:00 – 08:00',
    value: CREW_DIEM_BREAKFAST_VALUE,
    currency: 'BRL',
    currencyLabel: 'Brasil · R$',
    international: false,
    confidence: 'estimada',
    reason: `Ajuste automático pelo demonstrativo real da semana ${weekKey}: diferença de ${formatMoney(diff)} é compatível com ${missingCafes} café(s) de ${formatMoney(CREW_DIEM_BREAKFAST_VALUE)}. Antes o sistema era conservador e podia deixar de contar cafés em voo ativo que cruzava 05:00–08:00.`,
   });
  }
 }
 return out;
}

function countMainAndCafe(entries: PerDiemEntry[]): string {
 const main = entries.filter((entry) => entry.currency === 'BRL' && entry.type !== 'CAFE').length;
 const cafe = entries.filter((entry) => entry.currency === 'BRL' && entry.type === 'CAFE').length;
 if (cafe && main) return `${main} principal(is) + ${cafe} café(s)`;
 if (cafe) return `${cafe} café(s)`;
 return `${main} principal(is)`;
}

function absoluteDayBase(date: string): number {
 const parsed = rosterDateFromString(date);
 parsed.setHours(0, 0, 0, 0);
 return Math.floor(parsed.getTime() / 60000);
}

function dateKeyFromAbsoluteMinutes(abs: number): string {
 const date = new Date(abs * 60000);
 return dayKey(date);
}

function codeForPerDiemDay(day: CrewRoster['days'][number]): string {
 return String(day.pairingCode || day.type || '').toUpperCase() || 'JORNADA';
}

function normalizedAirportCode(value: string | null | undefined): string {
 return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function internationalPerDiemRuleForAirport(airport: string | null | undefined): InternationalPerDiemRule | null {
 const code = normalizedAirportCode(airport);
 const key = CREW_AIRPORT_INTERNATIONAL_RULE[code];
 return key ? CREW_INTERNATIONAL_PER_DIEM_RULES[key] : null;
}

function perDiemMetaFromRule(rule: InternationalPerDiemRule | null): Pick<PerDiemOperationalSegment, 'currency' | 'currencyLabel' | 'countryLabel' | 'international' | 'internationalRule'> {
 if (!rule) return { currency: CREW_DIEM_DOMESTIC_CURRENCY, currencyLabel: 'Brasil · R$', international: false, internationalRule: undefined };
 return { currency: rule.currency, currencyLabel: `${rule.country} · ${rule.currency}`, countryLabel: rule.country, international: true, internationalRule: rule };
}

function applyInternationalPerDiemRule(segment: PerDiemOperationalSegment, rule: InternationalPerDiemRule, context: string): PerDiemOperationalSegment {
 const meta = perDiemMetaFromRule(rule);
 return {
  ...segment,
  ...meta,
  confidence: segment.confidence === 'estimada' ? 'estimada' : 'alta',
  reason: `${segment.reason} ${context} Diária internacional aplicada conforme país do pernoite/prestação no exterior: ${rule.country}, refeição principal ${formatPerDiemCurrency(rule.mainValue, rule.currency)} (${rule.source}).`,
 };
}

function dayDutyRangeMinutes(day: CrewRoster['days'][number]): { start: number; end: number; confidence: 'alta' | 'estimada' } | null {
 const firstLeg = day.legs?.[0];
 const lastLeg = day.legs?.[day.legs.length - 1];
 const range = dashboardDutyRange(day, firstLeg, lastLeg);
 const start = parseTimeToMinutes(range.start);
 const endRaw = parseTimeToMinutes(range.end);
 if (start === null || endRaw === null) return null;
 const end = endRaw <= start ? endRaw + 1440 : endRaw;
 if (end <= start) return null;
 const confidence: 'alta' | 'estimada' = /fim não|estimad|não lido/i.test(String(range.end || '')) ? 'estimada' : 'alta';
 return { start, end, confidence };
}

function splitAbsoluteSegment(startAbs: number, endAbs: number, code: string, kind: PerDiemSegmentKind, confidence: 'alta' | 'estimada', reason: string, meta: Partial<Pick<PerDiemOperationalSegment, 'currency' | 'currencyLabel' | 'countryLabel' | 'international' | 'internationalRule' | 'flightKey'>> = {}): PerDiemOperationalSegment[] {
 const out: PerDiemOperationalSegment[] = [];
 if (!Number.isFinite(startAbs) || !Number.isFinite(endAbs) || endAbs <= startAbs) return out;
 let cursor = startAbs;
 while (cursor < endAbs) {
  const date = dateKeyFromAbsoluteMinutes(cursor);
  const localStart = ((cursor % 1440) + 1440) % 1440;
  const nextMidnight = cursor - localStart + 1440;
  const sliceEndAbs = Math.min(endAbs, nextMidnight);
  const localEnd = ((sliceEndAbs % 1440) + 1440) % 1440 || 1440;
  out.push({
   date,
   start: localStart,
   end: localEnd,
   absStart: cursor,
   absEnd: sliceEndAbs,
   code,
   flightKey: meta.flightKey,
   kind,
   confidence,
   reason,
   currency: meta.currency || CREW_DIEM_DOMESTIC_CURRENCY,
   currencyLabel: meta.currencyLabel || 'Brasil · R$',
   countryLabel: meta.countryLabel,
   international: Boolean(meta.international),
   internationalRule: meta.internationalRule,
  });
  cursor = sliceEndAbs;
 }
 return out;
}


function perDiemFlightKeyForDay(day: CrewRoster['days'][number]): string {
 const raw = `${day.pairingCode || ''} ${day.rawText || ''}`.toUpperCase().replace(/\s+/g, ' ');
 const pairing = raw.match(/\b(LA\s?\d{3,4})\/(\d{6})\b/);
 if (pairing) return `${pairing[1].replace(/\s+/g, '')}/${pairing[2]}`;
 const firstLeg = day.legs?.[0];
 if (firstLeg?.flightNumber) return String(firstLeg.flightNumber).toUpperCase().replace(/\s+/g, '');
 const flight = raw.match(/\bLA\s?\d{3,4}\b/);
 if (flight) return flight[0].replace(/\s+/g, '');
 return String(day.pairingCode || day.type || '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function activitySegmentForDay(day: CrewRoster['days'][number]): PerDiemOperationalSegment[] {
 const dayType = String(day.type || '').toUpperCase();
 const code = codeForPerDiemDay(day);
 if (['DO', 'DOF', 'DR', 'DOP', 'DOPR', 'OFF', 'VC'].includes(dayType) || ['DO', 'DOF', 'DR', 'DOP', 'DOPR', 'OFF', 'VC'].includes(code)) return [];
 if (isFinancialStandbyOnly(day)) return [];
 const range = dayDutyRangeMinutes(day);
 if (!range) return [];
 const dayAbs = absoluteDayBase(day.date);
 const startAbs = dayAbs + range.start;
 const endAbs = dayAbs + range.end;
 if (isFinancialReserve(day)) {
  return splitAbsoluteSegment(startAbs, endAbs, 'ASB', 'reserve', range.confidence, 'Reserva ASB/RES real: não herda horário de HSB; sem fim legível, usa 6h e limita a 1 refeição principal, somando café apenas se cruzar 05:00–08:00.');
 }
 if (isFinancialFlight(day)) {
  const first = day.legs?.[0];
  const last = day.legs?.[day.legs.length - 1];
  const flightCode = first?.flightNumber ? `LA ${first.flightNumber}` : code;
  const route = first && last ? `${first.origin || ''}–${last.destination || ''}` : 'voo';
  return splitAbsoluteSegment(startAbs, endAbs, flightCode, 'flight', range.confidence, `Voo/etapa ativa ${route}: gera refeições nas janelas trabalhadas; café entra quando a jornada ativa cruza 05:00–08:00.`, { flightKey: perDiemFlightKeyForDay(day) });
 }
 if (isFinancialTraining(day)) {
  return splitAbsoluteSegment(startAbs, endAbs, code, 'training', range.confidence, 'Treinamento/CRM/EAD/MT: diária principal quando a atividade toca almoço ou jantar, conforme demonstrativos oficiais.');
 }
 return [];
}

function buildFlightAnchors(roster: CrewRoster): PerDiemAnchor[] {
 return (roster.days || [])
  .filter((day) => day.legs?.length)
  .map((day) => {
   const first = day.legs?.[0];
   const last = day.legs?.[day.legs.length - 1];
   const range = dayDutyRangeMinutes(day);
   if (!range || !first || !last) return null;
   const base = absoluteDayBase(day.date);
   return {
    day,
    startAbs: base + range.start,
    endAbs: base + range.end,
    origin: normalizedAirportCode(first.origin),
    destination: normalizedAirportCode(last.destination),
    code: first.flightNumber ? `LA ${first.flightNumber}` : codeForPerDiemDay(day),
    flightKey: perDiemFlightKeyForDay(day),
   } as PerDiemAnchor;
  })
  .filter(Boolean)
  .sort((a, b) => (a as PerDiemAnchor).startAbs - (b as PerDiemAnchor).startAbs) as PerDiemAnchor[];
}


const INACTIVE_LAYOVER_AIRPORTS = new Set(['JPA', 'CPV', 'MAB', 'VCP', 'NAT', 'CGH', 'GRU', 'GIG', 'SDU', 'CNF', 'REC', 'FOR', 'MCZ', 'POA', 'CWB', 'GYN', 'MAO', 'BEL', 'FLN', 'VIX', 'SSA', 'AJU', 'THE', 'SLZ', 'CGB', 'CGR', 'BPS', 'IOS', 'IGU', 'NVT', 'JOI', 'LDB', 'UDI', 'RAO']);
const INACTIVE_LAYOVER_IGNORED_TOKENS = new Set(['INATIVO', 'INAT', 'LAYOVER', 'HOTEL', 'PERNOITE', 'STAND', 'HOME', 'BY', 'THE', 'OFF', 'DOF', 'DOP', 'RES', 'ASB', 'HSB', 'CRM', 'PDF', 'AIM']);

function isCrewCheckAirportForLayover(code: string): boolean {
 const normalized = normalizedAirportCode(code).slice(0, 3);
 return normalized.length === 3 && !INACTIVE_LAYOVER_IGNORED_TOKENS.has(normalized) && (Boolean(AIRPORT_COORDS[normalized]) || INACTIVE_LAYOVER_AIRPORTS.has(normalized));
}

function detectInactiveLayoverAirport(day: CrewRoster['days'][number], base: string): string {
 const source = `${day.type || ''} ${day.pairingCode || ''} ${day.hotel || ''} ${day.rawText || ''}`.toUpperCase();
 const candidates = [day.hotel, day.pairingCode, ...(source.match(/\b[A-Z]{3}\b/g) || [])]
  .map((value) => normalizedAirportCode(value).slice(0, 3))
  .filter((code) => code && code !== base && isCrewCheckAirportForLayover(code));
 return candidates[0] || '';
}

function isInactiveLayoverLikeDay(day: CrewRoster['days'][number]): boolean {
 const source = `${day.type || ''} ${day.pairingCode || ''} ${day.hotel || ''} ${day.rawText || ''}`.toUpperCase();
 return !day.legs?.length && (String(day.type || '').toUpperCase() === 'LAYOVER' || /(INATIV|INACTIVE|PERNOITE|LAYOVER|HOTEL|ACOMOD)/.test(source));
}

function nearestFlightAnchorsForDate(anchors: PerDiemAnchor[], date: string): { previous?: PerDiemAnchor; next?: PerDiemAnchor } {
 const start = absoluteDayBase(date);
 const end = start + 1440;
 const previous = [...anchors].reverse().find((anchor) => anchor.endAbs <= end);
 const next = anchors.find((anchor) => anchor.startAbs >= start);
 return { previous, next };
}

function inferredInactiveLayoverAirport(day: CrewRoster['days'][number], base: string, anchors: PerDiemAnchor[]): string {
 const explicit = detectInactiveLayoverAirport(day, base);
 if (explicit) return explicit;
 const { previous, next } = nearestFlightAnchorsForDate(anchors, day.date);
 const fromPrevious = normalizedAirportCode(previous?.destination || '').slice(0, 3);
 const fromNextOrigin = normalizedAirportCode(next?.origin || '').slice(0, 3);
 const gap = previous && next ? next.startAbs - previous.endAbs : 0;
 // Dia inativo nem sempre traz o aeroporto no texto. Quando estiver entre dois voos e houver mais de 20h,
 // assume a estação onde a jornada anterior terminou, desde que não seja base contratual/virtual.
 if (gap >= 20 * 60 && fromPrevious && fromPrevious === fromNextOrigin && fromPrevious !== base && isCrewCheckAirportForLayover(fromPrevious)) return fromPrevious;
 if (gap >= 20 * 60 && fromPrevious && fromPrevious !== base && isCrewCheckAirportForLayover(fromPrevious)) return fromPrevious;
 return '';
}

function buildExplicitLayoverDayPerDiemSegments(roster: CrewRoster, anchors: PerDiemAnchor[] = buildFlightAnchors(roster)): PerDiemOperationalSegment[] {
 const base = normalizedAirportCode(roster.base || 'BSB').slice(0, 3) || 'BSB';
 const out: PerDiemOperationalSegment[] = [];
 for (const day of roster.days || []) {
  const inactiveLayover = isInactiveLayoverLikeDay(day);
  if (!inactiveLayover) continue;
  const away = inferredInactiveLayoverAirport(day, base, anchors);
  if (!away) continue;
  const directed = shouldTreatDirectedLayover(day);
  // Pernoite dirigido e base virtual não geram diária automática.
  // Inativo/pernoite fora da base real continua computando almoço e jantar; café/ceia não entram por pernoite puro.
  if (directed || away === base || isSuppressedBaseVirtualLayover(away)) continue;
  const internationalRule = internationalPerDiemRuleForAirport(away);
  const meta = perDiemMetaFromRule(internationalRule);
  const startAbs = absoluteDayBase(day.date);
  const endAbs = startAbs + 1440;
  const reason = internationalRule
   ? `Inativo/pernoite publicado fora do Brasil em ${away}. Café e ceia não são gerados por pernoite puro; almoço/jantar seguem janelas de diárias internacionais.`
   : `Inativo/pernoite fora da base em ${away}. O CrewCheck trata como pernoite remunerável para diária: almoço e jantar entram quando o período cobre as janelas; café e ceia não entram em pernoite puro.`;
  out.push(...splitAbsoluteSegment(startAbs, endAbs, `PERNOITE ${away}`, 'layover', 'alta', reason, { ...meta, flightKey: perDiemFlightKeyForDay(day) || `PERNOITE ${away}` }));
 }
 return out;
}

function buildLayoverPerDiemSegments(roster: CrewRoster): PerDiemOperationalSegment[] {
 const base = normalizedAirportCode(roster.base || 'BSB') || 'BSB';
 const anchors = buildFlightAnchors(roster);
 const out: PerDiemOperationalSegment[] = [];
 for (let i = 0; i < anchors.length; i += 1) {
  const current = anchors[i];
  const away = normalizedAirportCode(current.destination);
  if (!away || away === base || isSuppressedBaseVirtualLayover(away)) continue;
  const next = anchors.slice(i + 1).find((candidate) => candidate.startAbs > current.endAbs && normalizedAirportCode(candidate.origin) === away);
  if (!next) continue;
  const gap = next.startAbs - current.endAbs;
  // Pernoite/inativo automático entre voos: só conta quando há permanência real fora da base,
  // acima de 20h entre o fim da jornada e a apresentação seguinte. Turnaround/solo curto não gera diária de pernoite.
  if (gap < 20 * 60 || gap > 6 * 24 * 60) continue;
  const internationalRule = internationalPerDiemRuleForAirport(away);
  const meta = perDiemMetaFromRule(internationalRule);
  const layoverReason = internationalRule
   ? `Pernoite fora do Brasil em ${away}. O ACT prevê diárias internacionais em moeda estrangeira do país/local de prestação; café internacional é conservador e não é gerado por pernoite puro quando pode estar incluído no hotel.`
   : `Pernoite/inativo fora da base em ${away}, identificado por intervalo superior a 20h entre fim da jornada e apresentação seguinte. Demonstrativos LATAM pagam almoço/jantar quando o pernoite cobre essas janelas; café e ceia não são gerados por pernoite puro.`;
  out.push(...splitAbsoluteSegment(
   current.endAbs,
   next.startAbs,
   `PERNOITE ${away}`,
   'layover',
   'alta',
   layoverReason,
   { ...meta, flightKey: current.flightKey || current.code }
  ));
 }
 return [...out, ...buildExplicitLayoverDayPerDiemSegments(roster, anchors)];
}

function buildPerDiemOperationalSegments(bundle: SessionRosterBundle | null): PerDiemOperationalSegment[] {
 const roster = bundle?.roster;
 if (!roster?.days?.length) return [];
 const active = roster.days.flatMap(activitySegmentForDay);
 const layovers = buildLayoverPerDiemSegments(roster);
 const internationalLayovers = layovers.filter((segment) => segment.international && segment.internationalRule);
 const enrichedActive = active.map((segment) => {
  if (segment.kind !== 'flight') return segment;
  const adjacentInternational = internationalLayovers.find((layover) => {
   const beforeLayover = segment.absEnd <= layover.absStart && (layover.absStart - segment.absEnd) <= 12 * 60;
   const afterLayover = segment.absStart >= layover.absEnd && (segment.absStart - layover.absEnd) <= 12 * 60;
   return beforeLayover || afterLayover;
  });
  return adjacentInternational?.internationalRule
   ? applyInternationalPerDiemRule(segment, adjacentInternational.internationalRule, 'Voo conectado a pernoite internacional; bate-volta sem pernoite permanece em reais.')
   : segment;
 });
 return [...enrichedActive, ...layovers].sort((a, b) => rosterDateFromString(a.date).getTime() - rosterDateFromString(b.date).getTime() || a.start - b.start || a.kind.localeCompare(b.kind));
}


function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
 // Diárias reais LATAM: atividade 09:00–11:00 toca almoço e o demonstrativo paga.
 // Não conta duração zero nem atividade que começa exatamente no fim da janela.
 if (!Number.isFinite(startA) || !Number.isFinite(endA) || endA <= startA) return false;
 return startA < endB && endA >= startB;
}

function segmentTouchesMealWindow(segment: PerDiemOperationalSegment, window: typeof CREW_DIEM_WINDOWS[number]): boolean {
 if (window.type === 'CEIA') {
  if (segment.kind !== 'flight' && segment.kind !== 'reserve') return false;
  return segment.start < 60 || segment.end >= 1440 || rangesOverlap(segment.start, segment.end, 0, 60);
 }
 if (window.type === 'CAFE') {
  if (segment.kind === 'layover' || segment.kind === 'training') return false;
  if (segment.international && segment.kind !== 'flight') return false;
  if (segment.kind === 'flight') return rangesOverlap(segment.start, segment.end, window.start, window.end);
  return rangesOverlap(segment.start, segment.end, window.start, window.end);
 }
 if (segment.kind === 'layover' || segment.kind === 'flight' || segment.kind === 'reserve' || segment.kind === 'training') {
  return rangesOverlap(segment.start, segment.end, window.start, window.end);
 }
 return false;
}

function reserveMealWindowsForSegment(segment: PerDiemOperationalSegment): typeof CREW_DIEM_WINDOWS[number][] {
 const hits: typeof CREW_DIEM_WINDOWS[number][] = [];
 const cafe = CREW_DIEM_WINDOWS.find((item) => item.type === 'CAFE');
 if (cafe && segmentTouchesMealWindow(segment, cafe)) hits.push(cafe);
 const main = CREW_DIEM_WINDOWS
  .filter((item) => item.type === 'ALMOCO' || item.type === 'JANTAR' || item.type === 'CEIA')
  .find((item) => segmentTouchesMealWindow(segment, item));
 if (main) hits.push(main);
 return hits;
}

function mealWindowsForSegment(segment: PerDiemOperationalSegment): typeof CREW_DIEM_WINDOWS[number][] {
 if (segment.kind === 'reserve') return reserveMealWindowsForSegment(segment);
 return CREW_DIEM_WINDOWS.filter((window) => segmentTouchesMealWindow(segment, window));
}

function makePerDiemEntryFromSegment(segment: PerDiemOperationalSegment, window: typeof CREW_DIEM_WINDOWS[number]): PerDiemEntry {
 const mainValue = segment.internationalRule ? segment.internationalRule.mainValue : CREW_DIEM_MAIN_VALUE;
 const value = window.type === 'CAFE' ? Number((mainValue * 0.25).toFixed(2)) : mainValue;
 const reasonByKind: Record<PerDiemSegmentKind, string> = {
  flight: window.type === 'CAFE'
   ? `${segment.reason} Café calibrado: entra quando voo/jornada ativa cruza 05:00–08:00; em pernoite puro não entra e em pernoite internacional pode ser zerado se o café estiver incluído no hotel.`
   : segment.reason,
  reserve: segment.reason,
  training: segment.reason,
  layover: segment.reason,
 };
 const internationalSuffix = segment.international ? ` Moeda aplicada: ${segment.currencyLabel}. Bate-volta internacional sem pernoite permanece em reais; ajuste manual se o demonstrativo oficial vier diferente.` : '';
 return {
  date: segment.date,
  dutyCode: segment.code,
  flightKey: segment.flightKey,
  type: window.type,
  label: window.label,
  window: `${displayMinutes(window.start)} – ${displayMinutes(window.end)}`,
  value,
  currency: segment.currency,
  currencyLabel: segment.currencyLabel,
  countryLabel: segment.countryLabel,
  international: segment.international,
  confidence: segment.confidence,
  reason: `${reasonByKind[segment.kind]}${internationalSuffix}`,
 };
}

function isBetterPerDiemEntry(candidate: PerDiemEntry, current: PerDiemEntry | undefined): boolean {
 if (!current) return true;
 const priority = (entry: PerDiemEntry) => {
  const code = entry.dutyCode.toUpperCase();
  const intl = entry.international ? 10 : 0;
  if (/^LA\s?\d+/.test(code)) return intl + 4;
  if (/^(ASB|RES)/.test(code)) return intl + 3;
  if (/PERNOITE/.test(code)) return intl + 2;
  return intl + 1;
 };
 return priority(candidate) > priority(current);
}

type PerDiemWeekTotal = { key: string; start: string; end: string; paymentHint: string; totals: Record<PerDiemCurrency, number>; total: number; count: number; countLabel: string };
type InternationalPerDiemPayment = { key: string; date: string; dateRange: string; dutyCode: string; flightKey: string; countryLabel: string; currency: PerDiemCurrency; totals: Record<PerDiemCurrency, number>; total: number; count: number; mealSummary: string; paymentHint: string };


function computePerDiemForecast(bundle: SessionRosterBundle | null): { entries: PerDiemEntry[]; total: number; totalsByCurrency: Record<PerDiemCurrency, number>; byType: Record<PerDiemType, number>; byWeek: PerDiemWeekTotal[]; byInternationalPayment: InternationalPerDiemPayment[] } {
 const byKey = new Map<string, PerDiemEntry>();
 const segments = buildPerDiemOperationalSegments(bundle);
 for (const segment of segments) {
  for (const window of mealWindowsForSegment(segment)) {
   const entry = makePerDiemEntryFromSegment(segment, window);
   const key = entry.international ? `${entry.flightKey || segment.code}-${segment.date}-${window.type}` : `${segment.date}-${window.type}`;
   if (isBetterPerDiemEntry(entry, byKey.get(key))) byKey.set(key, entry);
  }
 }
 const estimatedEntries = Array.from(byKey.values());
 const calibratedInternational = reconcileInternationalPerDiemWithOfficialDemonstratives(estimatedEntries, bundle);
 const calibratedDomestic = reconcileDomesticPerDiemWithOfficialDemonstratives(calibratedInternational, bundle);
 const entries = reconcileDomesticPerDiemWithRealWeekTotals(calibratedDomestic)
  .sort((a, b) => rosterDateFromString(a.date).getTime() - rosterDateFromString(b.date).getTime() || CREW_DIEM_WINDOWS.findIndex((w) => w.type === a.type) - CREW_DIEM_WINDOWS.findIndex((w) => w.type === b.type));
 const byType = { CAFE: 0, ALMOCO: 0, JANTAR: 0, CEIA: 0 } as Record<PerDiemType, number>;
 const totalsByCurrency = emptyPerDiemCurrencyTotals();
 for (const entry of entries) {
  if (entry.currency === 'BRL') byType[entry.type] += entry.value;
  addPerDiemCurrencyTotal(totalsByCurrency, entry.currency, entry.value);
 }
 const byWeek = groupPerDiemByCrewWeek(entries.filter((entry) => !entry.international));
 const byInternationalPayment = groupInternationalPerDiemByFlightDate(entries.filter((entry) => entry.international));
 return { entries, total: totalsByCurrency.BRL, totalsByCurrency, byType, byWeek, byInternationalPayment };
}

function groupPerDiemByCrewWeek(entries: PerDiemEntry[]): PerDiemWeekTotal[] {
 const map = new Map<string, PerDiemWeekTotal>();
 for (const entry of entries) {
  const date = rosterDateFromString(entry.date);
  const day = date.getDay();
  const daysSinceWednesday = (day - 3 + 7) % 7;
  const startDate = addDays(date, -daysSinceWednesday);
  const endDate = addDays(startDate, 6);
  const payment = estimatePaymentDateAfterWeeklyClose(endDate);
  const start = dayKey(startDate);
  const end = dayKey(endDate);
  const key = `${start}-${end}`;
  const current = map.get(key) || { key, start, end, paymentHint: `Fechamento terça ${end} · pagamento estimado ${dayKey(payment.date)} (${payment.reason})`, totals: emptyPerDiemCurrencyTotals(), total: 0, count: 0, countLabel: '' };
  addPerDiemCurrencyTotal(current.totals, entry.currency, entry.value);
  current.total = current.totals.BRL;
  current.count += 1;
  current.countLabel = countMainAndCafe(entries.filter((item) => !item.international && domesticWeekKeyForDate(item.date) === key));
  map.set(key, current);
 }
 for (const [realKey, amount] of Object.entries(CREW_PERDIEM_REAL_WEEK_TOTALS)) {
  const current = map.get(realKey);
  if (current) {
   current.totals.BRL = amount;
   current.total = amount;
   current.paymentHint = `${current.paymentHint} · ajustado pelo demonstrativo real informado`;
  }
 }
 return Array.from(map.values()).sort((a, b) => rosterDateFromString(a.start).getTime() - rosterDateFromString(b.start).getTime());
}

function groupInternationalPerDiemByFlightDate(entries: PerDiemEntry[]): InternationalPerDiemPayment[] {
 const map = new Map<string, InternationalPerDiemPayment & { dates: Set<string>; meals: Map<string, number> }>();
 for (const entry of entries) {
  const cleanDuty = String(entry.dutyCode || 'Voo internacional').replace(/\s+/g, ' ').trim();
  const flightKey = String(entry.flightKey || cleanDuty || 'Voo internacional').replace(/\s+/g, ' ').trim();
  const country = entry.countryLabel || entry.currencyLabel || 'Exterior';
  const key = `${flightKey}-${entry.currency}`;
  const current = map.get(key) || {
   key,
   date: entry.date,
   dateRange: entry.date,
   dutyCode: cleanDuty,
   flightKey,
   countryLabel: country,
   currency: entry.currency,
   totals: emptyPerDiemCurrencyTotals(),
   total: 0,
   count: 0,
   mealSummary: '',
   paymentHint: `Pagamento separado por chave de voo internacional: ${flightKey}`,
   dates: new Set<string>(),
   meals: new Map<string, number>(),
  };
  current.dates.add(entry.date);
  current.dutyCode = current.dutyCode.includes(cleanDuty) ? current.dutyCode : `${current.dutyCode} · ${cleanDuty}`;
  addPerDiemCurrencyTotal(current.totals, entry.currency, entry.value);
  current.total = current.totals[entry.currency];
  current.count += 1;
  current.meals.set(entry.label, (current.meals.get(entry.label) || 0) + 1);
  const dates = Array.from(current.dates).sort((a, b) => rosterDateFromString(a).getTime() - rosterDateFromString(b).getTime());
  current.date = dates[0] || entry.date;
  current.dateRange = entry.displayDateRange || (dates.length > 1 ? `${dates[0]} → ${dates[dates.length - 1]}` : current.date);
  current.mealSummary = entry.displayMealSummary || Array.from(current.meals.entries()).map(([label, count]) => `${count} ${label}`).join(' · ');
  current.count = entry.displayCount || current.count;
  current.paymentHint = entry.paymentHintOverride || `Somado por chave de voo ${flightKey}; internacionais não entram no fechamento nacional semanal.`;
  map.set(key, current);
 }
 return Array.from(map.values())
  .map(({ dates, meals, ...item }) => item)
  .sort((a, b) => rosterDateFromString(a.date).getTime() - rosterDateFromString(b.date).getTime() || a.flightKey.localeCompare(b.flightKey));
}


function haversineKm(from: string, to: string): number {
 const a = AIRPORT_COORDS[String(from || '').toUpperCase()];
 const b = AIRPORT_COORDS[String(to || '').toUpperCase()];
 if (!a || !b) return 0;
 const rad = Math.PI / 180;
 const dLat = (b[0] - a[0]) * rad;
 const dLon = (b[1] - a[1]) * rad;
 const lat1 = a[0] * rad;
 const lat2 = b[0] * rad;
 const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
 return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function isBrazilNationalHolidayForKm(date: Date): boolean {
 const d = date.getDate();
 const m = date.getMonth() + 1;
 const fixed = new Set(['1/1','21/4','1/5','7/9','12/10','2/11','15/11','20/11','25/12']);
 if (fixed.has(`${d}/${m}`)) return true;
 const easter = easterDate(date.getFullYear());
 const goodFriday = addDays(easter, -2);
 return goodFriday.getFullYear() === date.getFullYear() && goodFriday.getMonth() === date.getMonth() && goodFriday.getDate() === date.getDate();
}

function isKmDoubleRosterDate(date: string): boolean {
 const value = rosterDateFromString(date);
 const day = value.getDay();
 return day === 0 || isBrazilNationalHolidayForKm(value);
}

function isNightLeg(leg: CrewRoster['days'][number]['legs'][number]): boolean {
 const dep = parseTimeToMinutes(leg.departureTime);
 const arr = parseTimeToMinutes(leg.arrivalTime);
 if (dep === null || arr === null) return false;
 const end = arr <= dep ? arr + 1440 : arr;
 for (let t = dep; t <= end; t += 30) {
  const minute = t % 1440;
  if (minute >= 22 * 60 || minute < 5 * 60) return true;
 }
 return false;
}


function isInstructorBonusDay(day: CrewRoster['days'][number]): boolean {
 const text = `${day.pairingCode || ''} ${day.type || ''} ${day.rawText || ''}`.toUpperCase();
 // A gratificação/adicional de instrutor só entra como confirmado quando o PDF/iFlight trouxer
 // indicação explícita de INSTRUTOR/INSTRUCTOR/INSTR/INST. Treinamento comum continua separado.
 return /\b(INSTRUTOR|INSTRUCTOR|INSTR|INST)\b/.test(text);
}

function hoursBetweenDisplay(start: string, end: string): number {
 const a = parseTimeToMinutes(start);
 const b = parseTimeToMinutes(end);
 if (a === null || b === null) return 0;
 const diff = b <= a ? b + 1440 - a : b - a;
 return Math.max(0, diff / 60);
}

type CrewCheckFlightLeg = CrewRoster['days'][number]['legs'][number];

function normalizeCrewNameForFinance(value: string | null | undefined): string {
 return String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z\s]/g, ' ')
  .replace(/\b(SR|SRA|MR|MRS|MS|COMISSARIO|COMISSARIA|TRIPULANTE)\b/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
}

function isSameCrewForFinance(a: string | null | undefined, b: string | null | undefined): boolean {
 const left = normalizeCrewNameForFinance(a);
 const right = normalizeCrewNameForFinance(b);
 if (!left || !right) return false;
 if (left === right) return true;
 const aParts = left.split(' ').filter((part) => part.length > 1 && !['DE','DA','DO','DAS','DOS','E'].includes(part));
 const bParts = right.split(' ').filter((part) => part.length > 1 && !['DE','DA','DO','DAS','DOS','E'].includes(part));
 if (aParts.length >= 2 && bParts.length >= 2) {
  const firstLast = aParts[0] === bParts[0] && aParts[aParts.length - 1] === bParts[bParts.length - 1];
  if (firstLast) return true;
  const shortParts = aParts.length <= bParts.length ? aParts : bParts;
  const longParts = aParts.length <= bParts.length ? bParts : aParts;
  if (shortParts.length >= 2 && shortParts.every((part) => longParts.includes(part))) return true;
  const common = shortParts.filter((part) => longParts.includes(part));
  if (common.length >= 2 && common.includes(shortParts[0])) return true;
 }
 return false;
}

function loadFinanceCrewNameCandidates(bundle?: SessionRosterBundle | null): string[] {
 const candidates = [
  bundle?.roster.crewName,
 ];
 try {
  candidates.push(localStorage.getItem('crewcheck_profile_display_name') || undefined);
  candidates.push(localStorage.getItem('crewcheck_profile_full_name') || undefined);
  candidates.push(localStorage.getItem('crewcheck_last_roster_crew_name') || undefined);
 } catch {}
 const normalized = new Set<string>();
 return candidates
  .map((item) => String(item || '').trim())
  .filter((item) => item && !/^tripulante$/i.test(item) && !/@/.test(item))
  .filter((item) => {
   const key = normalizeCrewNameForFinance(item);
   if (!key || normalized.has(key)) return false;
   normalized.add(key);
   return true;
  });
}

function crewNameMatchesAnyForFinance(name: string | null | undefined, candidates: string[]): boolean {
 return candidates.some((candidate) => isSameCrewForFinance(name, candidate));
}

function shouldCountCcmChiefBonusForFinance(leg: CrewCheckFlightLeg, crewNameCandidates: string[]): boolean {
 if (leg.ccmBonusStatus === 'confirmed') return true;
 const crew = leg.crew || [];
 const firstCcm = crew.find((member) => String(member.role || '').toUpperCase() === 'CCM') || null;
 const lead = leg.ccmLead || firstCcm;
 if (!lead) return false;
 if (lead.isCurrentCrew) return true;
 if (crewNameMatchesAnyForFinance(lead.name, crewNameCandidates)) return true;
 const current = crew.find((member) => member.isCurrentCrew || crewNameMatchesAnyForFinance(member.name, crewNameCandidates));
 return Boolean(current && String(current.role || '').toUpperCase() === 'CCM' && Number(lead.order) === Number(current.order));
}



function classifyFlightKmPay(leg: CrewRoster['days'][number]['legs'][number], kmDouble: boolean): { period: FlightPayEstimate['period']; rate: number; ruleNote: string } {
 const night = isNightLeg(leg);
 if (kmDouble && night) {
  return {
   period: 'DFS noturno',
   rate: Math.max(CREW_KM_NIGHT_RATE, CREW_KM_DFS_DAY_RATE, CREW_KM_DFS_NIGHT_RATE),
   ruleNote: 'Domingo ou feriado nacional + noturno não quadruplica: aplica somente 2x do KM.',
  };
 }
 if (kmDouble) {
  return { period: 'DFS diurno', rate: CREW_KM_DFS_DAY_RATE, ruleNote: 'KM 2x apenas por domingo ou feriado nacional. Sábado comum não dobra.' };
 }
 if (night) {
  return { period: 'Noturno', rate: CREW_KM_NIGHT_RATE, ruleNote: 'Adicional noturno aplicado sem acúmulo com KM 2x.' };
 }
 return { period: 'Diurno', rate: CREW_KM_DAY_RATE, ruleNote: 'KM diurno padrão.' };
}

function computeFlightPayEstimates(bundle: SessionRosterBundle | null): FlightPayEstimate[] {
 const rows: FlightPayEstimate[] = [];
 for (const day of bundle?.roster.days || []) {
  const kmDouble = isKmDoubleRosterDate(day.date);
  for (const leg of day.legs || []) {
   const km = haversineKm(leg.origin, leg.destination);
   if (!km) continue;
   const payClass = classifyFlightKmPay(leg, kmDouble);
   const period = payClass.period;
   const rate = payClass.rate;
   rows.push({
    date: day.date,
    flightNumber: leg.flightNumber || day.pairingCode || 'Voo',
    route: `${String(leg.origin || '').toUpperCase()} → ${String(leg.destination || '').toUpperCase()}`,
    departureTime: leg.departureTime,
    arrivalTime: leg.arrivalTime,
    km,
    period,
    rate,
    amount: km * rate,
    note: payClass.ruleNote,
   });
  }
 }
 return rows;
}

function computeSalaryForecast(bundle: SessionRosterBundle | null, adminPrecise = false): SalaryForecast {
 let dayKm = 0;
 let nightKm = 0;
 let dfsDayKm = 0;
 let dfsNightKm = 0;
 let reserveHours = 0;
 let standbyHours = 0;
 let trainingCount = 0;
 let ccmChiefBonusCount = 0;
 let instructorBonusCount = 0;
 const flightPayEstimates = computeFlightPayEstimates(bundle);
 const crewNameCandidates = loadFinanceCrewNameCandidates(bundle);
 for (const day of bundle?.roster.days || []) {
  const kmDouble = isKmDoubleRosterDate(day.date);
  for (const leg of day.legs || []) {
   if (shouldCountCcmChiefBonusForFinance(leg, crewNameCandidates)) ccmChiefBonusCount += 1;
   const km = haversineKm(leg.origin, leg.destination);
   if (!km) continue;
   const payClass = classifyFlightKmPay(leg, kmDouble);
   if (payClass.period === 'DFS noturno') dfsNightKm += km;
   else if (payClass.period === 'DFS diurno') dfsDayKm += km;
   else if (payClass.period === 'Noturno') nightKm += km;
   else dayKm += km;
  }
  const code = String(day.pairingCode || day.type || '').toUpperCase();
  const range = dashboardDutyRange(day, day.legs?.[0], day.legs?.[day.legs.length - 1]);
  const hours = hoursBetweenDisplay(range.start, range.end);
  if (/^(ASB|RES)$/.test(code)) reserveHours += hours;
  if (/^(HSB|HSBE)$/.test(code)) standbyHours += hours;
  if (/^(CBF|EMER|CRM|C32F|TRE|TREINAMENTO)$/.test(code) || day.type === 'CRM') trainingCount += 1;
  if (isInstructorBonusDay(day)) instructorBonusCount += 1;
 }
 const flightPay = dayKm * CREW_KM_DAY_RATE + nightKm * CREW_KM_NIGHT_RATE + dfsDayKm * CREW_KM_DFS_DAY_RATE + dfsNightKm * CREW_KM_DFS_NIGHT_RATE;
 const reservePay = reserveHours * CREW_RESERVE_HOUR_RATE;
 const standbyPay = standbyHours * CREW_STANDBY_HOUR_RATE;
 const trainingPay = trainingCount > 0 ? CREW_TRAINING_INDEMNITY : 0;
 const ccmChiefBonusPay = ccmChiefBonusCount * CREW_CCM_CHIEF_BONUS;
 const instructorBonusPay = instructorBonusCount * CREW_INSTRUCTOR_BONUS;
 const variable = flightPay + reservePay + standbyPay + trainingPay + ccmChiefBonusPay + instructorBonusPay;
 const dsrPay = variable * CREW_DSR_FACTOR;
 const gross = CREW_SALARY_BASE + variable + dsrPay;
 const estimatedDiscounts = gross * CREW_HISTORICAL_DISCOUNT_FACTOR;
 const estimatedNet = Math.max(0, gross - estimatedDiscounts);
 const adminBreakdown = adminPrecise ? computeAdminPreciseSalaryBreakdown(gross, trainingPay) : undefined;
 return { baseSalary: CREW_SALARY_BASE, dayKm, nightKm, dfsDayKm, dfsNightKm, flightPay, flightPayEstimates, reserveHours, standbyHours, reservePay, standbyPay, trainingPay, ccmChiefBonusCount, ccmChiefBonusPay, instructorBonusCount, instructorBonusPay, dsrPay, gross, estimatedDiscounts, estimatedNet, adminBreakdown, confidence: adminBreakdown ? 'Modo administrador: cálculo itemizado com base nos demonstrativos enviados, incluindo INSS, IRRF, VGBL e descontos recorrentes.' : 'Estimativa baseada na escala, distâncias aproximadas e média histórica dos demonstrativos.' };
}

function estimateAdminInss(base: number): number {
 if (base <= 0) return 0;
 return Math.min(CREW_ADMIN_INSS_CAP, Math.max(0, base * CREW_ADMIN_INSS_EFFECTIVE_RATE));
}

function computeAdminPreciseSalaryBreakdown(gross: number, nonTaxableTrainingPay: number): AdminPreciseSalaryBreakdown {
 const fgtsBase = Math.max(0, gross - nonTaxableTrainingPay);
 const fgts = fgtsBase * 0.08;
 const inssBase = Math.max(0, fgtsBase - CREW_ADMIN_ORGANIC_COMPENSATION);
 const inss = estimateAdminInss(inssBase);
 const irBase = Math.max(0, fgtsBase - inss);
 const irrf = Math.max(0, irBase * CREW_ADMIN_IRRF_TOP_RATE - CREW_ADMIN_IRRF_DEDUCTION);
 const vgbl = fgtsBase * CREW_ADMIN_VGBL_RATE;
 const fixedLines: SalaryDeductionLine[] = [...CREW_ADMIN_FIXED_DEDUCTIONS, { label: 'Coparticipação Amil estimada', value: CREW_ADMIN_COPARTICIPATION_AVG, detail: 'média histórica variável' }];
 const calculatedLines: SalaryDeductionLine[] = [
  { label: 'INSS remuneração estimado', value: inss, detail: `base estimada ${formatMoney(inssBase)}` },
  { label: 'IRRF salário estimado', value: irrf, detail: `base IR estimada ${formatMoney(irBase)}` },
  { label: 'Previdência privada VGBL', value: vgbl, detail: '3% da base estimada' },
 ];
 const discountLines = [...calculatedLines, ...fixedLines];
 const fixedDiscounts = fixedLines.reduce((sum, line) => sum + line.value, 0);
 const estimatedDiscounts = discountLines.reduce((sum, line) => sum + line.value, 0);
 const netPrecise = Math.max(0, gross - estimatedDiscounts);
 return {
  fgtsBase,
  fgts,
  inssBase,
  irBase,
  inss,
  irrf,
  vgbl,
  fixedDiscounts,
  coparticipation: CREW_ADMIN_COPARTICIPATION_AVG,
  discountLines,
  estimatedDiscounts,
  netPrecise,
  disclaimer: 'Previsão avançada visível apenas para o administrador. Descontos pessoais, coparticipação médica, ajustes retroativos, diferenças de folha e incidências oficiais podem alterar o líquido final.',
 };
}


function ForecastHero({ title, subtitle, total, tag, icon: Icon }: { title: string; subtitle: string; total: string; tag: string; icon: LucideIcon }) {
 return (
  <section className="relative overflow-hidden rounded-[2.2rem] border border-cyan-200/20 bg-gradient-to-br from-cyan-300/18 via-blue-500/10 to-violet-500/12 p-6 shadow-2xl shadow-black/25">
   <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-cyan-200/20 blur-2xl" />
   <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div>
     <span className="rounded-full border border-cyan-200/20 bg-cyan-100/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100">{tag}</span>
     <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{title}</h2>
     <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{subtitle}</p>
    </div>
    <div className="rounded-[1.8rem] border border-white/10 bg-white/10 p-5 text-right backdrop-blur-xl">
     <Icon className="ml-auto mb-3 h-7 w-7 text-cyan-200" />
     <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-300">Total previsto</p>
     <p className="mt-1 text-3xl font-black text-white">{total}</p>
    </div>
   </div>
  </section>
 );
}


function PerDiemRulesSettingsCard({ settings, onChange }: { settings: PerDiemUserSettings; onChange: (patch: Partial<PerDiemUserSettings>) => void }) {
 return (
  <section className="mt-4 rounded-[1.8rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/15">
   <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
    <div>
     <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/70">regras pessoais</p>
     <h3 className="mt-1 text-2xl font-black text-white">Base virtual e pernoite dirigido</h3>
     <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Use somente se isso aparecer na sua escala/contrato. O CrewCheck evita somar pernoite em base contratual ou base virtual e mantém pernoite dirigido como regra manual para revisão.</p>
    </div>
    <Badge className="w-fit rounded-full border-0 bg-cyan-200 text-[#07111f]">ajuste fino</Badge>
   </div>
   <div className="mt-4 grid gap-3 md:grid-cols-3">
    <button type="button" onClick={() => onChange({ baseVirtualEnabled: !settings.baseVirtualEnabled })} className={`rounded-2xl border p-4 text-left transition active:scale-[0.99] ${settings.baseVirtualEnabled ? 'border-cyan-200/60 bg-cyan-200/15' : 'border-white/10 bg-white/[0.04]'}`}>
     <p className="text-sm font-black text-white">Tenho base virtual</p>
     <p className="mt-1 text-xs leading-5 text-slate-300">Folga/repouso na base virtual não gera diárias automaticamente.</p>
    </button>
    <label className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
     <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Aeroporto da base virtual</span>
     <input value={settings.baseVirtualAirport} onChange={(event) => onChange({ baseVirtualAirport: event.target.value })} maxLength={3} placeholder="Ex.: CGH" className="mt-2 w-full rounded-xl border border-white/10 bg-[#07111f] px-3 py-3 text-lg font-black uppercase text-white outline-none focus:border-cyan-300" />
    </label>
    <button type="button" onClick={() => onChange({ directedLayoverEnabled: !settings.directedLayoverEnabled })} className={`rounded-2xl border p-4 text-left transition active:scale-[0.99] ${settings.directedLayoverEnabled ? 'border-amber-200/60 bg-amber-200/15' : 'border-white/10 bg-white/[0.04]'}`}>
     <p className="text-sm font-black text-white">Pernoite dirigido</p>
     <p className="mt-1 text-xs leading-5 text-slate-300">Quando indicado, o sistema mostra como estimado/revisão, sem forçar café ou ceia.</p>
    </button>
   </div>
  </section>
 );
}



function AdminDashboardScreen({ bundle, savedRosters, dbStatus, pendingOffline, onBack }: { bundle: SessionRosterBundle | null; savedRosters: SavedRosterSummary[]; dbStatus: DatabaseStatus | null; pendingOffline: number; onBack: () => void }) {
 const [health, setHealth] = useState<any>(null);
 const [adminStats, setAdminStats] = useState<any>(null);
 const [systemDashboard, setSystemDashboard] = useState<any>(null);
 const [billingDashboard, setBillingDashboard] = useState<any>(null);
 const [loading, setLoading] = useState(false);
 const [unlimitedEmail, setUnlimitedEmail] = useState('');
 const [unlimitedNote, setUnlimitedNote] = useState('');
 const [grantingUnlimited, setGrantingUnlimited] = useState(false);
 const [grantUnlimitedResult, setGrantUnlimitedResult] = useState<any>(null);
 async function loadAdminDashboard() {
  setLoading(true);
  try {
   const token = getToken?.();
   const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
   const [healthPayload, statsPayload, systemPayload, billingPayload] = await Promise.all([
    fetch('/api/health', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({ ok: false })),
    fetch('/api/admin/usage-summary', { cache: 'no-store', headers }).then((r) => r.json()).catch(() => null),
    fetch('/api/admin/system-dashboard', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha sistema' })),
    fetch('/api/admin/billing/dashboard', { cache: 'no-store', headers }).then((r) => r.json()).catch((error) => ({ ok: false, message: error?.message || 'Falha financeiro' })),
   ]);
   setHealth(healthPayload);
   setAdminStats(statsPayload?.ok ? statsPayload : null);
   setSystemDashboard(systemPayload);
   setBillingDashboard(billingPayload);
  } finally {
   setLoading(false);
  }
 }
 async function handleGrantUnlimited() {
  const email = normalizeEmail(unlimitedEmail);
  if (!email || !email.includes('@')) {
   toast.error('Informe um e-mail válido para liberar o Premium Unlimited.');
   return;
  }
  setGrantingUnlimited(true);
  setGrantUnlimitedResult(null);
  try {
   const token = getToken?.();
   const headers: Record<string, string> = { 'content-type': 'application/json' };
   if (token) headers.authorization = `Bearer ${token}`;
   const response = await fetch('/api/admin/billing/grant-unlimited', { method: 'POST', headers, body: JSON.stringify({ email, note: unlimitedNote }) });
   const payload = await response.json().catch(() => null);
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível liberar Premium Unlimited.');
   setGrantUnlimitedResult(payload);
   setUnlimitedEmail('');
   setUnlimitedNote('');
   toast.success(payload.message || `Premium Unlimited liberado para ${email}.`);
   void loadAdminDashboard();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Falha ao liberar Premium Unlimited.');
  } finally {
   setGrantingUnlimited(false);
  }
 }
 useEffect(() => { void loadAdminDashboard(); }, []);
 const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
 const finance = systemDashboard?.finance || billingDashboard?.forecast || {};
 const services = Array.isArray(systemDashboard?.services) ? systemDashboard.services : [];
 const okServices = services.filter((svc: any) => svc.ok).length;
 const warnServices = services.length - okServices;
 const daysLoaded = bundle?.roster?.days?.length || 0;
 const financeCards = [
  { label: 'MRR previsto', value: formatMoney(finance.mrr || billingDashboard?.totals?.estimatedMrr || 0), hint: 'receita mensal recorrente estimada' },
  { label: 'ARR previsto', value: formatMoney(finance.arr || billingDashboard?.totals?.estimatedArr || 0), hint: 'receita anual recorrente estimada' },
  { label: 'Custos mensais', value: formatMoney(finance.fixedCosts || billingDashboard?.forecast?.fixedCosts || 0), hint: 'custos configurados' },
  { label: 'Lucro estimado', value: formatMoney(finance.monthlyProfit || billingDashboard?.forecast?.monthlyProfit || 0), hint: finance.profitMarginPercent !== null && finance.profitMarginPercent !== undefined ? `margem ${Number(finance.profitMarginPercent).toFixed(1)}%` : 'configure custos para margem' },
 ];
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 pb-32 text-white crewcheck-admin-screen">
   <div className="mx-auto max-w-7xl">
    <HeaderBack title="Dashboard Admin" subtitle="saúde do sistema · financeiro Asaas · gestão operacional" onBack={onBack} />
    <section className="mt-6 rounded-[2rem] border border-cyan-200/20 bg-gradient-to-br from-cyan-300/15 via-white/[0.06] to-blue-500/10 p-5 shadow-2xl shadow-black/25">
     <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
       <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-100/65">central administrativa</p>
       <h2 className="mt-1 text-3xl font-black">Operação, saúde e faturamento</h2>
       <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Painel agregado para acompanhar serviços, banco, e-mail, cobrança, assinaturas, inadimplência, receita prevista e lucro estimado. Sem expor segredos, tokens ou dados sensíveis.</p>
      </div>
      <button onClick={() => void loadAdminDashboard()} disabled={loading} className="rounded-2xl bg-cyan-200 px-5 py-4 text-sm font-black text-[#07111f] disabled:opacity-60"><RefreshCw className={`mr-2 inline h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar</button>
     </div>
    </section>
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     <Kpi icon={Users} value={adminStats?.usersTotal !== undefined ? String(adminStats.usersTotal) : String(systemDashboard?.finance?.users ?? '—')} label="Usuários cadastrados" />
     <Kpi icon={Activity} value={String(systemDashboard?.usage?.activeSessions ?? adminStats?.activeSessions ?? (online ? 'online' : 'offline'))} label="Sessões ativas / estado" />
     <Kpi icon={Database} value={health?.databaseConfigured || dbStatus?.connected ? 'online' : 'local'} label="Banco de dados" />
     <Kpi icon={CloudUpload} value={String(pendingOffline || 0)} label="Fila offline pendente" />
    </section>
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     {financeCards.map((card) => <div key={card.label} className="rounded-[1.6rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/20"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-100/60">{card.label}</p><h3 className="mt-2 text-2xl font-black text-white">{card.value}</h3><p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{card.hint}</p></div>)}
    </section>
    <section className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
     <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/10 p-5">
      <h3 className="text-xl font-black">Financeiro Asaas</h3>
      <div className="mt-4 space-y-2 text-sm leading-6 text-emerald-50/85">
       <p><b className="text-white">Premium ativos:</b> {billingDashboard?.totals?.activePremiumUsers ?? systemDashboard?.finance?.monthlyActive + systemDashboard?.finance?.annualActive ?? '—'}</p>
       <p><b className="text-white">Mensais:</b> {billingDashboard?.totals?.monthlyActive ?? systemDashboard?.finance?.monthlyActive ?? 0}</p>
       <p><b className="text-white">Anuais:</b> {billingDashboard?.totals?.annualActive ?? systemDashboard?.finance?.annualActive ?? 0}</p>
       <p><b className="text-white">Inadimplentes:</b> {billingDashboard?.totals?.pastDue ?? systemDashboard?.finance?.pastDue ?? 0}</p>
       <p><b className="text-white">Teste grátis:</b> {billingDashboard?.totals?.trialing ?? systemDashboard?.finance?.trialing ?? 0}</p>
      </div>
     </div>
     <div className="rounded-[2rem] border border-amber-300/20 bg-amber-300/10 p-5">
      <div className="flex items-center justify-between gap-2">
       <h3 className="text-xl font-black">Premium Unlimited</h3>
       <Shield className="h-5 w-5 text-amber-100" />
      </div>
      <p className="mt-2 text-xs leading-5 text-amber-50/80">Libere acesso Premium vitalício por e-mail para usuários já cadastrados, sem criar cobrança no Asaas.</p>
      <div className="mt-4 grid gap-2">
       <input value={unlimitedEmail} onChange={(event) => setUnlimitedEmail(event.target.value)} placeholder="email do usuário" inputMode="email" className="rounded-2xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm font-black text-white outline-none placeholder:text-slate-500" />
       <input value={unlimitedNote} onChange={(event) => setUnlimitedNote(event.target.value)} placeholder="observação opcional" className="rounded-2xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500" />
       <button onClick={() => void handleGrantUnlimited()} disabled={grantingUnlimited} className="rounded-2xl bg-amber-200 px-4 py-3 text-sm font-black text-[#07111f] disabled:opacity-60">
        {grantingUnlimited ? 'Liberando...' : 'Liberar Unlimited'}
       </button>
       {grantUnlimitedResult?.email ? <p className="rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-bold text-emerald-50">Liberado: {grantUnlimitedResult.email}</p> : null}
      </div>
     </div>
     <div className="rounded-[2rem] border border-cyan-300/20 bg-cyan-300/10 p-5">
      <h3 className="text-xl font-black">Saúde dos serviços</h3>
      <div className="mt-4 space-y-2 text-sm leading-6 text-cyan-50/85">
       <p><b className="text-white">Serviços OK:</b> {okServices}/{services.length || '—'}</p>
       <p><b className="text-white">Atenção:</b> {warnServices}</p>
       <p><b className="text-white">Radar:</b> {services.find((s: any) => s.key === 'flightaware')?.ok ? 'OK' : 'Verificar'}</p>
       <p><b className="text-white">E-mail:</b> {health?.emailConfigured ? 'OK' : 'Verificar'}</p>
       <p><b className="text-white">Cobrança:</b> {services.find((s: any) => s.key === 'asaas')?.ok ? 'OK' : 'Verificar'}</p>
      </div>
     </div>
     <div className="rounded-[2rem] border border-violet-300/20 bg-violet-300/10 p-5">
      <h3 className="text-xl font-black">Gerenciamento</h3>
      <div className="mt-4 grid gap-2">
       <button onClick={() => window.open('/api/admin/billing/dashboard', '_blank')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-black text-white">Abrir JSON financeiro</button>
       <button onClick={() => window.open('/api/admin/system-dashboard', '_blank')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-black text-white">Abrir JSON saúde</button>
       <button onClick={() => window.open('/api/admin/email-health', '_blank')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-left text-sm font-black text-white">Testar e-mail</button>
      </div>
     </div>
    </section>
    <section className="mt-6 rounded-[2rem] border border-white/10 bg-white/[0.055] p-5">
     <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/70">mapa de saúde</p><h3 className="mt-1 text-2xl font-black">Serviços monitorados</h3></div><Badge className="rounded-full border-0 bg-cyan-200 text-[#07111f]">sem segredos</Badge></div>
     <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {services.map((svc: any) => <div key={svc.key || svc.label} className={`rounded-2xl border p-4 ${svc.ok ? 'border-emerald-200/20 bg-emerald-300/10' : 'border-amber-200/20 bg-amber-300/10'}`}><div className="flex items-center justify-between gap-2"><p className="text-sm font-black text-white">{svc.label}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${svc.ok ? 'bg-emerald-200 text-emerald-950' : 'bg-amber-200 text-amber-950'}`}>{svc.ok ? 'OK' : 'Atenção'}</span></div><p className="mt-2 text-xs leading-5 text-slate-300">{svc.detail}</p></div>)}
     </div>
    </section>
    <section className="mt-6 grid gap-4 lg:grid-cols-2">
     <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5">
      <h3 className="text-xl font-black">Escalas e armazenamento</h3>
      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
       <p><b className="text-white">Escalas locais/salvas:</b> {savedRosters.length}</p>
       <p><b className="text-white">Escalas no banco:</b> {systemDashboard?.usage?.rostersTotal ?? adminStats?.rostersTotal ?? '—'}</p>
       <p><b className="text-white">Dias carregados na sessão atual:</b> {daysLoaded}</p>
       <p><b className="text-white">Arquivo atual:</b> {bundle?.roster?.month ? `${bundle.roster.month}/${bundle.roster.year}` : 'nenhum'}</p>
      </div>
     </div>
     <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5">
      <h3 className="text-xl font-black">Custos usados no lucro</h3>
      <div className="mt-4 grid gap-2 text-sm text-slate-300">
       {Object.entries(systemDashboard?.costBasis || billingDashboard?.forecast?.costBasis || {}).map(([key, value]) => <p key={key} className="flex justify-between gap-3 rounded-xl bg-white/[0.05] px-3 py-2"><span>{key}</span><b className="text-white">{typeof value === 'number' ? (key.toLowerCase().includes('percent') ? `${Number(value).toFixed(2)}%` : formatMoney(Number(value))) : String(value)}</b></p>)}
      </div>
     </div>
    </section>
   </div>
  </div>
 );
}


function PerDiemReceivedCalibrationCard({ samples, onChange, forecast }: { samples: PerDiemReceivedSample[]; onChange: (samples: PerDiemReceivedSample[]) => void; forecast: ReturnType<typeof computePerDiemForecast> }) {
 const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
 const [amount, setAmount] = useState('');
 const [note, setNote] = useState('');
 const totalReceived = samples.reduce((sum, item) => sum + item.amount, 0);
 const forecastBrl = forecast.totalsByCurrency.BRL || 0;
 const factor = forecastBrl > 0 && totalReceived > 0 ? totalReceived / forecastBrl : null;
 const addSample = () => {
  const parsed = parseBrazilMoneyInput(amount);
  if (!paymentDate || parsed === null || parsed <= 0) {
   toast.error('Informe data e valor recebido. Exemplo: 684,00');
   return;
  }
  const next = savePerDiemReceivedSamples([{ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, paymentDate, amount: parsed, note: note.trim() || 'Informado pelo administrador', createdAt: new Date().toISOString() }, ...samples]);
  onChange(next);
  setAmount('');
  setNote('');
  toast.success('Diária recebida salva para calibrar o CrewCheck.');
 };
 const removeSample = (id: string) => {
  const next = savePerDiemReceivedSamples(samples.filter((item) => item.id !== id));
  onChange(next);
  toast.success('Lançamento removido da calibração.');
 };
 const resetDefaults = () => {
  const next = savePerDiemReceivedSamples(CREW_PERDIEM_DEFAULT_SAMPLES);
  onChange(next);
  toast.success('Calibração voltou aos exemplos informados.');
 };
 return (
  <section className="mt-4 rounded-[1.8rem] border border-emerald-300/20 bg-emerald-300/10 p-5 shadow-2xl shadow-black/15">
   <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
    <div>
     <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/70">calibração real</p>
     <h3 className="mt-1 text-2xl font-black text-white">Diárias recebidas</h3>
     <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Informe depósitos reais por semana. O CrewCheck compara com a previsão e usa o histórico local para indicar ajuste e revisão sem acessar dados de outros usuários.</p>
    </div>
    <Badge className="w-fit rounded-full border-0 bg-emerald-200 text-[#07111f]">{samples.length} lançamento(s)</Badge>
   </div>
   <div className="mt-4 grid gap-3 md:grid-cols-[12rem_12rem_1fr_auto]">
    <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="rounded-2xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm font-black text-white outline-none" />
    <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Valor recebido" inputMode="decimal" className="rounded-2xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm font-black text-white outline-none" />
    <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observação opcional" className="rounded-2xl border border-white/10 bg-[#07111f] px-3 py-3 text-sm text-white outline-none" />
    <button onClick={addSample} className="rounded-2xl bg-emerald-200 px-4 py-3 text-sm font-black text-[#07111f]">Adicionar</button>
   </div>
   <div className="mt-4 grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
    <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
     <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/65">resumo local</p>
     <p className="mt-2 text-2xl font-black text-emerald-100">{formatMoney(totalReceived)}</p>
     <p className="mt-1 text-xs leading-5 text-slate-300">Total informado em demonstrativos/depositos. {factor ? `Fator de conferência atual: ${(factor * 100).toFixed(1)}%.` : 'Importe uma escala para comparar com a previsão.'}</p>
     <button onClick={resetDefaults} className="mt-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-black text-white">Restaurar exemplos</button>
    </div>
    <div className="max-h-56 overflow-auto rounded-2xl border border-white/10 bg-white/[0.04]">
     {samples.map((item) => (
      <div key={item.id} className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-sm last:border-b-0">
       <div><b>{new Date(`${item.paymentDate}T12:00:00`).toLocaleDateString('pt-BR')}</b><p className="text-xs text-slate-400">{item.note || 'Informado'}</p></div>
       <div className="flex items-center gap-2"><span className="font-black text-emerald-100">{formatMoney(item.amount)}</span><button onClick={() => removeSample(item.id)} className="rounded-lg border border-rose-300/20 bg-rose-300/10 px-2 py-1 text-[10px] font-black text-rose-100">Apagar</button></div>
      </div>
     ))}
     {!samples.length && <div className="px-4 py-6 text-center text-sm text-slate-300">Nenhuma diária recebida informada.</div>}
    </div>
   </div>
  </section>
 );
}



type ExchangeRatesResponse = {
 ok?: boolean;
 base?: string;
 date?: string;
 rates?: Record<string, number>;
 source?: string;
 message?: string;
};

const CREW_CURRENCY_OPTIONS = ['BRL', 'USD', 'EUR', 'GBP', 'ARS', 'CLP', 'COP', 'PEN', 'MXN', 'CAD'] as const;
type CrewCurrencyCode = typeof CREW_CURRENCY_OPTIONS[number];

function formatCurrencyAmount(value: number, currency: string): string {
 try {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number.isFinite(value) ? value : 0);
 } catch {
  return `${currency} ${(Number.isFinite(value) ? value : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
 }
}

function parseFlexibleMoney(value: string): number {
 const cleaned = String(value || '').trim().replace(/\s+/g, '');
 if (!cleaned) return 0;
 if (cleaned.includes(',') && cleaned.includes('.')) return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
 if (cleaned.includes(',')) return Number(cleaned.replace(',', '.')) || 0;
 return Number(cleaned) || 0;
}

async function fetchCrewExchangeRates(base: string, symbols: string[]): Promise<ExchangeRatesResponse> {
 const params = new URLSearchParams({ base: base.toUpperCase(), symbols: symbols.map((item) => item.toUpperCase()).join(',') });
 const response = await fetch(`/api/exchange-rates?${params.toString()}`);
 const payload = await response.json().catch(() => null) as ExchangeRatesResponse | null;
 if (!response.ok || !payload?.ok || !payload.rates) throw new Error(payload?.message || 'Cotação indisponível agora.');
 return payload;
}

function CurrencyConverterScreen({ bundle, onBack, onOpenPerDiem }: { bundle: SessionRosterBundle | null; onBack: () => void; onOpenPerDiem: () => void }) {
 const forecast = computePerDiemForecast(bundle);
 const [amountInput, setAmountInput] = useState('100');
 const [fromCurrency, setFromCurrency] = useState<CrewCurrencyCode>('USD');
 const [toCurrency, setToCurrency] = useState<CrewCurrencyCode>('BRL');
 const [ratePayload, setRatePayload] = useState<ExchangeRatesResponse | null>(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');
 const [brlRates, setBrlRates] = useState<Record<string, { value: number; date?: string; source?: string }>>({});
 const amount = parseFlexibleMoney(amountInput);
 const directRate = ratePayload?.rates?.[toCurrency] || 0;
 const converted = fromCurrency === toCurrency ? amount : amount * directRate;
 const loadRate = useCallback(async () => {
  setLoading(true);
  setError('');
  try {
   const payload = fromCurrency === toCurrency
    ? { ok: true, base: fromCurrency, date: new Date().toISOString().slice(0, 10), rates: { [toCurrency]: 1 }, source: 'conversão local' }
    : await fetchCrewExchangeRates(fromCurrency, [toCurrency]);
   setRatePayload(payload);
  } catch (err) {
   setError(err instanceof Error ? err.message : 'Cotação indisponível agora.');
  } finally {
   setLoading(false);
  }
 }, [fromCurrency, toCurrency]);
 useEffect(() => { void loadRate(); }, [loadRate]);
 useEffect(() => {
  const currencies = Array.from(new Set(forecast.byInternationalPayment.map((item) => item.currency).filter((currency) => currency !== 'BRL')));
  if (!currencies.length) return;
  let active = true;
  Promise.all(currencies.map(async (currency) => {
   try {
    const payload = await fetchCrewExchangeRates(currency, ['BRL']);
    return [currency, { value: payload.rates?.BRL || 0, date: payload.date, source: payload.source }] as const;
   } catch {
    return [currency, { value: 0, date: undefined, source: 'indisponível' }] as const;
   }
  })).then((rows) => {
   if (!active) return;
   const next: Record<string, { value: number; date?: string; source?: string }> = {};
   rows.forEach(([currency, value]) => { next[currency] = value; });
   setBrlRates(next);
  });
  return () => { active = false; };
 }, [forecast.byInternationalPayment.length, bundle]);
 const swapCurrencies = () => {
  setFromCurrency(toCurrency);
  setToCurrency(fromCurrency);
 };
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 pb-32 text-white crewcheck-finance-screen crewcheck-tool-screen">
   <div className="mx-auto max-w-6xl">
    <HeaderBack title="Conversor de moedas" subtitle="cotação do dia · diárias internacionais" onBack={onBack} action={<button onClick={onOpenPerDiem} className="crewcheck-premium-button crewcheck-premium-button-ghost rounded-2xl px-4 py-3 text-xs font-black">Abrir diárias</button>} />
    <section className="mt-6 overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-[linear-gradient(135deg,rgba(14,165,233,.16),rgba(255,255,255,.06),rgba(124,58,237,.12))] p-5 shadow-2xl shadow-black/25">
     <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
       <p className="text-[11px] font-black uppercase tracking-[0.24em] text-cyan-100/70">CrewCheck Finance</p>
       <h2 className="mt-2 text-3xl font-black tracking-tight md:text-5xl">Moeda, câmbio e diárias internacionais.</h2>
       <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-slate-300">Converta valores pela cotação do dia e veja as diárias internacionais da escala em reais, separadas do fechamento nacional.</p>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.07] px-5 py-4 text-sm font-semibold text-cyan-50/85">
       Fonte: {ratePayload?.source || 'cotação diária'}<br />Data: {ratePayload?.date || 'consultando...'}
      </div>
     </div>
    </section>
    <section className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,.55fr)]">
     <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20">
      <div className="grid gap-3 md:grid-cols-[1fr_12rem_auto_12rem] md:items-end">
       <label className="block"><span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Valor</span><input value={amountInput} onChange={(event) => setAmountInput(event.target.value)} inputMode="decimal" className="mt-2 h-14 w-full rounded-2xl border border-white/12 bg-black/20 px-4 text-2xl font-black text-white outline-none focus:border-cyan-300" placeholder="100,00" /></label>
       <label className="block"><span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">De</span><select value={fromCurrency} onChange={(event) => setFromCurrency(event.target.value as CrewCurrencyCode)} className="mt-2 h-14 w-full rounded-2xl border border-white/12 bg-slate-950/80 px-4 text-sm font-black text-white outline-none focus:border-cyan-300">{CREW_CURRENCY_OPTIONS.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
       <button onClick={swapCurrencies} className="crewcheck-premium-button crewcheck-premium-button-ghost h-14 rounded-2xl px-4 text-xl font-black" title="Inverter moedas">⇄</button>
       <label className="block"><span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Para</span><select value={toCurrency} onChange={(event) => setToCurrency(event.target.value as CrewCurrencyCode)} className="mt-2 h-14 w-full rounded-2xl border border-white/12 bg-slate-950/80 px-4 text-sm font-black text-white outline-none focus:border-cyan-300">{CREW_CURRENCY_OPTIONS.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
      </div>
      <div className="mt-5 rounded-[1.6rem] border border-cyan-300/20 bg-cyan-300/10 p-5">
       <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100/70">Resultado</p>
       <p className="mt-2 text-4xl font-black text-cyan-50">{loading ? 'Consultando...' : formatCurrencyAmount(converted, toCurrency)}</p>
       <p className="mt-2 text-sm font-semibold text-cyan-50/75">{amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {fromCurrency} {directRate ? `× ${directRate.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}` : ''}</p>
       {error && <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-50">{error}</p>}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
       {['USD','EUR','ARS','GBP'].map((currency) => <button key={currency} onClick={() => { setFromCurrency(currency as CrewCurrencyCode); setToCurrency('BRL'); }} className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white hover:bg-white/[0.10]">{currency} → BRL</button>)}
      </div>
     </div>
     <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/10 p-5 shadow-2xl shadow-black/20">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/70">diárias internacionais</p>
      <h3 className="mt-2 text-2xl font-black text-emerald-50">Convertidas em reais</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-emerald-50/75">Use como referência. O pagamento oficial pode usar regra/data específica do demonstrativo.</p>
      <div className="mt-4 space-y-3">
       {forecast.byInternationalPayment.slice(0, 7).map((item) => {
        const rate = item.currency === 'BRL' ? 1 : (brlRates[item.currency]?.value || 0);
        const brl = item.total * rate;
        return (
         <div key={item.key} className="rounded-3xl border border-white/10 bg-white/[0.07] p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100/70">{item.dateRange} · {item.countryLabel}</p>
          <p className="mt-1 text-lg font-black text-white">{formatPerDiemTotals(item.totals)}</p>
          <p className="text-sm font-black text-emerald-100">{rate ? `≈ ${formatCurrencyAmount(brl, 'BRL')}` : 'Cotação BRL indisponível'}</p>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-emerald-50/65">{item.mealSummary || item.flightKey} · taxa {item.currency}/BRL {rate ? rate.toLocaleString('pt-BR', { maximumFractionDigits: 5 }) : '—'}</p>
         </div>
        );
       })}
       {!forecast.byInternationalPayment.length && <p className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 text-sm font-semibold text-emerald-50/75">Nenhuma diária internacional encontrada na escala aberta.</p>}
      </div>
     </div>
    </section>
   </div>
  </div>
 );
}

type ParkingSpot = {
 lat?: number;
 lng?: number;
 accuracy?: number;
 savedAt?: string;
 terminal?: string;
 floor?: string;
 sector?: string;
 row?: string;
 note?: string;
 photoLabel?: string;
};

function parkingStorageKey(): string {
 return `crewcheck_parking_spot_${crewcheckCurrentUserScope()}`;
}

function readParkingSpot(): ParkingSpot | null {
 try {
  const raw = localStorage.getItem(parkingStorageKey());
  return raw ? JSON.parse(raw) as ParkingSpot : null;
 } catch { return null; }
}

function saveParkingSpotLocal(spot: ParkingSpot | null): ParkingSpot | null {
 try {
  if (spot) localStorage.setItem(parkingStorageKey(), JSON.stringify(spot));
  else localStorage.removeItem(parkingStorageKey());
 } catch {}
 return spot;
}

function buildPreciseMarkerUrl(lat?: number | null, lng?: number | null): string {
 const latitude = Number(lat);
 const longitude = Number(lng);
 if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
 return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function buildGoogleMapsDestinationUrl(lat?: number | null, lng?: number | null): string {
 const latitude = Number(lat);
 const longitude = Number(lng);
 if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'https://www.google.com/maps';
 const point = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
 return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point)}&travelmode=driving`;
}

function openGoogleDestination(url: string, fallbackUrl?: string): void {
 const target = url || 'https://www.google.com/maps';
 try { window.open(target, '_blank', 'noopener,noreferrer'); }
 catch { if (fallbackUrl) window.location.href = fallbackUrl; }
}

function buildTomTomGoDestinationUrl(lat?: number | null, lng?: number | null): string {
 const latitude = Number(lat);
 const longitude = Number(lng);
 if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
 return `tomtomgo://x-callback-url/navigate?destination=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

function buildTomTomGoAndroidIntentUrl(lat?: number | null, lng?: number | null): string {
 const latitude = Number(lat);
 const longitude = Number(lng);
 if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
 const fallback = encodeURIComponent(buildTomTomPlanSearchUrl(latitude, longitude));
 const destination = encodeURIComponent(`${latitude.toFixed(6)},${longitude.toFixed(6)}`);
 return `intent://x-callback-url/navigate?destination=${destination}#Intent;scheme=tomtomgo;package=com.tomtom.gplay.navapp;S.browser_fallback_url=${fallback};end`;
}

function buildTomTomPlanSearchUrl(lat?: number | null, lng?: number | null): string {
 const latitude = Number(lat);
 const longitude = Number(lng);
 if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'https://plan.tomtom.com/';
 const point = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
 // Forçado em domínio TomTom: sem fallback para Google Maps/OpenStreetMap.
 return `https://plan.tomtom.com/?destination=${encodeURIComponent(point)}&routeType=fastest&traffic=true`;
}

function formatParkingCoordinates(lat?: number | null, lng?: number | null): string {
 const latitude = Number(lat);
 const longitude = Number(lng);
 if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
 return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function openTomTomDestination(url: string, fallbackUrl?: string): void {
 const fallback = fallbackUrl || 'https://plan.tomtom.com/';
 if (!url) {
  window.location.assign(fallback);
  return;
 }
 try {
  window.location.href = url;
  window.setTimeout(() => {
   if (document.visibilityState === 'visible') window.location.assign(fallback);
  }, 900);
 } catch {
  window.location.assign(fallback);
 }
}

function ParkingSpotScreen({ onBack }: { onBack: () => void }) {
 const [spot, setSpot] = useState<ParkingSpot | null>(() => readParkingSpot());
 const [saving, setSaving] = useState(false);
 const [terminal, setTerminal] = useState(() => spot?.terminal || '');
 const [floor, setFloor] = useState(() => spot?.floor || '');
 const [sector, setSector] = useState(() => spot?.sector || '');
 const [row, setRow] = useState(() => spot?.row || '');
 const [note, setNote] = useState(() => spot?.note || '');
 useEffect(() => {
  setTerminal(spot?.terminal || '');
  setFloor(spot?.floor || '');
  setSector(spot?.sector || '');
  setRow(spot?.row || '');
  setNote(spot?.note || '');
 }, [spot?.savedAt]);
 const tomTomUrl = buildTomTomGoDestinationUrl(spot?.lat, spot?.lng);
 const tomTomIntentUrl = buildTomTomGoAndroidIntentUrl(spot?.lat, spot?.lng);
 const tomTomWebUrl = buildTomTomPlanSearchUrl(spot?.lat, spot?.lng);
 const preciseMarkerUrl = buildPreciseMarkerUrl(spot?.lat, spot?.lng);
 const coordinateLabel = formatParkingCoordinates(spot?.lat, spot?.lng);
 const accuracyLabel = !spot?.accuracy ? 'não informada' : spot.accuracy <= 25 ? 'excelente' : spot.accuracy <= 60 ? 'boa' : spot.accuracy <= 150 ? 'aproximada' : 'baixa';
 const buildSpot = (coords?: GeolocationCoordinates): ParkingSpot => ({
  lat: coords?.latitude ?? spot?.lat,
  lng: coords?.longitude ?? spot?.lng,
  accuracy: coords?.accuracy ?? spot?.accuracy,
  savedAt: new Date().toISOString(),
  terminal: terminal.trim(),
  floor: floor.trim(),
  sector: sector.trim(),
  row: row.trim(),
  note: note.trim(),
 });
 const saveManual = () => {
  const saved = saveParkingSpotLocal(buildSpot());
  setSpot(saved);
  toast.success('Vaga salva neste dispositivo.');
 };
 const saveCurrentLocation = () => {
  if (!navigator.geolocation) {
   toast.error('GPS indisponível neste navegador. Salve a vaga manualmente.');
   return;
  }
  setSaving(true);
  navigator.geolocation.getCurrentPosition((position) => {
   const saved = saveParkingSpotLocal(buildSpot(position.coords));
   setSpot(saved);
   setSaving(false);
   toast.success('Localização do carro salva.');
  }, (err) => {
   setSaving(false);
   toast.error(err.message || 'Não foi possível capturar o GPS.');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
 };
 const copyParking = async () => {
  const text = [`Meu carro está salvo no CrewCheck.`, terminal && `Terminal: ${terminal}`, floor && `Piso: ${floor}`, sector && `Setor: ${sector}`, row && `Vaga/fileira: ${row}`, note && `Observação: ${note}`, coordinateLabel && `Coordenadas: ${coordinateLabel}`, tomTomUrl && `Google Maps: ${preciseMarkerUrl}`, tomTomWebUrl && `Fallback TomTom Web: ${tomTomWebUrl}`, preciseMarkerUrl && `Google Maps: ${preciseMarkerUrl}`].filter(Boolean).join('\n');
  try {
   if (navigator.share) await navigator.share({ title: 'Local do carro', text, url: tomTomUrl || undefined });
   else await navigator.clipboard.writeText(text);
   toast.success('Local do carro pronto para compartilhar.');
  } catch { toast.info('Compartilhamento cancelado.'); }
 };
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 pb-32 text-white crewcheck-tool-screen">
   <div className="mx-auto max-w-6xl">
    <HeaderBack title="Onde estacionei" subtitle="GPS · vaga · aeroporto · nível" onBack={onBack} />
    <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,.82fr)_minmax(22rem,.55fr)]">
     <div className="overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-white/[0.06] shadow-2xl shadow-black/25">
      <div className="relative min-h-[22rem] bg-[radial-gradient(circle_at_42%_34%,rgba(125,211,252,.24),transparent_28%),linear-gradient(135deg,rgba(14,165,233,.12),rgba(255,255,255,.04))] p-5">
       <div className="absolute inset-0 opacity-45" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '54px 54px' }} />
       <div className="relative z-10 flex h-full min-h-[20rem] flex-col items-center justify-center text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] border border-cyan-200/20 bg-cyan-300/12 text-cyan-100 shadow-2xl shadow-cyan-950/30"><Car className="h-12 w-12" /></div>
        <h2 className="mt-5 text-4xl font-black tracking-tight">{spot ? 'Carro salvo' : 'Nenhum local salvo'}</h2>
        <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-slate-300">Salve GPS, terminal, piso, setor e observação. Ideal para estacionamento de aeroporto, conexão rápida e retorno de pernoite.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
         <Badge className="rounded-full border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/10">Precisão {accuracyLabel}</Badge>
         {spot?.savedAt && <Badge className="rounded-full border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/10">Salvo {new Date(spot.savedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</Badge>}
        </div>
       </div>
      </div>
      <div className="grid gap-3 border-t border-white/10 p-5 sm:grid-cols-2 lg:grid-cols-4">
       <ParkingField label="Terminal" value={terminal} onChange={setTerminal} placeholder="Ex.: BSB / T1" />
       <ParkingField label="Piso" value={floor} onChange={setFloor} placeholder="Ex.: 1 / 1.5 / G2" />
       <ParkingField label="Setor" value={sector} onChange={setSector} placeholder="Ex.: Azul / P3" />
       <ParkingField label="Fileira/Vaga" value={row} onChange={setRow} placeholder="Ex.: 22B" />
       <label className="block sm:col-span-2 lg:col-span-4"><span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">Observação</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: próximo ao portão 23, em frente ao café, coluna C." className="mt-2 min-h-24 w-full rounded-2xl border border-white/12 bg-black/20 px-4 py-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300" /></label>
      </div>
     </div>
     <div className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/20">
      <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/70">ações rápidas</p>
      <div className="mt-4 grid gap-3">
       <button onClick={saveCurrentLocation} disabled={saving} className="crewcheck-premium-button crewcheck-premium-button-primary rounded-3xl px-5 py-4 text-sm font-black"><MapPin className="h-5 w-5" />{saving ? 'Capturando GPS...' : 'Salvar localização atual'}</button>
       <button onClick={saveManual} className="crewcheck-premium-button crewcheck-premium-button-ghost rounded-3xl px-5 py-4 text-sm font-black"><CheckCircle2 className="h-5 w-5" />Salvar dados manuais</button>
       <button onClick={() => preciseMarkerUrl ? openGoogleDestination(preciseMarkerUrl, tomTomWebUrl) : toast.info('Salve uma localização GPS primeiro.')} className="rounded-3xl border border-white/10 bg-white/[0.07] px-5 py-4 text-left text-sm font-black text-white hover:bg-white/[0.11]"><Navigation className="mr-2 inline h-5 w-5 text-cyan-200" />Abrir no Google Maps</button>
       <button onClick={() => preciseMarkerUrl ? window.location.assign(preciseMarkerUrl) : toast.info('Salve uma localização GPS primeiro.')} className="rounded-3xl border border-cyan-300/20 bg-cyan-300/10 px-5 py-4 text-left text-sm font-black text-cyan-50 hover:bg-cyan-300/15"><MapPin className="mr-2 inline h-5 w-5 text-cyan-200" />Ver marcador preciso</button>
       <button onClick={async () => { if (!coordinateLabel) { toast.info('Salve uma localização GPS primeiro.'); return; } await navigator.clipboard?.writeText(coordinateLabel); toast.success('Coordenadas copiadas.'); }} className="rounded-3xl border border-white/10 bg-white/[0.07] px-5 py-4 text-left text-sm font-black text-white hover:bg-white/[0.11]"><Copy className="mr-2 inline h-5 w-5 text-cyan-200" />Copiar coordenadas</button>
       <button onClick={copyParking} className="rounded-3xl border border-white/10 bg-white/[0.07] px-5 py-4 text-left text-sm font-black text-white hover:bg-white/[0.11]"><Copy className="mr-2 inline h-5 w-5 text-cyan-200" />Copiar ou compartilhar</button>
       <button onClick={() => { setSpot(saveParkingSpotLocal(null)); toast.success('Local do carro removido.'); }} className="rounded-3xl border border-rose-300/20 bg-rose-300/10 px-5 py-4 text-left text-sm font-black text-rose-50 hover:bg-rose-300/15"><Trash2 className="mr-2 inline h-5 w-5" />Apagar local salvo</button>
      </div>
      {coordinateLabel ? <div className="mt-5 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-semibold leading-6 text-cyan-50/90"><b className="block text-xs uppercase tracking-[0.18em] text-cyan-100/70">Coordenadas do carro</b><span className="mt-1 block font-mono text-base font-black text-white">{coordinateLabel}</span><span className="mt-1 block text-xs text-cyan-50/70">O CrewCheck abre primeiro no Google Maps e mantém TomTom Web como fallback.</span></div> : null}
      <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-semibold leading-6 text-amber-50/90">Em estacionamentos cobertos, o GPS pode variar. Use também setor, piso, coluna, portão ou uma referência visual.</div>
     </div>
    </section>
   </div>
  </div>
 );
}

function ParkingField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
 return <label className="block"><span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 h-12 w-full rounded-2xl border border-white/12 bg-black/20 px-4 text-sm font-black text-white outline-none placeholder:text-slate-500 focus:border-cyan-300" /></label>;
}

type PerDiemMonthOption = { key: string; label: string; id?: string };

function buildPerDiemMonthOptions(bundle: SessionRosterBundle | null, savedRosters: SavedRosterSummary[]): PerDiemMonthOption[] {
 const map = new Map<string, PerDiemMonthOption>();
 const add = (year?: number | null, month?: number | null, id?: string, labelPrefix?: string) => {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m) return;
  const key = `${y}-${String(m).padStart(2, '0')}`;
  if (!map.has(key)) map.set(key, { key, label: `${labelPrefix ? `${labelPrefix} · ` : ''}${monthLabel(m, y)}`, id });
  else if (id && !map.get(key)?.id) map.set(key, { ...map.get(key)!, id });
 };
 add(bundle?.roster?.year, bundle?.roster?.month, undefined, 'Aberta');
 savedRosters.forEach((item) => add(item.year, item.month, item.id, item.sourceFileName || 'Salva'));
 return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function PerDiemForecastScreen({ bundle, savedRosters, onBack, onOpenImport, onOpenSavedRoster }: { bundle: SessionRosterBundle | null; savedRosters: SavedRosterSummary[]; onBack: () => void; onOpenImport: () => void; onOpenSavedRoster: (id: string) => Promise<void> | void }) {
 const [perDiemSettings, setPerDiemSettings] = useState<PerDiemUserSettings>(() => readPerDiemUserSettings());
 const [receivedSamples, setReceivedSamples] = useState<PerDiemReceivedSample[]>(() => readPerDiemReceivedSamples());
 const forecast = computePerDiemForecast(bundle);
 const hasRoster = Boolean(bundle?.roster.days?.length);
 const monthOptions = useMemo(() => buildPerDiemMonthOptions(bundle, savedRosters), [bundle, savedRosters]);
 const currentMonthKey = bundle?.roster?.month && bundle?.roster?.year ? `${bundle.roster.year}-${String(bundle.roster.month).padStart(2, '0')}` : '';
 const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
 useEffect(() => { if (currentMonthKey) setSelectedMonthKey(currentMonthKey); }, [currentMonthKey]);
 const handlePerDiemMonthChange = (value: string) => {
  setSelectedMonthKey(value);
  const option = monthOptions.find((item) => item.key === value);
  if (option?.id) void onOpenSavedRoster(option.id);
 };
 const updatePerDiemSettings = (patch: Partial<PerDiemUserSettings>) => {
  const saved = savePerDiemUserSettings({ ...perDiemSettings, ...patch });
  setPerDiemSettings(saved);
  toast.success('Preferências de diárias atualizadas.');
 };
 const summaryText = [
  'CrewCheck · Previsão de Diárias',
  `Período: ${financialPeriodLabel(bundle)}`,
  `Total mensal: ${formatPerDiemTotals(forecast.totalsByCurrency)}`,
  `Café: ${summarizePerDiemType(forecast.entries, 'CAFE')}`,
  `Almoço: ${summarizePerDiemType(forecast.entries, 'ALMOCO')}`,
  `Jantar: ${summarizePerDiemType(forecast.entries, 'JANTAR')}`,
  `Ceia: ${summarizePerDiemType(forecast.entries, 'CEIA')}`,
  '',
  'Nacionais — fechamento semanal:',
  ...forecast.byWeek.map((week) => `${week.start} a ${week.end}: ${formatPerDiemTotals(week.totals)} · ${week.paymentHint}`),
  '',
  'Internacionais — pagamento separado no dia do voo:',
  ...(forecast.byInternationalPayment.length ? forecast.byInternationalPayment.map((item) => `${item.flightKey} · ${item.dateRange} · ${item.mealSummary}: ${formatPerDiemTotals(item.totals)} · ${item.paymentHint}`) : ['Nenhuma diária internacional prevista.']),
  '',
  'Previsão operacional. Confira sempre com o demonstrativo oficial.',
 ].join('\n');
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 pb-32 text-white crewcheck-finance-screen">
   <div className="mx-auto max-w-6xl">
    <HeaderBack title="Previsão de Diárias" subtitle="alimentação · escala · depósitos" onBack={onBack} action={hasRoster ? <FinanceShareActions filename="crewcheck-diarias.txt" title="CrewCheck · Previsão de Diárias" content={summaryText} /> : undefined} />
    <div className="mt-6">
     <ForecastHero icon={FileText} tag="CrewCheck Finance" title="Diárias previstas" subtitle="Motor calibrado por demonstrativos oficiais e ACT: pernoite fora da base gera almoço/jantar nas janelas; café/ceia não entram em pernoite puro; base virtual e pernoite dirigido ficam configuráveis." total={formatPerDiemTotals(forecast.totalsByCurrency)} />
    </div>
    <div className="mt-4 rounded-3xl border border-cyan-200/15 bg-white/[0.07] p-4 shadow-xl shadow-black/10">
     <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
       <p className="text-[11px] font-black uppercase tracking-[0.2em] text-cyan-100/70">mês das diárias</p>
       <p className="mt-1 text-sm font-semibold text-cyan-50/80">Selecione o mês salvo para recalcular totais nacionais e internacionais sem misturar períodos antigos.</p>
      </div>
      <select value={selectedMonthKey} onChange={(event) => handlePerDiemMonthChange(event.target.value)} disabled={!monthOptions.length} className="h-12 min-w-[16rem] rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm font-black text-white outline-none">
       {monthOptions.length ? monthOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>) : <option value="">Nenhum mês salvo</option>}
      </select>
     </div>
    </div>
    <div className="mt-4 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-semibold leading-6 text-emerald-50/90">{CREW_DIEM_TRUST_NOTE}</div>
    <div className="mt-4 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-semibold leading-6 text-amber-50/90">Auditoria da semana: R$ 738,72 contra R$ 656,64 indica diferença de R$ 82,08, exatamente 3 cafés de R$ 27,36. A v10.8.103 passa a contar café sempre que voo/reserva/jornada ativa cruzar 05:00–08:00 e cria ajuste automático quando o demonstrativo real confirmar cafés ausentes.</div>
    <PerDiemRulesSettingsCard settings={perDiemSettings} onChange={updatePerDiemSettings} />
    <PerDiemReceivedCalibrationCard samples={receivedSamples} onChange={setReceivedSamples} forecast={forecast} />
    {!hasRoster && <StateCard icon={CloudUpload} title="Importe uma escala" text="A previsão de diárias precisa de uma escala aberta ou salva. Envie PDF CrewTopia, CrewRosterReport/AIMS ou fonte oficial disponível." />}
    {!hasRoster && <div className="mt-5"><Button onClick={onOpenImport} className="rounded-2xl bg-cyan-300 px-6 py-6 font-black text-[#07111f] hover:bg-cyan-200">Importar escala agora</Button></div>}
    {hasRoster && (
     <>
      <section className="mt-6 grid gap-3 sm:grid-cols-4">
       <Kpi icon={Clock} value={summarizePerDiemType(forecast.entries, 'CAFE')} label="Café · 05:00–08:00 · 25% da principal" />
       <Kpi icon={Clock} value={summarizePerDiemType(forecast.entries, 'ALMOCO')} label="Almoço · 11:00–13:00" />
       <Kpi icon={Clock} value={summarizePerDiemType(forecast.entries, 'JANTAR')} label="Jantar · 19:00–20:00" />
       <Kpi icon={Clock} value={summarizePerDiemType(forecast.entries, 'CEIA')} label="Ceia · 00:00–01:00" />
      </section>
      <section className="mt-6 rounded-[2rem] border border-cyan-200/15 bg-cyan-300/10 p-5 shadow-2xl shadow-black/20">
       <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
         <p className="text-[11px] font-black uppercase tracking-[0.22em] text-cyan-100/70">fechamento semanal</p>
         <h3 className="mt-1 text-2xl font-black">Totais por semana</h3>
         <p className="mt-2 text-sm leading-6 text-cyan-50/80">Somente diárias nacionais entram no fechamento semanal de quarta a terça. Diárias internacionais ficam em painel próprio, por moeda, com pagamento separado no dia do voo/serviço internacional.</p>
        </div>
        <Badge className="rounded-full border-0 bg-cyan-200 text-[#07111f]">nacionais</Badge>
       </div>
       <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {forecast.byWeek.map((week) => <div key={week.key} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70">{week.start} → {week.end}</p><p className="mt-2 text-2xl font-black text-emerald-100">{formatPerDiemTotals(week.totals)}</p><p className="mt-1 text-xs leading-5 text-cyan-50/70">{week.countLabel || `${week.count} diária(s)`} · {week.paymentHint}</p></div>)}
       </div>
      </section>

      <section className="mt-6 rounded-[2rem] border border-violet-200/15 bg-violet-300/10 p-5 shadow-2xl shadow-black/20">
       <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
         <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/70">internacionais</p>
         <h3 className="mt-1 text-2xl font-black">Somadas por chave de voo</h3>
         <p className="mt-2 text-sm leading-6 text-violet-50/80">Internacionais não entram no depósito semanal nacional. Quando houver demonstrativo oficial, o CrewCheck mantém um único campo calibrado por pairing/inativo, com valor fechado e descrição das refeições, evitando duplicidade por voo + pernoite.</p>
        </div>
        <Badge className="rounded-full border-0 bg-violet-200 text-[#07111f]">dia do voo</Badge>
       </div>
       <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {forecast.byInternationalPayment.map((item) => <div key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4"><p className="text-xs font-black uppercase tracking-[0.16em] text-violet-100/70">{item.dateRange} · {item.countryLabel}</p><p className="mt-2 text-xl font-black text-violet-50">{formatPerDiemTotals(item.totals)}</p><p className="mt-1 text-xs leading-5 text-violet-50/80">{item.mealSummary || item.dutyCode}</p><p className="mt-2 text-[11px] font-bold leading-5 text-violet-50/65">Campo único · {item.flightKey} · {item.paymentHint}</p></div>)}
        {forecast.byInternationalPayment.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm text-violet-50/75">Nenhuma diária internacional prevista nesta escala.</div>}
       </div>
      </section>
      <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.055] shadow-2xl shadow-black/20">
       <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 border-b border-white/10 bg-white/[0.06] px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/70 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr]">
        <span>Data</span><span>Tipo</span><span>Janela</span><span>Valor</span><span className="hidden sm:block">Base</span>
       </div>
       <div className="divide-y divide-white/10">
        {forecast.entries.map((entry, index) => (
         <div key={`${entry.date}-${entry.type}-${index}`} className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-2 px-4 py-4 text-sm sm:grid-cols-[1fr_1fr_1fr_1fr_1fr]">
          <span className="font-black text-white">{entry.date}</span>
          <span className="font-black text-cyan-100">{entry.label}</span>
          <span className="text-slate-300">{entry.window}</span>
          <span className="font-black text-emerald-200">{formatPerDiemCurrency(entry.value, entry.currency)}</span>
          <span className="hidden text-slate-400 sm:block">{entry.dutyCode} · {entry.currencyLabel} · {entry.confidence}</span>
         </div>
        ))}
        {forecast.entries.length === 0 && <div className="px-4 py-8 text-center text-sm text-slate-300">Nenhuma janela de diária encontrada para a escala atual.</div>}
       </div>
      </section>
      <div className="mt-5 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-5 text-sm leading-6 text-amber-50/90">
       Previsão operacional calibrada com demonstrativos reais e ACT. Confira sempre com o demonstrativo oficial: a regra pode variar por ajustes, hotel, café incluído, moeda local e lançamentos manuais. Sobreaviso puro não gera diária; ASB não herda HSB; voo encerrado na base contratual não cria almoço/jantar no dia seguinte sem trabalho efetivo; pernoite fora da base gera almoço/jantar se cobrir as janelas; café e ceia não entram em pernoite puro; ceia só entra com apresentação/voo/reserva/treinamento/tripulante extra ativo entre 00:00 e 01:00.
      </div>
     </>
    )}
   </div>
  </div>
 );
}

function SalaryForecastScreen({ bundle, savedRosters = [], onOpenSavedRoster, isAdmin, onBack, onOpenImport }: { bundle: SessionRosterBundle | null; savedRosters?: SavedRosterSummary[]; onOpenSavedRoster?: (id: string) => Promise<void> | void; isAdmin: boolean; onBack: () => void; onOpenImport: () => void }) {
 const [payslipCalibration, setPayslipCalibration] = useState<PayslipCalibration | null>(() => loadPayslipCalibration());
 const [directDiscount, setDirectDiscount] = useState<DirectDiscountOverride | null>(() => loadDirectDiscountOverride());
 const [directDiscountInput, setDirectDiscountInput] = useState(() => directDiscount ? String(directDiscount.total).replace('.', ',') : '');
 const [directDiscountNote, setDirectDiscountNote] = useState(() => directDiscount?.note || '');
 const [isReadingPayslip, setIsReadingPayslip] = useState(false);
 const baseForecast = computeSalaryForecast(bundle, isAdmin);
 const calibratedForecast = applyPayslipCalibrationToForecast(baseForecast, payslipCalibration);
 const forecast = applyDirectDiscountOverrideToForecast(calibratedForecast, directDiscount);
 const admin = forecast.adminBreakdown;
 const salaryMonthOptions = useMemo(() => buildPerDiemMonthOptions(bundle, savedRosters), [bundle, savedRosters]);
 const salaryMonthKey = bundle?.roster?.month && bundle?.roster?.year ? `${bundle.roster.year}-${String(bundle.roster.month).padStart(2, '0')}` : '';
 const [selectedSalaryMonthKey, setSelectedSalaryMonthKey] = useState(salaryMonthKey);
 useEffect(() => { if (salaryMonthKey) setSelectedSalaryMonthKey(salaryMonthKey); }, [salaryMonthKey]);
 const handleSalaryMonthChange = (value: string) => {
  setSelectedSalaryMonthKey(value);
  const option = salaryMonthOptions.find((item) => item.key === value);
  if (option?.id && onOpenSavedRoster) void onOpenSavedRoster(option.id);
 };
 const salarySummaryText = [
  'CrewCheck · Previsão de Salário',
  `Período: ${financialPeriodLabel(bundle)}`,
  `Bruto previsto: ${formatMoney(forecast.gross)}`,
  `Ganho por voo estimado: ${formatMoney(forecast.flightPay)} em ${forecast.flightPayEstimates.length} trecho(s)` ,
  `Descontos previstos: ${formatMoney(admin?.estimatedDiscounts ?? forecast.estimatedDiscounts)}`,
  `Líquido previsto: ${formatMoney(admin?.netPrecise ?? forecast.estimatedNet)}`,
  `Média histórica líquida: ${formatMoney(CREW_HISTORICAL_MONTHLY_AVERAGE.net)}`,
  '',
  'Esta é uma previsão. O holerite oficial pode variar por impostos, convênios, coparticipação, ajustes retroativos e regras de folha.',
 ].join('\n');
 async function handlePayslipUpload(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  setIsReadingPayslip(true);
  try {
   const parsed = await parsePayslipCalibrationPdf(file);
   setPayslipCalibration(savePayslipCalibration(parsed));
   toast.success('Holerite lido localmente para calibrar a previsão.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Não consegui ler o holerite.');
  } finally {
   setIsReadingPayslip(false);
  }
 }
 function clearPayslipCalibration() {
  setPayslipCalibration(savePayslipCalibration(null));
  toast.success('Calibração removida deste dispositivo.');
 }
 function saveDirectDiscount() {
  const total = parseBrazilMoneyInput(directDiscountInput);
  if (total === null) {
   toast.error('Informe o total de descontos em reais. Exemplo: 5960,95');
   return;
  }
  setDirectDiscount(saveDirectDiscountOverride({ total, note: directDiscountNote.trim() || 'Informado pelo usuário', updatedAt: new Date().toISOString() }));
  toast.success('Descontos diretos salvos neste dispositivo.');
 }
 function clearDirectDiscount() {
  setDirectDiscount(saveDirectDiscountOverride(null));
  setDirectDiscountInput('');
  setDirectDiscountNote('');
  toast.success('Descontos diretos removidos.');
 }
 const hasRoster = Boolean(bundle?.roster.days?.length);
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 pb-32 text-white crewcheck-finance-screen">
   <div className="mx-auto max-w-6xl">
    <HeaderBack title="Previsão de Salário" subtitle="proventos · escala · variável" onBack={onBack} action={hasRoster ? <FinanceShareActions filename="crewcheck-salario.txt" title="CrewCheck · Previsão de Salário" content={salarySummaryText} /> : undefined} />
    <div className="mt-6">
     <ForecastHero icon={TrendingUp} tag={admin ? 'CrewCheck Admin Finance' : 'CrewCheck Finance'} title={admin ? 'Salário previsto — administrador' : 'Salário estimado'} subtitle={admin ? 'Cálculo itemizado calibrado pelos seus demonstrativos: bruto, INSS, IRRF, VGBL, convênios, parcelas recorrentes e líquido previsto.' : 'Estimativa baseada em salário base, KM de voo, reserva, sobreaviso, treinamento, repouso remunerado e histórico dos demonstrativos enviados.'} total={formatMoney(admin?.netPrecise ?? forecast.estimatedNet)} />
    </div>
    <div className="mt-4 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm font-semibold leading-6 text-emerald-50/90">{CREW_DIEM_TRUST_NOTE}</div>
    <div className="mt-4 rounded-3xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-semibold leading-6 text-amber-50/90">Auditoria da semana: R$ 738,72 contra R$ 656,64 indica diferença de R$ 82,08, exatamente 3 cafés de R$ 27,36. A v10.8.103 passa a contar café sempre que voo/reserva/jornada ativa cruzar 05:00–08:00 e cria ajuste automático quando o demonstrativo real confirmar cafés ausentes.</div>
    {!hasRoster && <StateCard icon={CloudUpload} title="Importe uma escala" text="Para estimar salário, abra uma escala do mês. O CrewCheck calcula voos, reserva, sobreaviso e variáveis previstas." />}
    {!hasRoster && <div className="mt-5"><Button onClick={onOpenImport} className="rounded-2xl bg-cyan-300 px-6 py-6 font-black text-[#07111f] hover:bg-cyan-200">Importar escala agora</Button></div>}
    {hasRoster && (
     <>
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
       <Kpi icon={FileText} value={formatMoney(forecast.baseSalary)} label="Salário base mensal" />
       <Kpi icon={Plane} value={formatMoney(forecast.flightPay)} label={`KM voo · ${Math.round(forecast.dayKm + forecast.nightKm + forecast.dfsDayKm + forecast.dfsNightKm).toLocaleString('pt-BR')} km`} />
       <Kpi icon={Clock} value={formatMoney(forecast.reservePay + forecast.standbyPay)} label={`${forecast.reserveHours.toFixed(1)}h reserva · ${forecast.standbyHours.toFixed(1)}h sobreaviso`} />
       <Kpi icon={UserRound} value={formatMoney(forecast.ccmChiefBonusPay)} label={`${forecast.ccmChiefBonusCount} bonificação de chefe de cabine`} />
       <Kpi icon={GraduationCap} value={formatMoney(forecast.trainingPay)} label="Indenização treinamento estimada" />
       <Kpi icon={TrendingUp} value={formatMoney(forecast.gross)} label="Bruto estimado antes dos descontos" />
      </section>
      <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_0.8fr]">
       <div className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20">
        <h3 className="text-xl font-black">Composição prevista</h3>
        <div className="mt-5 grid gap-3">
         <FinanceLine label="Salário" value={forecast.baseSalary} />
         <FinanceLine label="KM voo diurno" value={forecast.dayKm * CREW_KM_DAY_RATE} detail={`${Math.round(forecast.dayKm).toLocaleString('pt-BR')} km × ${CREW_KM_DAY_RATE.toFixed(6)}`} />
         <FinanceLine label="KM voo noturno" value={forecast.nightKm * CREW_KM_NIGHT_RATE} detail={`${Math.round(forecast.nightKm).toLocaleString('pt-BR')} km × ${CREW_KM_NIGHT_RATE.toFixed(6)}`} />
         <FinanceLine label="KM 2x" value={forecast.dfsDayKm * CREW_KM_DFS_DAY_RATE + forecast.dfsNightKm * CREW_KM_DFS_NIGHT_RATE} detail={`${Math.round(forecast.dfsDayKm + forecast.dfsNightKm).toLocaleString('pt-BR')} km`} />
         <FinanceLine label="Horas reserva" value={forecast.reservePay} detail={`${forecast.reserveHours.toFixed(1)}h × ${formatMoney(CREW_RESERVE_HOUR_RATE)}`} />
         <FinanceLine label="Horas sobreaviso" value={forecast.standbyPay} detail={`${forecast.standbyHours.toFixed(1)}h × ${formatMoney(CREW_STANDBY_HOUR_RATE)}`} />
         <FinanceLine label="Treinamento/indenização estimada" value={forecast.trainingPay} />
         <FinanceLine label="Gratificação chefe de cabine" value={forecast.ccmChiefBonusPay} detail={`${forecast.ccmChiefBonusCount} ocorrência(s) confirmada(s) × ${formatMoney(CREW_CCM_CHIEF_BONUS)}`} />
         <FinanceLine label="Adicional de instrutor" value={forecast.instructorBonusPay} detail={forecast.instructorBonusCount ? `${forecast.instructorBonusCount} ocorrência(s) com indicação explícita de instrutor · valor pendente de confirmação` : 'Não soma automaticamente. Treinamento comum entra como indenização de treinamento.'} />
         <FinanceLine label="Repouso remunerado estimado" value={forecast.dsrPay} detail="32% sobre variáveis calibrado pelo histórico" />
        </div>
       </div>

       <div className="rounded-[2rem] border border-blue-200/15 bg-blue-300/10 p-5 shadow-2xl shadow-black/20 lg:col-span-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
         <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-blue-100/80">ganho por voo</p>
          <h3 className="mt-1 text-2xl font-black text-blue-50">Estimativa por trecho</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-50/80">Métrica estimada: KM do trecho × valor do KM em R$, separando diurno, noturno e KM 2x. Sábado comum não dobra; domingo e feriado nacional dobram uma única vez. Nunca quadruplica.</p>
         </div>
         <Badge className="rounded-full border-0 bg-blue-200 text-[#07111f]">{forecast.flightPayEstimates.length} trecho(s)</Badge>
        </div>
        <div className="mt-4 grid gap-3">
         {forecast.flightPayEstimates.slice(0, 18).map((item, index) => (
          <div key={`${item.date}-${item.flightNumber}-${item.route}-${index}`} className="rounded-3xl border border-white/10 bg-white/[0.055] p-4">
           <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
             <p className="text-sm font-black text-white">{item.flightNumber} · {item.route}</p>
             <p className="mt-1 text-xs font-semibold text-slate-300">{item.date} · {item.departureTime || '—'}–{item.arrivalTime || '—'} · {item.period}</p>
            </div>
            <div className="text-left sm:text-right">
             <p className="text-lg font-black text-blue-100">{formatMoney(item.amount)}</p>
             <p className="text-[11px] font-bold text-blue-50/70">{Math.round(item.km).toLocaleString('pt-BR')} km × {formatMoney(item.rate)}</p>
             <p className="text-[10px] font-semibold text-blue-50/55">{item.note}</p>
            </div>
           </div>
          </div>
         ))}
         {!forecast.flightPayEstimates.length && <p className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-slate-300">Nenhum trecho com KM calculável encontrado nesta escala.</p>}
        </div>
       </div>

       <div className="rounded-[2rem] border border-cyan-200/15 bg-cyan-300/10 p-5 shadow-2xl shadow-black/20">
        <h3 className="text-xl font-black text-cyan-50">Resumo líquido</h3>
        <div className="mt-5 space-y-4">
         <FinanceLine label="Bruto estimado" value={forecast.gross} />
         <FinanceLine label={admin ? 'Descontos itemizados previstos' : 'Descontos estimados'} value={admin?.estimatedDiscounts ?? forecast.estimatedDiscounts} negative detail={admin ? 'INSS, IRRF, VGBL e recorrentes' : 'média histórica aproximada'} />
         <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/12 p-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/75">Líquido previsto</p>
          <p className="mt-2 text-4xl font-black text-emerald-100">{formatMoney(admin?.netPrecise ?? forecast.estimatedNet)}</p>
         </div>
         <p className="text-xs leading-5 text-cyan-50/80">{forecast.confidence} Use como projeção. O contracheque oficial pode variar por impostos, convênios, descontos pessoais, ajustes e regras de folha.</p>
        </div>
       </div>
      </section>
      <section className="mt-6 rounded-[2rem] border border-sky-200/15 bg-sky-300/10 p-5 shadow-2xl shadow-black/20">
       <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
         <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-100/80">média histórica</p>
         <h3 className="mt-1 text-2xl font-black text-sky-50">Média mensal calibrada</h3>
         <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-50/80">Referência inicial calculada pelos demonstrativos enviados. Use como comparação rápida para saber se a previsão do mês está acima ou abaixo da média.</p>
        </div>
        <Badge className="rounded-full border-0 bg-sky-200 text-[#07111f]">{CREW_HISTORICAL_MONTHLY_AVERAGE.sampleMonths} meses</Badge>
       </div>
       <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Kpi icon={TrendingUp} value={formatMoney(CREW_HISTORICAL_MONTHLY_AVERAGE.gross)} label="Bruto médio histórico" />
        <Kpi icon={Shield} value={formatMoney(CREW_HISTORICAL_MONTHLY_AVERAGE.discounts)} label="Descontos médios históricos" />
        <Kpi icon={FileText} value={formatMoney(CREW_HISTORICAL_MONTHLY_AVERAGE.net)} label="Líquido médio histórico" />
       </div>
      </section>
      <section className="mt-6 rounded-[2rem] border border-violet-200/15 bg-violet-300/10 p-5 shadow-2xl shadow-black/20">
       <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
         <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-100/80">descontos sem detalhar</p>
         <h3 className="mt-1 text-2xl font-black text-violet-50">Informar total de descontos</h3>
         <p className="mt-2 max-w-3xl text-sm leading-6 text-violet-50/80">Se preferir não enviar holerite ou não detalhar rubricas, informe apenas o total mensal de descontos. O CrewCheck usa esse valor para estimar o líquido com mais privacidade.</p>
        </div>
        <div className="grid gap-2 sm:min-w-[360px] sm:grid-cols-[1fr_auto]">
         <input value={directDiscountInput} onChange={(event) => setDirectDiscountInput(event.target.value)} placeholder="Ex.: 5960,95" inputMode="decimal" className="rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-sm font-black text-white outline-none placeholder:text-white/40" />
         <Button onClick={saveDirectDiscount} className="rounded-2xl bg-violet-200 px-5 py-3 font-black text-[#07111f] hover:bg-violet-100">Salvar</Button>
         <input value={directDiscountNote} onChange={(event) => setDirectDiscountNote(event.target.value)} placeholder="Observação opcional" className="rounded-2xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-white/40 sm:col-span-2" />
         {directDiscount && <button onClick={clearDirectDiscount} className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-violet-50 sm:col-span-2">Remover desconto direto · {formatMoney(directDiscount.total)}</button>}
        </div>
       </div>
      </section>
      <section className="mt-6 rounded-[2rem] border border-emerald-200/15 bg-emerald-300/10 p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
         <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-100/80">calibração LGPD</p>
          <h3 className="mt-1 text-2xl font-black text-emerald-50">Importar holerite PDF</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-emerald-50/80">Use um holerite/demonstrativo para calibrar descontos recorrentes e deixar a previsão líquida mais próxima. O arquivo é processado para extrair valores, e a calibração fica salva apenas neste dispositivo.</p>
         </div>
         <div className="flex flex-col gap-2 sm:min-w-64">
          <label className="cursor-pointer rounded-2xl bg-emerald-200 px-5 py-3 text-center text-sm font-black text-[#07111f] shadow-lg shadow-black/20">
           {isReadingPayslip ? 'Lendo PDF...' : 'Subir holerite PDF'}
           <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(event) => void handlePayslipUpload(event)} />
          </label>
          {payslipCalibration && <button onClick={clearPayslipCalibration} className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-emerald-50">Remover calibração</button>}
         </div>
        </div>
        {payslipCalibration && <div className="mt-4 grid gap-3 sm:grid-cols-3">
         <Kpi icon={FileText} value={payslipCalibration.gross ? formatMoney(payslipCalibration.gross) : '—'} label={`Bruto do holerite · ${payslipCalibration.fileName}`} />
         <Kpi icon={TrendingUp} value={payslipCalibration.net ? formatMoney(payslipCalibration.net) : '—'} label="Líquido lido do PDF" />
         <Kpi icon={Shield} value={payslipCalibration.discounts ? formatMoney(payslipCalibration.discounts) : '—'} label="Descontos usados como referência" />
        </div>}
       </section>
      {admin && (
       <section className="mt-6 rounded-[2rem] border border-amber-200/15 bg-amber-300/10 p-5 shadow-2xl shadow-black/20">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
         <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-100/80">visível só para administrador</p>
          <h3 className="mt-1 text-2xl font-black text-amber-50">Previsão líquida mais precisa</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-50/80">{admin.disclaimer}</p>
         </div>
         <div className="rounded-3xl border border-amber-100/20 bg-black/20 px-5 py-4 text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100/75">líquido admin</p>
          <p className="text-3xl font-black text-amber-50">{formatMoney(admin.netPrecise)}</p>
         </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
         <Kpi icon={TrendingUp} value={formatMoney(forecast.gross)} label="Bruto previsto pela escala" />
         <Kpi icon={FileText} value={formatMoney(admin.fgtsBase)} label={`Base FGTS · FGTS ${formatMoney(admin.fgts)}`} />
         <Kpi icon={Shield} value={formatMoney(admin.inssBase)} label={`Base INSS · desconto ${formatMoney(admin.inss)}`} />
         <Kpi icon={FileText} value={formatMoney(admin.irBase)} label={`Base IR · IRRF ${formatMoney(admin.irrf)}`} />
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
         {admin.discountLines.map((line) => (
          <FinanceLine key={line.label} label={line.label} value={line.value} negative detail={line.detail} />
         ))}
        </div>
       </section>
      )}
     </>
    )}
   </div>
  </div>
 );
}

function FinanceLine({ label, value, detail, negative }: { label: string; value: number; detail?: string; negative?: boolean }) {
 return (
  <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.055] px-4 py-3">
   <div><p className="font-black text-white">{label}</p>{detail && <p className="mt-1 text-xs text-slate-400">{detail}</p>}</div>
   <span className={`shrink-0 text-right text-lg font-black ${negative ? 'text-rose-200' : 'text-cyan-100'}`}>{negative ? '- ' : ''}{formatMoney(value)}</span>
  </div>
 );
}


function SupportPanel({ onBack, onOpenSettings, onOpenImport }: { onBack: () => void; onOpenSettings: () => void; onOpenImport: () => void }) {
 const [subject, setSubject] = useState('Suporte CrewCheck');
 const [message, setMessage] = useState(`Olá, preciso de ajuda com o CrewCheck.\n\nVersão: ${APP_VERSION}\nTela/erro:\nO que tentei fazer:\n`);
 const [sending, setSending] = useState(false);
 const copySupportInfo = () => {
  const text = `CrewCheck v${APP_VERSION}\nURL: ${window.location.href}\nNavegador: ${navigator.userAgent}`;
  navigator.clipboard?.writeText(text)?.then(() => toast.success('Resumo técnico copiado.')).catch(() => toast.info('Não consegui copiar automaticamente.'));
 };
 async function sendSupport() {
  setSending(true);
  try {
   const response = await fetch('/api/support/contact', {
    method: 'POST',
    headers: crewcheckAuthHeader({ 'content-type': 'application/json' }),
    body: JSON.stringify({ subject, message, version: APP_VERSION, pageUrl: window.location.href }),
   });
   const payload = await response.json().catch(() => null);
   if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível enviar ao suporte.');
   toast.success('Mensagem enviada ao suporte CrewCheck.');
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Falha ao enviar suporte.');
  } finally {
   setSending(false);
  }
 }
 return (
  <div className="crewcheck-support-screen min-h-screen overflow-x-hidden overflow-y-auto bg-[#07111F] px-5 py-8 text-white">
   <div className="mx-auto max-w-5xl">
    <HeaderBack title="Ajuda e suporte" subtitle="Manuais, Android e atendimento interno" onBack={onBack} />
    <section className="mt-6 overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-white/[0.065] shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl">
     <div className="bg-gradient-to-r from-cyan-300/18 via-white/[0.08] to-emerald-300/14 p-6 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/70">ajuda premium</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">Precisa falar com o suporte?</h1>
      <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200/85">Envie a mensagem por dentro da plataforma. O e-mail interno de suporte não fica visível para o usuário.</p>
     </div>
     <div className="grid gap-4 p-5 lg:grid-cols-[1.2fr_.8fr] sm:p-7">
      <div className="rounded-3xl border border-cyan-200/20 bg-cyan-300/10 p-5">
       <Mail className="mb-4 h-8 w-8 text-cyan-200" />
       <h3 className="text-xl font-black">Enviar mensagem ao suporte</h3>
       <p className="mt-2 text-sm leading-6 text-slate-300">O CrewCheck envia para o contato interno configurado, sem revelar o destinatário.</p>
       <label className="mt-4 block"><span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/60">Assunto</span><input value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-300" /></label>
       <label className="mt-3 block"><span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/60">Mensagem</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={7} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none focus:border-cyan-300" /></label>
       <button onClick={sendSupport} disabled={sending} className="mt-4 w-full rounded-2xl bg-cyan-300 px-5 py-4 text-sm font-black text-[#07111f] transition hover:bg-cyan-200 disabled:opacity-60">{sending ? 'Enviando...' : 'Enviar ao suporte CrewCheck'}</button>
      </div>
      <div className="space-y-4">
       <button type="button" onClick={() => window.open('/apk', '_blank', 'noopener,noreferrer')} className="crewcheck-google-play-button w-full rounded-3xl bg-white p-5 text-left shadow-xl shadow-black/25">
        <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-slate-500">Android</p>
        <img src="/assets/stores/google-play-pt-br-light.png" alt="Disponível no Google Play" className="crewcheck-play-badge-light h-16 w-auto" />
        <img src="/assets/stores/google-play-pt-br-dark.png" alt="Disponível no Google Play" className="crewcheck-play-badge-dark h-16 w-auto" />
       </button>
       <button onClick={() => window.open('/manuals/manual-completo-crewcheck-premium-v1.pdf', '_blank', 'noopener,noreferrer')} className="w-full rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-left transition hover:bg-white/[0.09]"><FileText className="mb-4 h-8 w-8 text-emerald-200" /><h3 className="font-black">Manual completo</h3><p className="mt-2 text-sm leading-6 text-slate-300">Guia premium dentro da área de Ajuda.</p></button>
       <button onClick={() => window.open('/manuals/crewcheck-sincronizacao-calendario.pdf', '_blank', 'noopener,noreferrer')} className="w-full rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-left transition hover:bg-white/[0.09]"><CalendarDays className="mb-4 h-8 w-8 text-blue-200" /><h3 className="font-black">Guia calendário</h3><p className="mt-2 text-sm leading-6 text-slate-300">Como sincronizar agenda e ICS.</p></button>
       <button onClick={copySupportInfo} className="w-full rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-left transition hover:bg-white/[0.09]"><ClipboardList className="mb-4 h-8 w-8 text-amber-200" /><h3 className="font-black">Copiar resumo técnico</h3><p className="mt-2 text-sm leading-6 text-slate-300">Inclui versão, URL e navegador.</p></button>
       <button onClick={onOpenImport} className="w-full rounded-3xl border border-white/10 bg-white/[0.055] p-5 text-left transition hover:bg-white/[0.09]"><CloudUpload className="mb-4 h-8 w-8 text-amber-200" /><h3 className="font-black">Reimportar escala</h3><p className="mt-2 text-sm leading-6 text-slate-300">Use o PDF oficial antes de reportar divergência.</p></button>
      </div>
     </div>
     <div className="border-t border-white/10 p-5 sm:p-7"><button onClick={onOpenSettings} className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-5 py-4 text-sm font-black text-cyan-50 transition hover:bg-cyan-300/15"><Settings className="mr-2 inline h-4 w-4" /> Abrir Configurações</button></div>
    </section>
   </div>
  </div>
 );
}

function SimplePanel({ title, description, icon: Icon, actions, onBack }: { title: string; description: string; icon: LucideIcon; actions: { label: string; onClick: () => void }[]; onBack: () => void }) {
 return (
  <div className="min-h-screen bg-[#08111f] px-5 py-8 text-white">
   <div className="mx-auto max-w-3xl">
    <HeaderBack title={title} subtitle="CrewCheck Premium" onBack={onBack} />
    <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 text-center">
     <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-cyan-300/15 text-cyan-200"><Icon className="h-10 w-10" /></div>
     <h2 className="mt-5 text-2xl font-black">{title}</h2>
     <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300">{description}</p>
     <div className="mt-6 grid gap-3 sm:grid-cols-2">{actions.map((action) => <Button key={action.label} onClick={action.onClick} className="rounded-2xl bg-cyan-300 text-[#07111f] hover:bg-cyan-200">{action.label}</Button>)}</div>
    </div>
   </div>
  </div>
 );
}

function HeaderBack({ title, subtitle, onBack, action }: { title: string; subtitle: string; onBack: () => void; action?: ReactNode }) {
 return (
  <div className="crewcheck-header-shell flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
   <button onClick={onBack} className="crewcheck-header-back flex items-center gap-3 text-left"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-cyan-100"><ArrowLeft className="h-5 w-5" /></div><div><h1 className="text-xl font-black">{title}</h1><p className="text-xs uppercase tracking-[0.22em] text-cyan-100/60">{subtitle}</p></div></button>
   {action && <div className="sm:ml-auto">{action}</div>}
  </div>
 );
}

function StateCard({ icon: Icon, title, text, spin }: { icon: LucideIcon; title: string; text: string; spin?: boolean }) {
 return <div className="crewcheck-light-card mt-6 rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-center text-slate-300"><Icon className={`mx-auto mb-4 h-8 w-8 text-cyan-200 ${spin ? 'animate-spin' : ''}`} /><h3 className="text-lg font-black text-white">{title}</h3><p className="mt-2 text-sm">{text}</p></div>;
}

function MenuAction({ icon: Icon, title, text, onClick }: { icon: LucideIcon; title: string; text: string; onClick: () => void }) {
 return <button onClick={onClick} className="crewcheck-light-card flex items-center gap-4 rounded-3xl border border-white/10 bg-white/[0.05] p-5 text-left transition hover:bg-white/[0.09]"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-300/15 text-cyan-200"><Icon className="h-6 w-6" /></div><div><h3 className="font-black">{title}</h3><p className="text-sm text-slate-400">{text}</p></div><ChevronRight className="ml-auto h-5 w-5 text-slate-500" /></button>;
}

function monthLabel(month: number | null, year: number | null): string {
 const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
 if (!month || !year) return 'Período salvo';
 return `${names[month - 1] || String(month).padStart(2, '0')}/${year}`;
}

function Kpi({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
 return <div className="crewcheck-light-card rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl"><Icon className="mb-3 h-5 w-5 text-cyan-200" /><p className="text-xl font-black">{value}</p><p className="mt-1 text-xs leading-4 text-slate-300">{label}</p></div>;
}

function TrustLine({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
 return <div className="flex items-start gap-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><span>{text}</span></div>;
}

export default Home;
