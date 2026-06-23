import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  DownloadCloud,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import type { CrewRoster } from '@/lib/pdfParser';

interface IFlightIntegrationViewProps {
  onBack: () => void;
  onSuccess: () => void;
  onFileUpload?: (file: File) => Promise<void>;
  onRosterImport?: (roster: CrewRoster, sourceFileName?: string) => Promise<void>;
}

type IFlightStatus = 'idle' | 'portal' | 'fetching' | 'success' | 'error';

type IFlightPortalOptions = {
  autoClicks: boolean;
  keepAuthorizedSession: boolean;
  silentPremiumPull: boolean;
  autoResumeAfterLogin: boolean;
  universalPdfCapture: boolean;
  maskPortalUntilUserAction: boolean;
  noExternalApps: boolean;
  credentialEntry: 'official_iflight_page_only';
  mfaEntry: 'official_iflight_page_only';
  calendarStrategy: 'calendar_month_first';
  collectCrew: boolean;
  collectPairing: boolean;
  collectRosterDetails: boolean;
  collectDutyTimes: boolean;
  collectCrewList: boolean;
  collectAircraftAndTraining: boolean;
  maxAutomationMinutes: number;
  portalKind?: 'crew' | 'cwp';
  portalUrl?: string;
  fromDate: string;
  toDate: string;
  periodMonth: string;
  periodYear: string;
  format: 'pdf' | 'calendar_first';
  includeLegend: boolean;
  clickSend: false;
  privacyMode: 'lgpd_no_credentials';
  actions: string[];
};

type NativeIFlightPayload = {
  ok?: boolean;
  roster?: CrewRoster;
  dataBase64?: string;
  calendarText?: string;
  sourceFormat?: string;
  filename?: string;
  sourceFileName?: string;
  message?: string;
  error?: string;
};

declare global {
  interface Window {
    CrewCheckIFlight?: {
      openPortalAndImport?: (
        url: string,
        options?: IFlightPortalOptions,
      ) => Promise<NativeIFlightPayload | string> | NativeIFlightPayload | string;
    };
  }
}

const IFLIGHT_CREW_URL = 'https://iflightla.ibsplc.aero/iflight-crew/web/getMainPage';
const IFLIGHT_CWP_URL = 'https://iflightla.ibsplc.aero/iflight-cwp/web/getMainPage';
const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan',
  '02': 'Feb',
  '03': 'Mar',
  '04': 'Apr',
  '05': 'May',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Aug',
  '09': 'Sep',
  '10': 'Oct',
  '11': 'Nov',
  '12': 'Dec',
};

function lastDayOfMonth(year: string, month: string) {
  const yearNumber = Number(year) || new Date().getFullYear();
  const monthNumber = Number(month) || new Date().getMonth() + 1;
  return String(new Date(yearNumber, monthNumber, 0).getDate()).padStart(2, '0');
}

function formatIFlightDate(day: string, month: string, year: string) {
  return `${day}-${MONTH_NAMES[month] || 'Jan'}-${year || new Date().getFullYear()}`;
}

async function parseBase64Pdf(filename: string, dataBase64: string): Promise<CrewRoster> {
  const response = await fetch('/api/parse-pdf', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, dataBase64 }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.roster) {
    throw new Error(payload?.message || payload?.detail || 'Não consegui interpretar o PDF baixado pelo iFlight.');
  }
  return payload.roster as CrewRoster;
}


async function parseIFlightCalendarText(filename: string, text: string, periodMonth: string, periodYear: string): Promise<CrewRoster> {
  const response = await fetch('/api/parse-iflight-calendar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename, text, periodMonth, periodYear }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok || !payload?.roster) {
    throw new Error(payload?.message || payload?.detail || 'Capturei o calendário do iFlight, mas ainda não consegui transformar em escala confiável.');
  }
  return payload.roster as CrewRoster;
}

