import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BedDouble,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  CloudUpload,
  Copy,
  Coffee,
  Download,
  Dumbbell,
  FileText,
  Flame,
  Gauge,
  GraduationCap,
  Home,
  House,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Moon,
  MoreHorizontal,
  Navigation,
  Plane,
  Plus,
  Search,
  Settings,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { exportReport, type CrewCheckPdfExportResult } from "@/lib/pdfExport";
import { copyToClipboard, shareExportedPdfByEmail, shareExportedPdfNative, shareExportedPdfToWhatsApp } from "@/lib/sharing";
import { downloadCalendarFile, generateICalendar, type CalendarExportMode } from "@/lib/calendarExport";
import { deleteRosterAnalysis, getDatabaseStatus, listSavedRosters, getStoredStats, openActiveRoster, type DatabaseStatus, type SavedRosterSummary, type StoredStatsResponse } from "@/lib/databaseClient";
import { saveRosterOfflineFirst, syncPendingRosters, getPendingOfflineCount } from "@/lib/offlineSync";
import { sendRosterByEmail } from "@/lib/emailClient";
import { getStoredUser, getToken, logout } from "@/lib/authClient";
import type { CrewRoster, FlightLeg, RosterDay } from "@/lib/pdfParser";
import { normalizeRosterSchedule, getActivityCodes } from "@/lib/rosterNormalizer";
import { eventTextFromRosterCode, findRosterCodes, getRosterCodeDefinition } from "@/lib/rosterCodes";
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
  syncRosterToGoogleCalendar,
  getCalendarFeedInfo,
  type GoogleCalendarOption,
  type GoogleCalendarSettings,
  type GoogleCalendarSyncMode,
} from "@/lib/googleCalendarSync";
import { analyzeCompliance, getGymRecommendations, type ComplianceResult, type DayLoadAnalysis, type GymRecommendation, type LoadAnalysis } from "@/lib/complianceEngine";
import {
  buildRoutineSuggestions,
  defaultRoutineActivities,
  getActivityDefaultDuration,
  getActivityDefaultIntensity,
  getActivityLabel,
  isPhysicalActivity,
  isRecoverySuggestion,
  isMealSuggestion,
  isRoutineActivitySuggestion,
  type RoutineActivityConfig,
  type RoutineActivityType,
  type RoutineIntensity,
  type RoutinePeriod,
  type RoutineSuggestion,
} from "@/lib/routinePlanner";

type ViewKey = "summary" | "roster" | "alerts" | "irregularities" | "gym" | "fatigue" | "metrics" | "glossary" | "statistics" | "settings" | "manual";
type CrewThemeMode = "system" | "light" | "dark";

function loadInitialResultsView(): ViewKey {
  try {
    const stored = sessionStorage.getItem("crewcheck_initial_view") as ViewKey | null;
    sessionStorage.removeItem("crewcheck_initial_view");
    const allowed: ViewKey[] = ["summary", "roster", "alerts", "irregularities", "gym", "fatigue", "metrics", "glossary", "statistics", "settings", "manual"];
    return stored && allowed.includes(stored) ? stored : "summary";
  } catch {
    return "summary";
  }
}

type RosterEvent = {
  id: string;
  day: RosterDay;
  leg?: FlightLeg;
  legs?: FlightLeg[];
  date: Date;
  dateLabel: string;
  weekday: string;
  dayNumber: string;
  monthLabel: string;
  time: string;
  activity: string;
  subtitle: string;
  code: string;
  typeLabel: string;
  status: string;
  targetIso?: string;
  perDiemLayoverAfter?: { airport: string; startAbs: number; endAbs: number; reason: string; openEnded?: boolean; durationLabel?: string; weatherDate?: string; nextPresentationLabel?: string; engineCutLabel?: string; meals?: string[] };
  dayUseHotel?: { airport?: string; durationMinutes?: number | null; durationLabel?: string; reason?: string; meals?: string[]; presentationLabel?: string; hotelStay?: boolean };
};

type RosterDayGroup = {
  id: string;
  date: Date;
  dateLabel: string;
  weekday: string;
  dayNumber: string;
  monthLabel: string;
  time: string;
  events: RosterEvent[];
};

type RosterMonthOption = { key: string; label: string; count: number };