const IFlightIntegrationView: React.FC<IFlightIntegrationViewProps> = ({ onBack, onSuccess, onFileUpload, onRosterImport }) => {
  const now = new Date();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<IFlightStatus>('idle');
  const [message, setMessage] = useState('iFlight AutoPull restrito ao administrador. Usuários finais continuam com importação manual de PDF oficial. No iPad e no navegador comum, a opção mais estável é importar o PDF oficial salvo em Arquivos.');
  const [periodMonth, setPeriodMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [periodYear, setPeriodYear] = useState(String(now.getFullYear()));
  const [includeLegend, setIncludeLegend] = useState(false);
  const [autoClicks, setAutoClicks] = useState(true);
  const [keepAuthorizedSession, setKeepAuthorizedSession] = useState(true);
  const [silentPremiumPull, setSilentPremiumPull] = useState(true);
  const [universalPasteText, setUniversalPasteText] = useState('');
  const [showUniversalFallback, setShowUniversalFallback] = useState(false);
  const [portalKind, setPortalKind] = useState<'crew' | 'cwp'>('crew');

  const isBusy = status === 'fetching' || status === 'portal';
  const hasNativeBridge = typeof window !== 'undefined' && Boolean(window.CrewCheckIFlight?.openPortalAndImport);
  const months = useMemo(() => ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'], []);
  const fromDate = formatIFlightDate('01', periodMonth, periodYear);
  const toDate = formatIFlightDate(lastDayOfMonth(periodYear, periodMonth), periodMonth, periodYear);
  const activePortalUrl = portalKind === 'cwp' ? IFLIGHT_CWP_URL : IFLIGHT_CREW_URL;

  const portalOptions: IFlightPortalOptions = {
    autoClicks,
    keepAuthorizedSession,
    silentPremiumPull,
    autoResumeAfterLogin: true,
    universalPdfCapture: true,
    maskPortalUntilUserAction: true,
    noExternalApps: true,
    credentialEntry: 'official_iflight_page_only',
    mfaEntry: 'official_iflight_page_only',
    calendarStrategy: 'calendar_month_first',
    collectCrew: true,
    collectPairing: true,
    collectRosterDetails: true,
    collectDutyTimes: true,
    collectCrewList: true,
    collectAircraftAndTraining: true,
    maxAutomationMinutes: 10,
    portalKind,
    portalUrl: activePortalUrl,
    fromDate,
    toDate,
    periodMonth,
    periodYear,
    format: 'pdf',
    includeLegend,
    clickSend: false,
    privacyMode: 'lgpd_no_credentials',
    actions: ['open_official_iflight_webview', 'wait_user_login_password_mfa_on_official_portal', 'mask_portal_after_auth', 'reuse_authorized_session', 'auto_resume_after_login', 'open_menu', 'open_roster_report', 'fill_period', 'select_pdf', 'set_lt', 'run_report', 'monitor_pdf_download', 'capture_blob_pdf', 'intercept_fetch_xhr', 'open_roster_calendar_fallback', 'capture_roster_calendar_dom', 'return_to_crewcheck', 'broadcast_roster_to_all_modules'],
  };

  const finishRosterImport = async (roster: CrewRoster, sourceFileName: string) => {
    if (!onRosterImport) {
      setStatus('success');
      setMessage('Escala recebida automaticamente. Abra a tela de escala para conferir.');
      onSuccess();
      return;
    }
    setStatus('fetching');
    setMessage('PDF recebido. Interpretando escala e montando painel...');
    await onRosterImport(roster, sourceFileName);
    setStatus('success');
    setMessage('Escala iFlight sincronizada com sucesso.');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus('fetching');
    setMessage(`Processando ${file.name}...`);
    try {
      if (onFileUpload) {
        await onFileUpload(file);
        setStatus('success');
        setMessage('Escala iFlight sincronizada com sucesso.');
        onSuccess();
        return;
      }
      setStatus('success');
      setMessage('PDF selecionado. Conclua a análise na tela de escala.');
      onSuccess();
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Não foi possível importar o PDF do iFlight.');
    } finally {
      e.target.value = '';
    }
  };

  async function handleOpenPortalFlow() {
    if (hasNativeBridge && window.CrewCheckIFlight?.openPortalAndImport) {
      setStatus('portal');
      setMessage('Portal oficial aberto no modo administrador. Faça login/MFA com conta autorizada; depois o CrewCheck tenta abrir Roster Report, selecionar PDF/LT, baixar o arquivo e importar automaticamente.');
      try {
        const nativeResult = await window.CrewCheckIFlight.openPortalAndImport(activePortalUrl, portalOptions);
        const payload: NativeIFlightPayload = typeof nativeResult === 'string' ? JSON.parse(nativeResult) : nativeResult;
        if (!payload?.ok) throw new Error(payload?.error || payload?.message || 'O portal foi fechado sem retornar o PDF da escala.');
        if (payload.roster) {
          await finishRosterImport(payload.roster, payload.sourceFileName || payload.filename || `iFlight_${periodYear}_${periodMonth}.pdf`);
          return;
        }
        if (payload.calendarText) {
          const filename = payload.filename || `iFlight_RosterCalendar_${periodYear}_${periodMonth}.txt`;
          setMessage('Calendário iFlight capturado. Interpretando programação, tripulação, reservas, sobreavisos, treinamentos, pernoites e voos...');
          const roster = await parseIFlightCalendarText(filename, payload.calendarText, periodMonth, periodYear);
          await finishRosterImport(roster, filename);
          return;
        }
        if (payload.dataBase64) {
          const filename = payload.filename || `iFlight_${periodYear}_${periodMonth}.pdf`;
          const roster = await parseBase64Pdf(filename, payload.dataBase64);
          await finishRosterImport(roster, filename);
          return;
        }
        throw new Error('O portal retornou sem calendário legível, PDF ou escala interpretada.');
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Não foi possível concluir a importação pelo portal.';
        const isSso403 = /app_not_configured_for_user|service is not configured|403/i.test(rawMessage);
        const errorMessage = isSso403
          ? 'O portal não liberou acesso para esta sessão. Verifique se a conta corporativa correta tem permissão. Como alternativa, baixe o PDF no portal e importe manualmente.'
          : rawMessage;
        setStatus('error');
        setMessage(errorMessage);
        toast.error(errorMessage);
      }
      return;
    }

    setStatus('portal');
    setShowUniversalFallback(true);
    const webMessage = 'No web, o navegador pode impedir a abertura interna do iFlight quando o portal bloqueia a sessão. Abra o portal oficial em sessão autorizada e importe o PDF; no Android o CrewCheck usa navegador interno para capturar o download autorizado.';
    setMessage(webMessage);
    try {
      const nativeOpen = (window as any)?.CrewCheckNative?.openExternal;
      if (nativeOpen) nativeOpen(activePortalUrl);
      else window.open(activePortalUrl, '_blank', 'noopener,noreferrer');
    } catch {}
    toast.info('Portal oficial aberto. Ao baixar o PDF, compartilhe/importe no CrewCheck para finalizar a sincronização.');
  }

  async function handleUniversalPasteImport() {
    const text = universalPasteText.trim();
    if (text.length < 80) {
      toast.error('Cole o texto do calendário/roster do iFlight ou importe o PDF oficial.');
      return;
    }
    setStatus('fetching');
    setMessage('Lendo texto do calendário iFlight e convertendo para escala CrewCheck...');
    try {
      const roster = await parseIFlightCalendarText(`iFlight_RosterCalendar_${periodYear}_${periodMonth}.txt`, text, periodMonth, periodYear);
      await finishRosterImport(roster, `iFlight_RosterCalendar_${periodYear}_${periodMonth}.txt`);
      setUniversalPasteText('');
      onSuccess();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Não consegui converter o texto do iFlight.';
      setStatus('error');
      setMessage(msg);
      toast.error(msg);
    }
  }

  const statusTone = status === 'success'
    ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50'
    : status === 'error'
      ? 'border-rose-300/30 bg-rose-400/10 text-rose-50'
      : 'border-cyan-300/25 bg-cyan-300/10 text-cyan-50';

  return (
    <div className="min-h-screen overflow-hidden bg-[#030914] pb-24 text-white crewcheck-iflight-screen">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(249,115,22,0.18),transparent_30rem),radial-gradient(circle_at_86%_4%,rgba(14,165,233,0.16),transparent_28rem),linear-gradient(180deg,#030914_0%,#07111f_58%,#020817_100%)]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-5 py-6">
        <header className="flex items-center justify-between gap-4 rounded-[1.6rem] border border-white/10 bg-white/[0.065] px-4 py-3 shadow-2xl shadow-black/25 backdrop-blur-2xl">
          <button onClick={onBack} className="flex min-w-0 items-center gap-3 text-left">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-orange-100"><ChevronLeft className="h-5 w-5" /></span>
            <span className="min-w-0">
              <h2 className="truncate text-lg font-black">iFlight Admin</h2>
              <p className="mt-1 truncate text-xs font-black uppercase tracking-[0.18em] text-orange-100/60">admin · AutoPull controlado</p>
            </span>
          </button>
          <img src="/icons/crewcheck-icon.png" alt="CrewCheck" className="h-11 w-11 rounded-2xl" />
        </header>

        <section className="mt-5 rounded-[2rem] border border-white/10 bg-white/[0.065] p-5 shadow-2xl shadow-black/25 backdrop-blur-2xl sm:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-100/65">iFlight Admin · laboratório controlado</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">AutoPull iFlight da escala</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Esta função fica somente no perfil administrador. Usuários finais continuam com importação manual de PDF; aqui o CrewCheck testa o download automático autorizado no navegador interno Android e mantém um modo universal limitado para web.</p>
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm leading-6 ${statusTone}`}>{isBusy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}{message}</div>

              <div className="mt-4 grid gap-2 rounded-[1.4rem] border border-white/10 bg-white/[0.045] p-3 text-xs font-bold leading-5 text-slate-300 sm:grid-cols-4">
                <span className="rounded-2xl bg-white/10 px-3 py-2"><Lock className="mr-1 inline h-3.5 w-3.5 text-cyan-200" /> Login e confirmação manual</span>
                <span className="rounded-2xl bg-white/10 px-3 py-2"><Globe className="mr-1 inline h-3.5 w-3.5 text-cyan-200" /> Calendário iFlight</span>
                <span className="rounded-2xl bg-white/10 px-3 py-2"><FileText className="mr-1 inline h-3.5 w-3.5 text-cyan-200" /> PDF autorizado</span>
                <span className="rounded-2xl bg-white/10 px-3 py-2"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-200" /> Validação técnica</span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.35rem] border border-cyan-200/15 bg-cyan-300/10 p-4"><b className="text-cyan-50">Mascarado</b><p className="mt-1 text-xs leading-5 text-slate-300">Fluxo visual em validação para não expor telas técnicas durante testes internos.</p></div>
                <div className="rounded-[1.35rem] border border-emerald-200/15 bg-emerald-300/10 p-4"><b className="text-emerald-50">Sem senha salva</b><p className="mt-1 text-xs leading-5 text-slate-300">Não persistir senha. Qualquer teste deve ocorrer somente no portal oficial e em sessão controlada.</p></div>
                <div className="rounded-[1.35rem] border border-amber-200/15 bg-amber-300/10 p-4"><b className="text-amber-50">Restrito</b><p className="mt-1 text-xs leading-5 text-slate-300">Módulo oculto para usuários finais até validação de estabilidade e conformidade.</p></div>
              </div>

              <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-[#07111f]/75 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/60">roteiro técnico de validação</p>
                <div className="mt-3 grid gap-2 text-xs font-bold leading-5 text-slate-300 sm:grid-cols-2">
                  <span className="rounded-2xl bg-white/[0.07] px-3 py-2">Programação mensal e mudanças por dia</span>
                  <span className="rounded-2xl bg-white/[0.07] px-3 py-2">Voos, reservas, sobreavisos e treinamentos</span>
                  <span className="rounded-2xl bg-white/[0.07] px-3 py-2">Tripulação e detalhes de duty/pairing</span>
                  <span className="rounded-2xl bg-white/[0.07] px-3 py-2">Pernoites, horários, relatório PDF e calendário</span>
                </div>
              </div>

              <div className="mt-4 rounded-[1.4rem] border border-white/10 bg-white/[0.055] p-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/60">portal oficial</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button type="button" onClick={() => setPortalKind('crew')} className={`rounded-2xl px-4 py-3 text-left text-xs font-black transition ${portalKind === 'crew' ? 'bg-cyan-300 text-[#07111f]' : 'border border-white/10 bg-white/10 text-white hover:bg-white/15'}`}>iFlight Crew<br /><span className="font-semibold opacity-80">/iflight-crew/web/getMainPage</span></button>
                  <button type="button" onClick={() => setPortalKind('cwp')} className={`rounded-2xl px-4 py-3 text-left text-xs font-black transition ${portalKind === 'cwp' ? 'bg-cyan-300 text-[#07111f]' : 'border border-white/10 bg-white/10 text-white hover:bg-white/15'}`}>iFlight CWP<br /><span className="font-semibold opacity-80">alternativo autorizado</span></button>
                </div>
                <p className="mt-3 text-[0.72rem] font-semibold leading-5 text-slate-400">Se o portal Crew não liberar a conta autorizada, teste o CWP. O CrewCheck não contorna permissão: ele só reutiliza sessão oficial válida.</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <button onClick={handleOpenPortalFlow} disabled={status === 'fetching'} className="flex min-h-[4rem] items-center justify-center gap-3 rounded-2xl bg-cyan-300 px-5 py-4 text-base font-black text-[#07111f] shadow-lg shadow-cyan-950/30 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-70">
                  <DownloadCloud className="h-5 w-5" /> {hasNativeBridge ? 'Abrir navegador interno Android' : 'Abrir portal oficial'}
                </button>
                <button onClick={() => fileInputRef.current?.click()} disabled={status === 'fetching'} className="flex min-h-[4rem] items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-sm font-black text-white transition hover:bg-white/15 disabled:cursor-wait disabled:opacity-70">
                  <Upload className="h-5 w-5" /> Importar PDF
                </button>
                <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileUpload} disabled={status === 'fetching'} className="sr-only" />
              </div>

              {showUniversalFallback || !hasNativeBridge ? (
                <div className="mt-4 rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100/70">modo universal</p>
                      <h3 className="mt-1 text-lg font-black text-white">Modo universal limitado</h3>
                      <p className="mt-2 text-xs leading-5 text-slate-300">No iPad e no navegador comum, o caminho mais confiável e sem custo adicional é salvar o PDF oficial e importar pelo botão de PDF. No Android, o módulo administrativo ainda tenta capturar o download autorizado quando a sessão permitir.</p>
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white transition hover:bg-white/15">Importar PDF</button>
                  </div>
                  <textarea
                    value={universalPasteText}
                    onChange={(event) => setUniversalPasteText(event.target.value)}
                    placeholder="Opcional: cole aqui o texto da tela Roster Calendar do iFlight para o CrewCheck tentar converter sem PDF."
                    className="mt-3 min-h-[7rem] w-full rounded-2xl border border-white/10 bg-[#07111f]/90 p-3 text-xs font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={handleUniversalPasteImport} disabled={status === 'fetching'} className="rounded-2xl bg-cyan-300 px-4 py-2 text-xs font-black text-[#07111f] disabled:opacity-60">Converter texto colado</button>
                    <button onClick={() => setUniversalPasteText('')} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-black text-white">Limpar</button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-[1.5rem] border border-cyan-300/15 bg-[#07111f]/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-black text-cyan-100"><CalendarDays className="h-4 w-4" /> Período</div>
              <div className="grid gap-3">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70">Mês</span>
                  <select value={periodMonth} onChange={(event) => setPeriodMonth(event.target.value)} className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300">
                    {months.map((month) => <option key={month} value={month}>{month}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-cyan-100/70">Ano</span>
                  <input value={periodYear} onChange={(event) => setPeriodYear(event.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-[#07111f] px-4 text-sm font-bold text-white outline-none focus:border-cyan-300" />
                </label>
                <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-3 text-xs leading-5 text-slate-300">
                  <strong className="text-white">{fromDate}</strong> até <strong className="text-white">{toDate}</strong><br />Formato: <strong className="text-white">PDF automático</strong> · Fuso: <strong className="text-white">LT</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4 grid gap-4 md:grid-cols-3">
          <ToggleCard checked={autoClicks} onChange={setAutoClicks} title="AutoPull PDF" text="Tenta navegar até Roster Report, selecionar PDF/LT e capturar o download autorizado." />
          <ToggleCard checked={keepAuthorizedSession} onChange={setKeepAuthorizedSession} title="Manter sessão local" text="Não salva senha; preserva apenas a sessão oficial do iFlight no dispositivo enquanto válida." />
          <ToggleCard checked={silentPremiumPull} onChange={setSilentPremiumPull} title="Tela mascarada" text="Mostra progresso limpo enquanto o portal realiza a navegação técnica." />
          <div className="rounded-[1.5rem] border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm leading-6 text-emerald-50/80 md:col-span-3"><ShieldCheck className="mb-2 h-5 w-5" /><strong>LGPD:</strong> o CrewCheck não recebe senha nem código de confirmação no servidor. Essas informações ficam na tela oficial do iFlight dentro do navegador interno. O módulo permanece restrito ao administrador até validação completa de estabilidade, permissão e conformidade.</div>
        </section>

        <section className="mt-4 rounded-[1.7rem] border border-white/10 bg-white/[0.055] p-4 text-sm leading-6 text-slate-300 shadow-xl shadow-black/20 backdrop-blur-2xl">
          <AlertCircle className="mr-2 inline h-4 w-4 text-orange-200" />
          Fluxo administrativo: use apenas para testes controlados e contas autorizadas. Usuários finais continuam com importação manual de PDF oficial pela tela Nova escala.
        </section>

        
      </div>
    </div>
  );
};

function ToggleCard({ checked, onChange, title, text }: { checked: boolean; onChange: (value: boolean) => void; title: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[1.5rem] border border-white/10 bg-white/[0.055] p-4 text-sm text-slate-200 shadow-xl shadow-black/15 backdrop-blur-xl">
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" className="mt-1 h-4 w-4 accent-cyan-300" />
      <span><strong className="text-white">{title}</strong><br /><span className="text-slate-400">{text}</span></span>
    </label>
  );
}

export default IFlightIntegrationView;