function rosterMonthKeyFromDate(date: Date | null | undefined): string {
  if (!isValidCrewDateObject(date)) return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function rosterMonthLabelFromKey(key: string): string {
  const [yearRaw, monthRaw] = String(key || '').split('-');
  const month = Number(monthRaw);
  const year = Number(yearRaw);
  if (!month || !year) return 'Período não identificado';
  return `${MONTHS_PT[month - 1] || String(month).padStart(2, '0')} ${year}`;
}

function buildRosterMonthOptions(events: RosterEvent[]): RosterMonthOption[] {
  const map = new Map<string, RosterMonthOption>();
  events.forEach((event) => {
    const key = rosterMonthKeyFromDate(event.date);
    if (key === 'unknown') return;
    const current = map.get(key);
    if (current) current.count += 1;
    else map.set(key, { key, label: rosterMonthLabelFromKey(key), count: 1 });
  });
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const WEEKDAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];


function isValidCrewDateObject(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function fallbackRosterDate(month?: number | string, year?: number | string, day = 1): Date {
  const now = new Date();
  const safeYear = Number(year) >= 1900 ? Number(year) : now.getFullYear();
  const safeMonth = Number(month) >= 1 && Number(month) <= 12 ? Number(month) : now.getMonth() + 1;
  const safeDay = Number(day) >= 1 && Number(day) <= 31 ? Number(day) : 1;
  return new Date(safeYear, safeMonth - 1, safeDay, 12, 0, 0, 0);
}

function dateOnlyIsoSafe(date: Date | null | undefined, fallback = new Date()): string {
  const safe = isValidCrewDateObject(date) ? date : fallback;
  try {
    return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}


function formatRosterDate(date: Date | string | null | undefined, fallback = new Date()): string {
  if (isValidCrewDateObject(date)) return dateOnlyIsoSafe(date, fallback);
  const parsed = parseRosterDate(String(date || ''), fallback);
  return dateOnlyIsoSafe(isValidCrewDateObject(parsed) ? parsed : fallback, fallback);
}

function safeRosterIso(date: Date | null | undefined, fallback = new Date()): string {
  const safe = isValidCrewDateObject(date) ? date : fallback;
  try { return safe.toISOString(); } catch { return fallback.toISOString(); }
}

function safeRosterDateFromDay(day: RosterDay, fallback?: Date): Date {
  const parsed = parseRosterDate(day?.date || '', fallback || fallbackRosterDate((day as any)?.month, (day as any)?.year));
  return isValidCrewDateObject(parsed) ? parsed : (fallback || new Date());
}


function resultsCurrentUserScope(): string {
  try {
    const user = getStoredUser();
    const raw = String(user?.id || user?.email || "anon").trim().toLowerCase();
    return raw.replace(/[^a-z0-9_-]+/g, "_").slice(0, 80) || "anon";
  } catch {
    return "anon";
  }
}

function readResultsPersistedRosterPayload(): any | null {
  try {
    const scope = resultsCurrentUserScope();
    const keys = [
      `crewcheck_roster_sync_latest_v11_${scope}`,
      `crewcheck_latest_roster_bundle_${scope}`,
      `crewcheck_active_roster_snapshot_${scope}`,
      "crewcheck_last_roster_bundle_v11101",
      "crewcheck_last_roster_bundle_v11100",
      "crewcheck_last_roster_bundle_v11099",
      "crewcheck_last_roster_bundle_v11098",
      "crewcheck_roster_sync_latest_v11_anon",
      "crewcheck_latest_roster_bundle_anon",
      "crewcheck_active_roster_snapshot_anon",
      "crewcheck_latest_roster_bundle",
      "crewcheck_roster_sync_latest_v108134",
    ];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed?.roster?.days?.length) return parsed;
    }
  } catch {
    // iOS/Safari pode bloquear storage em alguns modos.
  }
  return null;
}

function persistResultsSession(rosterInput: CrewRoster, complianceInput?: ComplianceResult | null, gymInput?: GymRecommendation[] | null) {
  const normalizedRoster = normalizeRosterSchedule(rosterInput);
  const roleSelection = (sessionStorage.getItem("crewcheck_role_selection") || "auto") as any;
  const recalculatedCompliance = complianceInput || analyzeCompliance(normalizedRoster, roleSelection);
  const recalculatedGym = Array.isArray(gymInput) ? gymInput : getGymRecommendations(normalizedRoster, roleSelection);
  sessionStorage.setItem("crewcheck_roster", JSON.stringify(normalizedRoster));
  sessionStorage.setItem("crewcheck_compliance", JSON.stringify(recalculatedCompliance));
  sessionStorage.setItem("crewcheck_gym", JSON.stringify(recalculatedGym));
  try {
    if (normalizedRoster.crewName) localStorage.setItem("crewcheck_last_roster_crew_name", normalizedRoster.crewName);
  } catch {}
  return { normalizedRoster, recalculatedCompliance, recalculatedGym };
}

export default function Results() {
  const [, setLocation] = useLocation();
  const [roster, setRoster] = useState<CrewRoster | null>(null);
  const [compliance, setCompliance] = useState<ComplianceResult | null>(null);
  const [gym, setGym] = useState<GymRecommendation[]>([]);
  const [query, setQuery] = useState("");
  const [dutyType, setDutyType] = useState("Todos");
  const [selectedMonthKey, setSelectedMonthKey] = useState("live");
  const [activeView, setActiveView] = useState<ViewKey>(() => loadInitialResultsView());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('crewcheck_results_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [selectedAlert, setSelectedAlert] = useState<ComplianceResult["alerts"][number] | null>(null);
  const [ignoredAlertKeys, setIgnoredAlertKeys] = useState<string[]>(() => loadIgnoredAlertKeys());
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [savedRosters, setSavedRosters] = useState<SavedRosterSummary[]>([]);
  const [isSavingDb, setIsSavingDb] = useState(false);
  const [pendingOffline, setPendingOffline] = useState(getPendingOfflineCount());
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [themeMode, setThemeMode] = useState<CrewThemeMode>(() => loadCrewThemeMode());
  const [storedStats, setStoredStats] = useState<StoredStatsResponse | null>(null);
  const autoDbSaveStartedRef = useRef(false);

  const switchView = (view: ViewKey) => {
    setSelectedAlert(null);
    setMobileMenuOpen(false);
    setActiveView(view);
  };

  const openHomeView = (view: string) => {
    try { window.localStorage.setItem('crewcheck_next_home_view', view); } catch {}
    setMobileMenuOpen(false);
    setLocation('/?view=' + encodeURIComponent(view));
  };

  const toggleDesktopSidebar = () => {
    setDesktopSidebarCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem('crewcheck_results_sidebar_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const openAlertDay = (date?: string) => {
    if (date) {
      setQuery(date);
      setDutyType("Todos");
    }
    setSelectedAlert(null);
    setActiveView("roster");
  };

  useEffect(() => {
    applyCrewThemeMode(themeMode);
    saveCrewThemeMode(themeMode);
    if (themeMode !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const update = () => applyCrewThemeMode("system");
    media?.addEventListener?.("change", update);
    return () => media?.removeEventListener?.("change", update);
  }, [themeMode]);

  useEffect(() => {
    let active = true;

    async function loadRosterForResults() {
      const rosterData = sessionStorage.getItem("crewcheck_roster");
      const complianceData = sessionStorage.getItem("crewcheck_compliance");
      const gymData = sessionStorage.getItem("crewcheck_gym");

      try {
        if (rosterData && complianceData) {
          const restored = persistResultsSession(JSON.parse(rosterData), JSON.parse(complianceData), gymData ? JSON.parse(gymData) : []);
          if (!active) return;
          setRoster(restored.normalizedRoster);
          setCompliance(restored.recalculatedCompliance);
          setGym(restored.recalculatedGym);
          return;
        }

        const localPayload = readResultsPersistedRosterPayload();
        if (localPayload?.roster?.days?.length) {
          const restored = persistResultsSession(localPayload.roster, localPayload.compliance, localPayload.gym);
          if (!active) return;
          setRoster(restored.normalizedRoster);
          setCompliance(restored.recalculatedCompliance);
          setGym(restored.recalculatedGym);
          toast.success("Escala recuperada neste dispositivo.");
          return;
        }

        const cloudPayload = await openActiveRoster();
        if (cloudPayload?.roster?.days?.length) {
          const restored = persistResultsSession(cloudPayload.roster, cloudPayload.compliance, cloudPayload.gym);
          if (!active) return;
          setRoster(restored.normalizedRoster);
          setCompliance(restored.recalculatedCompliance);
          setGym(restored.recalculatedGym);
          toast.success("Escala ativa recuperada da nuvem.");
          return;
        }
      } catch {
        // Sem sessão, sem fallback local e sem escala ativa na nuvem.
      }

      if (active) setLocation("/?view=import");
    }

    void loadRosterForResults();
    return () => { active = false; };
  }, [setLocation]);

  useEffect(() => {
    let active = true;

    async function loadDatabaseInfo() {
      try {
        const status = await getDatabaseStatus();
        if (!active) return;
        setDbStatus(status);
        if (status.ok) {
          const history = await listSavedRosters(5);
          const stats = await getStoredStats().catch(() => null);
          if (active) {
            setSavedRosters(history);
            if (stats) setStoredStats(stats);
          }
        }
      } catch (error) {
        if (active) setDbStatus({ ok: false, connected: false, message: error instanceof Error ? error.message : 'Banco indisponível' });
      }
    }

    loadDatabaseInfo();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!roster) return;
    const pending = sessionStorage.getItem("crewcheck_auto_sync_pending");
    if (!pending) return;
    const settings = loadGoogleCalendarSettings();
    if (!settings.autoSync) {
      sessionStorage.removeItem("crewcheck_auto_sync_pending");
      return;
    }
    if (!isGoogleCalendarConfigured()) {
      toast.warning("Agenda automática ainda não está disponível nesta conta. Use exportação ICS enquanto isso.");
      sessionStorage.removeItem("crewcheck_auto_sync_pending");
      return;
    }
    if (!hasGoogleCalendarToken()) {
      toast.info("Agenda automática automático está ativo. Abra Configurações e conecte o Google para sincronizar esta escala.");
      return;
    }
    let cancelled = false;
    syncRosterToGoogleCalendar(roster, settings, buildGoogleSyncExtras(gym, buildFallbackLoadAnalysis(roster)))
      .then((result) => {
        if (cancelled) return;
        sessionStorage.removeItem("crewcheck_auto_sync_pending");
        toast.success(`Agenda automática atualizado: ${result.created} novo(s), ${result.updated} atualizado(s), ${result.deleted} removido(s).`);
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error && !/Invalid time value/i.test(error.message) ? error.message : "Agenda automática ignorou uma data inválida da escala. A tela foi carregada normalmente.");
      });
    return () => { cancelled = true; };
  }, [roster]);

  const events = useMemo(() => (roster ? buildRosterEvents(roster) : []), [roster]);
  const monthOptions = useMemo(() => buildRosterMonthOptions(events), [events]);
  useEffect(() => {
    if (selectedMonthKey === 'all' || selectedMonthKey === 'live' || selectedMonthKey === 'context') return;
    if (!monthOptions.some((option) => option.key === selectedMonthKey)) setSelectedMonthKey('live');
  }, [selectedMonthKey, monthOptions]);
  const rosterIsStale = useMemo(() => isRosterStaleForLive(roster), [roster]);
  const firstEventId = useMemo(() => (rosterIsStale ? undefined : getRosterFocusEvent(events)?.id), [events, rosterIsStale]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = normalize(query);
    const hasLiveEvents = events.some(isRosterEventTodayOrFuture);
    return events.filter((event) => {
      const eventMonthKey = rosterMonthKeyFromDate(event.date);
      const matchesMonth = selectedMonthKey === 'live'
        ? (!hasLiveEvents || isRosterEventTodayOrFuture(event))
        : (selectedMonthKey === 'all' || selectedMonthKey === 'context' || eventMonthKey === selectedMonthKey);
      const matchesType = dutyType === "Todos" || event.typeLabel === dutyType;
      const haystack = normalize(`${event.activity} ${event.subtitle} ${event.code} ${event.dateLabel} ${event.typeLabel}`);
      return matchesMonth && matchesType && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [events, query, dutyType, selectedMonthKey]);

  const filteredDayGroups = useMemo(() => buildDailyRosterGroups(filteredEvents), [filteredEvents]);

  const loadAnalysis = useMemo<LoadAnalysis>(() => {
    if (compliance?.loadAnalysis) return compliance.loadAnalysis;
    if (roster) return buildFallbackLoadAnalysis(roster);
    return buildEmptyLoadAnalysis();
  }, [compliance, roster]);

  const routineSuggestions = useMemo(() => buildRoutineSuggestions(loadAnalysis.days, loadRoutineActivities()), [loadAnalysis]);

  const refreshSavedRosters = async () => {
    try {
      const history = await listSavedRosters(5);
      setSavedRosters(history);
      const stats = await getStoredStats().catch(() => null);
      if (stats) setStoredStats(stats);
    } catch {
      // O cartão de banco já exibe o status; não precisa interromper a tela.
    }
  };


  const handleDeleteCurrentMonth = async () => {
    if (!roster) return;
    const label = currentRosterMonthLabel(roster);
    const ok = window.confirm(`Apagar a escala de ${label}? Ela sairá deste dispositivo e da base salva, quando houver sincronização.`);
    if (!ok) return;
    try {
      const matches = savedRosters.filter((item) => Number(item.month) === Number(roster.month) && Number(item.year) === Number(roster.year));
      for (const item of matches) {
        await deleteRosterAnalysis(item.id).catch(() => false);
      }
      [
        'crewcheck_roster',
        'crewcheck_compliance',
        'crewcheck_gym',
        'crewcheck_source_file',
        'crewcheck_auto_db_save_pending',
        'crewcheck_auto_sync_pending',
      ].forEach((key) => sessionStorage.removeItem(key));
      await refreshSavedRosters();
      toast.success(`Escala ${label} apagada. Próximas programações e Saída Inteligente não usarão esse mês.`);
      setLocation('/?view=import');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível apagar este mês.');
    }
  };

  useEffect(() => {
    if (!roster || !compliance) return;
    if (autoDbSaveStartedRef.current) return;
    if (sessionStorage.getItem("crewcheck_auto_db_save_pending") !== "1") return;

    autoDbSaveStartedRef.current = true;
    const rosterToSave = roster;
    const complianceToSave = compliance;
    const gymToSave = gym;
    let cancelled = false;

    async function autoSaveRoster() {
      setIsSavingDb(true);
      try {
        const result = await saveRosterOfflineFirst({
          roster: rosterToSave,
          compliance: complianceToSave,
          gym: gymToSave,
          sourceFileName: sessionStorage.getItem("crewcheck_source_file"),
        });

        if (cancelled) return;
        sessionStorage.removeItem("crewcheck_auto_db_save_pending");
        setPendingOffline(result.pendingCount);

        if (result.savedOnline) {
          setDbStatus({ ok: true, connected: true });
          await refreshSavedRosters();
          toast.success(result.deduplicatedLocal ? "Escala atualizada automaticamente na base, sem duplicidade." : "Escala salva automaticamente na base.");
        } else if (result.deduplicatedLocal) {
          toast.info("Escala já salva anteriormente. Salvamento automático não duplicou o registro.");
        } else {
          toast.warning("Banco indisponível no momento. Escala guardada offline para sincronizar depois.");
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : "Falha no salvamento automático da escala.");
      } finally {
        if (!cancelled) setIsSavingDb(false);
      }
    }

    void autoSaveRoster();
    return () => { cancelled = true; };
  }, [roster, compliance, gym]);

  if (!roster || !compliance) return null;

  const storedUser = getStoredUser();
  const isAdminUser = isCrewCheckAdmin(storedUser);
  const appMode = isCrewCheckAppMode();
  const visibleCompliance = getUserFacingCompliance(compliance, isAdminUser, ignoredAlertKeys, roster);
  const displayCrewName = resolvedCrewName(roster, storedUser);

  const stats = getStats(roster, visibleCompliance, events);
  const status = getComplianceStatus(visibleCompliance);
  const uniqueTypes = ["Todos", ...Array.from(new Set(events.map((event) => event.typeLabel)))];
  const StatusIcon = status.icon;
  const errors = visibleCompliance.alerts.filter((alert) => alert.severity === "error");
  const warnings = visibleCompliance.alerts.filter((alert) => alert.severity === "warning");

  const handleSuppressFalsePositive = (alert: ComplianceResult["alerts"][number]) => {
    if (!isAdminUser) return;
    const key = alertLearningKey(alert);
    const next = Array.from(new Set([...ignoredAlertKeys, key]));
    setIgnoredAlertKeys(next);
    saveIgnoredAlertKeys(next);
    setSelectedAlert(null);
    toast.success("Falso positivo aprendido. Este tipo de alerta será ocultado para esta leitura e próximas análises locais.");
  };

  const createPremiumPdfExport = (): CrewCheckPdfExportResult => exportReport(roster, visibleCompliance, gym);

  const showPdfExportToast = (result: CrewCheckPdfExportResult) => {
    toast.success(`PDF salvo: ${result.fileName}`, {
      description: `Tamanho aproximado: ${result.sizeKb} KB. Procure em Downloads/Arquivos do dispositivo.`,
      action: { label: 'Abrir', onClick: () => result.open() },
    } as any);
  };

  const handleExportPdf = () => {
    const result = createPremiumPdfExport();
    showPdfExportToast(result);
  };

  const handleSharePdf = async () => {
    const result = createPremiumPdfExport();
    try {
      const mode = await shareExportedPdfNative(result, `CrewCheck Premium - relatório ${result.fileName}`);
      toast.success(mode === 'shared' ? 'Compartilhamento aberto com o PDF anexado.' : 'PDF salvo. Link não enviado; anexe o arquivo em Downloads.');
    } catch {
      toast.info('PDF salvo. Abra Downloads/Arquivos para compartilhar manualmente.');
    }
  };

  const handleWhatsAppPdf = async () => {
    const result = createPremiumPdfExport();
    await shareExportedPdfToWhatsApp(result);
    toast.success('WhatsApp aberto. Se o anexo não aparecer, anexe o PDF salvo em Downloads.');
  };

  const handleEmailPdf = async () => {
    const result = createPremiumPdfExport();
    await shareExportedPdfByEmail(result);
    toast.success('E-mail aberto. Se o anexo não aparecer, anexe o PDF salvo em Downloads.');
  };

  const handleExportCalendar = (mode: CalendarExportMode = "all") => {
    const ical = generateICalendar(roster, gym, {
      mode,
      titleFormat: "route-flight",
      includeReminders: true,
      flightReminderMinutes: [120, 30],
      dutyReminderMinutes: [120, 30],
      gymReminderMinutes: [60],
      routineReminderMinutes: [60],
      routineSuggestions: buildGoogleSyncExtras(gym, loadAnalysis).routineSuggestions,
    });
    const label = mode === "all" ? "completo" : mode === "flights" ? "voos" : mode === "duties" ? "atividades" : mode === "rest" ? "folgas-repousos" : mode === "gym" ? "academia" : "rotina";
    downloadCalendarFile(ical, `crewcheck-${label}-${roster.year}-${String(roster.month).padStart(2, "0")}.ics`);
    toast.success(`Calendário ${label} exportado.`);
  };

    const handleCopy = async () => {
    const ok = await copyToClipboard(roster, visibleCompliance);
    toast[ok ? "success" : "error"](ok ? "Resumo copiado." : "Não foi possível copiar.");
  };

  const handleSaveDatabase = async () => {
    setIsSavingDb(true);
    try {
      const result = await saveRosterOfflineFirst({
        roster,
        compliance,
        gym,
        sourceFileName: sessionStorage.getItem("crewcheck_source_file"),
      });
      setPendingOffline(result.pendingCount);

      if (result.savedOnline) {
        toast.success(result.deduplicatedLocal ? "Escala já existia na base; registro atualizado sem duplicidade." : `Escala salva na base. ID: ${result.summary?.id?.slice(0, 8) || "online"}`);
        setDbStatus({ ok: true, connected: true });
        await refreshSavedRosters();
      } else if (result.deduplicatedLocal) {
        toast.info("Esta escala já foi salva/sincronizada. Duplicidade evitada.");
      } else {
        toast.warning("Sem conexão com banco. Escala guardada offline para sincronizar depois.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setIsSavingDb(false);
    }
  };

  const handleSyncOffline = async () => {
    setIsSavingDb(true);
    try {
      const result = await syncPendingRosters();
      setPendingOffline(result.remaining);
      if (result.synced > 0) toast.success(`${result.synced} escala(s) sincronizada(s) sem duplicidade.`);
      if (result.remaining > 0) toast.warning(`${result.remaining} escala(s) continuam pendentes.`);
      if (!result.synced && !result.remaining) toast.info("Nenhuma escala pendente offline.");
      await refreshSavedRosters();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar pendências.");
    } finally {
      setIsSavingDb(false);
    }
  };

  const handleEmailReport = async () => {
    const to = window.prompt("Enviar relatório para qual e-mail?");
    if (!to) return;
    setIsSendingEmail(true);
    try {
      const result = await sendRosterByEmail({ to, roster, compliance, gym });
      toast.success(`E-mail enviado${result.provider ? ` via ${result.provider}` : ""}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Envio por e-mail ainda não configurado.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handlePowerOff = async () => {
    try {
      await logout();
    } finally {
      sessionStorage.clear();
      setLocation('/login');
    }
  };

  const effectiveDark = getEffectiveCrewTheme(themeMode) === "dark";

  return (
    <div className={appMode ? "crewcheck-results-premium min-h-screen bg-[#020817] text-slate-50 android-premium-shell" : effectiveDark ? "crewcheck-results-premium min-h-screen bg-[#08111f] text-slate-50 crewcheck-dark-shell" : "crewcheck-results-premium min-h-screen bg-[#eef5f8] text-[#06213d]"}>
      {!appMode && <DesktopSidebar activeView={activeView} collapsed={desktopSidebarCollapsed} canAccessAdmin={isAdminUser} onToggleCollapsed={toggleDesktopSidebar} onChange={switchView} onOpenHomeView={openHomeView} onNewRoster={() => openHomeView("import")} onPowerOff={handlePowerOff} />}
      <div className={appMode ? "" : desktopSidebarCollapsed ? "lg:pl-24" : "lg:pl-72"}>
        <header className={`sticky top-0 z-40 border-b text-white shadow-[0_10px_30px_rgba(7,26,51,0.18)] ${appMode ? "border-cyan-300/10 bg-[#061424]/92 backdrop-blur-xl" : "border-white/10 bg-[#092846]"}`}>
          <div className={appMode ? "flex h-14 items-center justify-between px-3 sm:px-4 lg:px-7" : "flex h-16 items-center justify-between px-4 lg:px-7"}>
            <div className="flex items-center gap-3">
              <button onClick={() => setMobileMenuOpen(true)} className="rounded-xl p-2 text-white/85 transition hover:bg-white/10" aria-label="Abrir menu lateral">
                <Menu className="h-5 w-5" />
              </button>
              <button onClick={() => setLocation("/?view=import")} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-white/85 transition hover:bg-white/10 lg:inline-flex" aria-label="Carregar nova escala">
                <CloudUpload className="h-4 w-4" /> Nova escala
              </button>
            </div>
            <div className="text-center">
              {!appMode && <p className="text-xs uppercase tracking-[0.28em] text-cyan-100/60">CrewCheck Premium</p>}
              <h1 className={appMode ? "text-base font-black tracking-tight md:text-lg" : "text-sm font-black tracking-[0.18em] md:text-base"}>{appMode ? viewTitle(activeView) : viewTitle(activeView).toUpperCase()}</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="relative hidden rounded-xl p-2 text-white/85 transition hover:bg-white/10 sm:inline-flex" aria-label="Notificações">
                <Bell className="h-5 w-5" />
                <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold">{errors.length + warnings.length}</span>
              </button>
              <button onClick={() => openHomeView("settings")} className="hidden items-center gap-3 rounded-2xl px-2 py-1 text-left transition hover:bg-white/10 md:flex" aria-label="Abrir configurações completas de perfil e conta">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-sm font-black">{initials(displayCrewName)}</div>
                <div className="leading-tight">
                  <p className="text-sm font-bold">{titleCase(displayCrewName)}</p>
                  <p className="text-xs text-cyan-100/70">Perfil e conta · {roster.base}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-white/65" />
              </button>
              <button onClick={handlePowerOff} className="rounded-xl p-2 text-white/85 transition hover:bg-white/10" aria-label="Desligar e sair do sistema">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <MobileSideDrawer open={mobileMenuOpen} activeView={activeView} displayName={displayCrewName} rank={roster.rank || "Flight Crew"} base={roster.base} errors={errors.length} canAccessAdmin={isAdminUser} onClose={() => setMobileMenuOpen(false)} onChange={switchView} onOpenHomeView={openHomeView} onNewRoster={() => openHomeView("import")} onPowerOff={handlePowerOff} />
        <main className={appMode ? "px-2.5 pb-24 pt-3 sm:px-4 md:px-5 android-premium-main" : "px-4 py-6 md:px-7 lg:py-8"}>
          <div className={activeView === "roster" && !appMode ? "mx-auto w-full max-w-none" : "mx-auto max-w-[1540px]"}>
            {!appMode && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#0b4f7a]/20 pb-3">
                <div className="text-sm font-medium text-sky-500">
                  HOME <span className="mx-2 text-[#6d8397]">/</span> <span className="font-black text-[#092846]">{viewTitle(activeView)}</span>
                </div>
                <Badge className="rounded-full border-0 px-3 py-1 text-xs font-bold" style={{ backgroundColor: status.bg, color: status.fg }}>
                  <StatusIcon className="h-3.5 w-3.5" /> {status.label}
                </Badge>
              </div>
            )}

            {!appMode && <MobileViewTabs activeView={activeView} onChange={switchView} errors={errors.length} />}

            {!appMode && <section className="mb-4 overflow-hidden rounded-[1.4rem] border border-white bg-white shadow-[0_18px_55px_rgba(20,54,84,0.08)]">
              <div className="relative flex min-h-[7.2rem] items-center justify-between gap-6 overflow-hidden px-5 py-5 md:px-7">
                <div className="absolute inset-y-0 right-0 hidden w-[42%] bg-[radial-gradient(circle_at_70%_50%,rgba(72,190,255,0.28),transparent_34%),linear-gradient(90deg,transparent,#eaf7ff)] md:block" />
                <div className="relative z-10 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-inner shadow-blue-200/60">
                    {viewHeroIcon(activeView)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black tracking-tight md:text-3xl">{viewTitle(activeView)}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-[#60758a] md:text-base">{viewSubtitle(activeView)}</p>
                  </div>
                </div>
                <div className="relative z-10 hidden h-20 min-w-[18rem] items-end justify-end md:flex">
                  <div className="h-1 w-36 rounded-full bg-[#9ed4ef]" />
                  <div className="-ml-8 h-16 w-40 skew-x-[-24deg] rounded-tl-[3rem] rounded-br-2xl bg-gradient-to-br from-[#1d6f9d] to-[#063153] shadow-lg" />
                </div>
              </div>
            </section>}

            {!appMode && <div className="mb-4 rounded-[1.15rem] border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 shadow-sm"><strong>Fase de testes privados:</strong> confira sempre com sua escala oficial. Encontrou divergência? Use Configurações &gt; Suporte e envie o PDF/print para melhoria do CrewCheck.</div>}

            {rosterIsStale && <div className="mb-4 rounded-[1.2rem] border border-orange-200 bg-orange-50 px-4 py-4 text-sm leading-6 text-orange-950 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div><strong>Escala antiga detectada:</strong> este mês ({currentRosterMonthLabel(roster)}) fica disponível para consulta e diárias, mas não entra em Próxima Programação nem em Saída Inteligente.</div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setLocation('/?view=import')} className="rounded-xl bg-[#092846] text-white hover:bg-[#0f3558]">Importar escala atual</Button>
                  <Button onClick={handleDeleteCurrentMonth} variant="outline" className="rounded-xl border-orange-300 bg-white text-orange-900 hover:bg-orange-100"><Trash2 className="mr-2 h-4 w-4" />Apagar mês</Button>
                </div>
              </div>
            </div>}

            {/* Resumo já possui KPIs próprios dentro do painel; evita duplicidade visual. */}
            {!appMode && activeView !== "summary" && <ViewKpis activeView={activeView} stats={stats} load={loadAnalysis} errors={errors.length} warnings={warnings.length} gym={gym} roster={roster} />}

            {!appMode && (activeView === "roster" || activeView === "irregularities") && <LegalProfileBanner profile={visibleCompliance.legalProfile} />}
            


            {activeView === "summary" && <SummaryPanel roster={roster} stats={stats} load={loadAnalysis} compliance={visibleCompliance} events={events} isStale={rosterIsStale} onOpenRoster={() => switchView("roster")} onOpenAlerts={() => switchView("alerts")} onOpenMetrics={() => switchView("metrics")} />}
            {activeView === "alerts" && (selectedAlert ? <IrregularityDetailPage alert={selectedAlert} onBack={() => setSelectedAlert(null)} onOpenDay={() => openAlertDay(selectedAlert.date)} isAdminUser={isAdminUser} onSuppressFalsePositive={() => handleSuppressFalsePositive(selectedAlert)} /> : <AlertsPanel compliance={visibleCompliance} errors={errors} warnings={warnings} onOpenAlert={setSelectedAlert} onOpenMetrics={() => switchView("metrics")} onOpenRoster={() => switchView("roster")} />)}
            {activeView === "metrics" && <MetricsPanel compliance={visibleCompliance} load={loadAnalysis} stats={stats} roster={roster} />}
            {activeView === "glossary" && <GlossaryPanel />}

            {activeView === "roster" && (
              <section className="crewcheck-roster-workspace space-y-4">
                {appMode && <AndroidFeatureShortcuts activeView={activeView} onChange={switchView} errors={errors.length} onNewRoster={() => openHomeView("import")} onPowerOff={handlePowerOff} />}
                <RosterQuickToolbar onOpenSummary={() => switchView("summary")} onOpenFilters={() => { const box = document.getElementById("crewcheck-roster-filters"); box?.classList.toggle("hidden"); }} onDeleteMonth={handleDeleteCurrentMonth} />
                <div id="crewcheck-roster-filters" className="hidden"><RosterFilters roster={roster} query={query} setQuery={setQuery} dutyType={dutyType} setDutyType={setDutyType} uniqueTypes={uniqueTypes} selectedMonthKey={selectedMonthKey} setSelectedMonthKey={setSelectedMonthKey} monthOptions={monthOptions} /></div>
                <MobileRosterList groups={filteredDayGroups} todayId={firstEventId} roster={roster} routineSuggestions={routineSuggestions} />
              </section>
            )}

            {activeView === "irregularities" && (selectedAlert ? <IrregularityDetailPage alert={selectedAlert} onBack={() => setSelectedAlert(null)} onOpenDay={() => openAlertDay(selectedAlert.date)} isAdminUser={isAdminUser} onSuppressFalsePositive={() => handleSuppressFalsePositive(selectedAlert)} /> : <IrregularitiesPanel compliance={visibleCompliance} errors={errors} warnings={warnings} onOpenAlert={setSelectedAlert} />)}
            {activeView === "gym" && <RoutinePanel gym={gym} load={loadAnalysis} />}
            {activeView === "fatigue" && <FatiguePanel load={loadAnalysis} compliance={visibleCompliance} />}
            {activeView === "statistics" && <StatisticsPanel storedStats={storedStats} savedRosters={savedRosters} />}
            {activeView === "settings" && <SettingsPanel roster={roster} gym={gym} load={loadAnalysis} themeMode={themeMode} onThemeModeChange={setThemeMode} ignoredAlertKeys={ignoredAlertKeys} onClearIgnoredAlerts={() => { setIgnoredAlertKeys([]); saveIgnoredAlertKeys([]); toast.success("Aprendizado de falsos positivos limpo."); }} handleExportCalendar={handleExportCalendar} handleExportPdf={handleExportPdf} handleSharePdf={handleSharePdf} handleWhatsAppPdf={handleWhatsAppPdf} handleEmailPdf={handleEmailPdf} handleCopy={handleCopy} handleEmailReport={handleEmailReport} isSendingEmail={isSendingEmail} />}
            {activeView === "manual" && <ManualPanel />}
            <div className="mt-5"><PrivacyTrustBanner /></div>
          </div>
        </main>
      </div>
      <ResultsGlobalBottomMenu active={activeView === 'settings' ? 'settings' : 'roster'} onNavigate={openHomeView} />
    </div>
  );
}

function ResultsGlobalBottomMenu({ active, onNavigate }: { active: 'home' | 'roster' | 'flightboard' | 'departure' | 'settings'; onNavigate: (view: string) => void }) {
  const [compact, setCompact] = useState(() => {
    try { return localStorage.getItem('crewcheck_bottom_menu_compact') === '1'; } catch { return false; }
  });
  const toggleCompact = () => setCompact((current) => {
    const next = !current;
    try { localStorage.setItem('crewcheck_bottom_menu_compact', next ? '1' : '0'); } catch {}
    return next;
  });
  const items: Array<{ id: 'home' | 'roster' | 'flightboard' | 'departure' | 'settings'; label: string; fullLabel: string; icon: LucideIcon; view: string }> = [
    { id: 'home', label: 'Cockpit', fullLabel: 'Cockpit', icon: House, view: 'home' },
    { id: 'roster', label: 'Escala', fullLabel: 'Escala completa', icon: CalendarDays, view: 'roster' },
    { id: 'flightboard', label: 'Radar', fullLabel: 'Radar de Voos', icon: Gauge, view: 'flightboard' },
    { id: 'departure', label: 'Saída', fullLabel: 'Saída Inteligente', icon: Navigation, view: 'departure' },
    { id: 'settings', label: 'Config.', fullLabel: 'Configurações', icon: Settings, view: 'settings' },
  ];
  return (
    <nav className={`crewcheck-global-bottom-menu crewcheck-primary-bottom-nav ${compact ? 'is-compact' : ''} fixed bottom-0 left-0 right-0 z-[95] px-3 pb-[calc(0.9rem+env(safe-area-inset-bottom,0px))] pt-2.5 lg:hidden`}>
      <div className="crewcheck-bottom-menu-shell mx-auto flex items-center justify-between gap-1">
        {items.map(({ id, label, fullLabel, icon: Icon, view }) => {
          const isActive = active === id;
          return (
            <button key={id} onClick={() => onNavigate(view)} title={fullLabel} aria-label={fullLabel} className={`crewcheck-bottom-item flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition active:scale-95 ${isActive ? 'is-active' : ''}`}>
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

function ResultsSpeedDial({ onNavigate, onResultsNavigate }: { onNavigate: (view: string) => void; onResultsNavigate: (view: ViewKey) => void }) {
  const [open, setOpen] = useState(false);
  const goHome = (view: string) => { setOpen(false); onNavigate(view); };
  const goResults = (view: ViewKey) => { setOpen(false); onResultsNavigate(view); };
  const items: Array<{ label: string; hint: string; icon: LucideIcon; action: () => void; premium?: boolean }> = [
    { label: 'Resumo', hint: 'visão geral', icon: LayoutDashboard, action: () => goResults('summary') },
    { label: 'Minha Escala', hint: 'cards e detalhes', icon: Calendar, action: () => goResults('roster') },
    { label: 'Rotina', hint: 'janelas seguras', icon: Dumbbell, action: () => goResults('gym') },
    { label: 'Alertas', hint: 'atenção e revisão', icon: Bell, action: () => goResults('alerts') },
    { label: 'Chefe de Cabine', hint: 'caderno, água e checklist', icon: ClipboardList, action: () => goHome('chief'), premium: true },
    { label: 'Checklist Médico', hint: 'ocorrência e PDF', icon: FileText, action: () => goHome('medical'), premium: true },
    { label: 'Saída Inteligente', hint: 'GPS e transporte', icon: Navigation, action: () => goHome('departure') },
    { label: 'Ajuda e manuais', hint: 'PWA e suporte', icon: Mail, action: () => goHome('support') },
  ];
  return (
    <div className="crewcheck-speed-dial fixed right-4 z-[96] lg:hidden">
      {open && <div className="crewcheck-speed-dial-panel mb-3 w-[min(21rem,calc(100vw-2rem))] rounded-[1.55rem] border p-3 shadow-2xl backdrop-blur-2xl">
        <div className="mb-2 px-2"><p className="text-[10px] font-black uppercase tracking-[0.22em]">Menu completo</p><p className="text-xs font-semibold opacity-70">Escala + módulos premium</p></div>
        <div className="grid gap-2">{items.map(({ label, hint, icon: Icon, action, premium }) => <button key={label} onClick={action} className="crewcheck-speed-dial-action flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition active:scale-[0.99]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{label}</b><small className="block truncate text-[11px] font-semibold opacity-70">{hint}</small></span>{premium && <Sparkles className="h-4 w-4 shrink-0 opacity-80" />}</button>)}</div>
      </div>}
      <button type="button" onClick={() => setOpen((value) => !value)} className={`crewcheck-speed-dial-button flex h-14 w-14 items-center justify-center rounded-[1.25rem] border shadow-2xl transition active:scale-95 ${open ? 'is-open' : ''}`} aria-label="Abrir menu completo"><Menu className="h-6 w-6" /></button>
    </div>
  );
}


function RosterQuickToolbar({ onOpenSummary, onOpenFilters, onDeleteMonth }: { onOpenSummary: () => void; onOpenFilters: () => void; onDeleteMonth: () => void }) {
  const actionClass = "min-w-0 flex-1 justify-center rounded-xl px-3 py-2 text-xs font-black sm:flex-none sm:px-4";
  return (
    <div className="overflow-hidden rounded-[1.1rem] border border-white bg-white p-3 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-[#092846]">Escala</h3>
          <p className="max-w-[13rem] text-xs font-semibold leading-4 text-[#60758a] sm:max-w-none">Cards limpos. Toque para abrir detalhes.</p>
        </div>
        <div className="grid w-full min-w-0 grid-cols-3 gap-2 md:w-auto md:max-w-full md:flex md:flex-wrap md:justify-end">
          <Button onClick={onOpenSummary} variant="outline" className={`${actionClass} border-[#d8e4ee] text-[#092846]`}><LayoutDashboard className="h-4 w-4 shrink-0" /> <span className="truncate">Resumo</span></Button>
          <Button onClick={onOpenFilters} variant="outline" className={`${actionClass} border-blue-200 text-blue-600`}><Search className="h-4 w-4 shrink-0" /> <span className="truncate">Filtro</span></Button>
          <Button onClick={onDeleteMonth} variant="outline" className={`${actionClass} border-rose-200 text-rose-600`}><Trash2 className="h-4 w-4 shrink-0" /> <span className="truncate sm:hidden">Apagar</span><span className="hidden truncate sm:inline">Apagar mês</span></Button>
        </div>
      </div>
    </div>
  );
}


function loadLastRosterChangeSummary(): { message?: string; added?: number; removed?: number; changed?: number; duplicatesIgnored?: number; details?: string[] } | null {
  try {
    const raw = sessionStorage.getItem('crewcheck_last_roster_changes');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function SummaryPanel({ roster, stats, load, compliance, events, onOpenRoster, onOpenAlerts, onOpenMetrics, isStale }: { roster: CrewRoster; stats: ReturnType<typeof getStats>; load: LoadAnalysis; compliance: ComplianceResult; events: RosterEvent[]; onOpenRoster: () => void; onOpenAlerts: () => void; onOpenMetrics: () => void; isStale?: boolean }) {
  const layovers = roster.days.filter((day) => day.type === 'LAYOVER' || day.hotel).length;
  const alerts = compliance.alerts.length;
  const upcoming = isStale ? [] : getUpcomingRosterEvents(events, 5);
  const heroEvent = upcoming[0];
  const changeSummary = loadLastRosterChangeSummary();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-4">
        {changeSummary && <div className="rounded-[1.25rem] border border-cyan-100 bg-cyan-50 p-4 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-cyan-700">Comparativo da última importação</p>
          <h3 className="mt-1 text-xl font-black text-[#092846]">{changeSummary.message || 'Alterações da escala calculadas.'}</h3>
          {!!changeSummary.details?.length && <div className="mt-3 grid gap-2 md:grid-cols-2">{changeSummary.details.slice(0, 8).map((item, idx) => <div key={`${item}-${idx}`} className="rounded-2xl border border-cyan-100 bg-white px-3 py-2 text-xs font-bold leading-5 text-[#425a72]">{item}</div>)}</div>}
        </div>}
        {heroEvent && <PremiumNextProgramHero event={heroEvent} onOpenRoster={onOpenRoster} />}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CleanMetric icon={House} label="Folgas" value={stats.daysOff} tone="#15963a" />
          <CleanMetric icon={BedDouble} label="Pernoites" value={layovers} tone="#e0a000" />
          <CleanMetric icon={CalendarDays} label="Eventos" value={events.length} tone="#2f80ed" />
          <CleanMetric icon={Bell} label="Alertas" value={alerts} tone={alerts ? '#dc2626' : '#15963a'} />
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-xl font-black text-[#092846]">Próximas programações</h3><p className="text-sm text-[#60758a]">A partir do dia vigente, sem voltar para o início do mês.</p></div>
            <Button onClick={onOpenRoster} className="rounded-xl bg-[#092846] text-white">Abrir escala</Button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {upcoming.map((event) => <CompactEventRow key={event.id} event={event} />)}
            {!upcoming.length && <p className="rounded-2xl border border-[#e5edf5] bg-[#f8fbfd] p-4 text-sm font-semibold text-[#60758a]">Nenhuma programação futura encontrada nesta escala.</p>}
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <button onClick={onOpenAlerts} className="w-full rounded-[1.25rem] border border-white bg-white p-5 text-left shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-red-500">alertas</p>
          <p className="mt-1 text-3xl font-black text-[#092846]">{alerts}</p>
          <p className="text-sm text-[#60758a]">Clique para revisar irregularidades e atenções.</p>
        </button>
        <button onClick={onOpenMetrics} className="w-full rounded-[1.25rem] border border-white bg-white p-5 text-left shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">conformidade</p>
          <p className="mt-1 text-3xl font-black text-[#092846]">{compliance.score}/100</p>
          <p className="text-sm text-[#60758a]">Veja as métricas usadas para calcular a nota.</p>
        </button>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-600">carga da escala</p>
          <p className="mt-1 text-3xl font-black text-[#092846]">{load.intensityScore}/100</p>
          <p className="text-sm text-[#60758a]">{load.grade}</p>
        </div>
      </aside>
    </div>
  );
}

function AlertsPanel({ compliance, errors, warnings, onOpenAlert, onOpenMetrics, onOpenRoster }: { compliance: ComplianceResult; errors: ComplianceResult['alerts']; warnings: ComplianceResult['alerts']; onOpenAlert: (alert: ComplianceResult['alerts'][number]) => void; onOpenMetrics: () => void; onOpenRoster: () => void }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <button onClick={onOpenMetrics}><ScoreCard title="Regulamentação" value={`${compliance.score}/100`} icon={ShieldCheck} tone={errors.length ? '#dc2626' : '#15963a'} description="Clique para ver métricas." /></button>
        <button onClick={() => errors[0] && onOpenAlert(errors[0])}><ScoreCard title="Irregularidades" value={String(errors.length)} icon={AlertTriangle} tone="#dc2626" description="Clique para abrir." /></button>
        <button onClick={() => warnings[0] && onOpenAlert(warnings[0])}><ScoreCard title="Alertas" value={String(warnings.length)} icon={Bell} tone="#f97316" description="Pontos de atenção." /></button>
        <button onClick={onOpenRoster}><ScoreCard title="Dias carregados" value={String(compliance.metrics.daysOff + compliance.metrics.reserveCount + compliance.metrics.totalStandby)} icon={CalendarDays} tone="#2f80ed" description="Abrir escala." /></button>
      </div>
      <IrregularitiesPanel compliance={compliance} errors={errors} warnings={warnings} onOpenAlert={onOpenAlert} />
    </div>
  );
}

function MetricsPanel({ compliance, load, stats, roster }: { compliance: ComplianceResult; load: LoadAnalysis; stats: ReturnType<typeof getStats>; roster: CrewRoster }) {
  const rows = [
    ['Nota de conformidade', `${compliance.score}/100`, 'Baseada em irregularidades confirmadas e alertas relevantes.'],
    ['Repouso médio', `${compliance.metrics.averageTurnaround.toFixed(1)}h`, 'Entre jornadas. Acionamento/alteração pode usar regra de 12h.'],
    ['Horas de voo', `${stats.flightHours.toFixed(1)}h`, 'Soma dos trechos lidos.'],
    ['Horas de jornada', `${stats.dutyHours.toFixed(1)}h`, 'Apresentação até corte/fim de jornada.'],
    ['Folgas', String(stats.daysOff), 'Inclui DO, DR, DOF, DOP, DOPR e VC quando classificados como folga.'],
    ['Reserva/Sobreaviso', String(stats.reserveDays), 'ASB/HSB/HSBE agrupados; se houver acionamento, ignora mínimo isolado de 3h e valida o limite regulatório combinado.'],
    ['Jornada semanal', '44h', 'Ponto de atenção em janela móvel de 7 dias conforme Lei do Aeronauta e ACT.'],
    ['Alertas operacionais', 'Premium', 'PNAE/POB, NOTOC/DG, POC, DEPA/DEPU, animal em cabine e abastecimento com pax.'],
    ['Carga da escala', `${load.intensityScore}/100`, load.summary],
    ['Dias carregados', String(roster.days.length), 'Quantidade de dias interpretados pelo parser.'],
  ];
  return <section className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]"><h3 className="text-2xl font-black text-[#092846]">Métricas do CrewCheck</h3><div className="mt-4 divide-y divide-[#edf3f8]">{rows.map(([a,b,c]) => <div key={a} className="grid gap-2 py-3 md:grid-cols-[14rem_8rem_minmax(0,1fr)]"><b className="text-[#092846]">{a}</b><span className="font-black text-blue-600">{b}</span><p className="text-sm text-[#60758a]">{c}</p></div>)}</div></section>;
}

function GlossaryPanel() {
  const terms = [
    ['DO / DR / DOF', 'Folgas formais publicadas na escala.'],
    ['DOP / DOPR', 'Período oposto; tratado como folga para contagem e alertas.'],
    ['OFF', 'Extensão de repouso, não necessariamente folga formal.'],
    ['HSB / HSBE', 'Sobreaviso em casa.'],
    ['ASB', 'Reserva/Airport Stand By.'],
    ['PS', 'Extra/PS; ícone de voo em cinza.'],
    ['C32F', 'Check A32F; fica separado de Extra.'],
    ['PNAE / WCH / UMNR', 'Atendimento especial: conferir Nimbus e P.O.B. antes do fechamento de portas.'],
    ['NOTOC / DG', 'Artigos perigosos: ciência da cabine e fluxo de reporte em discrepância/incidente.'],
    ['DEPA / DEPU', 'Passageiro deportado/acompanhado: aplicar briefing de Security, assentos e escoltas.'],
    ['POC', 'Concentrador portátil de oxigênio: validar bateria 150%, assento e acomodação.'],
    ['PETC / ESAN / SVAN', 'Animal em cabine/serviço: conferir limite, assento e obstrução de corredor/saída.'],
    ['KME / KIM / MedAire', 'Ocorrência médica: abertura, lacres, autorização e MOR conforme procedimento.'],
    ['Inativo/Pernoite', 'Dia em branco após programação ou hotel/localidade.'],
  ];
  return <section className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]"><h3 className="text-2xl font-black text-[#092846]">Glossário</h3><div className="mt-4 grid gap-3 md:grid-cols-2">{terms.map(([code, text]) => <div key={code} className="rounded-2xl border border-[#e5edf5] bg-[#f8fbfd] p-4"><b className="text-[#092846]">{code}</b><p className="mt-1 text-sm text-[#60758a]">{text}</p></div>)}</div></section>;
}

function CleanMetric({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number | string; tone: string }) {
  return <div className="rounded-[1.1rem] border border-white bg-white p-4 shadow-[0_14px_45px_rgba(20,54,84,0.07)]"><Icon className="h-6 w-6" style={{ color: tone }} /><p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[#71869b]">{label}</p><p className="text-3xl font-black text-[#092846]">{value}</p></div>;
}


function PremiumNextProgramHero({ event, onOpenRoster }: { event: RosterEvent; onOpenRoster: () => void }) {
  const flight = useFlightStatus(event);
  const isFlight = event.typeLabel === 'Flight' && Boolean(event.leg);
  const style = getEventStyle(event);
  const route = isFlight && event.leg ? `${event.leg.origin} → ${event.leg.destination}` : event.activity;
  const countdown = useLiveCountdown(event);
  return (
    <div className="cc-next-program-hero overflow-hidden rounded-[1.45rem] border border-white bg-white shadow-[0_18px_55px_rgba(20,54,84,0.08)]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative overflow-hidden p-5 md:p-6">
          <div className="absolute -right-12 top-3 h-40 w-40 rounded-full bg-blue-100/70 blur-2xl" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-sky-600">próxima programação</p>
              <h3 className="mt-2 break-words text-2xl font-black tracking-tight text-[#092846] md:text-4xl">{route}</h3>
              <p className="mt-1 text-sm font-semibold text-[#60758a]">{event.dateLabel} · {event.time} · {event.activity}</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: style.solid }}>
              <Plane className="h-7 w-7" />
            </div>
          </div>
          {isFlight ? (
            <div className="relative z-10 mt-5 grid grid-cols-2 gap-2 md:grid-cols-6">
              <FlightMiniPill label="Status" value={flight.status || event.status || 'Scheduled'} />
              <FlightMiniPill label="Pouso" value={flight.landingCountdown || flight.estimatedArrival || '—'} />
              <FlightMiniPill label="Matrícula" value={flight.registration || '—'} />
              <FlightMiniPill label="Portão" value={flight.gate || '—'} />
              <FlightMiniPill label="Terminal" value={flight.terminal || '—'} />
              <FlightMiniPill label="Código" value={event.code || event.leg?.flightNumber || '—'} />
            </div>
          ) : (
            <div className="relative z-10 mt-5 grid grid-cols-2 gap-2 md:grid-cols-3">
              <FlightMiniPill label="Tipo" value={event.typeLabel} />
              <FlightMiniPill label="Código" value={event.code || '—'} />
              <FlightMiniPill label="Horário" value={event.time || '—'} />
            </div>
          )}
          <p className="relative z-10 mt-3 text-xs font-semibold text-[#60758a]">Status, portão e terminal aparecem somente para voos. Atividades, folgas, reservas e treinamentos ficam limpos, com foco em horário, rotina e recuperação.</p>
          <div className="relative z-10 mt-3"><PilotReserveStandbyWeatherCard event={event} /></div>
        </div>
        <div className="flex flex-col justify-between border-t border-[#e5edf5] bg-[#f8fbfd] p-5 lg:border-l lg:border-t-0">
          <div>
            <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-[#71869b]">tempo até apresentar</p>
            <p className="mt-2 text-4xl font-black text-[#092846]">{countdown}</p>
            <p className="mt-2 text-sm leading-6 text-[#60758a]">Rotina, descanso e alertas ficam dentro dos detalhes do dia.</p>
          </div>
          <button onClick={onOpenRoster} className="cc-button-primary mt-4 rounded-2xl px-4 py-3 text-sm font-black shadow-lg transition active:scale-95">Abrir escala completa</button>
        </div>
      </div>
    </div>
  );
}

function useLiveCountdown(event: RosterEvent): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return countdownFromEventAt(event, now);
}

function countdownFromEventAt(event: RosterEvent, now: number): string {
  const target = eventStartDate(event).getTime();
  const diff = target - now;
  if (diff <= 0) return 'agora';
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function CompactEventRow({ event }: { event: RosterEvent }) {
  const [open, setOpen] = useState(false);
  const style = getEventStyle(event);
  const Icon = style.icon;
  const flight = useFlightStatus(event);
  const isFlight = event.typeLabel === 'Flight' && Boolean(event.leg);
  return (
    <div className="cc-next-program-card overflow-hidden rounded-2xl border border-[#e5edf5] bg-[#f8fbfd] shadow-[0_10px_30px_rgba(20,54,84,0.05)]">
      <button type="button" onClick={() => setOpen((value) => !value)} className="grid w-full min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-start gap-3 p-3 text-left transition hover:bg-white/70">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: style.solid }}><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="break-words font-black leading-tight text-[#092846]">{event.dateLabel} · {event.time}</p>
          <p className="mt-0.5 break-words text-sm leading-5 text-[#60758a]">{event.activity} · {event.subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="max-w-[7.5rem] truncate rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-[#60758a] shadow-sm">{event.code || '—'}</span>
          <ChevronDown className={`h-4 w-4 text-[#60758a] transition ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {isFlight && (
        <div className="grid grid-cols-2 gap-2 px-3 pb-3 text-[11px] font-black sm:grid-cols-5">
          <FlightMiniPill label="Status" value={flight.status || event.status || 'Scheduled'} />
          <FlightMiniPill label="Pouso" value={flight.landingCountdown || flight.estimatedArrival || '—'} />
          <FlightMiniPill label="Matrícula" value={flight.registration || '—'} />
          <FlightMiniPill label="Portão" value={flight.gate || '—'} />
          <FlightMiniPill label="Terminal" value={flight.terminal || '—'} />
        </div>
      )}
      {open && <div className="border-t border-[#e5edf5] px-3 pb-3"><MobileRosterEventDetails event={event} routineSuggestions={[]} /></div>}
    </div>
  );
}

function FlightMiniPill({ label, value }: { label: string; value: string }) {
  return <div className="cc-flight-pill min-w-0 rounded-xl border px-2.5 py-2"><p className="cc-flight-pill-label truncate text-[9px] uppercase tracking-[0.12em]">{label}</p><p className="cc-flight-pill-value mt-0.5 truncate">{value}</p></div>;
}

function LanguageSettingsCard({ themeMode, onThemeModeChange }: { themeMode: CrewThemeMode; onThemeModeChange: (mode: CrewThemeMode) => void }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('crewcheck_language') || 'system');
  function saveLanguage(value: string) { const normalized = value === 'system' || value === 'pt-BR' ? 'pt' : value; setLanguage(normalized); localStorage.setItem('crewcheck_language', normalized); window.dispatchEvent(new CustomEvent('crewcheck:language-change', { detail: { language: normalized } })); toast.success('Preferência de idioma salva.'); }
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">aparência</p>
      <h3 className="text-xl font-black text-[#092846]">Tema, idioma e região</h3>
      <p className="mt-1 text-sm text-[#60758a]">O CrewCheck pode seguir automaticamente o tema e o idioma do sistema do aparelho.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-black uppercase tracking-[0.12em] text-[#60758a]">Tema
          <select value={themeMode} onChange={(e)=>onThemeModeChange(e.target.value as CrewThemeMode)} className="mt-2 h-11 w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
            <option value="system">Automático pelo sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </label>
        <label className="text-xs font-black uppercase tracking-[0.12em] text-[#60758a]">Idioma
          <select value={language} onChange={(e)=>saveLanguage(e.target.value)} className="mt-2 h-11 w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400"><option value="pt">Português (Brasil)</option><option value="en">English</option><option value="es">Español</option><option value="fr">Français</option><option value="it">Italiano</option><option value="de">Deutsch</option></select>
        </label>
      </div>
    </div>
  );
}


function PrivacyTrustBanner() {
  return (
    <section className="mb-4 rounded-[1.1rem] border border-emerald-100 bg-white px-4 py-3 shadow-[0_10px_35px_rgba(20,54,84,0.05)]">
      <div className="flex flex-col gap-2 text-sm text-[#425a72] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 font-bold text-[#092846]"><Lock className="h-4 w-4 text-emerald-600" /> Privacidade e proteção de dados</div>
        <p className="max-w-3xl leading-6">Cadastro mínimo, senha com hash, histórico por usuário e uso dos dados apenas para leitura da escala, conformidade e exportações solicitadas. Sistema orientado às boas práticas da LGPD.</p>
      </div>
    </section>
  );
}

function LegalProfileBanner({ profile }: { profile: ComplianceResult['legalProfile'] }) {
  return (
    <section className="mb-4 rounded-[1.25rem] border border-sky-100 bg-gradient-to-r from-white to-sky-50 p-4 shadow-[0_14px_45px_rgba(20,54,84,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#092846] text-white"><ShieldCheck className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">ACT / base legal</p>
            <h3 className="mt-1 text-lg font-black text-[#092846]">{profile.actName} · {profile.roleLabel} · {profile.functionLabel}</h3>
            <p className="mt-1 text-sm leading-6 text-[#60758a]">{profile.inferenceReason}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#092846] shadow-sm">Confiança: {profile.confidence}</span>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#092846] shadow-sm">Vigência: {profile.actValidity}</span>
        </div>
      </div>
    </section>
  );
}

function RosterFilters({ roster, query, setQuery, dutyType, setDutyType, uniqueTypes, selectedMonthKey, setSelectedMonthKey, monthOptions }: { roster: CrewRoster; query: string; setQuery: (value: string) => void; dutyType: string; setDutyType: (value: string) => void; uniqueTypes: string[]; selectedMonthKey: string; setSelectedMonthKey: (value: string) => void; monthOptions: RosterMonthOption[] }) {
  const sorted = [...roster.days].sort((a, b) => parseRosterDate(a.date, fallbackRosterDate(roster.month, roster.year)).getTime() - parseRosterDate(b.date, fallbackRosterDate(roster.month, roster.year)).getTime());
  const fromDate = sorted[0]?.date || `01/${String(roster.month).padStart(2, "0")}/${roster.year}`;
  const toDate = sorted[sorted.length - 1]?.date || `${daysInMonth(roster.month, roster.year)}/${String(roster.month).padStart(2, "0")}/${roster.year}`;
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-4 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Mês / período">
          <div className="relative">
            <select value={selectedMonthKey} onChange={(event) => setSelectedMonthKey(event.target.value)} className="h-[42px] w-full appearance-none rounded-xl border border-[#d8e4ee] bg-white px-3 pr-9 text-sm font-semibold text-[#092846] outline-none focus:border-blue-400">
              <option value="live">Da data atual em diante</option>
              <option value="all">Todos os meses da escala</option>
              <option value="context">Mês ativo + últimos dias anexados</option>
              {monthOptions.map((option) => <option key={option.key} value={option.key}>{option.label} · {option.count} item(ns)</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7890a4]" />
          </div>
        </Field>
        <Field label="De">
          <div className="rounded-xl border border-[#d8e4ee] bg-white px-3 py-2.5 text-sm">{fromDate}</div>
        </Field>
        <Field label="Até">
          <div className="rounded-xl border border-[#d8e4ee] bg-white px-3 py-2.5 text-sm">{toDate}</div>
        </Field>
        <Field label="Tipo">
          <select value={dutyType} onChange={(event) => setDutyType(event.target.value)} className="h-[42px] w-full rounded-xl border border-[#d8e4ee] bg-white px-3 text-sm font-semibold outline-none focus:border-blue-400">
            {uniqueTypes.map((type) => <option key={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Buscar">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7890a4]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar voo, rota, código ou data..." className="h-[42px] w-full rounded-xl border border-[#d8e4ee] bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400" />
          </div>
        </Field>
      </div>
      <p className="mt-3 text-xs font-semibold leading-5 text-[#60758a]">Novo: use “Mês ativo + últimos dias anexados” para forçar a exibição dos últimos dias do mês anterior quando houver escala subjacente/continuidade de chave.</p>
    </div>
  );
}

function RightActions({ roster, gym, events, stats, load, dbStatus, savedRosters, isSavingDb, pendingOffline, isSendingEmail, handleSyncOffline, handleEmailReport, handleSaveDatabase, handleExportCalendar, handleExportPdf, handleCopy, setLocation, onOpenSettings }: { roster: CrewRoster; gym: GymRecommendation[]; events: RosterEvent[]; stats: ReturnType<typeof getStats>; load: LoadAnalysis; dbStatus: DatabaseStatus | null; savedRosters: SavedRosterSummary[]; isSavingDb: boolean; pendingOffline: number; isSendingEmail: boolean; handleSyncOffline: () => void; handleEmailReport: () => void; handleSaveDatabase: () => void; handleExportCalendar: (mode?: CalendarExportMode) => void; handleExportPdf: () => void; handleCopy: () => void; setLocation: (path: string) => void; onOpenSettings: () => void }) {
  return (
    <aside className="space-y-4">
      <ActionCard title="Importar escala" description="Escolher PDF no dispositivo e substituir a escala atual sem duplicar histórico." icon={CloudUpload} button="Escolher PDF no dispositivo" onClick={() => setLocation("/?view=import")} />
      <DatabaseCard dbStatus={dbStatus} savedRosters={savedRosters} isSavingDb={isSavingDb} onSave={handleSaveDatabase} />
      <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <h3 className="text-lg font-black">Offline / APK</h3>
        <p className="mt-1 text-sm text-[#60758a]">Pendências ficam salvas no aparelho e sincronizam depois sem duplicar.</p>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3">
          <span className="text-sm font-bold text-[#092846]">{pendingOffline} pendente(s)</span>
          <Button onClick={handleSyncOffline} disabled={isSavingDb || pendingOffline === 0} variant="outline" className="rounded-xl border-blue-200 text-blue-600">Atualizar ICS</Button>
        </div>
      </div>
      <ActionCard title="Enviar por e-mail" description="Envia um resumo premium da análise para qualquer e-mail, se SendGrid ou MailerSend estiver configurado no Render." icon={Mail} button={isSendingEmail ? "Enviando..." : "Enviar"} onClick={handleEmailReport} />
      <GoogleCalendarQuickCard roster={roster} gym={gym} load={load} onOpenSettings={onOpenSettings} />
      <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black">Exportar ICS</h3>
            <p className="mt-1 text-sm text-[#60758a]">Arquivo compatível com Google, Outlook e iOS para uso manual.</p>
          </div>
          <Button onClick={() => handleExportCalendar("all")} variant="outline" className="rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"><Download className="h-4 w-4" /> Tudo</Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => handleExportCalendar("flights")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><Plane className="h-4 w-4" /> Só voos</Button>
          <Button onClick={() => handleExportCalendar("duties")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><BriefcaseBusiness className="h-4 w-4" /> Atividades</Button>
          <Button onClick={() => handleExportCalendar("rest")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><Moon className="h-4 w-4" /> Folgas</Button>
          <Button onClick={() => handleExportCalendar("gym")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><Dumbbell className="h-4 w-4" /> Academia</Button>
          <Button onClick={() => handleExportCalendar("routine")} variant="outline" className="justify-start rounded-xl border-[#d8e4ee] text-[#092846]"><BookOpen className="h-4 w-4" /> Rotina</Button>
        </div>
      </div>
      <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-lg font-black">Roster Summary</h3><span className="rounded-lg border border-[#d8e4ee] px-2 py-1 text-xs font-semibold text-[#60758a]">This Month</span></div>
        <div className="space-y-3 text-sm">
          <SummaryLine icon={CalendarDays} label="Total Events" value={events.length} color="#2f80ed" />
          <SummaryLine icon={Plane} label="Flight Segments" value={stats.flightSegments} color="#2f80ed" />
          <SummaryLine icon={GraduationCap} label="Training Sessions" value={stats.trainingSessions} color="#7c3aed" />
          <SummaryLine icon={BriefcaseBusiness} label="Meetings" value={stats.meetings} color="#0f8d96" />
          <SummaryLine icon={AlertTriangle} label="Interrupções" value={stats.interruptions} color="#f97316" />
          <SummaryLine icon={ClipboardList} label="Justificativas/DM" value={stats.absences} color="#64748b" />
          <SummaryLine icon={House} label="Day Off" value={stats.daysOff} color="#19a43a" />
          <SummaryLine icon={Gauge} label="Nota de puxada" value={load.intensityScore} color="#f97316" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={handleExportPdf} className="rounded-xl bg-[#092846] text-white hover:bg-[#0d365e]"><FileText className="h-4 w-4" /> PDF</Button>
        <Button onClick={handleCopy} variant="outline" className="rounded-xl border-[#d8e4ee]"><Copy className="h-4 w-4" /> Copiar</Button>
      </div>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">A análise é automática e depende da leitura correta do PDF. Para decisão trabalhista/oficial, confira escala publicada, ACT aplicável, CCT, manual do operador, GRF/SGRF e setor responsável.</p>
    </aside>
  );
}


function GoogleCalendarQuickCard({ roster, gym, load, onOpenSettings }: { roster: CrewRoster; gym: GymRecommendation[]; load: LoadAnalysis; onOpenSettings: () => void }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const settings = loadGoogleCalendarSettings();
  const configured = isGoogleCalendarConfigured();

  async function handleSyncNow() {
    if (!configured) {
      toast.error("Agenda automática ainda não está disponível. Conecte sua Conta Google ou use Exportar ICS como alternativa.");
      onOpenSettings();
      return;
    }
    setIsSyncing(true);
    try {
      const result = await syncRosterToGoogleCalendar(roster, settings, buildGoogleSyncExtras(gym, load));
      sessionStorage.removeItem("crewcheck_auto_sync_pending");
      toast.success(`Agenda automática atualizado: ${result.created} novo(s), ${result.updated} atualizado(s), ${result.deleted} removido(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao sincronizar Agenda automática.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="rounded-[1.25rem] border border-blue-100 bg-gradient-to-br from-white to-sky-50 p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Agenda automática</h3>
          <p className="mt-1 text-sm text-[#60758a]">Sincroniza direto com o Google Calendar, sem duplicar eventos antigos.</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white"><CalendarDays className="h-5 w-5" /></div>
      </div>
      <div className="rounded-2xl bg-white/75 p-3 text-xs leading-5 text-[#425a72]">
        <p><strong>Link:</strong> {settings.selectedCalendarName || settings.selectedCalendarId || "Calendário principal"}</p>
        <p><strong>Atualização automática:</strong> {settings.autoSync ? "ativo após upload" : "desativado"}</p>
        <p><strong>Conteúdo:</strong> {googleSyncModeLabel(settings.exportMode || "all")}</p>
        {!configured && <p className="mt-2 font-bold text-amber-700">Conecte o Google Calendar nas Configurações para sincronizar direto.</p>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={handleSyncNow} disabled={isSyncing || !configured} className="rounded-xl bg-blue-600 text-white hover:bg-blue-700">
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} /> {isSyncing ? "Sincronizando" : "Atualizar ICS"}
        </Button>
        <Button onClick={onOpenSettings} variant="outline" className="rounded-xl border-blue-200 text-blue-700"><Settings className="h-4 w-4" /> Configurar</Button>
      </div>
    </div>
  );
}


function ProfileAccountCard({ roster }: { roster: CrewRoster }) {
  const user = getStoredUser();
  const name = resolvedCrewName(roster, user);
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#092846] text-lg font-black text-white">{initials(name)}</div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">perfil e conta</p>
            <h3 className="text-xl font-black text-[#092846]">{titleCase(name)}</h3>
            <p className="text-sm font-semibold text-[#60758a]">{user?.email || 'Conta local'} · {roster.base || 'Base não identificada'}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <a href="/privacy.html" target="_blank" className="rounded-2xl border border-[#d7e4ef] px-4 py-3 text-center text-sm font-black text-[#092846] hover:bg-[#f7fbff]">Privacidade</a>
          <a href="/delete-account.html" target="_blank" className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-center text-sm font-black text-red-700 hover:bg-red-100">Excluir conta</a>
        </div>
      </div>
    </div>
  );
}

function RoutineSettingsCard() {
  const activities = loadRoutineActivities();
  const maxRoutineActivities = 12;
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">configurações de rotina</p>
          <h3 className="text-xl font-black text-[#092846]">Rotina centralizada</h3>
          <p className="mt-1 text-sm leading-6 text-[#60758a]">Limite: {activities.length}/{maxRoutineActivities}. O CrewCheck bloqueia duplicidade por tipo de atividade, salvo quando o tipo for diferente.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activities.slice(0, 6).map((item) => <span key={item.id} className="rounded-full bg-[#eef5fb] px-3 py-1 text-xs font-black text-[#425a72]">{getActivityLabel(item.type)}</span>)}
          {activities.length > 6 && <span className="rounded-full bg-[#eef5fb] px-3 py-1 text-xs font-black text-[#425a72]">+{activities.length - 6}</span>}
        </div>
      </div>
    </div>
  );
}

function ReliabilityCenterCard({ ignoredAlertKeys, onClear }: { ignoredAlertKeys: string[]; onClear: () => void }) {
  return (
    <div className="rounded-[1.25rem] border border-emerald-100 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">central de confiabilidade</p>
          <h3 className="text-xl font-black text-[#092846]">Aprendizado de alertas</h3>
          <p className="mt-1 text-sm leading-6 text-[#60758a]">Alertas que você confirmar como falso positivo deixam de aparecer e ficam registrados como regra local de confiança.</p>
        </div>
        <Button type="button" onClick={onClear} disabled={!ignoredAlertKeys.length} variant="outline" className="rounded-2xl border-emerald-200 text-emerald-700">Limpar aprendizado</Button>
      </div>
      <div className="mt-4 rounded-2xl bg-white/75 p-3 text-sm font-bold text-[#425a72]">{ignoredAlertKeys.length ? `${ignoredAlertKeys.length} regra(s) aprendida(s).` : 'Nenhum falso positivo aprendido ainda.'}</div>
    </div>
  );
}

function ExportSettingsCard({ handleExportCalendar, handleExportPdf, handleSharePdf, handleWhatsAppPdf, handleEmailPdf, handleCopy, handleEmailReport, isSendingEmail }: { handleExportCalendar: (mode?: CalendarExportMode) => void; handleExportPdf: () => void; handleSharePdf: () => void; handleWhatsAppPdf: () => void; handleEmailPdf: () => void; handleCopy: () => void; handleEmailReport: () => void; isSendingEmail: boolean }) {
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">exportações</p>
      <h3 className="mt-1 text-xl font-black text-[#092846]">PDF, ICS e compartilhamento</h3>
      <p className="mt-1 text-sm leading-6 text-[#60758a]">As opções de exportação ficam centralizadas aqui para manter a tela de escala limpa.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Button onClick={() => handleExportCalendar("all")} variant="outline" className="rounded-xl border-[#d8e4ee] text-[#092846]"><Download className="h-4 w-4" /> ICS completo</Button>
        <Button onClick={() => handleExportCalendar("flights")} variant="outline" className="rounded-xl border-[#d8e4ee] text-[#092846]"><Plane className="h-4 w-4" /> Só voos</Button>
        <Button onClick={() => handleExportCalendar("routine")} variant="outline" className="rounded-xl border-[#d8e4ee] text-[#092846]"><Dumbbell className="h-4 w-4" /> Rotina</Button>
        <Button onClick={handleExportPdf} className="rounded-xl bg-[#092846] text-white hover:bg-[#0d365e]"><FileText className="h-4 w-4" /> PDF</Button>
        <Button onClick={handleSharePdf} variant="outline" className="rounded-xl border-emerald-200 text-emerald-700"><Download className="h-4 w-4" /> Compartilhar arquivo</Button>
        <Button onClick={handleWhatsAppPdf} variant="outline" className="rounded-xl border-green-200 text-green-700"><Mail className="h-4 w-4" /> WhatsApp</Button>
        <Button onClick={handleEmailPdf} variant="outline" className="rounded-xl border-blue-200 text-blue-700"><Mail className="h-4 w-4" /> E-mail com PDF</Button>
        <Button onClick={handleCopy} variant="outline" className="rounded-xl border-[#d8e4ee]"><Copy className="h-4 w-4" /> Copiar resumo</Button>
        <Button onClick={handleEmailReport} disabled={isSendingEmail} variant="outline" className="rounded-xl border-violet-200 text-violet-700"><Mail className="h-4 w-4" /> {isSendingEmail ? "Enviando" : "E-mail texto"}</Button>
      </div>
    </div>
  );
}

function SupportSettingsCard() {
  const whatsapp = "https://wa.me/5561996071663?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20no%20CrewCheck.";
  const email = "mailto:suporte@crewcheck.app?subject=Suporte%20CrewCheck&body=Ol%C3%A1%2C%20preciso%20de%20suporte%20no%20CrewCheck.";
  const openSupport = (url: string) => {
    try {
      const nativeBridge = (window as unknown as { CrewCheckNative?: { openExternal?: (target: string) => boolean | void } }).CrewCheckNative;
      if (nativeBridge?.openExternal) {
        nativeBridge.openExternal(url);
        return;
      }
    } catch {}
    try {
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (opened) return;
    } catch {}
    window.location.href = url;
  };
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">suporte</p>
      <h3 className="mt-1 text-xl font-black text-[#092846]">Ajuda e atendimento</h3>
      <p className="mt-1 text-sm leading-6 text-[#60758a]">Abrimos WhatsApp/e-mail fora do CrewCheck, sem gravar mensagem, telefone ou dados pessoais no sistema.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => openSupport(whatsapp)} className="rounded-2xl bg-emerald-600 px-4 py-3 text-center text-sm font-black text-white hover:bg-emerald-700">Abrir WhatsApp</button>
        <button type="button" onClick={() => openSupport(email)} className="rounded-2xl border border-[#d7e4ef] px-4 py-3 text-center text-sm font-black text-[#092846] hover:bg-[#f7fbff]">Enviar e-mail</button>
      </div>
    </div>
  );
}

function SettingsPanel({ roster, gym, load, themeMode, onThemeModeChange, ignoredAlertKeys, onClearIgnoredAlerts, handleExportCalendar, handleExportPdf, handleSharePdf, handleWhatsAppPdf, handleEmailPdf, handleCopy, handleEmailReport, isSendingEmail }: { roster: CrewRoster; gym: GymRecommendation[]; load: LoadAnalysis; themeMode: CrewThemeMode; onThemeModeChange: (mode: CrewThemeMode) => void; ignoredAlertKeys: string[]; onClearIgnoredAlerts: () => void; handleExportCalendar: (mode?: CalendarExportMode) => void; handleExportPdf: () => void; handleSharePdf: () => void; handleWhatsAppPdf: () => void; handleEmailPdf: () => void; handleCopy: () => void; handleEmailReport: () => void; isSendingEmail: boolean }) {
  const [settings, setSettings] = useState<GoogleCalendarSettings>(() => loadGoogleCalendarSettings());
  const [calendars, setCalendars] = useState<GoogleCalendarOption[]>([]);
  const [connected, setConnected] = useState(() => hasGoogleCalendarToken());
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [clientIdOverride, setClientIdOverride] = useState(() => getGoogleClientIdOverride());
  const [feedInfo, setFeedInfo] = useState<{ feedUrl?: string; updatedAt?: string | null; hasContent?: boolean }>({});
  const configured = isGoogleCalendarConfigured();
  const hasEnvClientId = hasGoogleClientIdFromEnv();
  const currentUser = getStoredUser();
  const isAdminUser = isGoogleCalendarAdmin(currentUser);

  useEffect(() => {
    let active = true;
    getCalendarFeedInfo()
      .then((info) => { if (active) setFeedInfo(info); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  function persist(next: GoogleCalendarSettings) {
    const saved = saveGoogleCalendarSettings(next);
    setSettings(saved);
  }

  function handleSaveClientId() {
    saveGoogleClientIdOverride(clientIdOverride);
    toast.success(clientIdOverride.trim() ? 'Google Client ID salvo localmente.' : 'Google Client ID local removido.');
  }

  async function handleConnectAndLoad() {
    if (!configured) {
      toast.error("Agenda automática ainda não está disponível. Conecte sua Conta Google ou use Exportar ICS como alternativa.");
      return;
    }
    setIsLoadingCalendars(true);
    try {
      await connectGoogleCalendar("consent");
      setConnected(true);
      const info = await getCalendarFeedInfo();
      setFeedInfo(info);
      const items = await listGoogleCalendars();
      setCalendars(items);
      const selected = items.find((item) => item.id === settings.selectedCalendarId) || items.find((item) => item.primary) || items[0];
      if (selected) persist({ ...settings, selectedCalendarId: selected.id, selectedCalendarName: selected.summary });
      toast.success("Agenda automática conectado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível conectar ao Agenda automática.");
    } finally {
      setIsLoadingCalendars(false);
    }
  }

  async function handleRefreshCalendars() {
    if (!configured) {
      toast.error("Agenda automática ainda não está disponível. Conecte sua Conta Google ou use Exportar ICS como alternativa.");
      return;
    }
    setIsLoadingCalendars(true);
    try {
      const info = await getCalendarFeedInfo();
      setFeedInfo(info);
      const items = await listGoogleCalendars();
      setConnected(true);
      setCalendars(items);
      toast.success("Calendários carregados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar os calendários.");
    } finally {
      setIsLoadingCalendars(false);
    }
  }

  async function handleSyncNow() {
    if (!configured) {
      toast.error("Agenda automática ainda não está disponível para esta conta. Use Exportar ICS enquanto isso.");
      return;
    }
    setIsSyncing(true);
    try {
      let result;
      try {
        result = await syncRosterToGoogleCalendar(roster, settings, buildGoogleSyncExtras(gym, load));
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (/expirou|401|autorização|autorizacao|token/i.test(message)) {
          toast.info("Reconectando ao Agenda automática para renovar a autorização...");
          await connectGoogleCalendar("consent");
          result = await syncRosterToGoogleCalendar(roster, settings, buildGoogleSyncExtras(gym, load));
        } else {
          throw error;
        }
      }
      sessionStorage.removeItem("crewcheck_auto_sync_pending");
      toast.success(`Agenda automática atualizado: ${result.created} novo(s), ${result.updated} atualizado(s), ${result.deleted} removido(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar Agenda automática.";
      toast.error(`${message} Confira se a conta está conectada, se o calendário permite edição e se o domínio está autorizado no Google Cloud.`);
    } finally {
      setIsSyncing(false);
    }
  }

  const options = calendarOptions(calendars, settings);

  return (
    <div className="crewcheck-routine-premium grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <ProfileAccountCard roster={roster} />
        <LanguageSettingsCard themeMode={themeMode} onThemeModeChange={onThemeModeChange} />
        <RoutineSettingsCard />
        <ReliabilityCenterCard ignoredAlertKeys={ignoredAlertKeys} onClear={onClearIgnoredAlerts} />
        <ExportSettingsCard handleExportCalendar={handleExportCalendar} handleExportPdf={handleExportPdf} handleSharePdf={handleSharePdf} handleWhatsAppPdf={handleWhatsAppPdf} handleEmailPdf={handleEmailPdf} handleCopy={handleCopy} handleEmailReport={handleEmailReport} isSendingEmail={isSendingEmail} />
        <SupportSettingsCard />
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">configurações</p>
              <h3 className="mt-1 text-2xl font-black">Google Calendar sem duplicidade</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758a]">Escolha o calendário que receberá a escala. O CrewCheck marca cada evento com propriedades privadas e, no próximo upload, remove o período anterior antes de recriar a escala atualizada, evitando duplicidade.</p>
            </div>
            <Badge className={`rounded-full border-0 px-3 py-1 ${connected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{connected ? "Conectado" : "Pendente"}</Badge>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-[#d7e4ef] bg-[#f8fbfe] p-4">
              <h4 className="font-black text-[#092846]">1. Conectar Google Calendar</h4>
              <p className="mt-2 text-sm leading-6 text-[#60758a]">Autorize sua Conta Google e carregue seus calendários editáveis. A senha nunca passa pelo CrewCheck.</p>
              {!configured && (
                <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                  {isAdminUser
                    ? <>OAuth Google não configurado neste build. Use <code>VITE_GOOGLE_CLIENT_ID</code> no Render ou cole temporariamente o Client ID abaixo.</>
                    : <>Agenda automática ainda não está disponível para esta conta. Use o link ICS enquanto isso.</>}
                </p>
              )}
              <Button onClick={handleConnectAndLoad} disabled={!configured || isLoadingCalendars} className="mt-4 rounded-xl bg-[#092846] text-white hover:bg-[#0d365e]">
                <RefreshCw className={`h-4 w-4 ${isLoadingCalendars ? "animate-spin" : ""}`} /> {isLoadingCalendars ? "Gerando" : "Conectar Google"}
              </Button>
              {isAdminUser && !hasEnvClientId && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-white p-3">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-amber-800">
                    <Lock className="h-3.5 w-3.5" /> Somente administrador
                  </div>
                  <label className="block text-xs font-black uppercase tracking-[0.12em] text-amber-700">OAuth Client ID local</label>
                  <input
                    value={clientIdOverride}
                    onChange={(event) => setClientIdOverride(event.target.value)}
                    placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
                    className="mt-2 h-11 w-full rounded-xl border border-[#d7e4ef] px-3 text-xs font-semibold text-[#092846] outline-none focus:border-amber-400"
                  />
                  <p className="mt-2 text-xs leading-5 text-amber-800">Use este campo apenas para testar outro Client ID. O padrão já está configurado para o projeto CrewCheck; a senha/chave secreta nunca deve ficar no código.</p>
                  <Button type="button" onClick={handleSaveClientId} variant="outline" className="mt-2 rounded-xl border-amber-200 text-amber-700">Salvar/Limpar Client ID</Button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#d7e4ef] bg-[#f8fbfe] p-4">
              <h4 className="font-black text-[#092846]">2. Escolher calendário</h4>
              <p className="mt-2 text-sm leading-6 text-[#60758a]">Selecione o calendário que receberá os eventos da escala.</p>
              <select value={settings.selectedCalendarId} onChange={(event) => {
                const selected = options.find((item) => item.id === event.target.value);
                persist({ ...settings, selectedCalendarId: event.target.value, selectedCalendarName: selected?.summary || event.target.value });
              }} className="mt-4 h-12 w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
                {options.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " · principal" : ""}</option>)}
              </select>
              <div className="mt-3 rounded-2xl border border-blue-100 bg-white p-3">
                <label className="text-xs font-black uppercase tracking-[0.12em] text-blue-700">Status da conexão</label>
                <input readOnly value={feedInfo.feedUrl || 'Toque em Conectar Google para criar sua assinatura ICS'} className="mt-2 h-11 w-full rounded-xl border border-[#d7e4ef] bg-[#f8fbfe] px-3 text-xs font-bold text-[#092846]" />
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Button type="button" onClick={() => feedInfo.feedUrl ? navigator.clipboard.writeText(feedInfo.feedUrl).then(() => toast.success('Status copiado.')).catch(() => toast.error('Não consegui copiar o link.')) : toast.info('Gere o link primeiro.')} variant="outline" className="rounded-xl border-blue-200 text-blue-700"><Copy className="h-4 w-4" /> Copiar status</Button>
                  {feedInfo.feedUrl && <a href={feedInfo.feedUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-600 px-3 text-sm font-black text-white hover:bg-blue-700">Google</a>}
                </div>
              </div>
              <Button onClick={handleRefreshCalendars} disabled={!configured || isLoadingCalendars} variant="outline" className="mt-3 rounded-xl border-blue-200 text-blue-700"><RefreshCw className={`h-4 w-4 ${isLoadingCalendars ? "animate-spin" : ""}`} /> Atualizar calendários</Button>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[#d7e4ef] bg-[#f8fbfe] p-4">
            <h4 className="font-black text-[#092846]">3. O que sincronizar/exportar</h4>
            <p className="mt-2 text-sm leading-6 text-[#60758a]">Escolha se o Google Calendar receberá tudo, somente voos, academia ou rotina inteligente.</p>
            <select value={settings.exportMode || "all"} onChange={(event) => persist({ ...settings, exportMode: event.target.value as GoogleCalendarSyncMode })} className="mt-4 h-12 w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
              <option value="all">Tudo · escala, voos, atividades, folgas, academia e rotina</option>
              <option value="flights">Voos · somente etapas de voo</option>
              <option value="gym">Academia · recomendações de treino</option>
              <option value="routine">Rotina · treino, estudo, faculdade e compromissos</option>
            </select>
          </div>

          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <label className="flex cursor-pointer items-start gap-3 text-sm font-bold text-[#092846]">
              <input type="checkbox" checked={settings.autoSync} onChange={(event) => persist({ ...settings, autoSync: event.target.checked })} className="mt-1 h-4 w-4 rounded border-blue-300" />
              <span><strong>Sincronizar automaticamente via Google Calendar após cada upload de escala.</strong><br /><span className="font-medium text-[#60758a]">Quando uma nova escala for importada, o CrewCheck limpa o período anterior e cria os eventos atualizados no calendário selecionado.</span></span>
            </label>
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Atualizar ICS agora</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">Atualiza o link ICS usando o filtro: <b>{googleSyncModeLabel(settings.exportMode || "all")}</b>. Eventos que não existem mais nesse filtro são removidos para não sobrar duplicidade.</p>
          <Button onClick={handleSyncNow} disabled={!configured || isSyncing} className="mt-4 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700">
            <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} /> {isSyncing ? "Sincronizando" : "Atualizar calendários ICS"}
          </Button>
        </div>
        <div className="rounded-[1.25rem] border border-emerald-100 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">
          <h3 className="font-black">Como funciona sem autorização Google</h3>
          <p className="mt-2">O link ICS é sempre o mesmo. A cada nova escala, o CrewCheck substitui o conteúdo do link. O Google/Outlook/Apple Calendar leem esse link e atualizam os eventos periodicamente.</p>
        </div>
      </aside>
    </div>
  );
}


function googleSyncModeLabel(mode: GoogleCalendarSyncMode): string {
  if (mode === 'flights') return 'Voos';
  if (mode === 'gym') return 'Academia';
  if (mode === 'routine') return 'Rotina';
  return 'Tudo';
}

function buildGoogleSyncExtras(gym: GymRecommendation[], load: LoadAnalysis) {
  return {
    gymRecommendations: gym,
    routineSuggestions: buildRoutineSuggestions(load.days, loadRoutineActivities()),
  };
}

function calendarOptions(calendars: GoogleCalendarOption[], settings: GoogleCalendarSettings): GoogleCalendarOption[] {
  const map = new Map<string, GoogleCalendarOption>();
  map.set(settings.selectedCalendarId || "primary", { id: settings.selectedCalendarId || "primary", summary: settings.selectedCalendarName || "Calendário principal" });
  map.set("primary", { id: "primary", summary: "Calendário principal", primary: true, accessRole: "owner" });
  for (const calendar of calendars) map.set(calendar.id, calendar);
  return Array.from(map.values());
}

function isGoogleCalendarAdmin(user: ReturnType<typeof getStoredUser>): boolean {
  return isCrewCheckAdmin(user);
}

function isCrewCheckAdmin(user: ReturnType<typeof getStoredUser>): boolean {
  const role = normalize(user?.role || '');
  const email = normalize(user?.email || '');
  return ['admin', 'administrator', 'master', 'owner', 'suporte', 'support', 'admin'].includes(role) || email === 'suporte@crewcheck.app' || email === normalize(import.meta.env.VITE_CREWCHECK_ADMIN_EMAIL || '');
}

function getUserFacingCompliance(compliance: ComplianceResult, isAdminUser: boolean, ignoredAlertKeys: string[] = [], roster?: CrewRoster | null): ComplianceResult {
  const ignored = new Set(ignoredAlertKeys);
  const baseAlerts = compliance.alerts
    .filter((alert) => !ignored.has(alertLearningKey(alert)))
    .filter((alert) => !isActivationMinimumFalsePositiveAlert(alert, roster));
  const alerts = isAdminUser ? baseAlerts : baseAlerts.filter((alert) => !isTechnicalCodeAlert(alert));
  const hasError = alerts.some((alert) => alert.severity === 'error');
  const hasWarning = alerts.some((alert) => alert.severity === 'warning');
  return {
    ...compliance,
    alerts,
    overallStatus: hasError ? 'violation' : hasWarning ? 'warning' : 'compliant',
    score: hasError ? Math.min(compliance.score, 69) : hasWarning ? Math.min(compliance.score, 84) : Math.max(compliance.score, 90),
    summary: alerts.length === 0 ? 'Nenhuma irregularidade automática encontrada. Alertas técnicos internos não aparecem para o usuário final.' : compliance.summary,
  };
}

function isActivationMinimumFalsePositiveAlert(alert: ComplianceResult['alerts'][number], roster?: CrewRoster | null): boolean {
  const text = normalize(`${alert.title} ${alert.description} ${alert.details || ''}`);
  if (!/\b(sobreaviso|reserva)\b/.test(text) || !/\babaixo de 3 horas\b|\bminimo 3h\b|\bminimo: 3h\b/.test(text)) return false;
  const alertDate = String(alert.date || '').trim();
  if (!alertDate || !roster?.days?.length) return false;
  const sameDate = roster.days.filter((day) => day.date === alertDate);
  if (!sameDate.length) return false;
  const hasReserve = sameDate.some((day) => /^(ASB|RES)$/i.test(String(day.type || day.pairingCode || '')) || /\b(ASB|RESERVA)\b/i.test(`${day.rawText || ''} ${day.pairingCode || ''}`));
  const hasStandby = sameDate.some((day) => /^(HSB|HSBE)$/i.test(String(day.type || day.pairingCode || '')) || /\b(HSB|HSBE|SOBREAVISO)\b/i.test(`${day.rawText || ''} ${day.pairingCode || ''}`));
  const hasFlightOrActivation = sameDate.some((day) => (day.legs || []).length > 0 || /\b(LA\s*\d{3,4}|PS|EXTRA|ACION|CHAMAD|CALL\s*OUT|VOO)\b/i.test(`${day.rawText || ''} ${day.pairingCode || ''}`));
  return (hasStandby && (hasReserve || hasFlightOrActivation)) || (hasReserve && hasFlightOrActivation);
}

function isTechnicalCodeAlert(alert: ComplianceResult['alerts'][number]): boolean {
  const text = normalize(`${alert.title} ${alert.description} ${alert.details || ''} ${alert.legalReference || ''}`);
  return text.includes('siglas nao classificadas')
    || text.includes('sigla') && text.includes('nao entram no calculo')
    || text.includes('glossario crewcheck')
    || text.includes('unknown code');
}


function alertLearningKey(alert: ComplianceResult['alerts'][number]): string {
  return normalize(`${alert.title}|${alert.date || ''}|${alert.legalReference || ''}`);
}

function loadIgnoredAlertKeys(): string[] {
  try {
    const raw = localStorage.getItem('crewcheck_false_positive_alerts_v1');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function saveIgnoredAlertKeys(keys: string[]): void {
  try {
    localStorage.setItem('crewcheck_false_positive_alerts_v1', JSON.stringify(keys.slice(-250)));
  } catch {
    // Sem armazenamento local disponível.
  }
}

function isCrewCheckAppMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('app') === '1' || params.get('android') === '1') {
      window.localStorage.setItem('crewcheck_app_mode', '1');
      return true;
    }
    return window.localStorage.getItem('crewcheck_app_mode') === '1';
  } catch {
    return false;
  }
}

function loadCrewThemeMode(): CrewThemeMode {
  try {
    const saved = localStorage.getItem('crewcheck_theme_mode');
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system';
  }
}

function saveCrewThemeMode(mode: CrewThemeMode): void {
  try { localStorage.setItem('crewcheck_theme_mode', mode); } catch {}
}

function getEffectiveCrewTheme(mode: CrewThemeMode): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  try { return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch { return 'light'; }
}

function applyCrewThemeMode(mode: CrewThemeMode): void {
  try {
    const effective = getEffectiveCrewTheme(mode);
    document.documentElement.dataset.crewTheme = effective;
    document.documentElement.dataset.crewThemeMode = mode;
  } catch {}
}

function ManualPanel() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">manual do sistema</p>
          <h3 className="mt-1 text-2xl font-black">Como usar o CrewCheck</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758a]">Carregue o PDF da escala, confira os cartões interpretados, salve o histórico e use a sincronização Agenda automática para manter a agenda atualizada sem eventos repetidos.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <ManualStep title="1. Enviar escala" text="Na tela inicial, toque em Carregar PDF. O CrewCheck lê dados do tripulante, base, função, voos, reservas, folgas, treinamentos e observações." />
            <ManualStep title="2. Conferir leitura" text="Use a aba My Roster para verificar dias, horários e rotas. Programações contínuas são concatenadas para reduzir duplicidade visual." />
            <ManualStep title="3. Irregularidades" text="A aba Irregularidades separa violação confirmada, ponto de atenção e leitura incerta. Sempre confira a escala oficial antes de decisão formal." />
            <ManualStep title="4. Rotina inteligente" text="Cadastre treino, estudo, faculdade e compromissos. O sistema sugere janelas considerando carga, repouso, pernoites e madrugadas." />
            <ManualStep title="5. Agenda automática" text="Vá em Configurações, conecte o Google, escolha o calendário e ative sincronização automática após upload." />
            <ManualStep title="6. Histórico" text="Salve escalas para acompanhar estatísticas e recuperar análises anteriores. O app mantém pendências offline e sincroniza quando possível." />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href="/manual.html" target="_blank" className="rounded-2xl bg-[#092846] px-4 py-3 text-sm font-black text-white hover:bg-[#0d365e]">Abrir manual completo</a>
            <a href="/privacy.html" target="_blank" className="rounded-2xl border border-[#d7e4ef] px-4 py-3 text-sm font-black text-[#092846] hover:bg-[#f7fbff]">Privacidade</a>
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Regras de privacidade</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">O CrewCheck usa os dados da escala apenas para análise, histórico e exportações solicitadas. Tokens Google ficam no navegador e podem expirar; reconecte quando necessário.</p>
        </div>
        <div className="rounded-[1.25rem] border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <h3 className="font-black">Aviso operacional</h3>
          <p className="mt-2">A leitura automática ajuda na organização, mas não substitui a publicação oficial da escala, ACT, CCT, RBAC 117 ou validação do setor responsável.</p>
        </div>
      </aside>
    </div>
  );
}

function ManualStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[#d7e4ef] bg-[#f8fbfe] p-4">
      <h4 className="font-black text-[#092846]">{title}</h4>
      <p className="mt-2 text-sm leading-6 text-[#60758a]">{text}</p>
    </div>
  );
}

function IrregularitiesPanel({ compliance, errors, warnings, onOpenAlert }: { compliance: ComplianceResult; errors: ComplianceResult['alerts']; warnings: ComplianceResult['alerts']; onOpenAlert: (alert: ComplianceResult['alerts'][number]) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <ScoreCard title="Regulamentação" value={`${compliance.score}/100`} icon={ShieldCheck} tone={compliance.score >= 85 ? "#15963a" : compliance.score >= 70 ? "#f97316" : "#dc2626"} description="Nota de conformidade automática." />
          <ScoreCard title="Irregularidades" value={String(errors.length)} icon={AlertTriangle} tone="#dc2626" description="Alertas críticos encontrados." />
          <ScoreCard title="Pontos de atenção" value={String(warnings.length)} icon={Sparkles} tone="#f97316" description="Itens que exigem revisão." />
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="text-xl font-black">Irregularidades e alertas</h3><p className="mt-1 text-sm text-[#60758a]">Baseado em parâmetros regulatórios e operacionais configurados, com foco em jornada, repouso, sobreaviso, reserva e acionamentos.</p></div></div>
          {compliance.alerts.length === 0 ? (
            <div className="rounded-2xl bg-emerald-50 p-5 text-emerald-800"><CheckCircle2 className="mb-2 h-6 w-6" /><b>Nenhuma irregularidade automática encontrada.</b><p className="mt-1 text-sm">Ainda assim, revise ACT/CCT, escalas publicadas e eventuais extensões operacionais.</p></div>
          ) : (
            <div className="space-y-3">
              {compliance.alerts.map((alert) => <AlertCard key={alert.id} alert={alert} onOpen={() => onOpenAlert(alert)} />)}
            </div>
          )}
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-sky-100 bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">ACT aplicada</h3>
          <p className="mt-2 text-sm font-bold text-[#092846]">{compliance.legalProfile.roleLabel} · {compliance.legalProfile.functionLabel}</p>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">{compliance.legalProfile.actName}. {compliance.legalProfile.inferenceReason}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <MiniMetric label="Voo 28d" value={`${compliance.legalProfile.flightLimit28Days}h`} />
            <MiniMetric label="Voo 365d" value={`${compliance.legalProfile.flightLimit365Days}h`} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {compliance.legalProfile.sourceFiles.map((source) => <a key={source} href={source} target="_blank" className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700 hover:bg-sky-100">Abrir ACT</a>)}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Bases verificadas</h3>
          <div className="mt-4 space-y-3 text-sm text-[#425a72]">
            <LegalLine title="ACT correta por função" text="Detecta comissário ou piloto pelo código/cargo da escala e permite seleção manual na tela inicial." />
            <LegalLine title="Repouso mínimo" text="12h, 16h ou 24h conforme jornada anterior, com atenção ao +1h do ACT em jornada simples acima de 10h." />
            <LegalLine title="Solo entre etapas" text="Máximo de 180min no período diurno e 120min no período noturno." />
            <LegalLine title="Horas de voo" text="90h/28d e 900h/365d em A32F/Embraer; 100h/28d e 1000h/365d em Wide Body." />
            <LegalLine title="Madrugadas" text="2 consecutivas e 4 em janela móvel de 168h, com reset após 48h livres." />
            <LegalLine title="Sobreaviso/reserva" text="Sobreaviso 3h–12h e até 8 mensais; reserva em local de trabalho 3h–6h; quando houver acionamento, destaca SAV + jornada." />
            <LegalLine title="Jornada semanal" text="Alerta de 44h em janela móvel de 7 dias e 176h mensais, com leitura cautelosa de horários." />
            <LegalLine title="Pontos operacionais" text="PNAE/POB, NOTOC/DG, POC, DEPA/DEPU, animal em cabine, abastecimento com pax e ocorrência médica entram como lembretes de apoio, sem gerar irregularidade automática." />
            <LegalLine title="SGSO e reportes" text="Inclui lembretes de Safety Alert, MOR/ASR e ações após incidente/acidente quando termos aparecem na escala ou no texto importado." />
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-red-100 bg-red-50 p-5 text-sm leading-6 text-red-900">
          <h3 className="font-black">Importante</h3>
          <p className="mt-2">O sistema separa “irregularidade confirmada”, “ponto de atenção” e “leitura incerta”. Os alertas operacionais são lembretes de apoio e não substituem norma vigente, briefing, NOTOC, procedimento oficial, ANAC ou orientação da empresa.</p>
        </div>
      </aside>
    </div>
  );
}


function RoutinePanel({ gym, load }: { gym: GymRecommendation[]; load: LoadAnalysis }) {
  const [activities, setActivities] = useState<RoutineActivityConfig[]>(() => loadRoutineActivities());
  const [draft, setDraft] = useState<RoutineActivityConfig>(() => makeDraftRoutineActivity('musculacao'));
  const suggestions = useMemo(() => buildRoutineSuggestions(load.days, activities), [load.days, activities]);
  const routineSuggestions = suggestions.filter(isRoutineActivitySuggestion);
  const recoverySuggestions = suggestions.filter(isRecoverySuggestion);
  const mealSuggestions = suggestions.filter(isMealSuggestion);
  const physicalSuggestions = routineSuggestions.filter((item) => isPhysicalActivity(item.activityType));
  const cognitiveSuggestions = routineSuggestions.filter((item) => !isPhysicalActivity(item.activityType));
  const highConfidence = suggestions.filter((item) => item.confidence === 'alta').length;
  const protectedWindows = suggestions.filter((item) => item.protectedWindow).length;

  function updateActivities(next: RoutineActivityConfig[]) {
    setActivities(next);
    localStorage.setItem('crewcheck_routine_activities_v1', JSON.stringify(next));
  }

  function handleTypeChange(type: RoutineActivityType) {
    const duration = getActivityDefaultDuration(type);
    setDraft((current) => ({
      ...current,
      type,
      name: getActivityLabel(type),
      durationMinutes: duration,
      intensity: getActivityDefaultIntensity(type),
    }));
  }

  function addActivity() {
    const maxRoutineActivities = 12;
    const normalized = {
      ...draft,
      id: `${draft.type}-${Date.now()}`,
      name: draft.name.trim() || getActivityLabel(draft.type),
      durationMinutes: Math.max(15, Math.min(240, Number(draft.durationMinutes) || 60)),
      frequencyPerWeek: Math.max(1, Math.min(7, Number(draft.frequencyPerWeek) || 1)),
    };
    const duplicateSameType = activities.some((item) => item.type === normalized.type);
    if (duplicateSameType) {
      toast.error(`Rotina de ${getActivityLabel(normalized.type)} já existe. Para evitar duplicidade, remova ou edite a atividade atual.`);
      return;
    }
    if (activities.length >= maxRoutineActivities) {
      toast.error(`Limite de ${maxRoutineActivities} rotinas atingido. Remova uma rotina antes de adicionar outra.`);
      return;
    }
    updateActivities([...activities, normalized]);
    setDraft(makeDraftRoutineActivity(draft.type));
    toast.success(`Rotina criada: ${normalized.name}.`);
  }

  function removeActivity(id: string) {
    updateActivities(activities.filter((item) => item.id !== id));
  }

  function resetDefaults() {
    updateActivities(defaultRoutineActivities());
    setDraft(makeDraftRoutineActivity('musculacao'));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">rotina adaptada à escala</p>
              <h3 className="mt-1 text-2xl font-black">Rotina Reliable · treino, estudo e recuperação</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#60758a]">Configure duração, intensidade e tipo de atividade. O CrewCheck cruza folgas, pernoites, madrugadas, repouso antes/depois, reserva, sobreaviso, alimentação e deslocamento para sugerir apenas janelas prudentes e auditáveis.</p>
            </div>
            <button onClick={resetDefaults} className="rounded-2xl border border-[#d7e4ef] px-4 py-2 text-sm font-black text-[#092846] hover:bg-[#f7fbff]">Restaurar padrão</button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ScoreCard title="Atividades" value={String(activities.length)} icon={Activity} tone="#2563eb" description="configuradas" />
            <ScoreCard title="Rotina" value={String(routineSuggestions.length)} icon={Clock} tone="#15963a" description="sem choque de horários" />
            <ScoreCard title="Recuperação" value={String(recoverySuggestions.length)} icon={Moon} tone="#7c3aed" description="separada das atividades" />
            <ScoreCard title="Alimentação" value={String(mealSuggestions.length)} icon={Coffee} tone="#f59e0b" description="janelas e diárias" />
            <ScoreCard title="Janelas seguras" value={String(protectedWindows)} icon={ShieldCheck} tone="#0f766e" description="bloqueio de escala aplicado" />
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Adicionar atividade</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1.5 text-xs font-bold text-[#61778e] xl:col-span-2">Tipo
              <select value={draft.type} onChange={(e) => handleTypeChange(e.target.value as RoutineActivityType)} className="w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 py-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
                <option value="musculacao">Musculação</option>
                <option value="corrida">Corrida</option>
                <option value="caminhada">Caminhada</option>
                <option value="crossfit">Crossfit</option>
                <option value="estudo">Estudo</option>
                <option value="faculdade">Faculdade</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-bold text-[#61778e] xl:col-span-2">Nome
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 py-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400" placeholder="Ex.: Musculação A" />
            </label>
            <label className="space-y-1.5 text-xs font-bold text-[#61778e]">Frequência/semana
              <select value={draft.frequencyPerWeek} onChange={(e) => setDraft({ ...draft, frequencyPerWeek: Number(e.target.value) })} className="w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 py-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
                {[1,2,3,4,5,6,7].map((n) => <option key={n} value={n}>{n}x</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-bold text-[#61778e]">Período
              <select value={draft.preferredPeriod} onChange={(e) => setDraft({ ...draft, preferredPeriod: e.target.value as RoutinePeriod })} className="w-full rounded-2xl border border-[#d7e4ef] bg-white px-3 py-3 text-sm font-bold text-[#092846] outline-none focus:border-blue-400">
                <option value="qualquer">Qualquer</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <p className="mb-2 text-xs font-bold text-[#61778e]">Duração</p>
              <div className="flex flex-wrap gap-2">
                {[45,60,120].map((duration) => <button key={duration} onClick={() => setDraft({ ...draft, durationMinutes: duration })} className={`rounded-full px-4 py-2 text-sm font-black ${draft.durationMinutes === duration ? 'bg-[#092846] text-white' : 'bg-[#eef5fb] text-[#425a72]'}`}>{duration === 60 ? '1h' : duration === 120 ? '2h' : '45min'}</button>)}
                <input type="number" min={15} max={240} value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })} className="w-24 rounded-full border border-[#d7e4ef] px-3 py-2 text-center text-sm font-black" />
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-[#61778e]">Intensidade</p>
              <div className="flex flex-wrap gap-2">
                {(['baixa','moderada','alta'] as RoutineIntensity[]).map((intensity) => <button key={intensity} onClick={() => setDraft({ ...draft, intensity })} className={`rounded-full px-4 py-2 text-sm font-black capitalize ${draft.intensity === intensity ? 'bg-blue-600 text-white' : 'bg-[#eef5fb] text-[#425a72]'}`}>{intensity}</button>)}
              </div>
            </div>
            <Button onClick={addActivity} className="h-12 rounded-2xl bg-[#092846] px-6 text-white hover:bg-[#0d365e]"><Plus className="h-4 w-4" /> Adicionar</Button>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Plano reliable de atividades</h3>
          <p className="mt-1 text-sm leading-6 text-[#60758a]">Cada card só entra quando cabe inteiro em uma janela livre, com margem antes/depois de voo, reserva, sobreaviso, treinamento, alimentação e recuperação.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {routineSuggestions.map((item) => <RoutineCard key={item.id} item={item} />)}
            {!routineSuggestions.length && <p className="rounded-2xl bg-[#f7fbff] p-4 text-sm text-[#60758a]">Configure pelo menos uma atividade para gerar a rotina.</p>}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-600">descanso protegido</p>
              <h3 className="text-xl font-black">Recuperação sem misturar com treino</h3>
              <p className="mt-1 text-sm leading-6 text-[#60758a]">Descanso aparece como recomendação de recuperação, não como atividade. Ele usa outra cor, outro ícone e nunca ocupa o mesmo horário de treino, estudo ou compromisso.</p>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-violet-700 shadow-sm">{recoverySuggestions.length} janelas</span>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recoverySuggestions.map((item) => <RoutineCard key={item.id} item={item} />)}
            {!recoverySuggestions.length && <p className="rounded-2xl bg-white/70 p-4 text-sm text-[#60758a]">Nenhuma recuperação extra foi necessária nesta escala.</p>}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Atividades configuradas</h3>
          <div className="mt-4 space-y-2">
            {activities.map((activity) => <div key={activity.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f7fbff] p-3">
              <div className="min-w-0"><p className="truncate font-black text-[#092846]">{activity.name}</p><p className="text-xs font-semibold text-[#60758a]">{getActivityLabel(activity.type)} · {activity.durationMinutes}min · {activity.intensity} · {activity.frequencyPerWeek}x/sem</p></div>
              <button onClick={() => removeActivity(activity.id)} className="rounded-xl p-2 text-red-500 hover:bg-red-50" aria-label="Remover atividade"><Trash2 className="h-4 w-4" /></button>
            </div>)}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Resumo por tipo</h3>
          <div className="mt-4 grid gap-2">
            <MiniMetric label="Treinos físicos" value={String(physicalSuggestions.length)} />
            <MiniMetric label="Estudo/faculdade" value={String(cognitiveSuggestions.length)} />
            <MiniMetric label="Recuperação" value={String(recoverySuggestions.length)} />
            <MiniMetric label="Alimentação" value={String(mealSuggestions.length)} />
            <MiniMetric label="Alta intensidade" value={String(routineSuggestions.filter((i) => i.intensity === 'alta').length)} />
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-amber-100 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          <h3 className="font-black">Trust rules da rotina</h3>
          <p className="mt-2">Crossfit, corrida forte e musculação pesada são reduzidos automaticamente em dias com madrugada, repouso curto, jornada pesada ou apresentação cedo. Descanso e alimentação ficam em blocos próprios, com trava anti-sobreposição para não bater com atividades.</p>
        </div>
      </aside>
    </div>
  );
}

function RoutineCard({ item }: { item: RoutineSuggestion }) {
  const recovery = isRecoverySuggestion(item);
  const meal = isMealSuggestion(item);
  const colors = meal
    ? { bg: '#fff7ed', fg: '#d97706', border: 'border-amber-100', card: 'bg-white' }
    : recovery
    ? { bg: '#f3e8ff', fg: '#7c3aed', border: 'border-violet-100', card: 'bg-white' }
    : item.suitability === 'ideal' ? { bg: '#e9f8ee', fg: '#15963a', border: 'border-emerald-100', card: 'bg-[#fbfdff]' }
    : item.suitability === 'boa' ? { bg: '#eaf2ff', fg: '#2563eb', border: 'border-blue-100', card: 'bg-[#fbfdff]' }
    : item.suitability === 'moderada' ? { bg: '#fff7ed', fg: '#ea580c', border: 'border-orange-100', card: 'bg-[#fbfdff]' }
    : { bg: '#fee2e2', fg: '#b91c1c', border: 'border-red-100', card: 'bg-[#fbfdff]' };
  const Icon = meal ? Coffee : recovery ? Moon : isPhysicalActivity(item.activityType) ? Dumbbell : BookOpen;
  return (
    <div className={`cc-routine-card rounded-2xl border ${colors.border} ${colors.card} p-4 shadow-[0_10px_26px_rgba(20,54,84,0.05)]`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase text-[#60758a]">{item.dayOfWeek}</p><h4 className="text-lg font-black">{item.date}</h4></div>
        <span className="cc-routine-score-badge cc-premium-score-badge rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: colors.bg, color: colors.fg }}>{meal ? 'alimentação' : recovery ? 'recuperação' : `${item.score}/100`}</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm font-black text-[#092846]"><Icon className="h-4 w-4" /> {item.activityName}</div>
      <p className="mt-1 text-sm font-bold text-[#425a72]">{item.startTime}–{item.endTime} · {item.durationMinutes}min {meal ? '· janela protegida' : recovery ? '· sono/recuperação' : `· intensidade ${item.intensity}`}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="cc-routine-pill rounded-full px-2 py-1 text-xs font-black">{meal ? 'diária/refeição' : recovery ? 'descanso protegido' : item.suitability}</span>
        <span className="cc-routine-pill rounded-full px-2 py-1 text-xs font-black">confiança {item.confidence}</span>
        <span className="cc-routine-pill rounded-full px-2 py-1 text-xs font-black">{meal ? 'Alimentação' : recovery ? 'Recuperação' : getActivityLabel(item.activityType)}</span>
        {item.protectedWindow && <span className="cc-routine-pill cc-routine-pill-safe rounded-full px-2 py-1 text-xs font-black">sem choque</span>}
      </div>
      <p className="mt-2 text-sm leading-6 text-[#60758a]">{item.reason}</p>
      <p className="mt-2 text-xs leading-5 text-amber-700"><b>{meal ? 'Regra:' : recovery ? 'Orientação:' : 'Cuidado:'}</b> {item.caution}</p>
    </div>
  );
}

function loadRoutineActivities(): RoutineActivityConfig[] {
  try {
    const raw = localStorage.getItem('crewcheck_routine_activities_v1');
    if (!raw) return defaultRoutineActivities();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : defaultRoutineActivities();
  } catch {
    return defaultRoutineActivities();
  }
}

function makeDraftRoutineActivity(type: RoutineActivityType): RoutineActivityConfig {
  return { id: `draft-${type}`, type, name: getActivityLabel(type), durationMinutes: getActivityDefaultDuration(type), intensity: getActivityDefaultIntensity(type), frequencyPerWeek: 2, preferredPeriod: 'qualquer' };
}

function GymPanel({ gym, load }: { gym: GymRecommendation[]; load: LoadAnalysis }) {
  const best = gym.filter((item) => item.priority !== "low");
  const limited = gym.filter((item) => item.priority === "low");
  const layoverDays = load.days.filter((day) => day.type === "LAYOVER");
  const formalRestDays = load.days.filter((day) => day.isDayOff);
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Análise completa para academia</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">A recomendação agora considera a escala inteira: voos, madrugadas, repouso antes/depois, pernoites/inativos, OFF e folgas formais. A ideia é proteger sono e recuperação antes de sugerir treino pesado.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ScoreCard title="Treino viável" value={String(best.length)} icon={CheckCircle2} tone="#15963a" description="Dias bons ou moderados." />
            <ScoreCard title="Pernoites" value={String(layoverDays.length)} icon={BedDouble} tone="#e0a000" description="Avaliados com cautela." />
            <ScoreCard title="Folgas" value={String(formalRestDays.length)} icon={House} tone="#2f80ed" description="Melhores janelas." />
          </div>
        </div>
        <RecommendationBlock title="Melhores janelas para treinar" items={best} empty="Não encontrei dias ideais; priorize descanso e treinos curtos." />
        <RecommendationBlock title="Dias para evitar carga alta" items={limited} empty="Nenhum dia crítico para treino foi identificado." compact />
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Leitura por dia</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {load.days.map((day) => <LoadCard key={`gym-load-${day.date}`} day={day} compact />)}
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Como o sistema escolhe</h3>
          <div className="mt-4 space-y-3 text-sm text-[#425a72]">
            <LegalLine title="Folga formal" text="DO, DR, DOF, DOP e VC são os melhores dias para treino completo, desde que a jornada anterior não tenha sido muito pesada." />
            <LegalLine title="OFF" text="Extensão de descanso: bom para treino moderado, mas não trato como folga formal mensal." />
            <LegalLine title="Pernoite/inativo" text="Analisa hotel/localidade e carga anterior; em chegada pesada, sugere mobilidade em vez de musculação forte." />
            <LegalLine title="Voo e madrugada" text="Quanto mais trechos, maior jornada, início cedo, término tarde ou madrugada, menor a prioridade para treino pesado." />
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Regra prática</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758a]">Priorize treino completo em folgas formais. Em pernoite, faça treino curto/moderado. Após madrugada, jornada longa ou repouso justo, prefira alongamento, mobilidade, caminhada leve e sono.</p>
        </div>
      </aside>
    </div>
  );
}


function FatiguePanel({ load, compliance }: { load: LoadAnalysis; compliance: ComplianceResult }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <ScoreCard title="Nota de puxada" value={`${load.intensityScore}/100`} icon={Gauge} tone="#f97316" description={load.grade} />
          <ScoreCard title="Score legal" value={`${compliance.score}/100`} icon={ShieldCheck} tone="#2f80ed" description="Quanto maior, melhor." />
          <ScoreCard title="Repouso médio" value={`${compliance.metrics.averageTurnaround.toFixed(1)}h`} icon={Moon} tone="#7c3aed" description="Entre jornadas calculadas." />
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Dias mais puxados</h3>
          <p className="mt-1 text-sm text-[#60758a]">Ordenados por jornada, voos, trechos, madrugada, início cedo, término tarde e repouso.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {load.hardestDays.map((day) => <LoadCard key={day.date} day={day} />)}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black">Dias mais leves</h3>
          <p className="mt-1 text-sm text-[#60758a]">Melhores candidatos para academia, compromissos pessoais e recuperação ativa.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {load.easiestDays.map((day) => <LoadCard key={day.date} day={day} compact />)}
          </div>
        </div>
      </section>
      <aside className="space-y-4">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Resumo de fadiga</h3>
          <p className="mt-3 text-sm leading-6 text-[#60758a]">{load.summary}</p>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#e6edf4]"><div className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" style={{ width: `${load.intensityScore}%` }} /></div>
          <div className="mt-2 flex justify-between text-xs font-bold text-[#60758a]"><span>leve</span><span>muito puxada</span></div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-lg font-black">Sugestões minhas</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-[#425a72]">
            <li>• Adicionar configuração de ACT/CCT e tipo de tripulação para reduzir falsos positivos.</li>
            <li>• Criar histórico mensal para comparar se a escala está ficando mais pesada.</li>
            <li>• Incluir botão “contestação/observação” gerando relatório com base legal.</li>
            <li>• Permitir ajuste de preferência de treino: força, cardio, mobilidade ou descanso.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}


function MobileSideDrawer({ open, activeView, displayName, rank, base, errors, canAccessAdmin, onClose, onChange, onOpenHomeView, onNewRoster, onPowerOff }: { open: boolean; activeView: ViewKey; displayName: string; rank: string; base: string; errors: number; canAccessAdmin: boolean; onClose: () => void; onChange: (view: ViewKey) => void; onOpenHomeView: (view: string) => void; onNewRoster: () => void; onPowerOff: () => void }) {
  const nav: Array<{ key: ViewKey; label: string; caption: string; icon: LucideIcon; badge?: number }> = [
    { key: 'summary', label: 'Resumo', caption: 'visão limpa', icon: LayoutDashboard },
    { key: 'roster', label: 'Minha escala', caption: 'agenda por dia', icon: CalendarDays },
    { key: 'alerts', label: 'Alertas', caption: 'somente avisos', icon: Bell, badge: errors },
    { key: 'irregularities', label: 'Regulamentação', caption: 'jornada e limites', icon: ShieldAlert, badge: errors },
    { key: 'gym', label: 'Rotina', caption: 'treino e estudo', icon: Dumbbell },
    { key: 'fatigue', label: 'Carga da escala', caption: 'fadiga e descanso', icon: Gauge },
    { key: 'statistics', label: 'Histórico', caption: 'escalas salvas', icon: BarChart3 },
    { key: 'settings', label: 'Ajustes da escala', caption: 'exportações e relatório', icon: Settings },
      ];
  const extraNav: Array<{ view: string; label: string; caption: string; icon: LucideIcon }> = [
    { view: 'home', label: 'Cockpit', caption: 'tela inicial', icon: Home },
    { view: 'settings', label: 'Configurações completas', caption: 'conta, Telegram e Premium', icon: Settings },
    { view: 'departure', label: 'Saída inteligente', caption: 'Maps · Uber/99', icon: Clock },
    ...(canAccessAdmin ? [{ view: 'iflight', label: 'iFlight Admin', caption: 'admin', icon: Plane }] : []),
    { view: 'perdiem', label: 'Diárias', caption: 'valores previstos', icon: Coffee },
    { view: 'salary', label: 'Salário', caption: 'prévia mensal', icon: BriefcaseBusiness },
    { view: 'flightboard', label: 'Radar', caption: 'status e portão', icon: Gauge },
  ];
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] lg:hidden">
      <button className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-label="Fechar menu" />
      <aside className="absolute left-0 top-0 flex h-full w-[86vw] max-w-sm flex-col bg-[#071f38] p-4 text-white shadow-2xl">
        <button onClick={() => onChange('settings')} className="mb-4 flex items-center gap-3 rounded-3xl bg-white/8 p-3 text-left">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-[#071f38] font-black">{initials(displayName)}</div>
          <div className="min-w-0"><p className="truncate text-base font-black">{titleCase(displayName)}</p><p className="truncate text-xs text-cyan-100/70">{rank} · {base} · Perfil</p></div>
        </button>
        <nav className="flex-1 space-y-2 overflow-y-auto pr-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeView;
            return (
              <button key={item.key} onClick={() => onChange(item.key)} className={`relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${active ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-cyan-50/80 hover:bg-white/10'}`}>
                <Icon className="h-5 w-5" />
                <span className="min-w-0"><span className="block font-black">{item.label}</span><span className="block truncate text-xs text-cyan-100/60">{item.caption}</span></span>
                {Boolean(item.badge) && <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-black text-white">{item.badge}</span>}
              </button>
            );
          })}
          <div className="my-3 border-t border-white/10" />
          {extraNav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.view} onClick={() => onOpenHomeView(item.view)} className="relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-cyan-50/80 transition hover:bg-white/10">
                <Icon className="h-5 w-5" />
                <span className="min-w-0"><span className="block font-black">{item.label}</span><span className="block truncate text-xs text-cyan-100/60">{item.caption}</span></span>
              </button>
            );
          })}
        </nav>
        <div className="mt-4 grid gap-2 border-t border-white/10 pt-4">
          <button onClick={onNewRoster} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#071f38]"><CloudUpload className="mr-2 inline h-4 w-4" />Nova escala</button>
          <button onClick={onPowerOff} className="rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100"><LogOut className="mr-2 inline h-4 w-4" />Sair</button>
        </div>
      </aside>
    </div>
  );
}

function DesktopSidebar({ activeView, collapsed, canAccessAdmin, onToggleCollapsed, onChange, onOpenHomeView, onNewRoster, onPowerOff }: { activeView: ViewKey; collapsed: boolean; canAccessAdmin: boolean; onToggleCollapsed: () => void; onChange: (view: ViewKey) => void; onOpenHomeView: (view: string) => void; onNewRoster: () => void; onPowerOff: () => void }) {
  const nav: Array<{ key?: ViewKey; view?: string; label: string; caption: string; icon: LucideIcon; badge?: number }> = [
    { view: "home", label: "Cockpit", caption: "tela inicial", icon: Home },
    { key: "summary", label: "Resumo", caption: "visão geral", icon: LayoutDashboard },
    { key: "roster", label: "Escala", caption: "agenda completa", icon: CalendarDays },
    { view: "departure", label: "Saída inteligente", caption: "Maps · Uber/99", icon: Clock },
    { view: "settings", label: "Configurações", caption: "menu completo", icon: Settings },
    ...(canAccessAdmin ? [{ view: "iflight", label: "iFlight Admin", caption: "admin", icon: Plane }] : []),
    { view: "flightboard", label: "Radar", caption: "status e portão", icon: Gauge },
    { view: "perdiem", label: "Diárias", caption: "previsão mensal", icon: Coffee },
    { view: "salary", label: "Salário", caption: "bonificação e variáveis", icon: BriefcaseBusiness },
    { key: "alerts", label: "Alertas", caption: "avisos e atenção", icon: Bell },
    { key: "irregularities", label: "Regulamentação", caption: "jornada e limites", icon: ShieldAlert },
    { key: "gym", label: "Rotina", caption: "treino, estudo e vida", icon: Dumbbell },
    { key: "fatigue", label: "Carga da escala", caption: "fadiga e descanso", icon: Gauge },
    { key: "statistics", label: "Gerenciador", caption: "escalas salvas", icon: BarChart3 },
    { view: "support", label: "Ajuda", caption: "falar com suporte", icon: Mail },
    { key: "settings", label: "Ajustes da escala", caption: "exportações e relatório", icon: Settings },
      ];
  const handleNav = (item: typeof nav[number]) => item.key ? onChange(item.key) : item.view ? onOpenHomeView(item.view) : undefined;
  return (
    <aside className={`crewcheck-v10855-results-sidebar fixed inset-y-0 left-0 z-50 hidden ${collapsed ? 'w-24' : 'w-72'} flex-col bg-[#071f38] text-white shadow-[20px_0_50px_rgba(7,31,56,0.22)] transition-all duration-300 lg:flex`}>
      <div className="border-b border-white/10 p-4">
        <div className={`flex items-center ${collapsed ? 'flex-col justify-center' : 'justify-between'} gap-3 rounded-2xl bg-white/8 p-2`}>
          <button onClick={() => onOpenHomeView('home')} className="flex min-w-0 items-center gap-3 text-left">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-300 to-blue-500 text-[#071f38]"><Plane className="h-6 w-6" /></div>
            {!collapsed && <div><p className="text-base font-black leading-tight">CrewCheck</p><p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-100/65">Premium Roster</p></div>}
          </button>
          <button onClick={onToggleCollapsed} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/8 text-cyan-50 hover:bg-white/12" title={collapsed ? 'Expandir menu' : 'Encolher menu'} aria-label={collapsed ? 'Expandir menu lateral' : 'Encolher menu lateral'}>{collapsed ? <Plus className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
      </div>
      <nav className="flex-1 space-y-1.5 overflow-y-auto p-3">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeView;
          return (
            <button key={item.key || item.view} onClick={() => handleNav(item)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${active ? "bg-blue-600 text-white shadow-lg shadow-blue-950/20" : "text-cyan-50/78 hover:bg-white/10 hover:text-white"} ${collapsed ? 'justify-center' : ''}`} title={item.label}>
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white/18" : "bg-white/8"}`}><Icon className="h-5 w-5" /></div>
              {!collapsed && <div className="min-w-0"><p className="truncate font-black">{item.label}</p><p className="truncate text-xs text-cyan-100/60">{item.caption}</p></div>}
            </button>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-white/10 p-3">
        <button onClick={() => onOpenHomeView('settings')} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-3 py-3 text-sm font-black text-[#052032] shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-200 ${collapsed ? 'px-2' : ''}`}><Settings className="h-4 w-4" /> {!collapsed && 'Configurações'}</button>
        <button onClick={onNewRoster} className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-3 text-sm font-black text-[#071f38] transition hover:bg-cyan-50 ${collapsed ? 'px-2' : ''}`}><CloudUpload className="h-4 w-4" /> {!collapsed && 'Nova escala'}</button>
        <button onClick={onPowerOff} className={`flex w-full items-center justify-center gap-2 rounded-2xl border border-red-300/20 bg-red-500/10 px-3 py-3 text-sm font-black text-red-100 transition hover:bg-red-500/20 ${collapsed ? 'px-2' : ''}`}><LogOut className="h-4 w-4" /> {!collapsed && 'Sair'}</button>
      </div>
    </aside>
  );
}


function MobileViewTabs({ activeView, onChange, errors }: { activeView: ViewKey; onChange: (view: ViewKey) => void; errors: number }) {
  const tabs: Array<{ key: ViewKey; label: string; icon: LucideIcon; badge?: number }> = [
    { key: "summary", label: "Resumo", icon: LayoutDashboard },
    { key: "roster", label: "Escala", icon: CalendarDays },
    { key: "alerts", label: "Alertas", icon: Bell, badge: errors },
    { key: "gym", label: "Rotina", icon: Dumbbell },
    { key: "fatigue", label: "Puxada", icon: Gauge },
    { key: "statistics", label: "Gerenc.", icon: BarChart3 },
    { key: "settings", label: "Config.", icon: Settings },
      ];
  return (
    <div className="mb-4 grid grid-cols-3 gap-2 sm:grid-cols-7 lg:hidden">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.key === activeView;
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} className={`relative rounded-2xl border px-2 py-3 text-xs font-black shadow-sm ${active ? "border-[#092846] bg-[#092846] text-white" : "border-white bg-white text-[#60758a]"}`}>
            <Icon className="mx-auto mb-1 h-5 w-5" />{tab.label}
            {Boolean(tab.badge) && <span className="absolute right-1 top-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white">{tab.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

function AndroidFeatureShortcuts({ activeView, onChange, errors, onNewRoster, onPowerOff }: { activeView: ViewKey; onChange: (view: ViewKey) => void; errors: number; onNewRoster: () => void; onPowerOff: () => void }) {
  const shortcuts: Array<{ key: string; label: string; caption: string; icon: LucideIcon; view?: ViewKey; action?: () => void; badge?: number; tone: string }> = [
    { key: "summary", label: "Resumo", caption: "visão geral", icon: LayoutDashboard, view: "summary", tone: "from-cyan-400 to-blue-600" },
    { key: "roster", label: "Escala", caption: "programação", icon: CalendarDays, view: "roster", tone: "from-sky-400 to-blue-600" },
    { key: "alerts", label: "Alertas", caption: "avisos", icon: Bell, view: "alerts", badge: errors, tone: "from-rose-500 to-red-600" },
    { key: "gym", label: "Rotina", caption: "treino/estudo", icon: Dumbbell, view: "gym", tone: "from-emerald-400 to-teal-600" },
    { key: "calendar", label: "Calendário", caption: "Google/ICS", icon: CalendarDays, view: "settings", tone: "from-indigo-400 to-blue-600" },
    { key: "statistics", label: "Gerenciador", caption: "salvas", icon: BarChart3, view: "statistics", tone: "from-cyan-400 to-sky-600" },
      ];
  return (
    <section className="mb-3 rounded-[1.25rem] border border-cyan-300/10 bg-[#07172a] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] lg:hidden">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-[0.62rem] font-black uppercase tracking-[0.22em] text-cyan-200/70">CrewCheck</p>
          <h2 className="text-lg font-black text-white">Painel offline</h2>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[0.64rem] font-black text-emerald-200">offline-first</span>
      </div>
      <div className="grid grid-cols-4 gap-2 landscape:grid-cols-8">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          const active = item.view === activeView;
          const handleClick = item.action || (() => item.view && onChange(item.view));
          return (
            <button key={item.key} onClick={handleClick} className={`relative rounded-2xl border p-2 text-center transition active:scale-[0.98] ${active ? "border-cyan-300/30 bg-cyan-400/12 text-white" : "border-white/5 bg-[#0b2039] text-slate-200"}`}>
              <span className={`mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${item.tone} text-white shadow-sm`}><Icon className="h-4 w-4" /></span>
              <span className="block truncate text-[0.68rem] font-black leading-tight">{item.label}</span>
              <span className="mt-0.5 hidden truncate text-[0.58rem] font-semibold opacity-60 min-[390px]:block">{item.caption}</span>
              {Boolean(item.badge) && <span className="absolute right-1 top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-black text-white">{item.badge}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function KpiCard({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: string; hint: string; tone: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${tone}16`, color: tone }}><Icon className="h-7 w-7" /></div>
        <div><p className="text-xs font-bold uppercase tracking-wide text-[#71869b]">{label}</p><p className="mt-1 text-2xl font-black tabular-nums text-[#092846]">{value}</p><p className="text-xs font-medium text-[#71869b]">{hint}</p></div>
      </div>
    </div>
  );
}

function ViewKpis({ activeView, stats, load, errors, warnings, gym, roster }: { activeView: ViewKey; stats: ReturnType<typeof getStats>; load: LoadAnalysis; errors: number; warnings: number; gym: GymRecommendation[]; roster: CrewRoster }) {
  const layovers = roster.days.filter((day) => day.type === "LAYOVER").length;
  const formalDaysOff = roster.days.filter(isFormalDayOffForUi).length;
  const bestGym = gym.filter((item) => item.priority === "high" || item.priority === "medium").length;
  const hardDays = load.days.filter((day) => day.fatigueScore >= 70).length;

  const cards: Array<{ icon: LucideIcon; label: string; value: string; hint: string; tone: string }> = activeView === "gym"
    ? [
        { icon: Dumbbell, label: "Dias viáveis", value: String(bestGym), hint: "treino completo/moderado", tone: "#15963a" },
        { icon: House, label: "Folgas formais", value: String(formalDaysOff), hint: "DO / DR / DOF / DOP / VC", tone: "#2f80ed" },
        { icon: BedDouble, label: "Pernoites", value: String(layovers), hint: "inativo fora de base", tone: "#e0a000" },
        { icon: Moon, label: "Evitar carga", value: String(gym.filter((item) => item.priority === "low").length), hint: "mobilidade/descanso", tone: "#f97316" },
      ]
    : activeView === "irregularities"
      ? [
          { icon: ShieldCheck, label: "Conformidade", value: `${100 - Math.min(100, errors * 18 + warnings * 6)}/100`, hint: "nota automática", tone: errors ? "#dc2626" : "#15963a" },
          { icon: AlertTriangle, label: "Irregularidades", value: String(errors), hint: "clique para revisar", tone: "#dc2626" },
          { icon: Sparkles, label: "Atenções", value: String(warnings), hint: "dependem de revisão", tone: "#f97316" },
          { icon: CalendarDays, label: "Dias carregados", value: String(roster.days.length), hint: "escala inteira", tone: "#2f80ed" },
        ]
      : activeView === "fatigue"
        ? [
            { icon: Gauge, label: "Nota de puxada", value: `${load.intensityScore}/100`, hint: load.grade, tone: "#f97316" },
            { icon: CheckCircle2, label: "Recuperação", value: `${load.recoveryScore}/100`, hint: "quanto maior melhor", tone: "#15963a" },
            { icon: Flame, label: "Dias pesados", value: String(hardDays), hint: "70/100 ou mais", tone: "#dc2626" },
            { icon: CalendarDays, label: "Dias analisados", value: String(load.days.length), hint: "inclui folgas/pernoites", tone: "#2f80ed" },
          ]
        : activeView === "statistics"
          ? [
              { icon: BarChart3, label: "Histórico", value: "Pessoal", hint: "escalas salvas", tone: "#2f80ed" },
              { icon: Gauge, label: "Comparativo", value: "Geral", hint: "agregado superficial", tone: "#7c3aed" },
              { icon: ShieldCheck, label: "LGPD", value: "Aviso", hint: "uso pessoal", tone: "#15963a" },
              { icon: AlertTriangle, label: "Limite", value: "Não oficial", hint: "não apresentar à empresa", tone: "#f97316" },
            ]
          : [
            { icon: CalendarDays, label: "Eventos", value: String(stats.flightSegments + stats.trainingSessions + stats.meetings + stats.daysOff + stats.reserveDays), hint: "voos e atividades", tone: "#2f80ed" },
            { icon: House, label: "Folgas", value: String(stats.daysOff), hint: "DO / DR / DOF / DOP / VC", tone: "#15963a" },
            { icon: BedDouble, label: "Pernoites", value: String(layovers), hint: "dias inativos", tone: "#e0a000" },
            { icon: ShieldAlert, label: "Alertas", value: String(errors + warnings), hint: `${errors} críticos`, tone: errors ? "#dc2626" : "#f97316" },
          ];

  return (
    <section className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => <KpiCard key={`${activeView}-${card.label}`} {...card} />)}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1.5 text-xs font-bold text-[#61778e]"><span>{label}</span>{children}</label>;
}


type AirportCoordinate = { lat: number; lon: number; city: string; country: string; name: string };
type RosterMapSegment = {
  id: string;
  dateLabel: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  status: string;
  originInfo?: AirportCoordinate;
  destinationInfo?: AirportCoordinate;
  domestic: boolean;
  selected?: boolean;
};

const AIRPORT_COORDS: Record<string, AirportCoordinate> = {
  BSB: { lat: -15.87, lon: -47.92, city: 'Brasília', country: 'BR', name: 'Pres. Juscelino Kubitschek' },
  GRU: { lat: -23.43, lon: -46.47, city: 'Guarulhos', country: 'BR', name: 'São Paulo/Guarulhos' },
  CGH: { lat: -23.63, lon: -46.66, city: 'São Paulo', country: 'BR', name: 'Congonhas' },
  VCP: { lat: -23.01, lon: -47.13, city: 'Campinas', country: 'BR', name: 'Viracopos' },
  GIG: { lat: -22.81, lon: -43.25, city: 'Rio de Janeiro', country: 'BR', name: 'Galeão' },
  SDU: { lat: -22.91, lon: -43.16, city: 'Rio de Janeiro', country: 'BR', name: 'Santos Dumont' },
  CNF: { lat: -19.63, lon: -43.97, city: 'Belo Horizonte', country: 'BR', name: 'Confins' },
  PLU: { lat: -19.85, lon: -43.95, city: 'Belo Horizonte', country: 'BR', name: 'Pampulha' },
  POA: { lat: -29.99, lon: -51.17, city: 'Porto Alegre', country: 'BR', name: 'Salgado Filho' },
  CWB: { lat: -25.53, lon: -49.17, city: 'Curitiba', country: 'BR', name: 'Afonso Pena' },
  FLN: { lat: -27.67, lon: -48.55, city: 'Florianópolis', country: 'BR', name: 'Hercílio Luz' },
  IGU: { lat: -25.60, lon: -54.49, city: 'Foz do Iguaçu', country: 'BR', name: 'Cataratas' },
  SSA: { lat: -12.91, lon: -38.33, city: 'Salvador', country: 'BR', name: 'Dep. Luís Eduardo Magalhães' },
  REC: { lat: -8.13, lon: -34.92, city: 'Recife', country: 'BR', name: 'Guararapes' },
  FOR: { lat: -3.78, lon: -38.53, city: 'Fortaleza', country: 'BR', name: 'Pinto Martins' },
  NAT: { lat: -5.77, lon: -35.36, city: 'Natal', country: 'BR', name: 'São Gonçalo do Amarante' },
  JPA: { lat: -7.15, lon: -34.95, city: 'João Pessoa', country: 'BR', name: 'Pres. Castro Pinto' },
  MCZ: { lat: -9.51, lon: -35.79, city: 'Maceió', country: 'BR', name: 'Zumbi dos Palmares' },
  AJU: { lat: -10.98, lon: -37.07, city: 'Aracaju', country: 'BR', name: 'Santa Maria' },
  BEL: { lat: -1.38, lon: -48.48, city: 'Belém', country: 'BR', name: 'Val-de-Cans' },
  MAO: { lat: -3.04, lon: -60.05, city: 'Manaus', country: 'BR', name: 'Eduardo Gomes' },
  BVB: { lat: 2.85, lon: -60.69, city: 'Boa Vista', country: 'BR', name: 'Boa Vista' },
  PVH: { lat: -8.71, lon: -63.90, city: 'Porto Velho', country: 'BR', name: 'Gov. Jorge Teixeira' },
  RBR: { lat: -9.87, lon: -67.89, city: 'Rio Branco', country: 'BR', name: 'Plácido de Castro' },
  SLZ: { lat: -2.59, lon: -44.23, city: 'São Luís', country: 'BR', name: 'Marechal Cunha Machado' },
  THE: { lat: -5.06, lon: -42.82, city: 'Teresina', country: 'BR', name: 'Sen. Petrônio Portella' },
  PMW: { lat: -10.29, lon: -48.36, city: 'Palmas', country: 'BR', name: 'Brig. Lysias Rodrigues' },
  GYN: { lat: -16.63, lon: -49.22, city: 'Goiânia', country: 'BR', name: 'Santa Genoveva' },
  CGB: { lat: -15.65, lon: -56.12, city: 'Cuiabá', country: 'BR', name: 'Marechal Rondon' },
  CGR: { lat: -20.47, lon: -54.67, city: 'Campo Grande', country: 'BR', name: 'Campo Grande' },
  IOS: { lat: -14.82, lon: -39.03, city: 'Ilhéus', country: 'BR', name: 'Jorge Amado' },
  BPS: { lat: -16.44, lon: -39.08, city: 'Porto Seguro', country: 'BR', name: 'Porto Seguro' },
  VIX: { lat: -20.26, lon: -40.29, city: 'Vitória', country: 'BR', name: 'Eurico de Aguiar Salles' },
  MIA: { lat: 25.79, lon: -80.29, city: 'Miami', country: 'US', name: 'Miami International' },
  MCO: { lat: 28.43, lon: -81.31, city: 'Orlando', country: 'US', name: 'Orlando International' },
  JFK: { lat: 40.64, lon: -73.78, city: 'Nova York', country: 'US', name: 'John F. Kennedy' },
  EWR: { lat: 40.69, lon: -74.17, city: 'Newark', country: 'US', name: 'Newark Liberty' },
  LAX: { lat: 33.94, lon: -118.41, city: 'Los Angeles', country: 'US', name: 'Los Angeles International' },
  SCL: { lat: -33.39, lon: -70.79, city: 'Santiago', country: 'CL', name: 'Arturo Merino Benítez' },
  EZE: { lat: -34.82, lon: -58.54, city: 'Buenos Aires', country: 'AR', name: 'Ezeiza' },
  AEP: { lat: -34.56, lon: -58.42, city: 'Buenos Aires', country: 'AR', name: 'Aeroparque' },
  COR: { lat: -31.32, lon: -64.21, city: 'Córdoba', country: 'AR', name: 'Ingeniero Taravella' },
  MVD: { lat: -34.84, lon: -56.03, city: 'Montevidéu', country: 'UY', name: 'Carrasco' },
  ASU: { lat: -25.24, lon: -57.52, city: 'Assunção', country: 'PY', name: 'Silvio Pettirossi' },
  LIM: { lat: -12.02, lon: -77.11, city: 'Lima', country: 'PE', name: 'Jorge Chávez' },
  BOG: { lat: 4.70, lon: -74.15, city: 'Bogotá', country: 'CO', name: 'El Dorado' },
  MEX: { lat: 19.44, lon: -99.07, city: 'Cidade do México', country: 'MX', name: 'Benito Juárez' },
  CUN: { lat: 21.04, lon: -86.87, city: 'Cancún', country: 'MX', name: 'Cancún' },
  LIS: { lat: 38.77, lon: -9.13, city: 'Lisboa', country: 'PT', name: 'Humberto Delgado' },
  OPO: { lat: 41.24, lon: -8.68, city: 'Porto', country: 'PT', name: 'Francisco Sá Carneiro' },
  MAD: { lat: 40.49, lon: -3.57, city: 'Madri', country: 'ES', name: 'Barajas' },
  BCN: { lat: 41.30, lon: 2.08, city: 'Barcelona', country: 'ES', name: 'El Prat' },
  CDG: { lat: 49.01, lon: 2.55, city: 'Paris', country: 'FR', name: 'Charles de Gaulle' },
  ORY: { lat: 48.73, lon: 2.37, city: 'Paris', country: 'FR', name: 'Orly' },
  LHR: { lat: 51.47, lon: -0.45, city: 'Londres', country: 'GB', name: 'Heathrow' },
  LGW: { lat: 51.15, lon: -0.18, city: 'Londres', country: 'GB', name: 'Gatwick' },
  FRA: { lat: 50.04, lon: 8.56, city: 'Frankfurt', country: 'DE', name: 'Frankfurt' },
  AMS: { lat: 52.31, lon: 4.76, city: 'Amsterdã', country: 'NL', name: 'Schiphol' },
  FCO: { lat: 41.80, lon: 12.25, city: 'Roma', country: 'IT', name: 'Fiumicino' },
  MXP: { lat: 45.63, lon: 8.72, city: 'Milão', country: 'IT', name: 'Malpensa' },
  ZRH: { lat: 47.46, lon: 8.55, city: 'Zurique', country: 'CH', name: 'Zurich' },
  DXB: { lat: 25.25, lon: 55.36, city: 'Dubai', country: 'AE', name: 'Dubai International' },
  DOH: { lat: 25.26, lon: 51.61, city: 'Doha', country: 'QA', name: 'Hamad International' },
  JNB: { lat: -26.13, lon: 28.24, city: 'Joanesburgo', country: 'ZA', name: 'O. R. Tambo' },
};

function buildRosterMapSegments(groups: RosterDayGroup[]): RosterMapSegment[] {
  const seen = new Set<string>();
  const segments: RosterMapSegment[] = [];
  groups.forEach((group) => {
    group.events.forEach((event) => {
      const legs = event.legs && event.legs.length ? event.legs : event.leg ? [event.leg] : [];
      legs.forEach((leg, index) => {
        const origin = String(leg.origin || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
        const destination = String(leg.destination || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
        if (!origin || !destination || origin === destination) return;
        const flightNumber = String(leg.flightNumber || event.code || '').toUpperCase().replace(/^LA\s*/, 'LA') || event.code || 'Voo';
        const key = `${event.dateLabel}|${flightNumber}|${origin}|${destination}|${leg.departureTime || event.time}|${index}`;
        if (seen.has(key)) return;
        seen.add(key);
        const originInfo = AIRPORT_COORDS[origin];
        const destinationInfo = AIRPORT_COORDS[destination];
        segments.push({
          id: key,
          dateLabel: event.dateLabel,
          flightNumber,
          origin,
          destination,
          departureTime: cleanDisplayTimeToken(leg.departureTime || event.time || ''),
          arrivalTime: cleanDisplayTimeToken(leg.arrivalTime || ''),
          status: event.status || 'Programado',
          originInfo,
          destinationInfo,
          domestic: Boolean(originInfo && destinationInfo && originInfo.country === 'BR' && destinationInfo.country === 'BR'),
        });
      });
    });
  });
  return segments.sort((a, b) => `${a.dateLabel} ${a.departureTime}`.localeCompare(`${b.dateLabel} ${b.departureTime}`));
}

function projectAirportPoint(info: AirportCoordinate): { x: number; y: number } {
  return { x: ((info.lon + 180) / 360) * 1000, y: ((90 - info.lat) / 180) * 520 };
}

function routeArcPath(start: { x: number; y: number }, end: { x: number; y: number }): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const curve = Math.min(140, Math.max(38, Math.abs(dx) * 0.22 + Math.abs(dy) * 0.08));
  const c1x = start.x + dx * 0.32;
  const c2x = start.x + dx * 0.68;
  const c1y = start.y + dy * 0.16 - curve;
  const c2y = start.y + dy * 0.84 - curve;
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
}

function RosterMapPanel({ groups, todayId }: { groups: RosterDayGroup[]; todayId?: string }) {
  const segments = useMemo(() => buildRosterMapSegments(groups), [groups]);
  const mappedSegments = segments.filter((segment) => segment.originInfo && segment.destinationInfo);
  const unknownAirports = useMemo(() => Array.from(new Set(segments.flatMap((segment) => [segment.originInfo ? null : segment.origin, segment.destinationInfo ? null : segment.destination]).filter(Boolean) as string[])).slice(0, 8), [segments]);
  const [selectedId, setSelectedId] = useState<string>('');
  useEffect(() => {
    if (!mappedSegments.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!mappedSegments.some((segment) => segment.id === selectedId)) setSelectedId(mappedSegments[0].id);
  }, [mappedSegments, selectedId]);
  const selected = mappedSegments.find((segment) => segment.id === selectedId) || mappedSegments[0];
  const airports = useMemo(() => {
    const entries = new Map<string, AirportCoordinate>();
    mappedSegments.forEach((segment) => {
      if (segment.originInfo) entries.set(segment.origin, segment.originInfo);
      if (segment.destinationInfo) entries.set(segment.destination, segment.destinationInfo);
    });
    return Array.from(entries.entries()).map(([code, info]) => ({ code, info, point: projectAirportPoint(info) }));
  }, [mappedSegments]);
  const domestic = segments.filter((segment) => segment.domestic).length;
  const international = Math.max(0, segments.length - domestic);
  const dayCount = new Set(segments.map((segment) => segment.dateLabel)).size;
  if (!segments.length) {
    return (
      <section className="overflow-hidden rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><MapPin className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Mapa da escala</p>
            <h3 className="mt-1 text-xl font-black text-[#092846]">Sem voos mapeáveis neste filtro</h3>
            <p className="mt-1 text-sm text-[#60758a]">Quando houver trechos com origem e destino IATA, o CrewCheck exibirá a rota da escala aqui.</p>
          </div>
        </div>
      </section>
    );
  }
  return (
    <section className="crewcheck-roster-map-panel overflow-hidden rounded-[1.65rem] border border-white bg-white shadow-[0_24px_70px_rgba(20,54,84,0.11)]">
      <div className="grid gap-0 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="crewcheck-roster-map-stage relative min-h-[32rem] overflow-hidden bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.22),transparent_28%),linear-gradient(135deg,#f8fcff,#e9f5ff)] p-4 sm:p-6">
          <div className="relative z-10 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Mapa da escala</p>
              <h3 className="mt-1 text-3xl font-black tracking-tight text-[#092846] md:text-4xl">Mapa premium da escala</h3>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-[#60758a]">Visualização ampliada das rotas da escala, inspirada em mapa de malha aérea. Local, privada e sem enviar dados para terceiros.</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.08em]">
              <span className="rounded-full bg-white/85 px-3 py-1 text-[#092846] shadow-sm">{segments.length} trecho(s)</span>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{domestic} doméstico(s)</span>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{international} internacional(is)</span>
              <span className="rounded-full bg-white/85 px-3 py-1 text-[#60758a] shadow-sm">{dayCount} dia(s)</span>
            </div>
          </div>

          <div className="relative z-10 mt-4 overflow-hidden rounded-[1.2rem] border border-white/80 bg-white/60 shadow-inner shadow-blue-100/50 backdrop-blur">
            <svg viewBox="0 0 1000 520" className="crewcheck-roster-map-svg h-[27rem] w-full md:h-[34rem]" role="img" aria-label="Mapa visual das rotas da escala">
              <defs>
                <linearGradient id="crewcheckMapRoute" x1="0%" x2="100%" y1="0%" y2="0%">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#2563eb" />
                </linearGradient>
                <filter id="crewcheckMapShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#0f4c81" floodOpacity="0.18" />
                </filter>
              </defs>
              <rect x="0" y="0" width="1000" height="520" fill="#eff8ff" />
              <path d="M156 142 C210 96 285 104 334 152 C382 199 365 252 301 265 C222 281 150 234 126 194 C112 170 125 153 156 142Z" fill="#dbeefb" opacity="0.9" />
              <path d="M232 278 C278 265 318 296 314 346 C310 407 262 470 221 454 C179 438 178 374 196 325 C205 302 213 285 232 278Z" fill="#dbeefb" opacity="0.95" />
              <path d="M443 118 C529 72 644 88 701 149 C762 214 704 276 598 260 C496 244 412 183 443 118Z" fill="#dbeefb" opacity="0.85" />
              <path d="M524 275 C578 251 660 274 701 330 C748 395 718 465 642 451 C570 439 510 367 497 317 C492 297 502 284 524 275Z" fill="#dbeefb" opacity="0.82" />
              <path d="M732 179 C792 143 897 164 928 229 C963 302 909 364 821 337 C750 315 701 226 732 179Z" fill="#dbeefb" opacity="0.75" />
              <g opacity="0.28" stroke="#9cc8e8" strokeWidth="1">
                {[140, 260, 380, 500, 620, 740, 860].map((x) => <line key={`vl-${x}`} x1={x} y1="0" x2={x} y2="520" />)}
                {[100, 200, 300, 400].map((y) => <line key={`hl-${y}`} x1="0" y1={y} x2="1000" y2={y} />)}
              </g>
              {mappedSegments.map((segment, index) => {
                const start = projectAirportPoint(segment.originInfo!);
                const end = projectAirportPoint(segment.destinationInfo!);
                const isSelected = segment.id === selected?.id;
                return <path key={segment.id} d={routeArcPath(start, end)} fill="none" stroke={isSelected ? 'url(#crewcheckMapRoute)' : '#6aaee8'} strokeWidth={isSelected ? 4.5 : 2.25} strokeLinecap="round" strokeDasharray={isSelected ? undefined : '8 8'} opacity={isSelected ? 0.98 : Math.max(0.32, 0.84 - index * 0.035)} filter={isSelected ? 'url(#crewcheckMapShadow)' : undefined} />;
              })}
              {airports.map(({ code, info, point }) => {
                const active = selected && (selected.origin === code || selected.destination === code);
                return (
                  <g key={code} transform={`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`}>
                    <circle r={active ? 9 : 6} fill={active ? '#2563eb' : '#0ea5e9'} stroke="#fff" strokeWidth="3" filter="url(#crewcheckMapShadow)" />
                    <text x="12" y="4" fontSize="24" fontWeight="900" fill="#092846">{code}</text>
                    {active && <text x="12" y="25" fontSize="16" fontWeight="700" fill="#60758a">{info.city}</text>}
                  </g>
                );
              })}
              {selected?.originInfo && selected?.destinationInfo && (() => {
                const start = projectAirportPoint(selected.originInfo);
                const end = projectAirportPoint(selected.destinationInfo);
                const mid = { x: start.x + (end.x - start.x) * 0.55, y: start.y + (end.y - start.y) * 0.48 - 55 };
                return <g transform={`translate(${mid.x.toFixed(1)} ${mid.y.toFixed(1)})`}><circle r="16" fill="#2563eb" stroke="#fff" strokeWidth="4" /><path d="M-8 2 L12 -8 L5 2 L11 11 Z" fill="#fff" /></g>;
              })()}
            </svg>
          </div>
        </div>

        <aside className="border-t border-[#e2edf6] bg-white p-4 2xl:border-l 2xl:border-t-0">
          <div className="rounded-[1.15rem] border border-[#e2edf6] bg-[#f8fbfd] p-4">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.18em] text-sky-600">Trecho selecionado</p>
            {selected ? (
              <div className="mt-2">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-2xl font-black text-[#092846]">{selected.origin} → {selected.destination}</h4>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${selected.domestic ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{selected.domestic ? 'Doméstico' : 'Internacional'}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-[#60758a]">{selected.flightNumber} · {selected.dateLabel}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <FlightMiniPill label="Saída" value={selected.departureTime || '—'} />
                  <FlightMiniPill label="Chegada" value={selected.arrivalTime || '—'} />
                  <FlightMiniPill label="Origem" value={selected.originInfo?.city || selected.origin} />
                  <FlightMiniPill label="Destino" value={selected.destinationInfo?.city || selected.destination} />
                </div>
              </div>
            ) : <p className="mt-2 text-sm text-[#60758a]">Nenhum trecho com coordenadas disponíveis.</p>}
          </div>

          <div className="crewcheck-roster-map-list mt-3 max-h-[24rem] space-y-2 overflow-auto pr-1">
            {segments.slice(0, 18).map((segment) => {
              const mapped = Boolean(segment.originInfo && segment.destinationInfo);
              const active = segment.id === selected?.id;
              return (
                <button key={segment.id} type="button" onClick={() => mapped && setSelectedId(segment.id)} className={`w-full rounded-2xl border px-3 py-2 text-left transition ${active ? 'border-blue-300 bg-blue-50 shadow-sm' : 'border-[#e2edf6] bg-white hover:border-blue-200 hover:bg-[#f7fbff]'} ${!mapped ? 'opacity-70' : ''}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-black text-[#092846]">{segment.origin} → {segment.destination}</span>
                    <span className="rounded-full bg-[#eef5fb] px-2 py-0.5 text-[10px] font-black text-[#60758a]">{segment.flightNumber}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-semibold text-[#60758a]">{segment.dateLabel} · {segment.departureTime || 'horário não lido'}{mapped ? '' : ' · aeroporto sem mapa'}</p>
                </button>
              );
            })}
          </div>

          {unknownAirports.length > 0 && <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-900">Aeroportos sem coordenada no mapa: {unknownAirports.join(', ')}. A escala continua correta; apenas o desenho da rota não foi exibido para esses códigos.</div>}
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Mapa local, sem serviço externo e sem enviar a escala para terceiros.</div>
        </aside>
      </div>
    </section>
  );
}

function DesktopRosterTable({ groups, todayId, routineSuggestions }: { groups: RosterDayGroup[]; todayId?: string; routineSuggestions: RoutineSuggestion[] }) {
  const totalEvents = groups.reduce((sum, group) => sum + group.events.length, 0);
  const rootRef = useRef<HTMLElement | null>(null);
  const targetDateLabel = groups.find((group) => group.events.some((event) => event.id === todayId))?.dateLabel;
  useEffect(() => {
    if (!todayId && !targetDateLabel) return;
    const timer = window.setTimeout(() => {
      const root = rootRef.current;
      const target = (targetDateLabel ? root?.querySelector(`[data-roster-day-date="${targetDateLabel}"]`) : null) || root?.querySelector(`[data-roster-event-id="${todayId}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [todayId, targetDateLabel]);
  return (
    <section ref={rootRef} className="cc-roster-desktop-list hidden space-y-3 lg:block">
      <div className="overflow-hidden rounded-[1.25rem] border border-white bg-white shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="flex flex-col gap-3 border-b border-[#dce6ef] px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Minha escala premium</p>
            <h3 className="mt-1 text-xl font-black text-[#092846]">Programações em cards, sem corte de tela</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.08em] text-[#425a72]">
            <span className="rounded-full bg-[#eef5fb] px-3 py-1">{groups.length} dia(s)</span>
            <span className="rounded-full bg-[#eef5fb] px-3 py-1">{totalEvents} evento(s)</span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">toque/clique para detalhes</span>
          </div>
        </div>
        <div className="space-y-3 bg-[#f7fbff] p-4">{groups.map((group) => <RosterTableDayRow key={group.id} group={group} isToday={group.events.some((event) => event.id === todayId)} todayId={todayId} routineSuggestions={routineSuggestionsForDate(routineSuggestions, group.dateLabel)} />)}</div>
        <div className="flex items-center justify-between border-t border-[#e7eef5] px-5 py-4 text-sm text-[#60758a]"><span>Layout corrigido para desktop, iPad e iOS: as colunas rígidas foram substituídas por cards adaptáveis.</span><span className="rounded-full bg-[#eef5fb] px-3 py-1 text-xs font-black text-[#092846]">Premium iOS</span></div>
      </div>
    </section>
  );
}

function RosterTableDayRow({ group, isToday, todayId, routineSuggestions }: { group: RosterDayGroup; isToday: boolean; todayId?: string; routineSuggestions: RoutineSuggestion[] }) {
  const financial = groupDailyFinancialSummary(group);
  return (
    <article data-roster-day-target={isToday ? 'true' : undefined} data-roster-day-date={group.dateLabel} className={`cc-roster-day-desktop rounded-[1.15rem] border bg-white shadow-[0_12px_32px_rgba(20,54,84,0.06)] ${isToday ? 'border-blue-200 ring-2 ring-blue-100' : 'border-[#e2edf6]'}`}>
      <div className="grid min-w-0 gap-3 p-3 xl:grid-cols-[5.5rem_minmax(0,1fr)]">
        <div className="cc-roster-date-desktop cc-roster-date-minimal flex items-center justify-center rounded-2xl border border-[#e2edf6] bg-[#f8fbfd] px-2 py-3 text-center">
          <div>
            <p className="cc-roster-weekday-desktop text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#60758a]">{group.weekday}</p>
            <p className="cc-roster-day-number-desktop text-3xl font-black leading-none text-[#092846]">{group.dayNumber}</p>
            <p className="cc-roster-month-desktop mt-1 text-[0.62rem] font-black uppercase tracking-[0.12em] text-[#60758a]">{group.monthLabel}</p>
            {isToday && <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-600">Hoje</span>}
            <div className="cc-day-finance-chips mt-3 grid grid-cols-2 gap-1.5 text-[10px] font-black uppercase tracking-[0.06em]">
              <span className="cc-financial-chip cc-financial-chip-perdiem rounded-full px-2 py-1">Diárias {financial.perDiemLabel}</span>
              <span className="cc-financial-chip cc-financial-chip-total rounded-full px-2 py-1">Ganhos {financial.totalLabel}</span>
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-2.5">
          {sortRosterEventsForDisplay(group.events).map((event) => <RosterTableSubEvent key={event.id} event={event} isTarget={event.id === todayId} routineSuggestions={routineSuggestions} />)}
        </div>
      </div>
    </article>
  );
}


function crewSummaryForRosterEvent(event: RosterEvent): string | null {
  const legs = event.legs && event.legs.length ? event.legs : event.leg ? [event.leg] : [];
  const members = legs.flatMap((leg) => Array.isArray(leg.crew) ? leg.crew : []);
  if (!members.length) return null;
  const unique = new Map<string, any>();
  members.forEach((member: any) => {
    const key = `${String(member.role || '').toUpperCase()}|${String(member.name || '').toUpperCase()}`;
    if (member?.name && !unique.has(key)) unique.set(key, member);
  });
  const lead = legs.map((leg) => leg.ccmLead).find(Boolean) as any;
  const confirmed = legs.some((leg) => leg.ccmBonusStatus === 'confirmed');
  const notApplicable = legs.some((leg) => leg.ccmBonusStatus === 'not_applicable');
  const parts = [`${unique.size} tripulante${unique.size === 1 ? '' : 's'}`];
  if (lead?.name) parts.unshift(`Chefe ${lead.name}`);
  if (confirmed) parts.push('adicional CCM confirmado');
  else if (notApplicable) parts.push('chefe é outro CCM');
  return parts.join(' · ');
}


const CREWCHECK_ROSTER_WEATHER_IATA_TO_ICAO: Record<string, string> = {
  AJU:'SBAR', BEL:'SBBE', BPS:'SBPS', BSB:'SBBR', CGB:'SBCY', CGH:'SBSP', CGR:'SBCG', CNF:'SBCF', CWB:'SBCT', FLN:'SBFL', FOR:'SBFZ', GIG:'SBGL', GRU:'SBGR', GYN:'SBGO', IGU:'SBFI', IOS:'SBIL', JPA:'SBJP', MAO:'SBEG', MAB:'SBMA', MCZ:'SBMO', MCP:'SBMQ', NAT:'SBSG', NVT:'SBNF', PMW:'SBPJ', POA:'SBPA', PVH:'SBPV', RAO:'SBRP', REC:'SBRF', SDU:'SBRJ', SLZ:'SBSL', SSA:'SBSV', THE:'SBTE', UDI:'SBUL', VCP:'SBKP', VIX:'SBVT', XAP:'SBCH', MIA:'KMIA', JFK:'KJFK', LAX:'KLAX', MCO:'KMCO', LIS:'LPPT', MAD:'LEMD', CDG:'LFPG', FCO:'LIRF', FRA:'EDDF', LHR:'EGLL', EZE:'SAEZ', AEP:'SABE', SCL:'SCEL', LIM:'SPJC', BOG:'SKBO', MEX:'MMMX'
};

type RosterWeatherCardPayload = {
  ok?: boolean;
  sourceConfigured?: boolean;
  message?: string;
  alerts?: Array<{ title?: string; summary?: string; severity?: string; rawMetar?: string; rawTaf?: string; airport?: string; icao?: string }>;
  observations?: Array<{ rawOb?: string; raw?: string; text?: string; icao?: string; stationId?: string }>;
  forecasts?: Array<{ rawTAF?: string; rawTaf?: string; raw?: string; text?: string; icao?: string; stationId?: string }>;
  updatedAt?: string;
};

function resultWeatherNormalizeAirport(value?: string | null): string {
  const code = String(value || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length === 4) return code;
  if (code.length === 3) return CREWCHECK_ROSTER_WEATHER_IATA_TO_ICAO[code] || code;
  return '';
}

function isReserveStandbyWeatherEvent(event: RosterEvent): boolean {
  const code = String(event.code || event.day?.pairingCode || event.day?.type || '').toUpperCase();
  return /^(HSB|HSBE|ASB|RES)$/.test(code) || ['HSB', 'HSBE', 'ASB', 'RES'].includes(String(event.day?.type || '').toUpperCase());
}

function isAdminRosterWeatherContext(): boolean {
  try { return isCrewCheckAdmin(getStoredUser()); } catch { return false; }
}

function isPilotWeatherRosterContext(event: RosterEvent): boolean {
  if (isAdminRosterWeatherContext()) return true;
  try {
    const selected = `${sessionStorage.getItem('crewcheck_role_selection') || ''} ${localStorage.getItem('crewcheck_role_selection') || ''}`.toLowerCase();
    if (/\bpilot|piloto\b/.test(selected)) return true;
  } catch {}
  const rank = `${(event.day as any)?.rank || ''} ${(event.day as any)?.function || ''} ${(event.day as any)?.role || ''} ${event.day?.rawText || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return /\b(CMTE|CMT|COMANDANTE|COPILOTO|FIRST\s*OFFICER|PILOTO|PILOT|JJCP|JJFO)\b/.test(rank);
}

function reserveStandbyWeatherAirport(event: RosterEvent): string {
  const raw = String(event.day?.rawText || '');
  const code = String(event.code || event.day?.pairingCode || event.day?.type || '').toUpperCase().replace(/[^A-Z]/g, '');
  const idx = raw.toUpperCase().indexOf(code);
  const segment = idx >= 0 ? raw.slice(idx, idx + 220) : raw;
  const stationAfterCode = segment.match(/\b([A-Z]{3})\s+\d{1,2}:\d{2}/)?.[1];
  return resultWeatherNormalizeAirport(stationAfterCode)
    || resultWeatherNormalizeAirport(event.day?.base)
    || resultWeatherNormalizeAirport(event.leg?.origin)
    || resultWeatherNormalizeAirport((event.day?.legs || [])[0]?.origin)
    || resultWeatherNormalizeAirport(localStorage.getItem('crewcheck_preferred_airport') || 'BSB')
    || 'SBBR';
}

function rosterWeatherEndLabel(event: RosterEvent): string {
  const range = parseDisplayTimeRange(event.time);
  if (range) return minutesToDisplayTime(normalizeDisplayEnd(range.start, range.end));
  return event.day?.dutyDebrief || 'fim da programação';
}

function rosterWeatherProgramWindow(event: RosterEvent): { startAbs: number; endAbs: number } | null {
  const range = parseDisplayTimeRange(event.time);
  if (!range) return null;
  const dateStart = Math.floor(event.date.getTime() / 60000);
  const startAbs = dateStart + range.start;
  const endAbs = dateStart + normalizeDisplayEnd(range.start, range.end);
  if (!Number.isFinite(startAbs) || !Number.isFinite(endAbs) || endAbs <= startAbs) return null;
  return { startAbs, endAbs };
}

function rosterWeatherIsProgramActiveNow(event: RosterEvent): boolean {
  const windowRange = rosterWeatherProgramWindow(event);
  if (!windowRange) return false;
  const now = Date.now() / 60000;
  return now >= windowRange.startAbs && now <= windowRange.endAbs + 5;
}

function rosterWeatherIsStillActive(event: RosterEvent): boolean {
  const windowRange = rosterWeatherProgramWindow(event);
  if (!windowRange) return false;
  return Date.now() <= (windowRange.endAbs * 60000) + 5 * 60 * 1000;
}

function rawMetarFromWeatherPayload(payload: RosterWeatherCardPayload | null): string {
  return payload?.observations?.[0]?.rawOb || payload?.observations?.[0]?.raw || payload?.observations?.[0]?.text || payload?.alerts?.[0]?.rawMetar || '';
}

function rawTafFromWeatherPayload(payload: RosterWeatherCardPayload | null): string {
  return payload?.forecasts?.[0]?.rawTAF || payload?.forecasts?.[0]?.rawTaf || payload?.forecasts?.[0]?.raw || payload?.forecasts?.[0]?.text || payload?.alerts?.[0]?.rawTaf || '';
}

function PilotReserveStandbyWeatherCard({ event, compact = false }: { event: RosterEvent; compact?: boolean }) {
  const adminWeatherContext = isAdminRosterWeatherContext();
  const programActiveNow = rosterWeatherIsProgramActiveNow(event);
  const enabled = isReserveStandbyWeatherEvent(event) && (isPilotWeatherRosterContext(event) || adminWeatherContext) && programActiveNow;
  const airport = reserveStandbyWeatherAirport(event);
  const [payload, setPayload] = useState<RosterWeatherCardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const alerts = Array.isArray(payload?.alerts) ? payload.alerts : [];
  const rawMetar = rawMetarFromWeatherPayload(payload);
  const rawTaf = rawTafFromWeatherPayload(payload);
  const endLabel = rosterWeatherEndLabel(event);

  useEffect(() => {
    if (!enabled || !airport) return;
    let alive = true;
    let timer: number | undefined;
    const load = async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const params = new URLSearchParams({ airports: airport, scope: 'pilot_standby_reserve_card', eventDate: event.dateLabel, eventTime: event.time, watchUntil: rosterWeatherEndLabel(event) });
        const response = await fetch(`/api/meteorologia/aviacao/alertas?${params.toString()}`, { cache: 'no-store', headers: crewcheckAuthHeader() });
        const data = await response.json().catch(() => null);
        if (alive) setPayload(data || { ok: false, message: 'Meteorologia indisponível agora.' });
      } catch {
        if (alive) setPayload({ ok: false, alerts: [], message: 'Não consegui atualizar a meteorologia agora.' });
      } finally {
        if (alive) setLoading(false);
      }
    };
    void load(false);
    if (rosterWeatherIsStillActive(event)) timer = window.setInterval(() => void load(true), 30 * 60 * 1000);
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [enabled, airport, event.id, event.time, reloadNonce]);

  if (!enabled) return null;

  const headline = alerts.length
    ? `${alerts.length} ponto(s) de atenção meteorológica`
    : payload?.ok === false
      ? 'Meteorologia indisponível agora'
      : 'Meteorologia acompanhada';
  const message = alerts[0]?.summary || payload?.message || 'Sem indício forte de tempestade, CB/TCU, vento crítico, teto baixo ou baixa visibilidade no METAR/TAF consultado.';
  return (
    <div className={`mx-2 mb-2 rounded-2xl border border-sky-100 bg-sky-50/95 p-3 text-[#092846] shadow-sm ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <div className="flex items-start gap-2">
        <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 text-sky-700 ${loading ? 'animate-pulse' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="font-black">{adminWeatherContext ? 'Admin' : 'Piloto'} · METAR/TAF {airport} · {headline}</p>
          <p className="mt-1 leading-5 text-[#425a72]">{message}</p>
          <p className="mt-1 font-bold text-sky-700">Exibido apenas durante a janela da programação. Atualização automática a cada 30 min até {endLabel}.</p>
          {rawMetar && <p className="mt-2 truncate font-mono text-[10px] text-[#60758a]">METAR: {rawMetar}</p>}
          {!compact && rawTaf && <p className="mt-1 truncate font-mono text-[10px] text-[#60758a]">TAF: {rawTaf}</p>}
        </div>
        <button type="button" onClick={() => setReloadNonce((value) => value + 1)} className="rounded-full border border-sky-100 bg-white px-2 py-1 text-[10px] font-black text-sky-700">Atualizar</button>
      </div>
    </div>
  );
}


type RosterLayoverWeatherSnapshot = { ok?: boolean; airport?: string; airportName?: string; current?: { label?: string; severity?: string; temperature?: number; precipitationMm?: number; windKmh?: number; windGustKmh?: number; advisory?: string }; daily?: Array<{ date?: string; label?: string; severity?: string; temperatureMax?: number; temperatureMin?: number; precipitationProbability?: number; precipitationMm?: number; windGustKmh?: number; advisory?: string }>; source?: string; updatedAt?: string; message?: string };

function rosterLayoverWeatherToneClass(severity?: string | null): string {
  const tone = String(severity || '').toLowerCase();
  if (tone === 'red') return 'border-red-200/60 bg-red-50 text-red-950';
  if (tone === 'amber') return 'border-amber-200/70 bg-amber-50 text-amber-950';
  if (tone === 'yellow') return 'border-yellow-200/80 bg-yellow-50 text-yellow-950';
  return 'border-emerald-200/70 bg-emerald-50 text-emerald-950';
}

function rosterLayoverWeatherSymbol(severity?: string | null): string {
  const tone = String(severity || '').toLowerCase();
  if (tone === 'red') return '🔴 Clima crítico';
  if (tone === 'amber') return '🟠 Clima atenção';
  if (tone === 'yellow') return '🟡 Clima monitorar';
  return '🟢 Clima favorável';
}

function layoverWeatherDateForEvent(event: RosterEvent): string {
  return event.perDiemLayoverAfter?.weatherDate || dateOnlyIsoSafe(event.date);
}


function overnightLearningKey(airport: string, date: string) {
  return `crewcheck_overnight_presentation_${String(airport || '').toUpperCase()}_${date || 'sem-data'}`;
}
function normalizeClockInput(value: string): string {
  const match = String(value || '').match(/\b(\d{1,2})[:hH]?(\d{2})\b/);
  if (!match) return '';
  const h = Math.max(0, Math.min(23, Number(match[1]) || 0));
  const m = Math.max(0, Math.min(59, Number(match[2]) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function subtractClockMinutes(clock: string, minutes: number): string {
  const clean = normalizeClockInput(clock);
  if (!clean) return '';
  const [h, m] = clean.split(':').map(Number);
  let total = h * 60 + m - Math.max(0, Number(minutes) || 0);
  total = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function androidAlarmIntentUrl(clock: string, message: string): string {
  const clean = normalizeClockInput(clock);
  if (!clean) return '';
  const [h, m] = clean.split(':').map(Number);
  return `intent://#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=${h};i.android.intent.extra.alarm.MINUTES=${m};S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(message)};end`;
}
function iosShortcutAlarmUrl(clock: string, message: string): string {
  const text = JSON.stringify({ time: normalizeClockInput(clock), message, source: 'CrewCheck' });
  return `shortcuts://run-shortcut?name=${encodeURIComponent('CrewCheck Despertar')}&input=text&text=${encodeURIComponent(text)}`;
}

function RosterLayoverWeatherCard({ event, compact = false }: { event: RosterEvent; compact?: boolean }) {
  const kind = perDiemEventKind(event);
  const airport = event.perDiemLayoverAfter?.airport || (kind === 'layover' ? layoverAirportForEvent(event) : '');
  const enabled = Boolean(airport && kind === 'layover');
  const dateKey = layoverWeatherDateForEvent(event);
  const storageKey = overnightLearningKey(airport, dateKey);
  const [payload, setPayload] = useState<RosterLayoverWeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [presentationTime, setPresentationTime] = useState(() => {
    try { return normalizeClockInput(localStorage.getItem(storageKey) || localStorage.getItem(`crewcheck_overnight_presentation_${airport}`) || ''); } catch { return ''; }
  });
  const [leadMinutes, setLeadMinutes] = useState(() => {
    try { return Number(localStorage.getItem('crewcheck_wakeup_lead_minutes') || 120) || 120; } catch { return 120; }
  });
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [learningLabel, setLearningLabel] = useState('');
  useEffect(() => {
    if (!enabled || !airport) return;
    let alive = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ airport, date: dateKey, days: '4' });
        const weatherResponse = await fetch(`/api/weather/airport?${params.toString()}`, { cache: 'force-cache', signal: controller.signal, headers: crewcheckAuthHeader() });
        const data = await weatherResponse.json().catch(() => null) as RosterLayoverWeatherSnapshot | null;
        if (alive) setPayload(data || { ok: false, message: 'Previsão indisponível.' });
        const learned = await fetch(`/api/overnight-hotel/presentation?airport=${encodeURIComponent(airport)}&date=${encodeURIComponent(dateKey)}`, { cache: 'force-cache', signal: controller.signal, headers: crewcheckAuthHeader() }).then((r) => r.json()).catch(() => null);
        if (!alive) return;
        const learnedTime = learned?.suggestion?.presentationTime || learned?.global?.presentationTime || '';
        const learnedLead = learned?.suggestion?.leadMinutes || learned?.global?.leadMinutes || null;
        if (learnedTime && !presentationTime) {
          setPresentationTime(learnedTime);
          localStorage.setItem(storageKey, learnedTime);
          localStorage.setItem(`crewcheck_overnight_presentation_${airport}`, learnedTime);
        }
        if (learnedLead && !localStorage.getItem('crewcheck_wakeup_lead_minutes')) setLeadMinutes(Number(learnedLead));
        if (learned?.suggestion) setLearningLabel('sugestão do seu histórico');
        else if (learned?.global) setLearningLabel(`aprendizado coletivo · ${learned.global.samples || 1} amostra(s)`);
      } catch {
        if (alive) setPayload({ ok: false, message: 'Não consegui atualizar a previsão agora.' });
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; controller.abort(); };
  }, [enabled, airport, event.id]);
  if (!enabled) return null;
  const daily = payload?.daily?.find((item) => item.date === dateKey) || payload?.daily?.[0];
  const severity = daily?.severity || payload?.current?.severity || 'green';
  const temp = daily ? `${Math.round(Number(daily.temperatureMin || 0))}–${Math.round(Number(daily.temperatureMax || 0))}°C` : payload?.current?.temperature != null ? `${Math.round(Number(payload.current.temperature))}°C` : '—';
  const rain = daily?.precipitationProbability != null ? `${Math.round(Number(daily.precipitationProbability))}%` : payload?.current?.precipitationMm != null ? `${payload.current.precipitationMm} mm` : '—';
  const duration = event.perDiemLayoverAfter?.durationLabel || rosterLayoverDurationLabel(event.perDiemLayoverAfter?.startAbs || 0, event.perDiemLayoverAfter?.endAbs || 0);
  const wakeupTime = presentationTime ? subtractClockMinutes(presentationTime, leadMinutes) : '';
  const alarmMessage = `CrewCheck · acordar para apresentação/saída do hotel ${airport}${presentationTime ? ` às ${presentationTime}` : ''}`;
  const savePresentation = async () => {
    const clean = normalizeClockInput(presentationTime);
    if (!clean) { toast.warning('Informe um horário válido, exemplo 11:15.'); return; }
    setPresentationTime(clean);
    localStorage.setItem(storageKey, clean);
    localStorage.setItem(`crewcheck_overnight_presentation_${airport}`, clean);
    localStorage.setItem('crewcheck_wakeup_lead_minutes', String(leadMinutes));
    try {
      const response = await fetch('/api/overnight-hotel/presentation', { method: 'POST', headers: crewcheckAuthHeader({ 'content-type': 'application/json' }), body: JSON.stringify({ airport, date: dateKey, presentationTime: clean, leadMinutes, source: 'roster-card', notes: 'Horário informado no card de pernoite. Pode ser ajuste do comandante/API hotel.' }) });
      const data = await response.json().catch(() => null);
      if (data?.ok) { setLearningLabel(data.saved ? 'salvo no aprendizado CrewCheck' : 'salvo localmente'); toast.success('Horário de apresentação salvo.'); }
    } catch { toast.info('Horário salvo neste aparelho.'); }
  };
  const openAlarm = (platform: 'android' | 'ios') => {
    if (!wakeupTime) { toast.warning('Informe o horário de apresentação primeiro.'); return; }
    const url = platform === 'android' ? androidAlarmIntentUrl(wakeupTime, alarmMessage) : iosShortcutAlarmUrl(wakeupTime, alarmMessage);
    window.location.href = url;
  };
  const sendTelegramWakeup = async () => {
    if (!wakeupTime) { toast.warning('Informe o horário de apresentação primeiro.'); return; }
    try {
      const alarmUrl = androidAlarmIntentUrl(wakeupTime, alarmMessage);
      const response = await fetch('/api/overnight-wakeup/notify', { method: 'POST', headers: crewcheckAuthHeader({ 'content-type': 'application/json' }), body: JSON.stringify({ airport, date: dateKey, presentationTime, leadMinutes, wakeupTime, alarmUrl }) });
      const data = await response.json().catch(() => null);
      if (data?.telegram) toast.success('Alerta Telegram programado com botão “Já acordei” e soneca.');
      else toast.info(data?.message || 'Horário salvo, mas Telegram não está conectado.');
    } catch { toast.error('Não consegui enviar o alerta Telegram agora.'); }
  };
  return (
    <div className={`mx-2 mb-2 rounded-2xl border p-3 shadow-sm ${rosterLayoverWeatherToneClass(severity)} ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <div className="flex items-start gap-2">
        <BedDouble className={`mt-0.5 h-4 w-4 shrink-0 ${loading ? 'animate-pulse' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="font-black uppercase tracking-[0.12em]">{rosterLayoverWeatherSymbol(severity)} Pernoite {airport} · {duration || 'tempo a confirmar'}</p>
          <p className="mt-1 leading-5">{daily?.label || payload?.current?.label || 'Previsão'} · {temp} · chuva {rain}</p>
          <p className="mt-1 leading-5">Tempo total de pernoite: <b>{duration || 'tempo a confirmar'}</b>.</p>
          <p className="mt-1 leading-5 opacity-80">Diárias previstas no pernoite: almoço + jantar. Café/ceia só entram se houver jornada ativa na janela.</p>
          <div className="mt-3 rounded-[1.35rem] border border-white/45 bg-white/55 p-3 text-[11px] shadow-inner backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black uppercase tracking-[0.16em]">Apresentação</p>
                <p className="mt-1 font-semibold opacity-75">{presentationTime ? `Saída/apresentação ${presentationTime} · despertar ${wakeupTime || '—'}` : 'Horário ainda não informado. Configure no menu Apresentação.'}</p>
                {learningLabel ? <p className="mt-1 font-semibold opacity-70">{learningLabel}; comandante/API pode alterar.</p> : null}
              </div>
              <button type="button" onClick={() => setPresentationOpen((value) => !value)} className="rounded-2xl bg-slate-950 px-4 py-3 text-xs font-black text-white shadow-lg active:scale-[0.98]">{presentationOpen ? 'Fechar apresentação' : 'Gerenciar apresentação'}</button>
            </div>
            {presentationOpen ? <div className="mt-3 rounded-[1.25rem] border border-white/50 bg-white/70 p-3 text-slate-950 shadow-xl">
              <p className="font-black uppercase tracking-[0.14em] text-slate-700">Despertador Premium</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="block"><span className="font-bold text-slate-600">Apresentação/saída</span><input value={presentationTime} onChange={(e) => setPresentationTime(e.target.value.replace(/[^0-9:]/g, '').slice(0, 5))} onBlur={() => void savePresentation()} placeholder="Ex.: 11:15" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-black text-slate-950 outline-none focus:border-cyan-400" /></label>
                <label className="block"><span className="font-bold text-slate-600">Acordar antes</span><select value={leadMinutes} onChange={(e) => { const v = Number(e.target.value); setLeadMinutes(v); localStorage.setItem('crewcheck_wakeup_lead_minutes', String(v)); }} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-black text-slate-950 outline-none focus:border-cyan-400"><option value={45}>45 min antes</option><option value={60}>1h antes</option><option value={90}>1h30 antes</option><option value={120}>2h antes</option><option value={150}>2h30 antes</option><option value={180}>3h antes</option></select></label>
                <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-3"><span className="font-bold text-cyan-800">Despertar sugerido</span><p className="text-xl font-black text-slate-950">{wakeupTime || '—'}</p></div>
              </div>
              <p className="mt-2 font-semibold text-slate-600">O horário salvo alimenta o aprendizado individual e coletivo por aeroporto/hotel. Use a alteração manual quando o comandante definir outro horário.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <button type="button" onClick={() => void savePresentation()} className="rounded-2xl bg-slate-950 px-4 py-3 font-black text-white shadow-lg active:scale-[0.98]">Salvar/aprender</button>
                <button type="button" onClick={() => openAlarm('android')} className="rounded-2xl bg-emerald-500 px-4 py-3 font-black text-slate-950 shadow-lg active:scale-[0.98]">Despertador Android</button>
                <button type="button" onClick={() => openAlarm('ios')} className="rounded-2xl bg-sky-400 px-4 py-3 font-black text-slate-950 shadow-lg active:scale-[0.98]">Atalho iPhone</button>
                <button type="button" onClick={() => void sendTelegramWakeup()} className="rounded-2xl bg-indigo-500 px-4 py-3 font-black text-white shadow-lg active:scale-[0.98]">Ativar Telegram</button>
              </div>
              <p className="mt-2 text-[10px] font-bold leading-4 text-slate-500">No Telegram, a notificação terá botões “Já acordei” e “Soneca”. Ao tocar em “Já acordei”, o CrewCheck interrompe as próximas insistências.</p>
            </div> : null}
          </div>
          {(daily?.advisory || payload?.current?.advisory || payload?.message) ? <p className="mt-2 text-[11px] font-semibold opacity-75">{daily?.advisory || payload?.current?.advisory || payload?.message}</p> : null}
        </div>
      </div>
    </div>
  );
}
function isRosterDayUseHotelEvent(event: RosterEvent): boolean {
  if (event.dayUseHotel) return true;
  const text = `${event.typeLabel || ''} ${event.activity || ''} ${event.subtitle || ''} ${event.status || ''} ${event.code || ''} ${event.day?.type || ''} ${event.day?.pairingCode || ''}`.toUpperCase();
  if (/ESTADIA\s+DIURNA|HOTEL\s+DIA|DESCANSO\s+DIURNO|PERDIA|DAY\s*USE/.test(text)) return true;
  if (event.dayUseHotel) return true;
  return false;
}

function dayUseHotelAirportForEvent(event: RosterEvent): string {
  const explicit = String(event.dayUseHotel?.airport || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (explicit) return explicit;
  return groundStopAirportForDay(event.day) || layoverAirportForEvent(event) || '';
}

function dayUseHotelDurationLabel(event: RosterEvent): string {
  if (event.dayUseHotel?.durationLabel) return event.dayUseHotel.durationLabel;
  const duration = event.dayUseHotel?.durationMinutes ?? resultsDurationFromTimeText(event.time) ?? rosterDayPublishedDurationMinutes(event.day);
  return resultsDurationLabelFromMinutes(duration || 0);
}

function RosterDayUseHotelCard({ event, compact = false }: { event: RosterEvent; compact?: boolean }) {
  const enabled = isRosterDayUseHotelEvent(event);
  const airport = enabled ? dayUseHotelAirportForEvent(event) : '';
  const [payload, setPayload] = useState<RosterLayoverWeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !airport) return;
    let alive = true;
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ airport, date: dateOnlyIsoSafe(event.date), days: '2' });
        const response = await fetch(`/api/weather/airport?${params.toString()}`, { cache: 'force-cache', signal: controller.signal, headers: crewcheckAuthHeader() });
        const data = await response.json().catch(() => null) as RosterLayoverWeatherSnapshot | null;
        if (alive) setPayload(data || { ok: false, message: 'Previsão indisponível.' });
      } catch {
        if (alive) setPayload({ ok: false, message: 'Não consegui atualizar a previsão agora.' });
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; controller.abort(); };
  }, [enabled, airport, event.id]);
  if (!enabled) return null;
  const daily = payload?.daily?.find((item) => item.date === dateOnlyIsoSafe(event.date)) || payload?.daily?.[0];
  const temp = daily ? `${Math.round(Number(daily.temperatureMin || 0))}–${Math.round(Number(daily.temperatureMax || 0))}°C` : payload?.current?.temperature != null ? `${Math.round(Number(payload.current.temperature))}°C` : '—';
  const rain = daily?.precipitationProbability != null ? `${Math.round(Number(daily.precipitationProbability))}%` : payload?.current?.precipitationMm != null ? `${payload.current.precipitationMm} mm` : '—';
  const duration = dayUseHotelDurationLabel(event);
  return (
    <div className={`mx-2 mb-2 rounded-2xl border border-sky-100 bg-sky-50/95 p-3 text-[#092846] shadow-sm ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <div className="flex items-start gap-2">
        <Coffee className={`mt-0.5 h-4 w-4 shrink-0 text-sky-700 ${loading ? 'animate-pulse' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className="font-black uppercase tracking-[0.12em]">Estadia diurna {airport ? `· ${airport}` : ''} · {duration}</p>
          <p className="mt-1 leading-5">Hotel/descanso diurno entre duas programações no mesmo dia. Regra: mínimo 12h entre chegada e próxima apresentação; não é pernoite, mas gera diária de hotel igual quando fora da base contratual/virtual.</p>
          <p className="mt-1 font-semibold text-sky-800">Diárias previstas na estadia: almoço + jantar quando aplicável. Apresentação: {event.dayUseHotel?.presentationLabel || 'a confirmar'}.</p>
          <p className="mt-1 leading-5 text-[#425a72]">Clima local: {daily?.label || payload?.current?.label || 'previsão'} · {temp} · chuva {rain}. Use para deslocamento e planejamento de descanso, sem confundir com ocupação de assento.</p>
          <p className="mt-1 font-semibold text-sky-700">Termo premium: <b>Estadia diurna</b>. Apelido operacional: “perdia”.</p>
        </div>
      </div>
    </div>
  );
}


function RosterTableSubEvent({ event, routineSuggestions, isTarget = false }: { event: RosterEvent; routineSuggestions: RoutineSuggestion[]; isTarget?: boolean }) {
  const [open, setOpen] = useState(false);
  const style = getEventStyle(event);
  const toneClass = getRosterEventToneClass(event);
  const Icon = style.icon;
  const flight = useFlightStatus(event);
  const isFlight = event.typeLabel === 'Flight' && Boolean(event.leg);
  const statusLabel = isFlight ? (flight.status || event.status || 'Scheduled') : null;
  const routineOnly = routineSuggestions.filter(isRoutineActivitySuggestion);
  const recoveryOnly = routineSuggestions.filter(isRecoverySuggestion);
  const mealOnly = eventPerDiemItems(event);
  const crewSummary = crewSummaryForRosterEvent(event);
  const layoverOnly = Boolean(event.perDiemLayoverAfter || event.dayUseHotel);
  const displayTime = layoverOnly ? rosterLayoverCompactTime(event) : event.time;
  const displaySubtitle = layoverOnly ? rosterLayoverSubtitle(event) : event.subtitle;
  return (
    <div data-roster-event-id={event.id} data-roster-event-target={isTarget ? 'true' : undefined} className={`cc-roster-event ${toneClass} overflow-hidden rounded-2xl border bg-white ${isTarget ? 'ring-2 ring-blue-200' : ''}`}>
      <button type="button" onClick={() => setOpen((value) => !value)} className="grid w-full min-w-0 grid-cols-[2.8rem_minmax(5.2rem,6.5rem)_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-[#fbfdff] 2xl:grid-cols-[2.8rem_6.5rem_minmax(0,1fr)_16rem_auto]">
        <div className="cc-roster-event-icon flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: style.solid }}><Icon className="h-5 w-5" /></div>
        <div className="cc-roster-event-time min-w-0 text-sm font-black tabular-nums text-[#092846]">{displayTime}</div>
        <div className="min-w-0">
          <p className="cc-roster-event-title break-words font-black leading-tight text-[#092846]">{event.activity}</p>
          <p className="cc-roster-event-subtitle mt-0.5 break-words text-sm leading-5 text-[#60758a]">{displaySubtitle}</p>
          {crewSummary && <p className="cc-roster-crew-summary mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-sky-100 bg-sky-50 px-2 py-0.5 text-[11px] font-black text-sky-700"><Users className="h-3 w-3 shrink-0" /> <span className="truncate">{crewSummary}</span></p>}
          {routineOnly.length > 0 && <p className="cc-roster-routine-line mt-1 break-words text-xs font-bold text-blue-700">Rotina: {formatRoutineSuggestionSummary(routineOnly)}</p>}
          {recoveryOnly.length > 0 && <p className="cc-roster-routine-line mt-1 break-words text-xs font-bold text-violet-700">Recuperação: {formatRoutineSuggestionSummary(recoveryOnly)}</p>}
          {mealOnly.length > 0 && <p className="cc-roster-routine-line mt-1 break-words text-xs font-bold text-amber-700">Diárias: {formatEventMealSummary(mealOnly)}</p>}
        </div>
        {isFlight && <div className="hidden min-w-0 grid-cols-3 gap-2 2xl:grid">
          <FlightMiniPill label="Código" value={event.code || event.leg?.flightNumber || '—'} />
          <FlightMiniPill label="Status" value={statusLabel || '—'} />
          <FlightMiniPill label="Portão" value={flight.gate || '—'} />
        </div>}
        <div className="flex items-center gap-2">
          {statusLabel && <span className="hidden rounded-full px-3 py-1 text-xs font-bold xl:inline-flex" style={{ backgroundColor: style.bg, color: style.solid }}>{statusLabel}</span>}
          <MoreHorizontal className="hidden h-4 w-4 text-[#60758a] xl:block" />
          <ChevronDown className={`h-4 w-4 text-[#60758a] transition ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <>
          <PilotReserveStandbyWeatherCard event={event} />
          <RosterLayoverWeatherCard event={event} />
          <RosterDayUseHotelCard event={event} />
          <div className="border-t border-[#e5edf5] px-3 pb-3"><MobileRosterEventDetails event={event} routineSuggestions={routineSuggestions} /></div>
        </>
      )}
    </div>
  );
}

function MobileRosterList({ groups, todayId, roster, routineSuggestions }: { groups: RosterDayGroup[]; todayId?: string; roster: CrewRoster; routineSuggestions: RoutineSuggestion[] }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const targetDateLabel = groups.find((group) => group.events.some((event) => event.id === todayId))?.dateLabel;
  useEffect(() => {
    if (!todayId && !targetDateLabel) return;
    const scrollToTarget = () => {
      const root = rootRef.current;
      const target = (targetDateLabel ? root?.querySelector(`[data-roster-day-date="${targetDateLabel}"]`) : null) || root?.querySelector(`[data-roster-event-id="${todayId}"]`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const first = window.setTimeout(scrollToTarget, 350);
    const second = window.setTimeout(scrollToTarget, 1100);
    return () => { window.clearTimeout(first); window.clearTimeout(second); };
  }, [todayId, targetDateLabel]);
  return (
    <div ref={rootRef} className="android-roster-list crewcheck-roster-premium-list">
      <div className="mb-3 overflow-hidden rounded-[1.25rem] border border-white bg-white shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[0.62rem] font-black uppercase tracking-[0.24em] text-sky-600">Minha escala premium</p>
            <h2 className="text-lg font-black text-[#092846]">{MONTHS_PT[roster.month - 1]} {roster.year}</h2>
          </div>
          <span className="rounded-full bg-[#eef5fb] px-3 py-1 text-xs font-black text-[#425a72]">{groups.length} dias</span>
        </div>
      </div>
      <div className="space-y-2.5">{groups.map((group) => <MobileRosterDayCard key={group.id} group={group} isToday={group.events.some((event) => event.id === todayId)} todayId={todayId} routineSuggestions={routineSuggestionsForDate(routineSuggestions, group.dateLabel)} />)}</div>
    </div>
  );
}

function MobileRosterDayCard({ group, isToday, todayId, routineSuggestions }: { group: RosterDayGroup; isToday: boolean; todayId?: string; routineSuggestions: RoutineSuggestion[] }) {
  const financial = groupDailyFinancialSummary(group);
  return (
    <div data-roster-day-target={isToday ? 'true' : undefined} data-roster-day-date={group.dateLabel} className="cc-roster-day-card cc-roster-day-card-v10832 rounded-[1.35rem] border p-3 shadow-[0_16px_42px_rgba(20,54,84,0.10)]">
      <div className="cc-roster-date-card cc-roster-date-card-v10832 cc-roster-date-compact-v11023 cc-roster-date-compact-v11027 rounded-[1rem] border px-3 py-3 leading-tight">
        <div className="cc-date-row-v11023 cc-date-row-v11027"><div className="cc-date-stamp-v10832 cc-date-stamp-v11023 cc-date-stamp-v11027">
          <span className="cc-roster-weekday text-[0.78rem] font-black uppercase tracking-[0.18em] text-[#60758a]">{group.weekday}</span>
          <span className="cc-roster-day-number text-4xl font-black text-[#092846]">{group.dayNumber}</span>
          <span className="cc-roster-month text-[0.72rem] font-black uppercase tracking-[0.14em] text-[#60758a]">{group.monthLabel}</span>
        </div>
        </div>{isToday && <span className="cc-today-pill-v11023 mt-2 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-600">Hoje</span>}
        <div className="cc-day-finance-chips cc-day-finance-chips-v11023 mt-2 grid grid-cols-2 gap-1.5">
          <span className="cc-financial-chip cc-financial-chip-perdiem rounded-full px-2 py-1 text-[9px] font-black">Diárias {financial.perDiemLabel}</span>
          <span className="cc-financial-chip cc-financial-chip-total rounded-full px-2 py-1 text-[9px] font-black">Ganhos {financial.totalLabel}</span>
        </div>
      </div>
      <div className="min-w-0 space-y-1.5">
        {sortRosterEventsForDisplay(group.events).map((event) => <MobileRosterSubEvent key={event.id} event={event} isTarget={event.id === todayId} routineSuggestions={routineSuggestions} />)}
      </div>
    </div>
  );
}

function MobileRosterSubEvent({ event, routineSuggestions, isTarget = false }: { event: RosterEvent; routineSuggestions: RoutineSuggestion[]; isTarget?: boolean }) {
  const [open, setOpen] = useState(false);
  const style = getEventStyle(event);
  const toneClass = getRosterEventToneClass(event);
  const Icon = style.icon;
  const crewSummary = crewSummaryForRosterEvent(event);
  const layoverOnly = Boolean(event.perDiemLayoverAfter || event.dayUseHotel);
  const displayTime = layoverOnly ? rosterLayoverCompactTime(event) : event.time;
  const displaySubtitle = layoverOnly ? rosterLayoverSubtitle(event) : event.subtitle;
  return (
    <div data-roster-event-id={event.id} data-roster-event-target={isTarget ? 'true' : undefined} className={`cc-roster-event ${toneClass} w-full overflow-hidden rounded-[1rem] border text-left transition ${isTarget ? 'ring-2 ring-blue-200' : ''}`}>
      <button type="button" onClick={() => setOpen(!open)} className="cc-roster-event-trigger-v11023 w-full p-2.5 text-left transition active:scale-[0.99]">
        <div className="cc-roster-event-grid-v11023 grid grid-cols-[2.7rem_minmax(4.4rem,5rem)_minmax(0,1fr)_1.35rem] items-center gap-2.5">
          <div className="cc-roster-event-icon flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: style.solid }}><Icon className="h-5 w-5" /></div>
          <div className="cc-roster-event-time text-[0.86rem] font-black leading-tight tabular-nums">{formatStackedTime(displayTime)}</div>
          <div className="cc-roster-event-text-v11023 min-w-0"><p className="cc-roster-event-title truncate text-[1.05rem] font-black leading-tight">{event.activity}</p><p className="cc-roster-event-subtitle mt-0.5 line-clamp-2 text-[0.82rem] leading-tight">{displaySubtitle}</p>{crewSummary && <p className="cc-roster-crew-summary mt-1 truncate text-[0.68rem] font-black text-sky-700">Tripulação: {crewSummary}</p>}</div>
          <ChevronDown className={`cc-roster-chevron h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <>
          <PilotReserveStandbyWeatherCard event={event} compact />
          <RosterLayoverWeatherCard event={event} compact />
          <RosterDayUseHotelCard event={event} compact />
          <div className="border-t border-white/10 px-2.5 pb-2.5"><MobileRosterEventDetails event={event} routineSuggestions={routineSuggestions} /></div>
        </>
      )}
    </div>
  );
}




type EventMealItem = { id: string; startTime: string; endTime: string; activityName: string };
const EVENT_MEAL_WINDOWS: EventMealItem[] = [
  { id: 'cafe', startTime: '05:00', endTime: '08:00', activityName: 'Café da manhã' },
  { id: 'almoco', startTime: '11:00', endTime: '13:00', activityName: 'Almoço' },
  { id: 'jantar', startTime: '19:00', endTime: '20:00', activityName: 'Jantar' },
  { id: 'ceia', startTime: '00:00', endTime: '01:00', activityName: 'Ceia' },
];

const EVENT_PERDIEM_MAIN_VALUE = 109.44;
const EVENT_PERDIEM_BREAKFAST_VALUE = 27.36;
const EVENT_DAILY_BASE_SALARY_ESTIMATE = 3076.64 / 30;

type OfficialRosterPerDiemRow = { date: string; type: EventMealItem['id']; dutyCode: string; value: number; source: string };

const EVENT_OFFICIAL_DOMESTIC_DIEM_2026_06_17_23: OfficialRosterPerDiemRow[] = [
  { date: '17/06/2026', type: 'almoco', dutyCode: 'LA 3732 BSB-FOR', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '17/06/2026', type: 'jantar', dutyCode: 'LA 3743 FOR-BSB', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '20/06/2026', type: 'almoco', dutyCode: 'LA 3280 BSB-VCP', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '20/06/2026', type: 'jantar', dutyCode: 'LA 3573 PMW-BSB', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '21/06/2026', type: 'jantar', dutyCode: 'LA 3819 FLN-BSB', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '21/06/2026', type: 'ceia', dutyCode: 'LA 3500 BSB-MAB', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '22/06/2026', type: 'almoco', dutyCode: 'PERNOITE MAB', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '22/06/2026', type: 'jantar', dutyCode: 'PERNOITE MAB', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '23/06/2026', type: 'almoco', dutyCode: 'LA 3980 BSB-CPV', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
  { date: '23/06/2026', type: 'jantar', dutyCode: 'PERNOITE CPV', value: EVENT_PERDIEM_MAIN_VALUE, source: 'Demonstrativo LATAM 17/06–23/06' },
];

function mealItemForOfficialRow(row: OfficialRosterPerDiemRow): EventMealItem {
  return EVENT_MEAL_WINDOWS.find((meal) => meal.id === row.type) || EVENT_MEAL_WINDOWS[1];
}

function officialPerDiemDateKey(date: Date | string): string {
  if (typeof date === 'string') return date;
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function officialPerDiemRowsForRosterDate(date: Date | string): OfficialRosterPerDiemRow[] {
  const key = officialPerDiemDateKey(date);
  return EVENT_OFFICIAL_DOMESTIC_DIEM_2026_06_17_23.filter((row) => row.date === key);
}

function formatRosterMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Math.max(0, Number(value) || 0));
}

function perDiemValueForMeal(item: EventMealItem): number {
  return item.id === 'cafe' ? EVENT_PERDIEM_BREAKFAST_VALUE : EVENT_PERDIEM_MAIN_VALUE;
}

function cloneMealForLayover(meal: EventMealItem, airport: string): EventMealItem {
  return { ...meal, activityName: `${meal.activityName} · Pernoite ${airport}` };
}

function cloneMealForStay(meal: EventMealItem, airport: string, label = 'Estadia diurna'): EventMealItem {
  return { ...meal, activityName: `${meal.activityName} · ${label} ${airport}` };
}

function layoverMealItemsForFlightEvent(event: RosterEvent): EventMealItem[] {
  const layover = event.perDiemLayoverAfter;
  if (!layover) return [];
  const localStart = ((layover.startAbs % 1440) + 1440) % 1440;
  const startDay = Math.floor(layover.startAbs / 1440);
  const endDay = Math.floor(layover.endAbs / 1440);
  // Se a permanência fora da base cruza a meia-noite, o card do dia da chegada deve considerar até 24:00.
  // Antes, o fim local do dia seguinte (ex.: 12:00) cortava o jantar e deixava pernoite sem almoço/janta.
  const localEnd = endDay > startDay ? 1440 : Math.min(1440, ((layover.endAbs % 1440) + 1440) % 1440 || 1440);
  return EVENT_MEAL_WINDOWS
    .filter((meal) => meal.id === 'almoco' || meal.id === 'jantar')
    .filter((meal) => rangesOverlapForPerDiem(localStart, localEnd, timeToSortValue(meal.startTime), timeToSortValue(meal.endTime)))
    .map((meal) => cloneMealForLayover(meal, layover.airport));
}

function mergeEventMeals(base: EventMealItem[], extras: EventMealItem[]): EventMealItem[] {
  const byId = new Map<string, EventMealItem>();
  for (const item of base) byId.set(item.id, item);
  for (const item of extras) if (!byId.has(item.id)) byId.set(item.id, item);
  return Array.from(byId.values());
}

function dayUseHotelPerDiemItemsForEvent(event: RosterEvent): EventMealItem[] {
  if (!isRosterDayUseHotelEvent(event)) return [];
  const airport = dayUseHotelAirportForEvent(event);
  const base = resultContractualBaseAirport(event);
  const virtualBase = resultVirtualBaseAirport();
  const text = `${event.day?.type || ''} ${event.day?.pairingCode || ''} ${event.day?.hotel || ''} ${event.activity || ''} ${event.subtitle || ''} ${event.day?.rawText || ''}`.toUpperCase();
  // ACT/base virtual: não gerar diária automática quando a estadia estiver na base contratual/virtual ou quando for dirigida.
  if (!airport || airport === base || (virtualBase && airport === virtualBase) || /PERNOITE\s+DIRIGIDO|DIRIGIDO/.test(text)) return [];
  return EVENT_MEAL_WINDOWS
    .filter((meal) => meal.id === 'almoco' || meal.id === 'jantar')
    .map((meal) => cloneMealForStay(meal, airport));
}

function eventPerDiemEstimatedValue(event: RosterEvent): number {
  return eventPerDiemItems(event).reduce((sum, item) => sum + perDiemValueForMeal(item), 0);
}

function isOperationalEarningEvent(event: RosterEvent): boolean {
  const kind = perDiemEventKind(event);
  return kind === 'flight' || kind === 'reserve' || kind === 'training';
}

function groupDailyFinancialSummary(group: RosterDayGroup): { perDiem: number; total: number; perDiemLabel: string; totalLabel: string } {
  const officialRows = officialPerDiemRowsForRosterDate(group.date);
  if (officialRows.length) {
    const officialPerDiem = officialRows.reduce((sum, row) => sum + row.value, 0);
    const hasWork = group.events.some(isOperationalEarningEvent);
    const base = hasWork ? EVENT_DAILY_BASE_SALARY_ESTIMATE : 0;
    const total = officialPerDiem + base;
    return { perDiem: officialPerDiem, total, perDiemLabel: formatRosterMoney(officialPerDiem), totalLabel: formatRosterMoney(total) };
  }
  const perDiemByKey = new Map<string, number>();
  for (const event of group.events) {
    for (const meal of eventPerDiemItems(event)) {
      const key = `${meal.id}-${event.id}`;
      perDiemByKey.set(key, perDiemValueForMeal(meal));
    }
  }
  const perDiem = Array.from(perDiemByKey.values()).reduce((sum, value) => sum + value, 0);
  const hasWork = group.events.some(isOperationalEarningEvent);
  const base = hasWork ? EVENT_DAILY_BASE_SALARY_ESTIMATE : 0;
  const total = perDiem + base;
  return { perDiem, total, perDiemLabel: formatRosterMoney(perDiem), totalLabel: formatRosterMoney(total) };
}

function eventPerDiemItems(event: RosterEvent): EventMealItem[] {
  const kind = perDiemEventKind(event);
  if (isRosterDayUseHotelEvent(event)) return dayUseHotelPerDiemItemsForEvent(event);
  if (kind === 'standby' || kind === 'off' || kind === 'none') return [];
  if (kind === 'layover') return layoverPerDiemItemsForEvent(event);
  const range = parseDisplayTimeRange(event.time);
  if (!range) return [];
  const start = range.start;
  const end = normalizeDisplayEnd(range.start, range.end);
  const output: EventMealItem[] = [];

  if (kind === 'reserve') {
    const breakfast = EVENT_MEAL_WINDOWS.find((meal) => meal.id === 'cafe');
    if (breakfast && rangesOverlapForPerDiem(start, end, timeToSortValue(breakfast.startTime), timeToSortValue(breakfast.endTime))) output.push(breakfast);
    const mainMeal = EVENT_MEAL_WINDOWS
      .filter((meal) => meal.id !== 'cafe')
      .find((meal) => meal.id === 'ceia' ? coversCeiaWindow(start, end) : rangesOverlapForPerDiem(start, end, timeToSortValue(meal.startTime), timeToSortValue(meal.endTime)));
    if (mainMeal) output.push(mainMeal);
    return output;
  }

  for (const meal of EVENT_MEAL_WINDOWS) {
    const mealStart = timeToSortValue(meal.startTime);
    const mealEnd = timeToSortValue(meal.endTime);
    if (meal.id === 'ceia') {
      if (kind !== 'flight') continue;
      if (coversCeiaWindow(start, end)) output.push(meal);
      continue;
    }
    if (meal.id === 'cafe') {
      // Café é conservador nos voos: demonstrativos pagam quando a jornada começa antes de 05:00
      // e atravessa a janela 05:00–08:00. Treinamento/pernoite não gera café automático.
      if (kind !== 'flight') continue;
      if (start < 5 * 60 && rangesOverlapForPerDiem(start, end, mealStart, mealEnd)) output.push(meal);
      continue;
    }
    if (rangesOverlapForPerDiem(start, end, mealStart, mealEnd)) output.push(meal);
  }
  if (kind === 'flight') return output;
  return output;
}


const RESULTS_MIN_LAYOVER_REST_MINUTES = 12 * 60;
const RESULTS_DAY_USE_MIN_REST_MINUTES = 12 * 60;
const RESULTS_SHORT_GROUND_STOP_MAX_MINUTES = 3 * 60;

function resultsDurationFromTimeText(time?: string | null): number | null {
  const range = parseDisplayTimeRange(String(time || ''));
  if (!range) return null;
  return Math.max(0, normalizeDisplayEnd(range.start, range.end) - range.start);
}

function resultsDurationLabelFromMinutes(minutes: number | null | undefined): string {
  const safe = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours && mins) return `${hours}h ${mins}min`;
  if (hours) return `${hours}h`;
  return `${mins}min`;
}

function rosterDayPublishedDurationMinutes(day?: RosterDay | null): number | null {
  if (!day) return null;
  const range = parseDisplayTimeRange(displayTimeForRosterDay(day));
  if (!range) return null;
  return Math.max(0, normalizeDisplayEnd(range.start, range.end) - range.start);
}

function isShortOrInvalidLayoverDuration(minutes: number | null | undefined): boolean {
  if (minutes === null || minutes === undefined) return false;
  return Number(minutes) >= 0 && Number(minutes) < RESULTS_MIN_LAYOVER_REST_MINUTES;
}

function isShortGroundStopLikeLayover(event: RosterEvent): boolean {
  if (event.perDiemLayoverAfter || event.dayUseHotel) return false;
  const source = `${event.typeLabel || ''} ${event.activity || ''} ${event.subtitle || ''} ${event.code || ''} ${event.status || ''} ${event.day?.type || ''} ${event.day?.pairingCode || ''}`.toUpperCase();
  if (!/\b(PERNOITE|LAYOVER|HOTEL|INATIVO)\b/.test(source)) return false;
  const duration = resultsDurationFromTimeText(event.time) ?? rosterDayPublishedDurationMinutes(event.day);
  return isShortOrInvalidLayoverDuration(duration);
}

function groundStopAirportForDay(day?: RosterDay | null): string {
  const base = String((day as any)?.base || 'BSB').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'BSB';
  const raw = `${day?.hotel || ''} ${day?.pairingCode || ''} ${day?.rawText || ''}`.toUpperCase();
  const candidates = Array.from(new Set(raw.match(/\b[A-Z]{3}\b/g) || []));
  const ignored = new Set(['LAY','INA','HOT','PER','ACT','PDF','AIM','CRM','EAD','OFF','DOF','DOP','HSB','ASB','RES']);
  return candidates.find((code) => !ignored.has(code) && code !== base) || '';
}

function rosterRestAirportCode(value?: string | null): string {
  return String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function rosterRestEventText(event: RosterEvent): string {
  return `${event.typeLabel || ''} ${event.activity || ''} ${event.subtitle || ''} ${event.code || ''} ${event.status || ''} ${event.day?.type || ''} ${event.day?.pairingCode || ''} ${event.day?.hotel || ''} ${event.day?.rawText || ''}`.toUpperCase();
}

function isRosterOnlineTrainingText(text: string): boolean {
  return /\b(EAD|ONLINE|ON\s*LINE|ON-LINE|TREINAMENTO\s+ONLINE|AULA\s+ONLINE|E-LEARNING|DIST[ÂA]NCIA)\b/.test(String(text || '').toUpperCase());
}

function isSyntheticCrewCheckRestCard(event: RosterEvent): boolean {
  return Boolean(event.perDiemLayoverAfter || event.dayUseHotel || /^CREWCHECK-REST-/.test(String(event.id || '')));
}

function isRawRosterHotelOrLayoverCard(event: RosterEvent): boolean {
  if (isSyntheticCrewCheckRestCard(event)) return false;
  const text = rosterRestEventText(event);
  return /PERNOITE|LAYOVER|HOTEL\s+STAY|INATIVO\s*\/\s*PERNOITE|ACOMOD|HOSPEDAGEM|CHEGADA\s*\/\s*FIM\s+DE\s+JORNADA/.test(text);
}

function isValidSyntheticLayoverEvent(event: RosterEvent): boolean {
  const minutes = Math.round(Number((event.perDiemLayoverAfter?.endAbs || 0) - (event.perDiemLayoverAfter?.startAbs || 0)));
  return Boolean(event.perDiemLayoverAfter?.airport && Number.isFinite(minutes) && minutes >= RESULTS_MIN_LAYOVER_REST_MINUTES);
}

function isValidSyntheticDayUseEvent(event: RosterEvent): boolean {
  const minutes = Number(event.dayUseHotel?.durationMinutes ?? resultsDurationFromTimeText(event.time) ?? 0);
  return Boolean(event.dayUseHotel && Number.isFinite(minutes) && minutes >= RESULTS_DAY_USE_MIN_REST_MINUTES);
}

function shouldSuppressRawRosterLayoverEvent(event: RosterEvent): boolean {
  const text = rosterRestEventText(event);
  if (isRosterOnlineTrainingText(text)) return true;
  if (!isRawRosterHotelOrLayoverCard(event)) return false;
  // v11.1.43: cartões de hotel/pernoite vindos crus da escala estavam duplicando e criando 0min.
  // A visualização premium passa a confiar apenas nos cartões sintéticos calculados entre voos reais.
  return true;
}

function sanitizeRosterRestEvents(events: RosterEvent[]): RosterEvent[] {
  const result: RosterEvent[] = [];
  const seenRest = new Set<string>();
  for (const event of events) {
    if (shouldSuppressRawRosterLayoverEvent(event)) continue;
    if (event.perDiemLayoverAfter && !isValidSyntheticLayoverEvent(event)) continue;
    if (event.dayUseHotel && !isValidSyntheticDayUseEvent(event)) continue;
    if (event.perDiemLayoverAfter || event.dayUseHotel) {
      const airport = event.perDiemLayoverAfter?.airport || event.dayUseHotel?.airport || layoverAirportForEvent(event) || 'REST';
      const kind = event.perDiemLayoverAfter ? 'P' : 'D';
      const start = event.perDiemLayoverAfter?.startAbs || eventAbsoluteStart(event);
      const end = event.perDiemLayoverAfter?.endAbs || eventAbsoluteEnd(event);
      const key = `${formatRosterDate(event.date)}|${kind}|${airport}|${Math.round(start)}|${Math.round(end)}`;
      const broadKey = `${formatRosterDate(event.date)}|${airport}|${Math.round(start)}|${Math.round(end)}`;
      if (seenRest.has(key) || seenRest.has(broadKey)) continue;
      seenRest.add(key);
      seenRest.add(broadKey);
    }
    result.push(event);
  }
  return result;
}


function perDiemEventKind(event: RosterEvent): 'flight' | 'reserve' | 'standby' | 'training' | 'layover' | 'off' | 'none' {
  const code = normalizeEventCode(event);
  const label = `${event.typeLabel || ''} ${event.activity || ''} ${event.subtitle || ''} ${event.day?.hotel || ''} ${event.day?.rawText || ''}`.toUpperCase();
  if (event.typeLabel === 'Flight' || Boolean(event.leg || event.legs?.length)) return 'flight';
  if (isRosterDayUseHotelEvent(event) || /PERDIA|ESTADIA\s+DIURNA|HOTEL\s+DIA|DESCANSO\s+DIURNO/.test(label)) return 'none';
  if (isShortGroundStopLikeLayover(event) || shouldSuppressRawRosterLayoverEvent(event)) return 'none';
  if (event.perDiemLayoverAfter) return 'layover';
  if (event.typeLabel === 'Inativo' || event.typeLabel === 'Hotel' || /^(INA|INAT|INATIVO|HOTEL|LAYOVER)$/.test(code) || /INATIV|INACTIVE|PERNOITE|LAYOVER|HOTEL STAY|CHEGADA \/ FIM DE JORNADA|FIM DE JORNADA|ACOMOD/.test(label)) return 'layover';
  if (/^(ASB|RES)$/.test(code) || /RESERVA|AIRPORT STAND BY|RESERVE/.test(label)) return 'reserve';
  if (/^(HSB|HSBE)$/.test(code) || /SOBREAVISO|HOME STAND BY|STANDBY/.test(label)) return 'standby';
  if (/^(CBF|EMER|C32F|CRM|MT)$/.test(code) || /TREIN|CHECK|EAD|REUNI/.test(label)) return 'training';
  if (/^(DO|DOF|DR|DOP|DOPR|OFF|VC)$/.test(code) || /FOLGA|DAY OFF/.test(label)) return 'off';
  return 'none';
}

const RESULTS_PERDIEM_SETTINGS_KEY = 'crewcheck_perdiem_user_settings_v10885';

function resultVirtualBaseAirport(): string {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESULTS_PERDIEM_SETTINGS_KEY) || '{}');
    return parsed?.baseVirtualEnabled ? String(parsed.baseVirtualAirport || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : '';
  } catch {
    return '';
  }
}

function layoverAirportForEvent(event: RosterEvent): string {
  const base = resultContractualBaseAirport(event);
  const fields = [event.day?.hotel, event.day?.pairingCode, event.subtitle, event.activity, event.day?.rawText, event.code]
    .map((value) => String(value || '').toUpperCase())
    .join(' ');
  const explicitHotel = String(event.day?.hotel || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  if (explicitHotel && !['LAY', 'INA', 'HOT', 'PER'].includes(explicitHotel) && explicitHotel !== base) return explicitHotel;

  const directPatterns = [
    /(?:PERNOITE|INATIVO\/?PERNOITE|HOTEL\s+STAY|CHEGADA\s+EM|FIM\s+DE\s+JORNADA\s+EM)\s*(?:EM|·|:|-)?\s*([A-Z]{3})\b/,
    /\b([A-Z]{3})\s*(?:FORA\s+DE\s+BASE|PERNOITE|HOTEL)\b/,
  ];
  for (const pattern of directPatterns) {
    const match = fields.match(pattern);
    if (match?.[1] && match[1] !== base) return match[1];
  }

  const knownAirports = Array.from(new Set(fields.match(/\b[A-Z]{3}\b/g) || []));
  const ignored = new Set(['ACT', 'PDF', 'AIM', 'CRM', 'EAD', 'OFF', 'DOF', 'DOP', 'HSB', 'ASB', 'RES']);
  return knownAirports.find((code) => !ignored.has(code) && code !== base) || '';
}

function resultContractualBaseAirport(event?: RosterEvent): string {
  const candidates = [
    (event?.day as any)?.base,
    (event?.day as any)?.contractualBase,
    window.localStorage.getItem('crewcheck_profile_base'),
    window.localStorage.getItem('crewcheck_base_airport'),
  ];
  for (const value of candidates) {
    const airport = String(value || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    if (airport) return airport;
  }
  return 'BSB';
}

function layoverPerDiemItemsForEvent(event: RosterEvent): EventMealItem[] {
  if (isShortGroundStopLikeLayover(event)) return [];
  const text = `${event.day?.type || ''} ${event.day?.pairingCode || ''} ${event.day?.hotel || ''} ${event.activity || ''} ${event.subtitle || ''} ${event.day?.rawText || ''}`.toUpperCase();
  // Pernoite dirigido e base virtual não geram diária automática.
  if (/PERNOITE\s+DIRIGIDO|DIRIGIDO/.test(text)) return [];
  const airport = event.perDiemLayoverAfter?.airport || layoverAirportForEvent(event);
  const base = resultContractualBaseAirport(event);
  const virtualBase = resultVirtualBaseAirport();
  if (!airport || airport === base || (virtualBase && airport === virtualBase)) return [];
  // Pernoite fora de base computa almoço e jantar. Café e ceia só entram por jornada/voo/reserva ativa.
  return EVENT_MEAL_WINDOWS.filter((meal) => meal.id === 'almoco' || meal.id === 'jantar');
}

function isMealSuppressedEvent(event: RosterEvent): boolean {
  const kind = perDiemEventKind(event);
  return kind === 'standby' || kind === 'reserve' || kind === 'training' || kind === 'flight';
}

function rangesOverlapForPerDiem(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  if (!Number.isFinite(aStart) || !Number.isFinite(aEnd) || aEnd <= aStart) return false;
  // Demonstrativo oficial paga a janela quando a atividade toca o início da refeição
  // (ex.: 09:00–11:00 gera almoço). Não conta início exatamente no fim da janela.
  return aStart < bEnd && aEnd >= bStart;
}

function coversCeiaWindow(start: number, rawEnd: number): boolean {
  const end = normalizeDisplayEnd(start, rawEnd);
  // Ceia conta se voo/reserva alcança 00:00 ou permanece ativo dentro de 00:00–01:00.
  // Encerrar 23:55/23:59 não conta; encerrar exatamente 00:00 conta como trabalho na virada.
  if (start < 60 && end > 0) return true;
  if (start < 1440 && end >= 1440) return true;
  return rangesOverlapForPerDiem(start, end, 1440, 1500);
}

function formatEventMealSummary(items: EventMealItem[]): string {
  return items.map((item) => item.activityName).join(' · ');
}

function CrewListBox({ event }: { event: RosterEvent }) {
  const legs = event.legs && event.legs.length ? event.legs : event.leg ? [event.leg] : [];
  const items = legs
    .map((leg) => ({ leg, crew: Array.isArray(leg.crew) ? leg.crew : [] }))
    .filter((item) => item.crew.length > 0);
  if (!items.length) return null;
  return (
    <div className="cc-roster-routine-box mt-2 rounded-lg border border-sky-100 bg-sky-50 p-2 text-sky-950">
      <b>Tripulação detectada:</b>
      <div className="mt-1 space-y-2">
        {items.map(({ leg, crew }) => {
          const lead = leg.ccmLead;
          const status = leg.ccmBonusStatus === 'confirmed' ? 'Adicional CCM confirmado para você' : leg.ccmBonusStatus === 'not_applicable' ? 'Adicional CCM não aplicável: outro CCM aparece antes' : 'Adicional CCM pendente';
          return (
            <div key={`${leg.flightNumber}-${leg.origin}-${leg.destination}`} className="rounded-lg bg-white/70 p-2">
              <p className="font-black">{leg.flightNumber} · {leg.origin} → {leg.destination}</p>
              <p className="mt-1 text-[11px]">Chefe efetivo: {lead ? `${lead.name} (primeiro CCM)` : 'não identificado'} · {status}</p>
              <p className="mt-1 text-[11px] leading-5">{crew.map((member: any) => `${member.role} ${member.name}${member.isCurrentCrew ? ' (você)' : ''}`).join(' · ')}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileRosterEventDetails({ event, routineSuggestions }: { event: RosterEvent; routineSuggestions: RoutineSuggestion[] }) {
  const flight = useFlightStatus(event);
  const isFlight = event.typeLabel === 'Flight' && Boolean(event.leg);
  const routineOnly = routineSuggestions.filter(isRoutineActivitySuggestion);
  const recoveryOnly = routineSuggestions.filter(isRecoverySuggestion);
  const mealOnly = eventPerDiemItems(event);
  const crewSummary = crewSummaryForRosterEvent(event);
  return (
    <div className="cc-roster-event-details mt-2 rounded-xl p-3 text-xs leading-5 shadow-inner">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><b className="text-sm">{event.activity}</b><p className="mt-0.5">{event.subtitle}</p></div>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black">{event.typeLabel}</span>
      </div>
      {isFlight && (
        <div className="cc-flight-live-grid mt-3 grid grid-cols-3 gap-2">
          <FlightMiniPill label="Status" value={flight.status || event.status || 'Scheduled'} />
          <FlightMiniPill label="Portão" value={flight.gate || '—'} />
          <FlightMiniPill label="Terminal" value={flight.terminal || '—'} />
        </div>
      )}
      {isFlight && <div className="cc-flight-detail-times mt-2 rounded-lg border border-cyan-200/10 bg-cyan-300/10 p-2 text-[11px] font-bold"><span>Apresentação: {event.day.dutyReport || '—'}</span><span className="mx-2">•</span><span>Decolagem: {event.leg?.departureTime || extractStartTime(event.time) || '—'}</span><span className="mx-2">•</span><span>Chegada: {event.leg?.arrivalTime || '—'}</span></div>}
      {isFlight && <p className="mt-2 text-[11px] font-semibold opacity-75">Dados do voo: {flight.source || 'dados online ainda não disponíveis'}{flight.updatedAt ? ` · Atualizado ${formatFlightStatusUpdatedAt(flight.updatedAt)}` : ''}</p>}
      {isFlight && <CrewListBox event={event} />}
      {event.perDiemLayoverAfter && <div className="cc-roster-routine-box mt-2 rounded-lg border border-amber-100 bg-amber-50 p-2 text-amber-900"><b>Pernoite detectado:</b> {event.perDiemLayoverAfter.airport} · tempo total {rosterLayoverDisplayDuration(event)} · último destino fora de casa. Inclui almoço e jantar quando aplicável; saída do hotel será calculada quando você alimentar a previsão.</div>}
      {isRosterDayUseHotelEvent(event) && <div className="cc-roster-routine-box mt-2 rounded-lg border border-sky-100 bg-sky-50 p-2 text-sky-950"><b>Estadia diurna:</b> descanso/hotel durante o dia, entre programações. Não é pernoite, não aguarda dados de saída de hotel e gera almoço+jantar quando aplicável.</div>}
      <div className="cc-roster-info-box mt-2 rounded-lg p-2"><b>Mais informações:</b> {rosterEventRecommendation(event)}</div>
      {routineOnly.length > 0 && <div className="cc-roster-routine-box mt-2 rounded-lg border p-2"><b>Rotina sugerida:</b><ul className="mt-1 space-y-1">{routineOnly.slice(0, 4).map((item) => <li key={item.id}>{item.startTime}–{item.endTime} · {item.activityName} · {item.suitability}</li>)}</ul></div>}
      {recoveryOnly.length > 0 && <div className="cc-roster-routine-box mt-2 rounded-lg border border-violet-100 bg-violet-50 p-2 text-violet-900"><b>Descanso/recuperação:</b><ul className="mt-1 space-y-1">{recoveryOnly.slice(0, 3).map((item) => <li key={item.id}>{item.startTime}–{item.endTime} · {item.activityName}</li>)}</ul></div>}
      {mealOnly.length > 0
        ? <div className="cc-roster-routine-box mt-2 rounded-lg border border-amber-100 bg-amber-50 p-2 text-amber-900"><b>Alimentação/diárias:</b><ul className="mt-1 space-y-1">{mealOnly.slice(0, 4).map((item) => <li key={item.id}>{item.startTime}–{item.endTime} · {item.activityName}</li>)}</ul><p className="mt-2 text-[11px] font-semibold opacity-75">Regra: aparece quando a atividade ou o pernoite imediatamente após o voo cruza a janela real de refeição.</p></div>
        : (isMealSuppressedEvent(event) && <div className="cc-roster-routine-box mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-700"><b>Diárias:</b> sem diária aplicável nesta atividade.</div>)}
    </div>
  );
}

function formatFlightStatusUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (!isValidCrewDateObject(parsed)) return 'agora';
  try { return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return 'agora'; }
}

type FlightStatusSnapshot = { status?: string; gate?: string; terminal?: string; registration?: string; aircraftIcao?: string; estimatedArrival?: string; landingCountdown?: string; source?: string; updatedAt?: string; matchedFlight?: string; scheduledTime?: string; confirmedTime?: string };

function useFlightStatus(event: RosterEvent): FlightStatusSnapshot {
  const [snapshot, setSnapshot] = useState<FlightStatusSnapshot>(() => cachedFlightStatus(event));
  useEffect(() => {
    if (event.typeLabel !== 'Flight') return;
    const statusLeg = selectBsbAwareStatusLeg(event);
    const flightNumber = statusLeg?.flightNumber || firstFlightCode(event.code);
    if (!flightNumber) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      flightNumber,
      flight: flightNumber,
      codes: event.code || flightNumber,
      origin: statusLeg?.origin || event.leg?.origin || '',
      destination: statusLeg?.destination || event.leg?.destination || '',
      route: event.activity || '',
      airport: statusLeg?.origin || statusLeg?.destination || event.leg?.origin || 'BSB',
      date: dateOnlyIsoSafe(event.date),
    });
    fetch(`/api/radar/private-status?${params.toString()}`, { signal: controller.signal, cache: 'no-store', headers: crewcheckAuthHeader() })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!payload?.ok) return;
        const next = { status: payload.status, gate: payload.gate, terminal: payload.terminal, registration: payload.registration, aircraftIcao: payload.aircraftIcao, estimatedArrival: payload.estimatedArrival, landingCountdown: payload.landingCountdown, source: payload.sourceLabel || payload.source || 'Radar CrewCheck privado', updatedAt: payload.updatedAt, matchedFlight: payload.matchedFlight || payload.flightNumber, scheduledTime: payload.scheduledTime || payload.scheduledDeparture, confirmedTime: payload.confirmedTime || payload.estimatedDeparture };
        setSnapshot(next);
        try { localStorage.setItem(flightStatusCacheKey(event), JSON.stringify(next)); } catch {}
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [event.id, event.typeLabel, event.code, event.activity, event.leg?.flightNumber, event.leg?.origin, event.leg?.destination, event.date]);
  return snapshot;
}

function selectBsbAwareStatusLeg(event: RosterEvent): FlightLeg | undefined {
  const legs = event.legs?.length ? event.legs : event.leg ? [event.leg] : [];
  return legs.find((leg) => [leg.origin, leg.destination].some((airport) => String(airport || '').toUpperCase() === 'BSB')) || legs[0];
}

function firstFlightCode(value: string): string {
  return String(value || '').toUpperCase().split(/[^A-Z0-9]+/).find((token) => /^[A-Z]{1,4}\d{2,5}$/.test(token)) || '';
}

function flightStatusCacheKey(event: RosterEvent): string {
  return `crewcheck_flight_status_${event.code || event.leg?.flightNumber || event.id}_${dateOnlyIsoSafe(event.date)}`;
}

function cachedFlightStatus(event: RosterEvent): FlightStatusSnapshot {
  if (event.typeLabel !== 'Flight') return {};
  try {
    const raw = localStorage.getItem(flightStatusCacheKey(event));
    if (raw) return JSON.parse(raw) as FlightStatusSnapshot;
  } catch {}
  return { status: event.status || 'Scheduled', gate: '—', terminal: '—', source: event.activity?.includes('BSB') ? 'BSB Aero oficial: aguardando consulta' : 'Sem dados online' };
}

function rosterEventRecommendation(event: RosterEvent): string {
  if (event.typeLabel === 'Flight') {
    const legs = event.day.legs?.length || 0;
    if (legs > 3) return 'Dia com muitas pernas. Priorize hidratação, alimentação e descanso entre etapas; rotina leve apenas se houver janela ampla.';
    if (event.day.isNextDay) return 'Voo em madrugada/virando dia. Evite treino pesado; prefira descanso ou caminhada leve após recuperação.';
    return 'Voo operacional normal. Atividades leves podem caber se houver folga real antes ou depois da apresentação.';
  }
  if (['Training','Ground Duty','Simulator'].includes(event.typeLabel)) return 'Treinamento/check separado do voo. Bom para estudo leve antes/depois, evitando compromissos colados no horário.';
  if (['Inativo','Hotel'].includes(event.typeLabel)) return 'Pernoite fora de casa. Confira hotel/deslocamento, previsão do tempo, descanso e refeições previstas antes de programar atividade.';
  if (['Day Off','Folga','Descanso'].includes(event.typeLabel)) return 'Melhor janela para rotina, treino ou compromissos, respeitando recuperação e sono.';
  if (['Reserve','Standby','Sobreaviso','Reserva'].includes(event.typeLabel)) return 'Mantenha disponibilidade. Só encaixe atividades curtas e próximas, sem risco de perder acionamento.';
  return 'Toque em Rotina para ver sugestões calculadas considerando descanso, jornada e carga do mês.';
}


function getRosterFocusEvent(events: RosterEvent[]): RosterEvent | undefined {
  if (!events.length) return undefined;
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const ordered = [...events].sort((a, b) => eventStartDate(a).getTime() - eventStartDate(b).getTime());
  const todayEvents = ordered.filter((event) => {
    const start = eventStartDate(event).getTime();
    return start >= todayStart.getTime() && start < todayEnd.getTime();
  });
  const inProgressToday = todayEvents.find((event) => eventStartDate(event).getTime() <= now.getTime() && eventEndDate(event).getTime() > now.getTime());
  if (inProgressToday) return inProgressToday;
  const upcomingToday = todayEvents.find((event) => eventEndDate(event).getTime() >= now.getTime());
  if (upcomingToday) return upcomingToday;
  if (todayEvents.length) return todayEvents[0];
  const next = ordered.find((event) => eventEndDate(event).getTime() > now.getTime());
  if (next) return next;
  return ordered.find((event) => eventStartDate(event).getTime() >= todayStart.getTime()) || ordered[ordered.length - 1];
}

function getUpcomingRosterEvents(events: RosterEvent[], limit = 5): RosterEvent[] {
  if (!events.length) return [];
  const now = new Date();
  const ordered = [...events].sort((a, b) => eventStartDate(a).getTime() - eventStartDate(b).getTime());
  return ordered.filter((event) => eventEndDate(event).getTime() > now.getTime()).slice(0, limit);
}


function isRosterEventTodayOrFuture(event: RosterEvent): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventEndDate(event).getTime() >= today.getTime();
}

function eventStartDate(event: RosterEvent): Date {
  const target = new Date(event.date);
  const [h, m] = String(event.time || '').split('–')[0].trim().split(':').map((part) => Number(part));
  if (Number.isFinite(h)) target.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  return target;
}

function eventEndDate(event: RosterEvent): Date {
  const start = eventStartDate(event);
  const range = parseDisplayTimeRange(event.time);
  if (!range) return new Date(start.getTime() + 90 * 60 * 1000);
  const end = new Date(event.date);
  const normalizedEnd = normalizeDisplayEnd(range.start, range.end);
  end.setHours(Math.floor(normalizedEnd / 60) % 24, normalizedEnd % 60, 0, 0);
  if (normalizedEnd >= 1440 || normalizedEnd <= range.start) end.setDate(end.getDate() + 1);
  return end;
}

function routineSuggestionsForDate(items: RoutineSuggestion[], dateLabel: string): RoutineSuggestion[] {
  return items.filter((item) => item.date === dateLabel).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function formatRoutineSuggestionSummary(items: RoutineSuggestion[]): string {
  return items
    .slice(0, 2)
    .map((item) => `${item.startTime} ${item.activityName}`)
    .join(' · ');
}

function DatabaseCard({ dbStatus, savedRosters, isSavingDb, onSave }: { dbStatus: DatabaseStatus | null; savedRosters: SavedRosterSummary[]; isSavingDb: boolean; onSave: () => void }) {
  const connected = Boolean(dbStatus?.ok || dbStatus?.connected);
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Banco de dados</h3>
          <p className="mt-1 text-sm text-[#60758a]">Salve a análise na base MySQL/Aiven e mantenha histórico das escalas.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${connected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{connected ? "Online" : "Configurar"}</span>
      </div>
      {!connected && <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">Configure DATABASE_URL no Render para ativar salvamento. O site continua funcionando localmente sem banco.</p>}
      <Button onClick={onSave} disabled={isSavingDb || !connected} className="w-full rounded-xl bg-[#092846] text-white hover:bg-[#0d365e] disabled:cursor-not-allowed disabled:opacity-60">
        <ShieldCheck className="h-4 w-4" /> {isSavingDb ? "Salvando..." : "Salvar análise"}
      </Button>
      {savedRosters.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#60758a]">Últimas escalas salvas</p>
          {savedRosters.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-2xl border border-[#e5edf5] bg-[#f8fbfd] p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <b className="truncate text-[#092846]">{item.sourceFileName || item.crewName || "Escala salva"}</b>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 font-black text-sky-700">{item.score ?? "-"}/100</span>
              </div>
              <p className="mt-1 text-[#60758a]">{String(item.month || '').padStart(2, '0')}/{item.year || ''} · {item.base || '-'} · alertas: {item.criticalAlertsCount}/{item.alertsCount}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({ title, description, icon: Icon, button, onClick }: { title: string; description: string; icon: LucideIcon; button: string; onClick: () => void }) {
  return <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-lg font-black">{title}</h3><p className="mt-3 text-sm leading-6 text-[#60758a]">{description}</p></div><Icon className="h-10 w-10 text-blue-100" /></div><Button onClick={onClick} variant="outline" className="w-full rounded-xl border-blue-200 text-blue-600 hover:bg-blue-50"><Icon className="h-4 w-4" /> {button}</Button></div>;
}

function MiniApp({ label, text }: { label: string; text: string }) {
  return <div className="rounded-xl border border-[#dce6ef] bg-[#f8fbfd] p-2 text-center"><p className="text-xs font-black text-blue-600">{label}</p><p className="mt-1 text-[11px] font-semibold text-[#60758a]">{text}</p></div>;
}

function SummaryLine({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: number; color: string }) {
  return <div className="flex items-center justify-between border-b border-[#edf3f8] pb-2 last:border-0"><span className="flex items-center gap-2 font-semibold text-[#425a72]"><Icon className="h-4 w-4" style={{ color }} />{label}</span><b>{value}</b></div>;
}

function ScoreCard({ title, value, icon: Icon, tone, description }: { title: string; value: string; icon: LucideIcon; tone: string; description: string }) {
  return <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-black uppercase tracking-wide text-[#61778e]">{title}</h3><Icon className="h-6 w-6" style={{ color: tone }} /></div><p className="text-3xl font-black" style={{ color: tone }}>{value}</p><p className="mt-1 text-sm text-[#60758a]">{description}</p></div>;
}

function AlertCard({ alert, onOpen }: { alert: ComplianceResult['alerts'][number]; onOpen: () => void }) {
  const isError = alert.severity === "error";
  return (
    <button onClick={onOpen} className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg ${isError ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isError ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"}`}>{isError ? <AlertTriangle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={`font-black ${isError ? "text-red-900" : "text-amber-950"}`}>{alert.title}</h4>
            {alert.date && <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-bold">{alert.date}</span>}
            {alert.classification && <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-black">{alert.classification === "confirmada" ? "Confirmada" : alert.classification === "leitura_inconsistente" ? "Leitura incerta" : "Atenção"}</span>}
            {alert.confidence && <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-black">Confiança: {alert.confidence}</span>}
          </div>
          <p className={`mt-1 text-sm leading-6 ${isError ? "text-red-800" : "text-amber-900"}`}>{alert.description}</p>
          {alert.details && <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#60758a]">{alert.details}</p>}
          <p className="mt-2 text-xs font-black text-[#092846]">Clique para abrir explicação completa{alert.date ? ' e acessar o dia da escala' : ''}.</p>
        </div>
        <MoreHorizontal className="mt-2 h-5 w-5 text-[#60758a]" />
      </div>
    </button>
  );
}

function IrregularityDetailPage({ alert, onBack, onOpenDay, isAdminUser, onSuppressFalsePositive }: { alert: ComplianceResult['alerts'][number]; onBack: () => void; onOpenDay: () => void; isAdminUser: boolean; onSuppressFalsePositive: () => void }) {
  const isError = alert.severity === "error";
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className={`rounded-[1.25rem] border bg-white p-6 shadow-[0_14px_45px_rgba(20,54,84,0.07)] ${isError ? "border-red-100" : "border-amber-100"}`}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <button onClick={onBack} className="rounded-xl border border-[#d8e4ee] px-4 py-2 text-sm font-black text-[#092846] hover:bg-[#f7fbff]">← Voltar às irregularidades</button>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${isError ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>{isError ? "Irregularidade" : "Ponto de atenção"}</span>
        </div>
        <h3 className="text-2xl font-black text-[#092846]">{alert.title}</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {alert.date && <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-black text-sky-700">Dia citado: {alert.date}</span>}
          {alert.classification && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-[#092846]">{alert.classification === "confirmada" ? "Irregularidade confirmada" : alert.classification === "leitura_inconsistente" ? "Leitura incerta — revisar PDF" : "Ponto de atenção"}</span>}
          {alert.confidence && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-[#092846]">Confiança: {alert.confidence}</span>}
        </div>
        <div className="mt-5 space-y-4 text-sm leading-7 text-[#425a72]">
          <div className="rounded-2xl bg-[#f7fbff] p-4"><p className="font-black text-[#092846]">O que o sistema encontrou</p><p className="mt-1">{alert.description}</p></div>
          {alert.details && <div className="rounded-2xl bg-[#f7fbff] p-4"><p className="font-black text-[#092846]">Detalhes do cálculo</p><p className="mt-1 whitespace-pre-wrap">{alert.details}</p></div>}
          {alert.evidence && <div className="rounded-2xl bg-[#f7fbff] p-4"><p className="font-black text-[#092846]">Evidência de leitura</p><p className="mt-1 whitespace-pre-wrap">{alert.evidence}</p></div>}
          {alert.legalReference && <div className="rounded-2xl bg-[#f7fbff] p-4"><p className="font-black text-[#092846]">Base usada</p><p className="mt-1">{alert.legalReference}</p></div>}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><p className="font-black">Como interpretar</p><p className="mt-1">O CrewCheck só classifica como irregularidade automática quando consegue calcular o item pelo PDF. Quando depender de ACT/CCT, tipo de tripulação, GRF/SGRF, extensão registrada, manual do operador ou interpretação sindical/empresa, o alerta fica como revisão.</p></div>
        </div>
      </section>
      <aside className="space-y-3">
        {alert.date && <Button onClick={onOpenDay} className="w-full rounded-xl bg-[#092846] text-white hover:bg-[#0d365e]"><CalendarDays className="h-4 w-4" /> Abrir dia na escala</Button>}
        {isAdminUser && <Button onClick={onSuppressFalsePositive} variant="outline" className="w-full rounded-xl border-emerald-200 text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Ensinar falso positivo</Button>}
        <Button onClick={onBack} variant="outline" className="w-full rounded-xl border-[#d8e4ee]"><ShieldAlert className="h-4 w-4" /> Ver outros alertas</Button>
      </aside>
    </div>
  );
}



function StatisticsPanel({ storedStats, savedRosters }: { storedStats: StoredStatsResponse | null; savedRosters: SavedRosterSummary[] }) {
  if (!storedStats) {
    return (
      <section className="rounded-[1.25rem] border border-white bg-white p-6 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <h3 className="text-2xl font-black text-[#092846]">Gerenciador de Escalas</h3>
        <p className="mt-2 text-sm leading-6 text-[#60758a]">Suas escalas salvas aparecem aqui para consulta. Para tornar ativa, excluir ou reprocessar, abra o Gerenciador pelo menu principal.</p>
      </section>
    );
  }

  const personal = storedStats.personal.summary;
  const global = storedStats.global.summary;
  return (
    <div className="space-y-4">
      <section className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-5 text-amber-950 shadow-[0_14px_45px_rgba(20,54,84,0.05)]">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h3 className="text-lg font-black">Gerenciador, histórico e comparativo</h3>
            <p className="mt-1 text-sm leading-6">{storedStats.notice}</p>
            <p className="mt-1 text-sm leading-6">Os dados são auxiliares, agregados e destinados apenas à organização pessoal. Não use estes números como prova, reclamação formal ou apresentação à empresa.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <StatsSummaryCard title="Seu histórico" subtitle="Escalas salvas na sua conta" summary={personal} tone="#2f80ed" />
        <StatsSummaryCard title="Quadro comparativo geral" subtitle="Amostra agregada e superficial" summary={global} tone="#7c3aed" />
      </section>

      <section className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-[#092846]">Histórico das suas escalas</h3>
            <p className="mt-1 text-sm text-[#60758a]">Visão mensal simplificada das escalas armazenadas.</p>
          </div>
          <span className="rounded-full bg-[#eef5fb] px-3 py-1 text-xs font-black text-[#092846]">{storedStats.personal.periods.length} período(s)</span>
        </div>
        {storedStats.personal.periods.length === 0 ? (
          <p className="rounded-2xl bg-[#f7fbff] p-4 text-sm text-[#60758a]">Nenhuma escala salva ainda. Após enviar uma escala, o CrewCheck tenta salvar automaticamente; este botão fica como reforço/manual.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-[#60758a]"><tr><th className="py-3">Período</th><th>Eventos/voos</th><th>Folgas</th><th>Pernoites</th><th>Academia</th><th>Dias pesados</th><th>Alertas</th><th>Puxada</th></tr></thead>
              <tbody className="divide-y divide-[#e7eef5]">
                {storedStats.personal.periods.map((period) => (
                  <tr key={period.id} className="text-[#092846]"><td className="py-3 font-black">{period.period}</td><td>{period.flightSegments}</td><td>{period.daysOff}</td><td>{period.layovers}</td><td>{period.gymGoodDays}</td><td>{period.heavyDays}</td><td>{period.criticalAlertsCount}/{period.alertsCount}</td><td>{period.intensityScore}/100</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black text-[#092846]">Escalas salvas recentemente</h3>
          <div className="mt-4 space-y-2">
            {savedRosters.length === 0 ? <p className="text-sm text-[#60758a]">Nenhum registro recente encontrado.</p> : savedRosters.map((item) => <div key={item.id} className="rounded-2xl bg-[#f7fbff] p-3 text-sm"><p className="font-black text-[#092846]">{String(item.month || '').padStart(2, '0')}/{item.year || '----'} · {item.base || 'Base'}</p><p className="mt-1 text-xs text-[#60758a]">Score {item.score ?? '-'} · Puxada {item.intensityScore ?? '-'} · Alertas {item.criticalAlertsCount ?? 0}/{item.alertsCount ?? 0}</p></div>)}
          </div>
        </div>
        <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
          <h3 className="text-xl font-black text-[#092846]">Como ler os números</h3>
          <div className="mt-4 space-y-3 text-sm leading-6 text-[#60758a]">
            <p><b className="text-[#092846]">Seu histórico:</b> usa apenas escalas salvas na sua conta.</p>
            <p><b className="text-[#092846]">Comparativo geral:</b> usa registros agregados da base, sem servir como referência oficial.</p>
            <p><b className="text-[#092846]">LGPD:</b> o uso é limitado à sua organização pessoal e análise funcional da escala.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatsSummaryCard({ title, subtitle, summary, tone }: { title: string; subtitle: string; summary: StoredStatsResponse['personal']['summary']; tone: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-black text-[#092846]">{title}</h3><p className="mt-1 text-sm text-[#60758a]">{subtitle}</p></div><span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: `${tone}16`, color: tone }}>{summary.rostersCount} escala(s)</span></div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatMini label="Puxada média" value={`${summary.avgIntensity}/100`} />
        <StatMini label="Alertas críticos" value={String(summary.avgCriticalAlerts)} />
        <StatMini label="Voos/eventos" value={String(summary.avgFlightSegments)} />
        <StatMini label="Folgas" value={String(summary.avgDaysOff)} />
        <StatMini label="Pernoites" value={String(summary.avgLayovers)} />
        <StatMini label="Academia" value={String(summary.avgGymGoodDays)} />
      </div>
      <p className="mt-4 text-xs font-semibold text-[#71869b]">Período: {summary.firstPeriod || '-'} até {summary.lastPeriod || '-'}</p>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#f7fbff] p-3"><p className="text-xs font-bold uppercase text-[#71869b]">{label}</p><p className="mt-1 text-lg font-black text-[#092846]">{value}</p></div>;
}

function LegalLine({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl bg-[#f7fbff] p-3"><p className="font-black text-[#092846]">{title}</p><p className="mt-1 text-[#60758a]">{text}</p></div>;
}

function RecommendationBlock({ title, items, empty, compact = false }: { title: string; items: GymRecommendation[]; empty: string; compact?: boolean }) {
  return (
    <div className="rounded-[1.25rem] border border-white bg-white p-5 shadow-[0_14px_45px_rgba(20,54,84,0.07)]">
      <h3 className="text-xl font-black">{title}</h3>
      {items.length === 0 ? <p className="mt-3 rounded-2xl bg-[#f7fbff] p-4 text-sm text-[#60758a]">{empty}</p> : <div className={`mt-4 grid gap-3 ${compact ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-3"}`}>{items.map((item) => <GymCard key={`${item.date}-${item.priority}`} item={item} />)}</div>}
    </div>
  );
}

function GymCard({ item }: { item: GymRecommendation }) {
  const style = item.priority === "high" ? { bg: "#e9f8ee", fg: "#15963a" } : item.priority === "medium" ? { bg: "#eaf2ff", fg: "#2563eb" } : { bg: "#fff0df", fg: "#e36c0a" };
  const confidence = item.confidence || (item.dayType === 'OTHER' ? 'baixa' : 'alta');
  return (
    <div className="rounded-2xl border border-[#e5edf5] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-bold uppercase text-[#60758a]">{item.dayType}</p><h4 className="text-lg font-black">{item.date}</h4></div>
        <span className="rounded-full px-3 py-1 text-xs font-black" style={{ backgroundColor: style.bg, color: style.fg }}>{item.recoveryScore}/100</span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm font-bold text-[#092846]"><Dumbbell className="h-4 w-4" />{item.suggestedTime} · {item.suggestedDuration}</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">{item.planType || 'moderado'}</span>
        <span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">Confiança {confidence}</span>
        <span className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-black text-[#425a72]">Carga {item.loadScore}/100</span>
      </div>
      <p className="mt-2 text-sm leading-6 text-[#60758a]">{item.reason}</p>
      {item.focus && <p className="mt-2 text-xs leading-5 text-[#425a72]"><b>Foco:</b> {item.focus}</p>}
      {item.caution && <p className="mt-1 text-xs leading-5 text-amber-700"><b>Cuidado:</b> {item.caution}</p>}
    </div>
  );
}

function LoadCard({ day, compact = false }: { day: DayLoadAnalysis; compact?: boolean }) {
  const color = day.fatigueScore >= 75 ? "#dc2626" : day.fatigueScore >= 55 ? "#f97316" : day.fatigueScore >= 30 ? "#2563eb" : "#15963a";
  return (
    <div className="rounded-2xl border border-[#e5edf5] bg-[#fbfdff] p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[#60758a]">{day.dayOfWeek}</p><h4 className="text-lg font-black">{day.date}</h4><p className="mt-1 text-sm font-semibold text-[#425a72]">{day.label}</p></div><span className="rounded-full px-3 py-1 text-xs font-black text-white" style={{ backgroundColor: color }}>{day.fatigueScore}/100</span></div>
      {!compact && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><MiniMetric label="Jornada" value={`${day.dutyHours}h`} /><MiniMetric label="Voo" value={`${day.flightHours}h`} /><MiniMetric label="Trechos" value={String(day.sectors)} /></div>}
      <div className="mt-3 flex flex-wrap gap-1.5">{day.reasons.slice(0, compact ? 2 : 4).map((reason) => <span key={reason} className="rounded-full bg-[#eef3f8] px-2 py-1 text-xs font-semibold text-[#60758a]">{reason}</span>)}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#eef5fb] px-2 py-2"><p className="font-bold text-[#60758a]">{label}</p><p className="mt-1 font-black text-[#092846]">{value}</p></div>;
}


function layoverDisplayCardQuality(event: RosterEvent): number {
  if (!isRosterLayoverDisplayCard(event)) return 0;
  const lay = event.perDiemLayoverAfter;
  let score = 0;
  if (lay?.startAbs) score += 30;
  if (lay?.endAbs) score += 20;
  if (lay?.nextPresentationLabel) score += 18;
  if (lay?.durationLabel) score += 12;
  if (lay?.openEnded === false) score += 8;
  const start = lay?.startAbs || eventAbsoluteStart(event);
  score += Math.min(12, Math.max(0, start % 1440) / 120);
  return score;
}

function dedupeSameDayLayoverCards(events: RosterEvent[]): RosterEvent[] {
  const result: RosterEvent[] = [];
  const layoverByKey = new Map<string, RosterEvent>();
  for (const event of events) {
    if (!isRosterLayoverDisplayCard(event)) {
      result.push(event);
      continue;
    }
    const airport = layoverAirportForEvent(event) || event.perDiemLayoverAfter?.airport || normalizeEventCode(event).replace(/^PERNOITE\s*/, '');
    const key = `${formatRosterDate(event.date)}|${airport || 'LAYOVER'}`;
    const previous = layoverByKey.get(key);
    if (!previous || layoverDisplayCardQuality(event) >= layoverDisplayCardQuality(previous)) {
      layoverByKey.set(key, event);
    }
  }
  return [...result, ...layoverByKey.values()];
}


function rosterVisualGroupKey(event: RosterEvent): string {
  const monthIndex = Math.max(0, MONTHS_SHORT.indexOf(String(event.monthLabel || '').toUpperCase()));
  const year = isValidCrewDateObject(event.date) ? event.date.getFullYear() : new Date().getFullYear();
  const day = Number(event.dayNumber || '');
  if (day >= 1 && day <= 31 && monthIndex >= 0) return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return formatRosterDate(event.date);
}

function buildDailyRosterGroups(events: RosterEvent[]): RosterDayGroup[] {
  const byDate = new Map<string, RosterEvent[]>();
  for (const event of events) {
    // v11.1.37: agrupar por data real, não pelo dateLabel vindo de escalas anexadas.
    // Isso evita dois grupos visuais para o mesmo dia quando há escala subjacente/mês anterior.
    const canonicalDateLabel = rosterVisualGroupKey(event);
    const normalizedEvent = { ...event, dateLabel: canonicalDateLabel, ...rosterEventDatePartsFromDate(event.date) };
    const list = byDate.get(canonicalDateLabel) || [];
    list.push(normalizedEvent);
    byDate.set(canonicalDateLabel, list);
  }

  return Array.from(byDate.entries())
    .map(([dateLabel, list]) => {
      const prepared = sanitizeRosterRestEvents(dedupeSameDayLayoverCards(list));
      const sorted = sortRosterEventsForDisplay(sanitizeRosterRestEvents(collapseSameDayFragments(adjustSequentialDisplayTimes([...prepared].sort((a, b) => timeToSortValue(extractStartTime(a.time)) - timeToSortValue(extractStartTime(b.time)))))));
      const first = sorted[0];
      return {
        id: `day-${dateLabel}`,
        date: first.date,
        dateLabel,
        weekday: first.weekday,
        dayNumber: first.dayNumber,
        monthLabel: first.monthLabel,
        time: dayGroupTimeLabel(sorted),
        events: sorted,
      };
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

function collapseSameDayFragments(events: RosterEvent[]): RosterEvent[] {
  const result: RosterEvent[] = [];
  for (const event of events) {
    const code = normalizeEventCode(event);
    const previous = result[result.length - 1];
    const prevCode = previous ? normalizeEventCode(previous) : '';
    const eventRange = parseDisplayTimeRange(event.time);
    const prevRange = previous ? parseDisplayTimeRange(previous.time) : null;
    const isFragmentCode = /^(HSB|HSBE|ASB|RES)$/.test(code);
    if (previous && isFragmentCode && code === prevCode && eventRange && prevRange) {
      const distance = Math.abs(eventRange.start - prevRange.end);
      const hasZero = eventRange.start === eventRange.end || prevRange.start === prevRange.end;
      if (hasZero || distance <= 90 || eventRange.start <= prevRange.end + 90) {
        const start = Math.min(prevRange.start, eventRange.start);
        const end = Math.max(normalizeDisplayEnd(prevRange.start, prevRange.end), normalizeDisplayEnd(eventRange.start, eventRange.end));
        result[result.length - 1] = { ...previous, id: `${previous.id}__merged__${event.id}`, time: `${minutesToDisplayTime(start)} – ${minutesToDisplayTime(end)}` };
        continue;
      }
    }
    result.push(event);
  }
  return result;
}

function adjustSequentialDisplayTimes(events: RosterEvent[]): RosterEvent[] {
  let previousEnd: number | null = null;
  return events.map((event) => {
    const parsed = parseDisplayTimeRange(event.time);
    if (!parsed) return event;

    let { start, end } = parsed;
    const normalizedEnd = normalizeDisplayEnd(start, end);
    const isAdjustable = event.typeLabel !== "Flight";

    if (isAdjustable && previousEnd !== null && start <= previousEnd && previousEnd - start <= 20) {
      const newStart = previousEnd + 1;
      const newEnd = normalizedEnd <= newStart ? newStart + Math.max(30, normalizedEnd - start || 60) : normalizedEnd;
      const adjusted = { ...event, time: `${minutesToDisplayTime(newStart)} – ${minutesToDisplayTime(newEnd)}` };
      previousEnd = Math.max(previousEnd, newEnd);
      return adjusted;
    }

    previousEnd = previousEnd === null ? normalizedEnd : Math.max(previousEnd, normalizedEnd);
    return event;
  });
}

function dayGroupTimeLabel(events: RosterEvent[]): string {
  const ranges = events.map((event) => parseDisplayTimeRange(event.time)).filter((range): range is { start: number; end: number } => Boolean(range));
  if (!ranges.length) return "All Day";
  const start = Math.min(...ranges.map((range) => range.start));
  const end = Math.max(...ranges.map((range) => normalizeDisplayEnd(range.start, range.end)));
  return `${minutesToDisplayTime(start)} – ${minutesToDisplayTime(end)}`;
}

function isRosterLayoverDisplayCard(event: RosterEvent): boolean {
  if (event.perDiemLayoverAfter) return isValidSyntheticLayoverEvent(event);
  if (isShortGroundStopLikeLayover(event) || shouldSuppressRawRosterLayoverEvent(event)) return false;
  const source = `${event.activity || ''} ${event.code || ''} ${event.typeLabel || ''} ${event.status || ''}`.toUpperCase();
  return /\bPERNOITE\b/.test(source);
}

function rosterEventDisplayOrder(event: RosterEvent, groupHasOperationalProgram = false): number {
  if (!isRosterLayoverDisplayCard(event)) return 0;
  // v11.1.37: pernoite é sempre rodapé operacional do dia quando há programação.
  // Isso impede que 00:00–23:59 ou escala anexada subam antes dos voos que geraram o descanso.
  return groupHasOperationalProgram ? 900 : 90;
}

function isRosterOperationalProgramEvent(event: RosterEvent): boolean {
  if (isRosterLayoverDisplayCard(event)) return false;
  const type = String(event.typeLabel || '').toUpperCase();
  return ['FLIGHT','RESERVE','RESERVA','STANDBY','SOBREAVISO','TRAINING','GROUND DUTY','SIMULATOR','MEETING','TRANSPORT'].includes(type);
}

function sortRosterEventsForDisplay(events: RosterEvent[]): RosterEvent[] {
  const groupHasOperationalProgram = events.some(isRosterOperationalProgramEvent);
  return [...events].sort((a, b) => {
    const orderA = rosterEventDisplayOrder(a, groupHasOperationalProgram);
    const orderB = rosterEventDisplayOrder(b, groupHasOperationalProgram);
    if (orderA !== orderB) return orderA - orderB;
    const absA = isRosterLayoverDisplayCard(a) && a.perDiemLayoverAfter ? a.perDiemLayoverAfter.startAbs : eventAbsoluteStart(a);
    const absB = isRosterLayoverDisplayCard(b) && b.perDiemLayoverAfter ? b.perDiemLayoverAfter.startAbs : eventAbsoluteStart(b);
    if (absA !== absB) return absA - absB;
    return timeToSortValue(extractStartTime(a.time)) - timeToSortValue(extractStartTime(b.time));
  });
}

function parseDisplayTimeRange(time: string): { start: number; end: number } | null {
  const matches = String(time || '').match(/\b\d{1,2}:\d{2}\b/g);
  if (!matches || matches.length < 2) return null;
  return { start: timeToSortValue(matches[0]), end: timeToSortValue(matches[1]) };
}

function extractStartTime(time: string): string {
  return String(time || '').match(/\b\d{1,2}:\d{2}\b/)?.[0] || '';
}

function normalizeDisplayEnd(start: number, end: number): number {
  return end < start ? end + 1440 : end;
}

function minutesToDisplayTime(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatStackedTime(time: string): ReactNode {
  if (time === 'All Day') return <span className="cc-time-stack cc-time-stack-single">Dia todo</span>;
  const matches = String(time || '').match(/\b\d{1,2}:\d{2}\b/g);
  if (!matches || matches.length < 2) return <span className="cc-time-stack cc-time-stack-single">{time}</span>;
  return <span className="cc-time-stack"><span className="cc-time-start">{matches[0]}</span><span className="cc-time-arrow">→</span><span className="cc-time-end">{matches[1]}</span></span>;
}

function isRosterStaleForLive(roster: CrewRoster | null | undefined): boolean {
  if (!roster?.days?.length) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const latest = Math.max(...roster.days.map((day, index) => parseRosterDate(day.date, fallbackRosterDate(roster.month, roster.year, index + 1)).getTime()).filter((value) => Number.isFinite(value)));
  return Number.isFinite(latest) && latest < today.getTime();
}

function currentRosterMonthLabel(roster: CrewRoster): string {
  const firstDate = roster.days[0] ? parseRosterDate(roster.days[0].date, fallbackRosterDate(roster.month, roster.year)) : new Date();
  const month = Number(roster.month) || (isValidCrewDateObject(firstDate) ? firstDate.getMonth() + 1 : 0);
  const year = Number(roster.year) || (isValidCrewDateObject(firstDate) ? firstDate.getFullYear() : new Date().getFullYear());
  return month ? `${String(month).padStart(2, '0')}/${year}` : String(year);
}


function rosterLocalDayIndex(date: Date): number {
  const safe = isValidCrewDateObject(date) ? date : new Date();
  // v11.1.46: dia local puro evita deslocamento UTC bagunçar estadia/pernoite.
  return Math.floor(Date.UTC(safe.getFullYear(), safe.getMonth(), safe.getDate()) / 86400000);
}

function eventAbsoluteStart(event: RosterEvent): number {
  const range = parseDisplayTimeRange(event.time);
  return rosterLocalDayIndex(event.date) * 1440 + (range?.start ?? timeToSortValue(extractStartTime(event.time)) ?? 0);
}

function eventAbsoluteEnd(event: RosterEvent): number {
  const range = parseDisplayTimeRange(event.time);
  const start = range?.start ?? timeToSortValue(extractStartTime(event.time)) ?? 0;
  const end = range ? normalizeDisplayEnd(range.start, range.end) : start;
  return rosterLocalDayIndex(event.date) * 1440 + end;
}

function rosterLayoverDisplayDuration(event: RosterEvent): string {
  const layover = event.perDiemLayoverAfter;
  if (layover?.durationLabel) return layover.durationLabel;
  if (layover?.startAbs != null && layover?.endAbs != null) return rosterLayoverDurationLabel(layover.startAbs, layover.endAbs);
  const range = parseDisplayTimeRange(event.time);
  if (range) return rosterLayoverDurationLabel(0, Math.max(0, normalizeDisplayEnd(range.start, range.end) - range.start));
  return String(event.time || '').trim() || 'tempo a confirmar';
}

function rosterLayoverCompactTime(event: RosterEvent): string {
  if (event.dayUseHotel?.durationLabel) return event.dayUseHotel.durationLabel;
  if (event.perDiemLayoverAfter) return rosterLayoverDisplayDuration(event);
  return event.time;
}

function rosterLayoverSubtitle(event: RosterEvent): string {
  if (event.dayUseHotel) {
    const airport = event.dayUseHotel.airport || layoverAirportForEvent(event) || '';
    const duration = event.dayUseHotel.durationLabel || rosterLayoverDisplayDuration(event);
    return `Estadia diurna em ${airportCity(airport)} · ${duration} · detalhes na seta`;
  }
  if (event.perDiemLayoverAfter) {
    const airport = event.perDiemLayoverAfter.airport || layoverAirportForEvent(event) || '';
    const duration = rosterLayoverDisplayDuration(event);
    const suffix = event.perDiemLayoverAfter.openEnded ? 'a confirmar' : duration;
    return `Descanso em ${airportCity(airport)} · ${suffix} · detalhes na seta`;
  }
  return event.subtitle;
}


function rosterLayoverDurationLabel(startAbs: number, endAbs: number): string {
 const minutes = Math.max(0, Math.round(endAbs - startAbs));
 const days = Math.floor(minutes / 1440);
 const hours = Math.floor((minutes % 1440) / 60);
 const mins = minutes % 60;
 if (days > 0) return `${days}d ${hours}h${mins ? ` ${mins}min` : ''}`;
 if (hours > 0) return `${hours}h${mins ? ` ${mins}min` : ''}`;
 return `${mins}min`;
}

function rosterClockFromAbs(abs: number): string {
 const local = ((Math.round(abs) % 1440) + 1440) % 1440;
 return minutesToDisplayTime(local);
}

function rosterDateFromAbsoluteMinutes(abs: number): Date {
  const dayIndex = Math.floor(Math.round(abs) / 1440);
  const utc = new Date(dayIndex * 86400000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate(), 12, 0, 0, 0);
}

function rosterEventDatePartsFromDate(date: Date) {
 return {
  dateLabel: formatRosterDate(date),
  weekday: WEEKDAYS_SHORT[date.getDay()],
  dayNumber: String(date.getDate()).padStart(2, '0'),
  monthLabel: MONTHS_SHORT[date.getMonth()],
 };
}

function rosterLayoverCardDateFor(current: RosterEvent, currentEnd: number): Date {
 const currentStartDay = Math.floor(eventAbsoluteStart(current) / 1440);
 const currentEndDay = Math.floor(currentEnd / 1440);
 // Se o corte dos motores/chegada ocorrer após a meia-noite, o card fica somente no dia seguinte.
 if (currentEndDay > currentStartDay) return rosterDateFromAbsoluteMinutes(currentEnd);
 return current.date;
}

function restCardLocalDateForAbs(abs: number): Date {
  return rosterDateFromAbsoluteMinutes(abs);
}

function isSameOperationalDateAbs(a: number, b: number): boolean {
  return Math.floor(a / 1440) === Math.floor(b / 1440);
}

function makeDayUseHotelCard(current: RosterEvent, next: RosterEvent, airport: string, currentEnd: number, nextStart: number): RosterEvent {
  const restAirport = rosterRestAirportCode(current.leg?.destination) || airport;
  const durationMinutes = Math.max(0, Math.round(nextStart - currentEnd));
  const durationLabel = rosterLayoverDurationLabel(currentEnd, nextStart);
  const date = restCardLocalDateForAbs(currentEnd);
  const dateParts = rosterEventDatePartsFromDate(date);
  return {
    ...current,
    ...dateParts,
    id: `CREWCHECK-REST-DAYUSE-${current.id}-${restAirport}-${Math.round(currentEnd)}-${Math.round(nextStart)}`,
    date,
    leg: undefined,
    legs: [],
    time: `${rosterClockFromAbs(currentEnd)} – ${rosterClockFromAbs(nextStart)}`,
    activity: `Estadia diurna · ${restAirport}`,
    subtitle: `Estadia diurna em ${airportCity(restAirport)} · ${durationLabel} · detalhes na seta`,
    code: `ESTADIA DIURNA ${restAirport}`,
    typeLabel: 'Hotel diurno',
    status: 'Estadia diurna',
    dayUseHotel: {
      airport: restAirport,
      durationMinutes,
      durationLabel,
      presentationLabel: rosterClockFromAbs(nextStart),
      hotelStay: true,
      meals: ['Almoço', 'Jantar'],
      reason: `Estadia diurna entre programações no mesmo dia: chegada/corte às ${rosterClockFromAbs(currentEnd)} e próxima apresentação/partida às ${rosterClockFromAbs(nextStart)}. Não é pernoite, mas gera diária de hotel igual quando fora da base contratual/virtual.`,
    },
    perDiemLayoverAfter: undefined,
  };
}

function makeOvernightCard(current: RosterEvent, next: RosterEvent, airport: string, currentEnd: number, nextStart: number): RosterEvent {
  const restAirport = rosterRestAirportCode(current.leg?.destination) || airport;
  const date = rosterLayoverCardDateFor(current, currentEnd);
  const dateParts = rosterEventDatePartsFromDate(date);
  const durationLabel = rosterLayoverDurationLabel(currentEnd, nextStart);
  const layover = {
    airport: restAirport,
    startAbs: currentEnd,
    endAbs: nextStart,
    openEnded: false,
    durationLabel,
    weatherDate: dateOnlyIsoSafe(date),
    nextPresentationLabel: rosterClockFromAbs(nextStart),
    engineCutLabel: rosterClockFromAbs(currentEnd),
    meals: ['Almoço', 'Jantar'],
    reason: `Pernoite real fora de casa: descanso cruza a noite/dia operacional e tem ${durationLabel}. Gera almoço e jantar no card quando fora da casa/base.`,
  };
  return {
    ...current,
    ...dateParts,
    date,
    id: `CREWCHECK-REST-OVERNIGHT-${current.id}-${restAirport}-${Math.round(currentEnd)}-${Math.round(nextStart)}`,
    leg: undefined,
    legs: [],
    time: durationLabel,
    activity: `Pernoite · ${restAirport}`,
    subtitle: `Descanso em ${airportCity(restAirport)} · ${durationLabel} · detalhes na seta`,
    code: `PERNOITE ${restAirport}`,
    typeLabel: 'Inativo',
    status: 'Pernoite',
    perDiemLayoverAfter: layover,
    dayUseHotel: undefined,
  };
}

function makeOpenEndedOvernightCard(current: RosterEvent, airport: string, currentEnd: number): RosterEvent {
  const restAirport = rosterRestAirportCode(current.leg?.destination) || airport;
  const date = rosterLayoverCardDateFor(current, currentEnd);
  const dateParts = rosterEventDatePartsFromDate(date);
  const estimatedEnd = currentEnd + RESULTS_MIN_LAYOVER_REST_MINUTES;
  const layover = {
    airport: restAirport,
    startAbs: currentEnd,
    endAbs: estimatedEnd,
    openEnded: true,
    durationLabel: 'a confirmar',
    weatherDate: dateOnlyIsoSafe(date),
    engineCutLabel: rosterClockFromAbs(currentEnd),
    meals: ['Almoço', 'Jantar'],
    reason: 'Pernoite provável no último destino visível da escala. A duração e a apresentação serão confirmadas quando a próxima escala/mês ou saída do hotel forem informados.',
  };
  return {
    ...current,
    ...dateParts,
    date,
    id: `CREWCHECK-REST-OPEN-OVERNIGHT-${current.id}-${restAirport}-${Math.round(currentEnd)}`,
    leg: undefined,
    legs: [],
    time: 'a confirmar',
    activity: `Pernoite · ${restAirport}`,
    subtitle: `Descanso em ${airportCity(restAirport)} · apresentação a confirmar · detalhes na seta`,
    code: `PERNOITE ${restAirport}`,
    typeLabel: 'Inativo',
    status: 'Pernoite',
    perDiemLayoverAfter: layover,
    dayUseHotel: undefined,
  };
}

function restLocalClockFromAbs(abs: number): number {
  return ((Math.round(abs) % 1440) + 1440) % 1440;
}

function isStrictDayUseRest(currentEnd: number, nextStart: number, gap: number): boolean {
  if (gap < RESULTS_DAY_USE_MIN_REST_MINUTES) return false;
  if (!isSameOperationalDateAbs(currentEnd, nextStart)) return false;
  const endClock = restLocalClockFromAbs(currentEnd);
  const nextClock = restLocalClockFromAbs(nextStart);
  // Estadia diurna/"perdia": dia no hotel, entre chegada manhã/meio-dia e reapresentação à noite.
  return endClock >= 5 * 60 && endClock <= 14 * 60 + 30 && nextClock >= 18 * 60;
}

function isStrictOvernightRest(currentEnd: number, nextStart: number, gap: number): boolean {
  if (gap < RESULTS_MIN_LAYOVER_REST_MINUTES) return false;
  if (isStrictDayUseRest(currentEnd, nextStart, gap)) return false;
  const endDay = Math.floor(currentEnd / 1440);
  const nextDay = Math.floor(nextStart / 1440);
  const endClock = restLocalClockFromAbs(currentEnd);
  const nextClock = restLocalClockFromAbs(nextStart);
  // Pernoite real: cruza dia local ou nasce após voo noturno/madrugada com próxima saída de manhã.
  return nextDay > endDay || endClock < 5 * 60 || endClock >= 20 * 60 || nextClock < 10 * 60;
}

function classifyRestBetweenFlights(current: RosterEvent, next: RosterEvent | undefined, base: string, virtualBase = ''): RosterEvent | null {
  if (!current.leg || !next?.leg) return null;
  const airport = rosterRestAirportCode(current.leg.destination);
  const nextOrigin = rosterRestAirportCode(next.leg.origin);
  // v11.1.45: descanso sintético só nasce quando o próximo voo cronológico sai do mesmo aeroporto.
  // Não pula voos intermediários para procurar outro voo futuro, pois isso gerava cartões trocados/duplicados.
  if (!airport || airport !== nextOrigin || airport === base || (virtualBase && airport === virtualBase)) return null;
  const currentEnd = eventAbsoluteEnd(current);
  const nextStart = eventAbsoluteStart(next);
  const gap = Math.round(nextStart - currentEnd);
  if (!Number.isFinite(gap) || gap <= 0 || gap > 6 * 24 * 60) return null;

  // 0h a 3h: apenas tempo em solo/conexão.
  if (gap <= RESULTS_SHORT_GROUND_STOP_MAX_MINUTES) return null;

  // 3h a 11h59: descanso operacional longo, mas não cria hotel/pernoite automático.
  if (gap < RESULTS_MIN_LAYOVER_REST_MINUTES) return null;

  if (isStrictDayUseRest(currentEnd, nextStart, gap)) return makeDayUseHotelCard(current, next, airport, currentEnd, nextStart);
  if (isStrictOvernightRest(currentEnd, nextStart, gap)) return makeOvernightCard(current, next, airport, currentEnd, nextStart);

  // Mesmo dia, 12h+, mas sem padrão de "dia no hotel" nem noite: não inventar cartão.
  return null;
}

function markLayoverAfterFlights(events: RosterEvent[], roster: CrewRoster): RosterEvent[] {
  const base = String(roster.base || 'BSB').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'BSB';
  const virtualBase = resultVirtualBaseAirport();
  const sanitizedEvents = sanitizeRosterRestEvents(events);
  const flights = [...sanitizedEvents]
    .filter((event) => event.typeLabel === 'Flight' && event.leg)
    .sort((a, b) => eventAbsoluteStart(a) - eventAbsoluteStart(b));
  const synthetic: RosterEvent[] = [];

  for (let index = 0; index < flights.length - 1; index += 1) {
    const current = flights[index];
    const next = flights[index + 1];
    const away = rosterRestAirportCode(current.leg?.destination);
    if (!away || away === base || (virtualBase && away === virtualBase)) continue;
    const card = classifyRestBetweenFlights(current, next, base, virtualBase);
    if (card) synthetic.push(card);
  }

  const lastFlight = flights[flights.length - 1];
  const lastAway = rosterRestAirportCode(lastFlight?.leg?.destination);
  if (lastFlight?.leg && lastAway && lastAway !== base && (!virtualBase || lastAway !== virtualBase)) {
    const lastEnd = eventAbsoluteEnd(lastFlight);
    const endClock = restLocalClockFromAbs(lastEnd);
    // v11.1.46: fim de escala/mês fora de casa ganha pernoite compacto provável.
    if (endClock >= 18 * 60 || endClock < 6 * 60) synthetic.push(makeOpenEndedOvernightCard(lastFlight, lastAway, lastEnd));
  }

  const combined = sanitizeRosterRestEvents([...sanitizedEvents, ...synthetic]);
  return dedupeSameDayLayoverCards(combined)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || eventAbsoluteStart(a) - eventAbsoluteStart(b) || a.typeLabel.localeCompare(b.typeLabel));
}

function buildRosterEvents(roster: CrewRoster): RosterEvent[] {
  const rawEvents = [...roster.days]
    .sort((a, b) => {
      const diff = parseRosterDate(a.date, fallbackRosterDate(roster.month, roster.year)).getTime() - parseRosterDate(b.date, fallbackRosterDate(roster.month, roster.year)).getTime();
      if (diff !== 0) return diff;
      return timeToSortValue(a.dutyReport) - timeToSortValue(b.dutyReport);
    })
    .flatMap((day, dayIndex) => {
      const date = parseRosterDate(day.date, fallbackRosterDate(roster.month, roster.year, dayIndex + 1));
      const base = buildBaseEvent(day, date);
      const supplemental = supplementalActivitiesForDay(day, base, dayIndex);

      if (day.legs?.length) {
        const isExtraPassenger = isPsFlightDayForUi(day);
        const orderedLegs = [...day.legs].sort((a, b) => timeToSortValue(actualDepartureTimeForFlightLeg(day, a)) - timeToSortValue(actualDepartureTimeForFlightLeg(day, b)));
        const presentation = presentationTimeForFlightDay(day, orderedLegs[0]);
        const flightEvents = orderedLegs.map((leg, legIndex) => {
          const nextLeg = orderedLegs[legIndex + 1];
          const previousLeg = orderedLegs[legIndex - 1];
          const passengerPrefix = String(leg.workType || '').toUpperCase() === 'PS' || isExtraPassenger ? '🧍 ' : '';
          const start = actualDepartureTimeForFlightLeg(day, leg, legIndex);
          const time = `${start} – ${leg.arrivalTime}`;
          const activity = `${passengerPrefix}${leg.flightNumber} · ${leg.origin} → ${leg.destination}`;
          const subtitleParts = [
            legIndex === 0 && presentation ? `Apres. ${presentation}` : `Decolagem ${start}`,
            `Chegada ${leg.arrivalTime}`,
            nextLeg ? `Solo ${groundTimeLabel(leg, nextLeg)}` : (previousLeg ? `Após solo ${groundTimeLabel(previousLeg, leg)}` : ''),
            `${airportCity(leg.origin)} → ${airportCity(leg.destination)}`,
          ].filter(Boolean);
          return {
            ...base,
            id: `${day.date}-flight-leg-${dayIndex}-${legIndex}-${leg.flightNumber}-${leg.origin}-${start}`,
            leg,
            legs: [leg],
            time,
            activity,
            subtitle: `${(String(leg.workType || '').toUpperCase() === 'PS' || isExtraPassenger) ? 'Extra / passageiro · ' : ''}${subtitleParts.join(' · ')}`,
            code: leg.flightNumber || `${passengerPrefix}${flightCodeSummary([leg])}`,
            typeLabel: 'Flight',
            status: (String(leg.workType || '').toUpperCase() === 'PS' || isExtraPassenger) ? 'Extra · Passageiro (PS)' : 'Scheduled',
          } as RosterEvent;
        });
        return [...supplemental.filter((event) => event.typeLabel !== 'Day Off'), ...flightEvents];
      }
      if (supplemental.length > 1 || (supplemental.length === 1 && day.type === 'OTHER')) return supplemental;
      return [{ ...base, id: `${day.date}-${day.type}-${dayIndex}-${day.pairingCode || 'duty'}`, ...eventTextForDay(day) }];
    });

  const deduped = dedupeRosterEvents(rawEvents)
    .sort((a, b) => a.date.getTime() - b.date.getTime() || timeToSortValue(extractStartTime(a.time)) - timeToSortValue(extractStartTime(b.time)));
  return markLayoverAfterFlights(deduped, roster);
}

function dedupeRosterEvents(events: RosterEvent[]): RosterEvent[] {
  const groups = new Map<string, RosterEvent[]>();
  for (const event of events) {
    const code = normalizeEventCode(event);
    const key = `${event.dateLabel}|${code}|${event.typeLabel}`;
    const list = groups.get(key) || [];
    list.push(event);
    groups.set(key, list);
  }
  const result: RosterEvent[] = [];
  for (const list of groups.values()) {
    if (list.length === 1) { result.push(list[0]); continue; }
    const sorted = [...list].sort((a, b) => timeToSortValue(extractStartTime(a.time)) - timeToSortValue(extractStartTime(b.time)));
    const code = normalizeEventCode(sorted[0]);
    const shouldMerge = /^(HSB|HSBE|ASB|RES|CBF|EMER|MT)$/.test(code)
      || sorted.some(isZeroLengthEvent)
      || (code === 'CRM' && hasSameOrOverlappingDisplayWindow(sorted));
    if (!shouldMerge) { result.push(...sorted); continue; }
    const ranges = sorted.map((event) => parseDisplayTimeRange(event.time)).filter((range): range is { start: number; end: number } => Boolean(range));
    const merged = { ...sorted[0] };
    if (ranges.length) {
      const start = Math.min(...ranges.map((range) => range.start));
      const end = Math.max(...ranges.map((range) => normalizeDisplayEnd(range.start, range.end)));
      merged.time = `${minutesToDisplayTime(start)} – ${minutesToDisplayTime(end)}`;
    }
    merged.id = sorted.map((event) => event.id).join('__dedup__');
    result.push(merged);
  }
  return result;
}

function hasSameOrOverlappingDisplayWindow(events: RosterEvent[]): boolean {
  const ranges = events
    .map((event) => parseDisplayTimeRange(event.time))
    .filter((range): range is { start: number; end: number } => Boolean(range))
    .map((range) => ({ start: range.start, end: normalizeDisplayEnd(range.start, range.end) }))
    .sort((a, b) => a.start - b.start);
  if (ranges.length !== events.length) return false;
  const unique = new Set(ranges.map((range) => `${range.start}-${range.end}`));
  if (unique.size < ranges.length) return true;
  return ranges.some((range, index) => index > 0 && range.start < ranges[index - 1].end);
}

function normalizeEventCode(event: RosterEvent): string {
  const code = String(event.code || event.day.pairingCode || event.day.type || '').toUpperCase();
  if (code.includes('HSBE')) return 'HSBE';
  if (code.includes('HSB')) return 'HSB';
  if (code.includes('ASB')) return 'ASB';
  if (code.includes('RES')) return 'RES';
  if (/CRM\s*BSB|CRMBSB|CRMB/.test(code)) return 'CRM';
  return code.replace(/\s+/g, ' ').trim();
}

function isZeroLengthEvent(event: RosterEvent): boolean {
  const range = parseDisplayTimeRange(event.time);
  return Boolean(range && range.start === range.end);
}

function isPsFlightDayForUi(day: RosterDay): boolean {
  const legs = day.legs || [];
  const allLegsArePs = legs.length > 0 && legs.every((leg) => String(leg.workType || '').toUpperCase() === 'PS');
  // Não marcar o dia inteiro como Extra se apenas uma ou duas etapas forem PS.
  // Em dias mistos, cada perna usa o próprio workType para evitar confundir voo operacional com voo de extra.
  return allLegsArePs || String(day.pairingCode || '').toUpperCase() === 'PS';
}

function flightActivityPrefix(day: RosterDay): string {
  const code = getActivityCodes(day).find((item) => Boolean(getRosterCodeDefinition(item)));
  if (!code) return "";
  const def = getRosterCodeDefinition(code);
  return def ? `${def.title} / ${def.description}` : code;
}

function activityPrefixCode(day: RosterDay): string {
  return getActivityCodes(day).find((item) => Boolean(getRosterCodeDefinition(item))) || "";
}

function routeChain(legs: FlightLeg[]): string {
  if (!legs.length) return "—";
  const points = [legs[0].origin];
  for (const leg of legs) {
    if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  }
  return points.join(" – ");
}

function groundTimeLabel(previousLeg: FlightLeg, nextLeg: FlightLeg): string {
  const start = timeToSortValue(previousLeg.arrivalTime);
  const end = timeToSortValue(nextLeg.departureTime);
  const normalizedEnd = end < start ? end + 1440 : end;
  const diff = Math.max(0, normalizedEnd - start);
  const hours = Math.floor(diff / 60);
  const minutes = diff % 60;
  if (hours && minutes) return `${hours}h${String(minutes).padStart(2, '0')}`;
  if (hours) return `${hours}h`;
  return `${minutes}min`;
}

function cityChain(legs: FlightLeg[]): string {
  if (!legs.length) return "";
  const points = [legs[0].origin];
  for (const leg of legs) {
    if (points[points.length - 1] !== leg.destination) points.push(leg.destination);
  }
  return points.map((code) => airportCity(code)).join(" – ");
}

function flightCodeSummary(legs: FlightLeg[]): string {
  const codes = Array.from(new Set(legs.map((leg) => leg.flightNumber)));
  return codes.length <= 3 ? codes.join(" · ") : `${codes[0]} +${codes.length - 1}`;
}

function buildBaseEvent(day: RosterDay, date: Date): Omit<RosterEvent, "id" | "activity" | "subtitle" | "code" | "typeLabel" | "status"> {
  const safeDate = isValidCrewDateObject(date) ? date : new Date();
  const time = displayTimeForRosterDay(day);
  const target = new Date(safeDate);
  const [h, m] = String(time || '').split('–')[0].trim().split(':').map((part) => Number(part));
  if (Number.isFinite(h) && h >= 0 && h <= 23) target.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  const weekday = WEEKDAYS_SHORT[safeDate.getDay()] || '—';
  const monthLabel = MONTHS_SHORT[safeDate.getMonth()] || '—';
  return { day, date: safeDate, dateLabel: day.date || dateOnlyIsoSafe(safeDate), weekday, dayNumber: String(safeDate.getDate()).padStart(2, "0"), monthLabel, time, targetIso: safeRosterIso(target, safeDate) };
}

function displayTimeForRosterDay(day: RosterDay): string {
  const times = extractTimesFromRosterText(day.rawText || '');
  const firstLeg = day.legs?.[0];
  const lastLeg = day.legs?.[day.legs.length - 1];
  const flightPresentation = firstLeg ? presentationTimeForFlightDay(day, firstLeg) : '';
  const start = firstLeg ? (flightPresentation || day.dutyReport || firstLeg.departureTime || times[0] || '') : (day.dutyReport || times[0] || '');
  let end = firstLeg ? (day.dutyDebrief || lastLeg?.arrivalTime || '') : (day.dutyDebrief || '');
  if (!firstLeg && !end && times.length > 1 && !isReserveOrStandbyDay(day)) end = times[times.length - 1];
  if (start && end === start && isReserveOrStandbyDay(day)) end = '';
  if (!end && start && isReserveOrStandbyDay(day)) end = inferReserveOrStandbyEndTime(day, start);
  if (!end && start && !isReserveOrStandbyDay(day) && typeof day.dutyHours === 'number' && day.dutyHours > 0) end = addDisplayMinutes(start, Math.round(day.dutyHours * 60));
  if (start && end) return `${start} – ${end}`;
  if (start && isReserveOrStandbyDay(day)) return `${start} – fim não lido`;
  if (start) return start;
  return "All Day";
}

function presentationTimeForFlightDay(day: RosterDay, firstLeg?: FlightLeg): string {
  // Em reserva/sobreaviso acionado, dutyReport pode ser o início da reserva/SAV.
  // Não exibir esse horário como apresentação do voo.
  if (/^(ASB|RES|HSB|HSBE)$/i.test(String(day.type || day.pairingCode || '')) && (day.legs || []).length) return '';
  const departure = firstLeg?.departureTime || '';
  if (!departure) return day.dutyReport || '';
  const report = day.dutyReport || '';
  const depMinutes = timeToSortValue(departure);
  const reportMinutes = timeToSortValue(report);
  if (report && depMinutes !== 9999 && reportMinutes !== 9999) {
    const diff = depMinutes >= reportMinutes ? depMinutes - reportMinutes : depMinutes + 1440 - reportMinutes;
    if (diff >= 15 && diff <= 240) return report;
  }
  // Escala: não sintetizar apresentação. Se não veio publicada, mostra decolagem/horário visível.
  return '';
}


function actualDepartureTimeForFlightLeg(day: RosterDay, leg: FlightLeg, legIndex = 0): string {
  const fallback = cleanDisplayTimeToken(leg.departureTime || '');
  const raw = String(day.rawText || '');
  const flightDigits = String(leg.flightNumber || '').replace(/\D/g, '');
  if (!raw || !flightDigits || !leg.origin) return fallback;
  const flightRegex = new RegExp(`\bLA\s*${flightDigits}\b`, 'i');
  const match = flightRegex.exec(raw);
  if (!match) return fallback;
  const after = raw.slice(match.index + match[0].length);
  const nextMatch = /\bLA\s*\d{3,4}\b/i.exec(after);
  const segment = nextMatch ? after.slice(0, nextMatch.index) : after.slice(0, 180);
  const tokens = segment.split(/\s+/).map((token) => token.trim()).filter(Boolean);
  const origin = String(leg.origin || '').toUpperCase();
  const destination = String(leg.destination || '').toUpperCase();
  const originIndex = tokens.findIndex((token) => token.toUpperCase() === origin);
  if (originIndex < 0) return fallback;
  const destinationIndex = tokens.findIndex((token, index) => index > originIndex && token.toUpperCase() === destination);
  const afterOriginTokens = tokens.slice(originIndex + 1, destinationIndex > originIndex ? destinationIndex : tokens.length);
  const afterOriginTime = afterOriginTokens.find((token) => /\b\d{1,2}:\d{2}(?:\(\+1\))?\b/.test(token));
  if (afterOriginTime) return cleanDisplayTimeToken(afterOriginTime);
  const beforeOriginTimes = tokens.slice(0, originIndex).filter((token) => /\b\d{1,2}:\d{2}(?:\(\+1\))?\b/.test(token)).map(cleanDisplayTimeToken);
  return beforeOriginTimes[beforeOriginTimes.length - 1] || fallback;
}

function cleanDisplayTimeToken(token: string): string {
  return String(token || '').replace('(+1)', '').replace(/^(\d):/, '0$1:');
}


function inferReserveOrStandbyEndTime(day: RosterDay, start: string): string {
  const code = String(day.pairingCode || day.type || '').toUpperCase();
  const times = extractReserveStandbyTimesForCode(day, code).filter((time) => time !== start);
  if (times.length) return times[times.length - 1];
  if (code.includes('ASB') || code.includes('RES')) return addDisplayMinutes(start, 360);
  if (code.includes('HSBE')) return addDisplayMinutes(start, 180);
  if (code.includes('HSB')) return addDisplayMinutes(start, 180);
  return '';
}

function extractReserveStandbyTimesForCode(day: RosterDay, code: string): string[] {
  const normalizedCode = String(code || '').toUpperCase();
  const raw = String(day.rawText || '');
  if (!normalizedCode || !raw) return [];
  const upper = raw.toUpperCase();
  const idx = upper.search(new RegExp(`\\b${normalizedCode}\\b`));
  if (idx < 0) return [];
  const nextIdx = findNextRosterCodeIndex(upper, idx + normalizedCode.length);
  const segment = raw.slice(idx, nextIdx > idx ? nextIdx : Math.min(raw.length, idx + 220));
  return uniqueDisplayTimes(segment);
}

function isReserveOrStandbyDay(day: RosterDay): boolean {
  const code = String(day.pairingCode || day.type || '').toUpperCase();
  return /^(HSB|HSBE|ASB|RES)$/.test(code);
}

function extractTimesFromRosterText(text: string): string[] {
  const seen = new Set<string>();
  const times: string[] = [];
  for (const match of String(text || '').matchAll(/\b([01]?\d|2[0-3]):[0-5]\d(?:\(\+1\))?\b/g)) {
    const clean = match[0].replace('(+1)', '');
    if (!seen.has(clean)) { seen.add(clean); times.push(clean); }
  }
  return times;
}

function addDisplayMinutes(time: string, minutesToAdd: number): string {
  const [hours, minutes] = String(time || '').split(':').map((part) => Number(part));
  if (!Number.isFinite(hours)) return '';
  const total = (((hours * 60 + (Number.isFinite(minutes) ? minutes : 0) + minutesToAdd) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function supplementalActivitiesForDay(day: RosterDay, base: Omit<RosterEvent, "id" | "activity" | "subtitle" | "code" | "typeLabel" | "status">, dayIndex: number): RosterEvent[] {
  const raw = `${day.pairingCode || ""} ${day.rawText || ""}`.toUpperCase();
  const events: RosterEvent[] = [];
  const seen = new Set<string>();
  const codes = findRosterCodes(raw);

  for (const code of codes) {
    if (seen.has(code)) continue;
    seen.add(code);

    // Folgas formais não podem nascer como subprogramação de um dia de treinamento/voo.
    // O OCR/parser pode encontrar DO/DR/DOF dentro de textos descritivos, traduções ou
    // fragmentos do PDF; nesses casos a tela acabava criando uma folga inexistente no
    // mesmo horário de CBF/EMER. Só exibimos DAY_OFF como subevento quando o próprio
    // dia foi classificado como folga.
    const definition = getRosterCodeDefinition(code);
    if (day.legs?.length && isPureFlightOperationalSupplement(code, definition?.category)) continue;
    if (definition?.category === "DAY_OFF" && !isDayOffRosterDay(day)) continue;

    const time = extractActivityWindow(day, code) || base.time;
    const eventText = activityEventText(code);
    if (!eventText) continue;
    events.push({
      ...base,
      id: `${day.date}-${code}-${dayIndex}`,
      time,
      ...eventText,
    });
  }

  return events;
}

function isPureFlightOperationalSupplement(code: string, category?: string): boolean {
  const normalized = String(code || '').toUpperCase().replace(/\s+/g, '');
  if (['OP', 'CC', 'PS', 'P', '320', '320P', '32S', '31R', '328', '39R', '321'].includes(normalized)) return true;
  return category === 'OTHER' && /^(OP|PS|CC)$/.test(normalized);
}

function isDayOffRosterDay(day: RosterDay): boolean {
  return ["DO", "DOF", "DR", "OFF"].includes(String(day.type || '').toUpperCase()) || getRosterCodeDefinition(day.pairingCode || '')?.category === "DAY_OFF";
}

function isFormalDayOffForUi(day: RosterDay): boolean {
  const code = String(day.pairingCode || '').toUpperCase();
  return ["DO", "DOF", "DR"].includes(String(day.type || '').toUpperCase())
    || ["DOP", "DOPR", "VC", "FOLGA"].includes(code)
    || getRosterCodeDefinition(code)?.category === "DAY_OFF";
}

function activityEventText(code: string): Pick<RosterEvent, "activity" | "subtitle" | "code" | "typeLabel" | "status"> | null {
  return eventTextFromRosterCode(code);
}

function extractActivityWindow(day: RosterDay, code: string): string | null {
  const raw = day.rawText || "";
  const normalizedCode = String(code || '').toUpperCase();
  if (/^(HSB|HSBE|ASB|RES)$/.test(normalizedCode)) return extractReserveStandbyActivityWindow(day, normalizedCode);
  const idx = raw.toUpperCase().indexOf(normalizedCode);
  if (idx < 0) return null;
  const fragment = raw.slice(idx, idx + 90);
  const times = fragment.match(/\b\d{1,2}:\d{2}(?:\(\+1\))?\b/g)?.map((time) => time.replace('(+1)', '')) || [];
  if (times.length >= 2) return `${times[0]} – ${times[1]}`;
  return null;
}

function extractReserveStandbyActivityWindow(day: RosterDay, code: string): string | null {
  const raw = String(day.rawText || '');
  const upper = raw.toUpperCase();
  const idx = upper.indexOf(code);
  if (idx < 0) return null;
  const nextIdx = findNextRosterCodeIndex(upper, idx + code.length);
  const segment = raw.slice(idx, nextIdx > idx ? nextIdx : Math.min(raw.length, idx + 180));
  const times = uniqueDisplayTimes(segment);
  const start = times[0] || day.dutyReport || extractStartTime(displayTimeForRosterDay(day));
  let end = times.length >= 2 ? times[times.length - 1] : '';

  if (start && (!end || end === start)) {
    const nextSegment = nextIdx > idx ? raw.slice(nextIdx, Math.min(raw.length, nextIdx + 90)) : '';
    const nextStart = uniqueDisplayTimes(nextSegment)[0];
    if ((code === 'HSB' || code === 'HSBE') && nextStart && nextStart !== start) end = nextStart;
  }

  if (start && (!end || end === start)) {
    if (code === 'ASB' || code === 'RES') end = addDisplayMinutes(start, 360);
    else if (code === 'HSBE') end = addDisplayMinutes(start, 180);
    else if (code === 'HSB') end = addDisplayMinutes(start, 180);
  }
  return start && end ? `${start} – ${end}` : null;
}

function findNextRosterCodeIndex(text: string, fromIndex: number): number {
  const re = /\b(HSBE|HSB|ASB|RES|CBF|EMER|CRMBSB|CRMB|CRM|MT|C\d{2,3}F|DOF?|DOPR?|DR|OFF|VC|LA\s?\d{3,4})\b/g;
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  return match ? match.index : -1;
}

function uniqueDisplayTimes(text: string): string[] {
  const seen = new Set<string>();
  const times: string[] = [];
  for (const match of String(text || '').matchAll(/\b([01]?\d|2[0-3]):[0-5]\d(?:\(\+1\))?\b/g)) {
    const clean = match[0].replace('(+1)', '');
    if (!seen.has(clean)) { seen.add(clean); times.push(clean); }
  }
  return times;
}


function eventTextForDay(day: RosterDay): Pick<RosterEvent, "activity" | "subtitle" | "code" | "typeLabel" | "status"> {
  if (day.type === "LAYOVER" && /CONTINUACAO_MADRUGADA/i.test(day.rawText || "")) {
    return {
      activity: "Chegada / fim de jornada",
      subtitle: day.hotel ? `Chegada em ${day.hotel} e fim da jornada após voo noturno` : "Continuação da jornada da véspera",
      code: day.pairingCode || "FIM-JORNADA",
      typeLabel: "Inativo",
      status: "Madrugada",
    };
  }
  if (day.type === "LAYOVER") {
    const duration = rosterDayPublishedDurationMinutes(day);
    if (isShortOrInvalidLayoverDuration(duration)) {
      const airport = groundStopAirportForDay(day);
      const label = resultsDurationLabelFromMinutes(duration || 0);
      if (duration !== null && duration <= RESULTS_SHORT_GROUND_STOP_MAX_MINUTES) {
        return {
          activity: "Tempo em solo",
          subtitle: airport ? `Solo em ${airport} · ${label} · conexão/retorno operacional, sem pernoite` : `${label} · conexão/retorno operacional, sem pernoite`,
          code: day.pairingCode || "SOLO",
          typeLabel: "Ground Duty",
          status: "Solo",
        };
      }
      return {
        activity: airport ? `Estadia diurna · ${airport}` : "Estadia diurna",
        subtitle: airport ? `Hotel/descanso diurno em ${airport} · ${label} · fica entre programações, não é pernoite` : `${label} · descanso diurno entre programações, não é pernoite`,
        code: day.pairingCode || "PERDIA",
        typeLabel: "Hotel diurno",
        status: "Estadia diurna",
      };
    }
    return { activity: "Inativo / Pernoite", subtitle: day.hotel ? `Pernoite em ${day.hotel}` : `Dia em branco após programação`, code: day.pairingCode || "INATIVO", typeLabel: "Inativo", status: "Inativo" };
  }
  if (day.type === "OTHER" && !day.dutyReport && !day.dutyDebrief && !day.legs?.length && !day.pairingCode) return { activity: "Sem programação lida", subtitle: "Dia incluído para completar a escala inteira", code: "—", typeLabel: "Sem programação", status: "Livre" };
  if (day.hotel) return { activity: "Hotel Stay", subtitle: day.hotel || `Pernoite · ${day.base}`, code: day.pairingCode || "—", typeLabel: "Hotel", status: "Hotel" };

  const rosterCode = getRosterCode(day) || day.pairingCode || day.type;
  const mapped = eventTextFromRosterCode(rosterCode);
  if (mapped) return mapped;

  if (["DO", "DOF", "DR"].includes(day.type) || getRosterCodeDefinition(day.pairingCode || "")?.category === "DAY_OFF") {
    const code = day.pairingCode || day.type;
    const mapped = eventTextFromRosterCode(code);
    return mapped || { activity: "Folga formal", subtitle: "Folga publicada na escala", code, typeLabel: "Day Off", status: "Day Off" };
  }
  if (day.type === "OFF") return { activity: "OFF", subtitle: "Extensão de repouso; não entra como folga formal mensal", code: day.type, typeLabel: "Day Marker", status: "Rest" };
  if (["HSB", "HSBE"].includes(day.type)) return { activity: `${day.type} / Sobreaviso`, subtitle: "Home Stand By", code: day.pairingCode || day.type, typeLabel: "Standby", status: "Standby" };
  if (["ASB", "RES"].includes(day.type)) return { activity: `${day.type} / Reserva`, subtitle: day.type === "ASB" ? "Airport Stand By" : "Reserva", code: day.pairingCode || day.type, typeLabel: "Reserve", status: "Reserve" };
  return { activity: day.pairingCode || day.type || "Duty", subtitle: `Base ${day.base}`, code: day.pairingCode || "—", typeLabel: "Duty", status: "Duty" };
}

function isPsFlightEvent(event: RosterEvent): boolean {
  const code = String(event.code || '').toUpperCase();
  if (code === 'PS') return true;
  // Em eventos por perna, usar sempre o workType da própria perna.
  // Antes qualquer PS no dia deixava todos os voos cinza.
  if (event.leg) return String(event.leg.workType || '').toUpperCase() === 'PS';
  const legs = event.day.legs || [];
  return legs.length > 0 && legs.every((leg) => String(leg.workType || '').toUpperCase() === 'PS');
}

function getRosterEventToneClass(event: RosterEvent): string {
  const key = event.typeLabel;
  if (key === "Flight" && isPsFlightEvent(event)) return "cc-roster-positioning";
  if (key === "Flight") return "cc-roster-flight";
  if (key === "Hotel diurno") return "cc-roster-training";
  if (key === "Hotel" || key === "Inativo") return "cc-roster-hotel";
  if (key === "Folga" || key === "Descanso" || key === "Day Off") return "cc-roster-off";
  if (key === "Sobreaviso" || key === "Reserva" || key === "Reserve" || key === "Standby") return "cc-roster-standby";
  if (key === "Training" || key === "Ground Duty" || key === "Simulator") return "cc-roster-training";
  if (key === "Transport") return "cc-roster-transport";
  if (key === "Meeting") return "cc-roster-meeting";
  if (key === "Sem programação") return "cc-roster-empty";
  if (key === "Ausência" || key === "Justificado" || key === "Day Marker" || key === "Interrupção") return "cc-roster-attention";
  if (key === "Médico" || key === "Medical") return "cc-roster-medical";
  return "cc-roster-duty";
}

function getEventStyle(event: RosterEvent): { icon: LucideIcon; solid: string; bg: string } {
  const key = event.typeLabel;
  if (key === "Flight" && isPsFlightEvent(event)) return { icon: UserRound, solid: "#64748b", bg: "#f1f5f9" };
  if (key === "Flight") return { icon: Plane, solid: "#0284c7", bg: "#e0f2fe" };
  if (key === "Hotel diurno") return { icon: Coffee, solid: "#0ea5e9", bg: "#e0f2fe" };
  if (key === "Hotel" || key === "Inativo") return { icon: BedDouble, solid: "#d97706", bg: "#fffbeb" };
  if (key === "Folga" || key === "Descanso" || key === "Day Off") return { icon: House, solid: "#16a34a", bg: "#dcfce7" };
  if (key === "Sobreaviso" || key === "Reserva" || key === "Reserve" || key === "Standby") return { icon: UserRound, solid: "#f97316", bg: "#ffedd5" };
  if (key === "Training" || key === "Ground Duty") return { icon: GraduationCap, solid: "#e11d48", bg: "#ffe4e6" };
  if (key === "Simulator") return { icon: GraduationCap, solid: "#7c3aed", bg: "#ede9fe" };
  if (key === "Transport") return { icon: Plane, solid: "#a16207", bg: "#fef3c7" };
  if (key === "Meeting") return { icon: Users, solid: "#0891b2", bg: "#cffafe" };
  if (key === "Sem programação") return { icon: CalendarDays, solid: "#64748b", bg: "#f1f5f9" };
  if (key === "Ausência" || key === "Justificado" || key === "Day Marker") return { icon: ClipboardList, solid: "#ea580c", bg: "#ffedd5" };
  if (key === "Interrupção") return { icon: AlertTriangle, solid: "#dc2626", bg: "#fee2e2" };
  if (key === "Médico" || key === "Medical") return { icon: ShieldCheck, solid: "#0d9488", bg: "#ccfbf1" };
  return { icon: BriefcaseBusiness, solid: "#0891b2", bg: "#cffafe" };
}

function getRosterCode(day: RosterDay): string {
  const direct = getRosterCodeDefinition(day.pairingCode)?.code || getRosterCodeDefinition(day.type)?.code;
  if (direct) return direct;
  const source = `${day.pairingCode || ""} ${day.type || ""} ${day.rawText || ""}`.toUpperCase();
  return findRosterCodes(source)[0] || "";
}

function timeToSortValue(time: string | null | undefined): number {
  if (!time) return 9999;
  const [hour, minute] = time.replace('(+1)', '').split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function getStats(roster: CrewRoster, compliance: ComplianceResult, events: RosterEvent[]) {
  const trainingSessions = events.filter((event) => event.typeLabel === "Training").length;
  const meetings = events.filter((event) => event.typeLabel === "Meeting").length;
  const flightSegments = events.filter((event) => event.typeLabel === "Flight").length;
  const absences = events.filter((event) => ["Ausência", "Justificado", "Médico"].includes(event.typeLabel)).length;
  const interruptions = events.filter((event) => event.typeLabel === "Interrupção").length;
  return { absences, interruptions, flightHours: roster.totals?.flightHours ?? compliance.metrics.totalFlightHours, dutyHours: roster.totals?.dutyHours ?? compliance.metrics.totalDutyHours, daysOff: compliance.metrics.daysOff || events.filter((event) => ["Day Off", "Folga"].includes(event.typeLabel)).length, reserveDays: (compliance.metrics.totalStandby + compliance.metrics.reserveCount) || events.filter((event) => ["Reserve", "Sobreaviso", "Reserva"].includes(event.typeLabel)).length, trainingSessions, meetings, flightSegments };
}

function getComplianceStatus(compliance: ComplianceResult) {
  if (compliance.overallStatus === "violation") return { label: "IRREGULARIDADES", bg: "#fee2e2", fg: "#b91c1c", icon: ShieldCheck };
  if (compliance.overallStatus === "warning") return { label: "ATENÇÃO", bg: "#ffedd5", fg: "#c2410c", icon: Sparkles };
  return { label: "CONFORME", bg: "#dcfce7", fg: "#15803d", icon: CheckCircle2 };
}

function viewTitle(view: ViewKey) {
  const titles: Record<ViewKey, string> = { summary: "Resumo", roster: "Minha Escala", alerts: "Alertas", irregularities: "Regulamentação", gym: "Rotina", fatigue: "Carga da Escala", metrics: "Métricas", glossary: "Glossário", statistics: "Gerenciador de Escalas", settings: "Configurações", manual: "Manual" };
  return titles[view];
}

function viewSubtitle(view: ViewKey) {
  const subtitles: Record<ViewKey, string> = {
    summary: "Visão objetiva da escala: folgas, pernoites, eventos, alertas e próximos compromissos.",
    roster: "Primeiro a escala, depois filtros e detalhes. Toque em um card para ver mais informações.",
    alerts: "Somente avisos e irregularidades. O número de alertas fica centralizado neste menu.",
    irregularities: "Confira irregularidades e pontos de atenção com ACT aplicada por função, RBAC 117, Lei do Aeronauta e regras trabalhistas parametrizadas.",
    gym: "Organize treino, estudo, faculdade e atividades pessoais com duração, intensidade e janelas seguras conforme a escala.",
    fatigue: "Ranking dos dias mais cansativos, nota de puxada da escala e leitura de risco de fadiga.",
    metrics: "Métricas utilizadas para nota de conformidade, descanso, carga de escala e alertas.",
    glossary: "Siglas operacionais, tipos de evento e critérios usados pelo CrewCheck.",
    statistics: "Gerenciador e histórico das escalas salvas, com acesso rápido ao que foi armazenado.",
    settings: "Escolha o calendário Google, conecte a conta e ative atualização automática após upload da escala.",
    manual: "Guia rápido de uso do CrewCheck, leitura da escala, privacidade e sincronização de calendário.",
  };
  return subtitles[view];
}

function viewHeroIcon(view: ViewKey) {
  const icons: Record<ViewKey, ReactNode> = { summary: <LayoutDashboard className="h-7 w-7" />, roster: <CalendarDays className="h-7 w-7" />, alerts: <Bell className="h-7 w-7" />, irregularities: <ShieldAlert className="h-7 w-7" />, gym: <Dumbbell className="h-7 w-7" />, fatigue: <Gauge className="h-7 w-7" />, metrics: <BarChart3 className="h-7 w-7" />, glossary: <BookOpen className="h-7 w-7" />, statistics: <BarChart3 className="h-7 w-7" />, settings: <Settings className="h-7 w-7" />, manual: <BookOpen className="h-7 w-7" /> };
  return icons[view];
}

function buildEmptyLoadAnalysis(): LoadAnalysis {
  return {
    intensityScore: 0,
    recoveryScore: 0,
    grade: "Moderada",
    summary: "Aguardando leitura da escala.",
    hardestDays: [],
    easiestDays: [],
    days: [],
  };
}

function buildFallbackLoadAnalysis(roster: CrewRoster): LoadAnalysis {
  const days: DayLoadAnalysis[] = roster.days.map((day) => ({
    date: day.date,
    dayOfWeek: day.dayOfWeek,
    type: day.type,
    label: day.type,
    fatigueScore: day.dutyHours ? Math.min(100, Math.round(day.dutyHours * 6)) : 10,
    loadLabel: "Moderado",
    dutyHours: day.dutyHours || 0,
    flightHours: day.flyingHours || 0,
    dutyStartTime: day.dutyReport || null,
    dutyEndTime: day.dutyDebrief || null,
    isDutyNextDay: Boolean(day.isNextDay),
    sectors: day.legs?.length || 0,
    restBefore: null,
    restAfter: null,
    isNightDuty: false,
    isEarlyStart: false,
    isLateFinish: Boolean(day.isNextDay),
    isDayOff: ["OFF", "DO", "DOF", "DR", "LAYOVER"].includes(day.type) || getRosterCodeDefinition(day.pairingCode || "")?.category === "DAY_OFF",
    gymScore: 50,
    reasons: ["análise simplificada"],
  }));
  return { intensityScore: 50, recoveryScore: 50, grade: "Moderada", summary: "Análise simplificada.", hardestDays: days.slice(0, 5), easiestDays: days.slice(0, 5), days };
}

function resolvedCrewName(roster: CrewRoster, user: ReturnType<typeof getStoredUser>): string {
  const rosterName = String(roster.crewName || '').trim();
  if (rosterName && !/^tripulante$/i.test(rosterName)) return rosterName;
  const userName = String(user?.name || '').trim();
  if (userName && !/^tripulante$/i.test(userName)) return userName;
  const emailPrefix = String(user?.email || '').split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return emailPrefix || 'Tripulante';
}

function parseRosterDate(value: string, fallback = new Date()): Date {
  const raw = String(value || '').trim();
  const safeFallback = isValidCrewDateObject(fallback) ? fallback : new Date();
  if (!raw) return safeFallback;

  const compactIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (compactIso) {
    const [, y, m, d] = compactIso;
    const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0, 0);
    return isValidCrewDateObject(date) ? date : safeFallback;
  }

  const br = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const yearRaw = br[3] ? Number(br[3]) : safeFallback.getFullYear();
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    return isValidCrewDateObject(date) && date.getMonth() === month - 1 ? date : safeFallback;
  }

  const monthMap: Record<string, number> = { JAN: 1, JANEIRO: 1, FEV: 2, FEVEREIRO: 2, MAR: 3, MARCO: 3, MARÇO: 3, ABR: 4, ABRIL: 4, MAI: 5, MAIO: 5, JUN: 6, JUNHO: 6, JUL: 7, JULHO: 7, AGO: 8, AGOSTO: 8, SET: 9, SETEMBRO: 9, OUT: 10, OUTUBRO: 10, NOV: 11, NOVEMBRO: 11, DEZ: 12, DEZEMBRO: 12 };
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const textual = normalized.match(/(?:DOM|SEG|TER|QUA|QUI|SEX|SAB)?\s*(\d{1,2})\s+([A-Z]{3,9})(?:\s+(\d{4}))?/);
  if (textual) {
    const day = Number(textual[1]);
    const month = monthMap[textual[2]];
    const year = textual[3] ? Number(textual[3]) : safeFallback.getFullYear();
    if (month) {
      const date = new Date(year, month - 1, day, 12, 0, 0, 0);
      return isValidCrewDateObject(date) ? date : safeFallback;
    }
  }

  const parsed = new Date(raw);
  return isValidCrewDateObject(parsed) ? parsed : safeFallback;
}
function daysInMonth(month: number, year: number) { return String(new Date(year, month, 0).getDate()).padStart(2, "0"); }
function formatHours(value?: number) { const totalMinutes = Math.max(0, Math.round((value || 0) * 60)); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return `${hours}:${String(minutes).padStart(2, "0")}`; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "CC"; }
function titleCase(value: string) { return value.toLowerCase().replace(/(^|\s)\S/g, (match) => match.toUpperCase()); }
function airportCity(code: string) { const names: Record<string, string> = { BSB: "Brasília", GRU: "Guarulhos", CGH: "Congonhas", MCZ: "Maceió", VCP: "Viracopos", FOR: "Fortaleza", CNF: "Confins", PMW: "Palmas", FLN: "Florianópolis", MAB: "Marabá", CPV: "Campina Grande", GYN: "Goiânia", JPA: "João Pessoa", NAT: "Natal", EZE: "Buenos Aires / Ezeiza", POA: "Porto Alegre", VIX: "Vitória", REC: "Recife" }; return names[code] || code; }
function airportSubtitle(origin: string, destination: string) { return `${airportCity(origin)} – ${airportCity(destination)}`; }
function crewcheckAuthHeader(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return { ...extra, ...(token ? { authorization: `Bearer ${token}` } : {}) };
}


