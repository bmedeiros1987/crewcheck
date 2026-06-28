import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Car,
  DollarSign,
  FileText,
  FolderSync,
  Gauge,
  GraduationCap,
  Home as HomeIcon,
  Lock,
  Mail,
  MapPin,
  Navigation,
  Menu,
  MoreVertical,
  Plane,
  Radar,
  Monitor,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getSavedLanguage, getTranslations } from '@/lib/i18n';

interface DashboardProps {
  user: {
    name: string;
    company: string;
    avatar?: string;
    base?: string;
    requiresDeparture?: boolean;
  };
  nextEvent?: {
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
  onNavigate: (view: string) => void;
  canAccessC32FAcademy?: boolean;
  pendingOffline?: number;
  hasRoster?: boolean;
  alertsCount?: number;
  daysLoaded?: number;
  complianceScore?: number;
}

const Dashboard: React.FC<DashboardProps> = ({
  user,
  nextEvent,
  onNavigate,
  canAccessC32FAcademy = false,
  pendingOffline = 0,
  hasRoster = false,
  alertsCount = 0,
  daysLoaded = 0,
  complianceScore,
}) => {
  const i18n = getTranslations(getSavedLanguage());
  const displayName = user.name || i18n.crewMember;
  const firstName = displayName.split(/\s+/).filter(Boolean).slice(0, 2).join(' ') || 'Crew';
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'CC';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('crewcheck_home_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem('crewcheck_home_sidebar_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  };

  const menuItems = [
    { icon: HomeIcon, label: 'Cockpit', caption: 'visão geral minimalista', color: 'from-cyan-300 to-blue-500', onClick: () => onNavigate('home') },
    { icon: FileText, label: 'Nova escala', caption: 'PDF, AIMS ou oficial', color: 'from-cyan-300 to-blue-500', onClick: () => onNavigate('import') },
    { icon: CreditCard, label: 'Assinatura', caption: 'planos e pagamento', color: 'from-amber-200 to-orange-500', onClick: () => onNavigate('billing') },
    { icon: Calendar, label: 'Escala', caption: 'linha do tempo premium', color: 'from-blue-400 to-indigo-600', onClick: () => onNavigate('roster') },
    { icon: Navigation, label: 'Saída Inteligente', caption: 'Maps · transporte · Uber/99', color: 'from-emerald-300 to-cyan-600', onClick: () => onNavigate('departure') },
    { icon: Bell, label: 'BIDS', caption: 'janela de solicitação e calendário', color: 'from-amber-300 to-orange-600', onClick: () => onNavigate('bids') },
    { icon: Monitor, label: 'Radar de Voos', caption: 'status, portão e aeroporto', color: 'from-cyan-200 to-sky-600', onClick: () => onNavigate('flightboard') },
    { icon: UserRound, label: 'Chefe de Cabine', caption: 'caderno, água e horários', color: 'from-indigo-200 to-violet-600', onClick: () => onNavigate('chief') },
    { icon: FileText, label: 'Checklist Médico', caption: 'ocorrência e PDF', color: 'from-rose-200 to-red-600', onClick: () => onNavigate('medical') },
    { icon: FileText, label: 'Diárias', caption: 'previsão e memória de cálculo', color: 'from-emerald-300 to-teal-600', onClick: () => onNavigate('perdiem') },
    { icon: DollarSign, label: 'Moedas', caption: 'cotação do dia e diárias internacionais', color: 'from-cyan-200 to-blue-600', onClick: () => onNavigate('currency') },
    { icon: Car, label: 'Meu carro', caption: 'GPS, piso e vaga do estacionamento', color: 'from-sky-200 to-cyan-600', onClick: () => onNavigate('parking') },
    { icon: TrendingUp, label: 'Salário', caption: 'bonificação, bruto e líquido', color: 'from-lime-300 to-emerald-600', onClick: () => onNavigate('salary') },
    { icon: FolderSync, label: 'Rotina', caption: 'treino, estudo e recuperação', color: 'from-emerald-300 to-teal-600', onClick: () => onNavigate('routine') },
    { icon: AlertCircle, label: 'Conformidade', caption: 'avisos e pontos de atenção', color: 'from-rose-400 to-red-600', onClick: () => onNavigate('irregularities') },
    { icon: BarChart3, label: 'Relatórios', caption: 'métricas e exportações', color: 'from-sky-300 to-cyan-600', onClick: () => onNavigate('reports') },
    { icon: Clock, label: 'Histórico', caption: 'escalas salvas', color: 'from-amber-300 to-orange-600', onClick: () => onNavigate('history') },
    { icon: FileText, label: 'Notas privadas', caption: 'somente neste dispositivo', color: 'from-yellow-300 to-amber-500', onClick: () => onNavigate('notes') },
    ...(canAccessC32FAcademy ? [{ icon: ShieldCheck, label: 'Admin', caption: 'uso, saúde e ferramentas', color: 'from-slate-200 to-cyan-600', onClick: () => onNavigate('admin') }, { icon: GraduationCap, label: 'C32F', caption: 'módulo privado de estudo', color: 'from-violet-300 to-fuchsia-600', onClick: () => onNavigate('c32f') }] : []),
    { icon: Mail, label: 'Ajuda', caption: 'falar com suporte', color: 'from-sky-300 to-cyan-600', onClick: () => onNavigate('support') },
    { icon: Settings, label: 'Configurações', caption: 'perfil, agenda e manual', color: 'from-slate-300 to-slate-600', onClick: () => onNavigate('settings') },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden overflow-y-auto bg-[#030914] text-white crewcheck-commercial-dashboard">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_4%,rgba(14,165,233,0.33),transparent_31%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.26),transparent_30%),linear-gradient(180deg,#030914_0%,#07111f_43%,#020817_100%)]" />
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.16),transparent_44%)]" />
        <div className="absolute -bottom-28 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className={`relative z-10 mx-auto grid min-h-[100dvh] w-full max-w-[118rem] grid-cols-1 gap-5 px-4 pb-32 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-6 ${sidebarCollapsed ? 'lg:grid-cols-[6.2rem_minmax(0,1fr)]' : 'lg:grid-cols-[18rem_minmax(0,1fr)]'} lg:pb-10 lg:pt-6 crewcheck-home-ultra-minimal`}>
        <aside className={`crewcheck-v10855-home-sidebar hidden rounded-[2rem] border border-white/10 bg-white/[0.045] p-3 shadow-2xl shadow-black/30 backdrop-blur-2xl lg:flex lg:flex-col ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
          <div className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            <button onClick={() => onNavigate('home')} className="flex min-w-0 items-center gap-3 rounded-3xl p-2 text-left transition hover:bg-white/[0.07]" title="CrewCheck Home">
              <img src="/icons/crewcheck-icon-v2.png" alt="CrewCheck" className="crewcheck-brand-icon-image h-12 w-12 rounded-2xl shadow-2xl shadow-cyan-950/40" />
              {!sidebarCollapsed && <div className="min-w-0"><h1 className="truncate text-lg font-black tracking-tight">CrewCheck</h1><p className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.22em] text-cyan-100/60">Premium Roster</p></div>}
            </button>
            <button onClick={toggleSidebar} className="crewcheck-v10855-sidebar-toggle flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/15 bg-white/[0.06] text-cyan-50 transition hover:bg-cyan-300/12" title={sidebarCollapsed ? 'Expandir menu' : 'Esconder menu'}>
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <button onClick={() => onNavigate('import')} className={`mt-4 flex w-full items-center ${sidebarCollapsed ? 'justify-center px-3' : 'justify-between px-4'} rounded-3xl border border-cyan-300/20 bg-cyan-300/10 py-3 text-left text-sm font-bold text-cyan-50 transition hover:bg-cyan-300/15`} title="Importar escala">
            <span className="flex min-w-0 items-center gap-2"><Sparkles className="h-4 w-4 shrink-0 text-cyan-200" /> {!sidebarCollapsed && <span className="truncate">Importar PDF</span>}</span>
            {!sidebarCollapsed && <ChevronRight className="h-4 w-4 shrink-0" />}
          </button>

          <nav className="crewcheck-v10855-home-nav mt-4 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.label} onClick={item.onClick} className={`group flex w-full items-center gap-3 rounded-2xl border border-white/0 px-3 py-2.5 text-left transition hover:border-cyan-200/15 hover:bg-white/[0.07] ${sidebarCollapsed ? 'justify-center' : ''}`} title={item.label}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${item.color} text-[#06101d] shadow-lg shadow-black/10 transition group-hover:scale-105`}><Icon className="h-5 w-5" /></span>
                  {!sidebarCollapsed && <span className="min-w-0"><span className="block truncate text-sm font-black text-white">{item.label}</span><span className="block truncate text-[0.68rem] font-semibold text-slate-400">{item.caption}</span></span>}
                </button>
              );
            })}
          </nav>

          {!sidebarCollapsed && <div className="mt-4 grid gap-2 border-t border-white/10 pt-4">
            <FeatureLine icon={ShieldCheck} title="Reliable" text={hasRoster ? `${daysLoaded || 0} dias carregados · ${alertsCount} alerta(s).` : 'Importe sua escala para ativar todas as métricas.'} />
            <button onClick={() => onNavigate('settings')} className="cc-profile-quick-card w-full rounded-3xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:bg-white/[0.07]">
              <div className="flex items-center gap-3">
                <ProfileAvatar avatar={user.avatar} initials={initials} size="sm" />
                <div className="min-w-0"><p className="truncate font-black leading-tight">{firstName}</p><p className="text-xs text-slate-400">{user.base || 'Base'} · perfil</p></div>
              </div>
            </button>
          </div>}
        </aside>

        <main className="min-w-0 space-y-5">
          <section className="relative overflow-hidden rounded-[2rem] border border-cyan-200/15 bg-[linear-gradient(135deg,rgba(255,255,255,.14),rgba(125,211,252,.10),rgba(255,255,255,.05))] p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-2xl sm:p-7">
            <div className="absolute -right-12 top-4 h-44 w-44 rounded-full border-[14px] border-cyan-200/10" />
            <Plane className="pointer-events-none absolute -right-3 top-8 h-32 w-32 rotate-12 text-cyan-100/25 drop-shadow-2xl sm:h-40 sm:w-40 xl:text-cyan-100/35" />
            <div className="relative z-10 max-w-2xl">
              <div className="flex items-start gap-4">
                <button type="button" onClick={() => onNavigate('settings')} className="cc-hero-avatar-button shrink-0 text-left" title="Alterar foto de perfil">
                  <ProfileAvatar avatar={user.avatar} initials={initials} size="lg" />
                  <span className="mt-2 block text-center text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/70">Foto</span>
                </button>
                <div className="min-w-0">
                  <p className="text-[0.7rem] font-black uppercase tracking-[0.32em] text-cyan-100/70">Cockpit pessoal</p>
                  <h2 className="mt-2 max-w-xl break-words text-3xl font-black leading-[0.95] tracking-tight sm:text-5xl">{firstName}</h2>
                  <p className="mt-3 text-sm font-semibold text-slate-300 sm:text-base">Cockpit · {user.base || 'BSB'} · escala, rotina reliable, radar, saída inteligente e alertas em leitura rápida.</p>
                </div>
              </div>
              <div className="mt-5 grid max-w-xl grid-cols-3 gap-2 sm:gap-3">
                <MiniStatus icon={Wifi} value="Offline" label="pronto" />
                <MiniStatus icon={ShieldCheck} value="LGPD" label="privado" />
                <MiniStatus icon={RefreshCw} value="Trust" label="auditável" />
              </div>
              <div className="mt-5 max-w-2xl rounded-3xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50/90">
                <b>Fase de testes privados:</b> confira sempre os dados com a escala oficial. Se encontrar divergência, envie o PDF/print pela aba Suporte para ajustarmos o CrewCheck.
              </div>
            </div>
          </section>

          <section className="crewcheck-v10855-home-focus grid gap-4 2xl:grid-cols-[minmax(0,0.95fr)_minmax(28rem,0.72fr)]">
            <NextProgramBoardingPass nextEvent={nextEvent} hasRoster={hasRoster} canAccessAdmin={canAccessC32FAcademy} onOpenRoster={() => onNavigate('roster')} onImport={() => onNavigate('import')} onSync={() => onNavigate('iflight')} />
            <SmartDepartureSummaryCard nextEvent={nextEvent} hasRoster={hasRoster} userBase={user.base} onOpen={() => onNavigate('departure')} />
          </section>

          <PremiumTrustStrip hasRoster={hasRoster} alertsCount={alertsCount} daysLoaded={daysLoaded} complianceScore={complianceScore} />

          <section className="crewcheck-cockpit-module-center rounded-[2rem] border border-cyan-200/12 bg-white/[0.04] p-4 shadow-2xl shadow-black/20 backdrop-blur-2xl">
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[0.66rem] font-black uppercase tracking-[0.28em] text-cyan-100/65">Central CrewCheck</p>
                <h3 className="text-2xl font-black tracking-tight text-white">Todos os módulos no Cockpit</h3>
              </div>
              <p className="max-w-md text-xs font-semibold leading-5 text-slate-400">Acesso rápido sem menu flutuante: escala, chefe, checklist médico, diárias, salário, ajuda e relatórios.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {menuItems.filter((item) => item.label !== 'Cockpit').map((item) => <MenuCard key={item.label} {...item} compact adminMode={canAccessC32FAcademy} onAdminNavigate={onNavigate} />)}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};


function PremiumTrustStrip({ hasRoster, alertsCount, daysLoaded, complianceScore }: { hasRoster: boolean; alertsCount: number; daysLoaded: number; complianceScore?: number }) {
  const items = [
    { icon: ShieldCheck, title: hasRoster ? 'Escala auditada' : 'Aguardando escala', text: hasRoster ? `${daysLoaded || 0} dia(s) carregado(s) com fonte local.` : 'Importe PDF oficial para ativar o cockpit.', tone: 'emerald' },
    { icon: Gauge, title: 'Confiabilidade', text: complianceScore ? `${complianceScore}/100 · cálculo conservador` : 'Sem escala ativa para pontuar.', tone: 'cyan' },
    { icon: Bell, title: 'Alertas', text: alertsCount ? `${alertsCount} ponto(s) para revisar antes de confiar no mês.` : 'Nenhum alerta crítico confirmado.', tone: alertsCount ? 'amber' : 'emerald' },
  ];
  return (
    <section className="crewcheck-premium-trust-strip grid gap-3 md:grid-cols-3">
      {items.map(({ icon: Icon, title, text, tone }) => (
        <div key={title} className={`crewcheck-trust-tile crewcheck-trust-${tone}`}>
          <Icon className="h-5 w-5" />
          <div><p>{title}</p><span>{text}</span></div>
        </div>
      ))}
    </section>
  );
}

function NextProgramBoardingPass({ nextEvent, hasRoster, canAccessAdmin, onOpenRoster, onImport, onSync }: { nextEvent?: DashboardProps['nextEvent']; hasRoster: boolean; canAccessAdmin?: boolean; onOpenRoster: () => void; onImport: () => void; onSync: () => void }) {
  const isFlight = Boolean(nextEvent?.isFlight);
  const forceOperationalDeparture = /reserva|reserve|airport stand|asb|\bres\b|voo acionado|crm|cbf|emer|check|simulador|reunião|meeting/i.test(`${nextEvent?.title || ''} ${nextEvent?.status || ''} ${nextEvent?.route || ''}`);
  const requiresDeparture = nextEvent?.requiresDeparture !== false || forceOperationalDeparture;
  const liveCountdown = useLiveCountdown(nextEvent?.targetIso, nextEvent?.countdown);
  const primaryTitle = nextEvent?.flightNumber && isFlight
    ? `${nextEvent.flightNumber} · ${nextEvent?.route || nextEvent?.title || 'Voo'}`
    : (nextEvent?.title || nextEvent?.route || (hasRoster ? 'Escala carregada' : 'Importe sua escala'));
  const startLabel = requiresDeparture ? (isFlight ? 'Apresentação' : 'Início') : 'Início';
  const sideHeading = nextEvent?.isInProgress ? 'status agora' : requiresDeparture ? 'tempo restante' : 'sem deslocamento';
  const sideValue = nextEvent?.isInProgress ? 'em andamento' : requiresDeparture ? liveCountdown : '—';
  const sideText = nextEvent?.dayContext || (requiresDeparture
    ? (isFlight ? `Radar privado: ${nextEvent?.source || 'CrewCheck'}` : 'Use o botão “Mais informações” para ver a programação completa.')
    : 'Esta programação não exige saída de casa nem cálculo de deslocamento.');
  const relationLabel = nextEvent?.relationLabel || (hasRoster ? 'A seguir' : 'Aguardando PDF');
  const notToday = Boolean(nextEvent?.relation === 'tomorrow' || nextEvent?.relation === 'future' || nextEvent?.relation === 'rest_followup');
  const routeParts = String(nextEvent?.route || primaryTitle || '').split(/\s*→\s*/).map((part) => part.trim()).filter(Boolean);
  const origin = nextEvent?.origin || routeParts[0] || '';
  const destination = nextEvent?.destination || routeParts[1] || '';

  return (
    <div className={`crewcheck-next-program-v108151 overflow-hidden rounded-[1.9rem] border border-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.092),rgba(255,255,255,0.048))] shadow-2xl shadow-black/20 backdrop-blur-2xl ${notToday ? 'cc-not-today' : ''}`}>
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_15.5rem]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[0.65rem] font-black uppercase tracking-[0.26em] text-cyan-100/70">Programação a seguir</p>
                <span className={`cc-next-relation-chip rounded-full border px-3 py-1 text-[0.62rem] font-black uppercase tracking-[0.14em] ${notToday ? 'border-amber-300/35 bg-amber-300/12 text-amber-100' : nextEvent?.isInProgress ? 'border-emerald-300/35 bg-emerald-300/12 text-emerald-100' : 'border-cyan-300/25 bg-cyan-300/12 text-cyan-100'}`}>{relationLabel}</span>
              </div>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{primaryTitle}</h3>
              <p className="mt-1 text-sm font-semibold text-slate-300">{nextEvent?.date || 'PDF oficial' } · {nextEvent?.source || 'CrewCheck local'}</p>
            </div>
            <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/12 text-cyan-50 sm:flex"><Plane className="h-7 w-7" /></div>
          </div>

          {notToday && nextEvent?.dayContext ? (
            <div className="cc-next-context mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm font-bold leading-6 text-amber-50/90">
              {nextEvent.dayContext}
            </div>
          ) : null}

          {(origin || destination) && isFlight ? (
            <div className="cc-route-strip mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-cyan-100/60">Origem</p>
                <p className="mt-1 text-3xl font-black text-white">{origin || '—'}</p>
              </div>
              <div className="flex items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-300/10 px-4 text-cyan-100"><Plane className="h-6 w-6 rotate-45" /></div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <p className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-cyan-100/60">Destino</p>
                <p className="mt-1 text-3xl font-black text-white">{destination || '—'}</p>
              </div>
            </div>
          ) : null}

          <div className={isFlight && requiresDeparture ? "mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5" : "mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"}>
            <GlassPill label={startLabel} value={nextEvent?.time || '—'} />
            <GlassPill label="Fim" value={nextEvent?.endTime || '—'} />
            {isFlight && requiresDeparture ? (
              <>
                <GlassPill label="Status" value={nextEvent?.status || 'Programado'} />
                <GlassPill label="Portão" value={nextEvent?.gate || '—'} />
                <GlassPill label="Terminal" value={nextEvent?.terminal || '—'} />
              </>
            ) : (
              <>
                <GlassPill label="Tipo" value={nextEvent?.status || (hasRoster ? 'Programação' : 'Importação')} />
                <GlassPill label="Deslocamento" value={requiresDeparture ? 'Necessário' : 'Não'} />
              </>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={hasRoster ? onOpenRoster : onImport} className="cc-button-primary rounded-2xl px-4 py-3 text-sm font-black shadow-lg transition active:scale-95">{hasRoster ? 'Mais informações' : 'Importar PDF'}</button>
            <button onClick={onImport} className="cc-button-secondary rounded-2xl px-4 py-3 text-sm font-black transition active:scale-95">Enviar PDF oficial</button>
          </div>
        </div>
        <div className="cc-next-side border-t border-white/10 bg-cyan-300/[0.08] p-5 xl:border-l xl:border-t-0">
          <p className="text-[0.65rem] font-black uppercase tracking-[0.22em] text-cyan-100/70">{sideHeading}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{sideValue}</p>
          <p className="mt-2 text-sm leading-6 text-slate-300">{sideText}</p>
        </div>
      </div>
    </div>
  );
}



type SmartDeparturePlan = {
  ok: boolean;
  airport?: string;
  airportName?: string;
  leaveAtLabel?: string;
  arrivalDeadlineLabel?: string;
  durationMinutes?: number;
  delayMinutes?: number | null;
  distanceKm?: number | null;
  isLate?: boolean;
  source?: string;
  humanSourceLabel?: string;
  pickupBufferMinutes?: number | null;
  inVehicleMinutes?: number | null;
  warning?: string | null;
  message?: string;
  marginMinutes?: number;
  safetyMarginMinutes?: number;
  mode?: string;
  requestedMode?: string;
  recommendedMode?: string;
  routeOptions?: SmartRouteOption[];
  accuracyMeters?: number | null;
  permissionConfidence?: string;
  localizedDuration?: string | null;
  localizedDistance?: string | null;
  mapsUrl?: string;
  label?: string;
  transitSteps?: Array<{ line?: string; from?: string; to?: string; departureTime?: string; arrivalTime?: string; departureLabel?: string; arrivalLabel?: string; text?: string; mode?: string; headsign?: string; agency?: string; realtime?: boolean; routeLabel?: string; source?: string }> ;
  transitBoard?: Array<{ line?: string; from?: string; to?: string; departureLabel?: string; arrivalLabel?: string; text?: string; mode?: string; headsign?: string; agency?: string; realtime?: boolean; routeLabel?: string; source?: string }>;
  recommendedReason?: string;
  fastestMode?: string;
  estimateDisclosure?: string;
  dataQualityLabel?: string;
  originSourceLabel?: string;
  distancePolicy?: { thresholdKm?: number; policyDistanceKm?: number; straightDistanceKm?: number; isLongDistance?: boolean; userAllowsFlightAboveThreshold?: boolean; decision?: string; comparedModes?: string[] };
};

const CREWCHECK_SMART_DEPARTURE_DEFAULT_MARGIN = 30;
const CREWCHECK_SUPPORTED_AIRPORTS = 'BSB|GRU|CGH|GIG|SDU|CNF|VCP|POA|CWB|SSA|REC|FOR|NAT|MAO|BEL|FLN|IGU|AJU|JPA|MCZ|VIX|GYN|CGB|CGR|SLZ|THE|PVH|RBR|BVB|PMW|MCP|NVT|JOI|LDB|MGF|RAO|UDI|IOS|BPS';

function getSmartDepartureMarginMinutes() {
  const stored = Number(localStorage.getItem('crewcheck_departure_margin_minutes') || '');
  if (Number.isFinite(stored) && stored >= CREWCHECK_SMART_DEPARTURE_DEFAULT_MARGIN) return String(Math.min(120, stored));
  try { localStorage.setItem('crewcheck_departure_margin_minutes', String(CREWCHECK_SMART_DEPARTURE_DEFAULT_MARGIN)); } catch {}
  return String(CREWCHECK_SMART_DEPARTURE_DEFAULT_MARGIN);
}

function inferAirportForDeparture(nextEvent?: DashboardProps['nextEvent'], fallbackBase?: string) {
  const candidates = [
    nextEvent?.origin,
    nextEvent?.base,
    nextEvent?.route,
    fallbackBase,
    localStorage.getItem('crewcheck_preferred_airport') || '',
  ].map((item) => String(item || '').toUpperCase());
  const airportPattern = new RegExp(`\\b(${CREWCHECK_SUPPORTED_AIRPORTS})\\b`);
  for (const raw of candidates) {
    const match = raw.match(airportPattern);
    if (match?.[1]) return match[1];
  }
  return 'BSB';
}

type NativePermissionStatus = { location?: boolean; notifications?: boolean };
type NativeLocationPayload = { ok?: boolean; lat?: number; lng?: number; accuracy?: number; provider?: string; time?: number; error?: string; permission?: boolean };
type SmartTravelMode = 'AUTO' | 'DRIVE' | 'TRANSIT' | 'RIDE_APP' | 'TWO_WHEELER' | 'DRIVE_FLIGHT' | 'RIDE_APP_FLIGHT' | 'MOTO_FLIGHT' | 'TRANSIT_FLIGHT';
type SmartRouteOption = { ok?: boolean; mode?: string; label?: string; leaveAtLabel?: string; leaveAtFullLabel?: string; arrivalDeadlineLabel?: string; durationMinutes?: number; distanceKm?: number | null; source?: string; humanSourceLabel?: string; mapsUrl?: string; accuracyMeters?: number | null; permissionConfidence?: string; routeQuality?: string; firstTransitDeparture?: string | null; pickupBufferMinutes?: number | null; inVehicleMinutes?: number | null; transitSteps?: Array<{ line?: string; from?: string; to?: string; departureTime?: string; arrivalTime?: string; departureLabel?: string; arrivalLabel?: string; text?: string; mode?: string; headsign?: string; agency?: string; realtime?: boolean; routeLabel?: string; source?: string }> };

function getCrewCheckNativeBridge(): any {
  try {
    const win = window as any;
    return win.CrewCheckPremium || win.CrewCheckNative || win.AndroidCrewCheckNative || null;
  } catch {
    return null;
  }
}

function readCrewCheckNativePermissionStatus(): NativePermissionStatus {
  try {
    const win = window as any;
    const cached = win.__crewcheckNativePermissionStatus && typeof win.__crewcheckNativePermissionStatus === 'object' ? win.__crewcheckNativePermissionStatus : null;
    const native = getCrewCheckNativeBridge();
    if (native?.permissionStatus) {
      const raw = native.permissionStatus();
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === 'object') return { ...cached, ...parsed };
    }
    if (cached) return cached;
  } catch {}
  return {
    location: undefined,
    notifications: typeof Notification !== 'undefined' ? Notification.permission === 'granted' : undefined,
  };
}

function requestCrewCheckNativeLocation(): boolean {
  try {
    const native = getCrewCheckNativeBridge();
    if (native?.requestLocation) return Boolean(native.requestLocation());
  } catch {}
  return false;
}

function requestCrewCheckNativeNotifications(): boolean {
  try {
    const native = getCrewCheckNativeBridge();
    if (native?.requestNotifications) return Boolean(native.requestNotifications());
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
      return false;
    }
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  } catch {}
  return false;
}

function requestCrewCheckNativeCurrentLocation(timeoutMs = 14500): Promise<NativeLocationPayload | null> {
  return new Promise((resolve) => {
    try {
      const native = getCrewCheckNativeBridge();
      if (!native?.requestCurrentLocation) {
        resolve(null);
        return;
      }
      const callbackId = `loc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      let done = false;
      const cleanup = () => window.removeEventListener('crewcheck:native-location-result', listener as EventListener);
      const finish = (payload: NativeLocationPayload | null) => {
        if (done) return;
        done = true;
        cleanup();
        resolve(payload);
      };
      const listener = (event: Event) => {
        const detail = (event as CustomEvent<NativeLocationPayload & { callbackId?: string }>).detail || {};
        if (detail.callbackId && detail.callbackId !== callbackId) return;
        finish(detail);
      };
      window.addEventListener('crewcheck:native-location-result', listener as EventListener);
      const accepted = Boolean(native.requestCurrentLocation(callbackId));
      if (!accepted) finish(null);
      window.setTimeout(() => finish(null), timeoutMs);
    } catch {
      resolve(null);
    }
  });
}

function saveCrewCheckLastGoodLocation(payload: NativeLocationPayload) {
  try {
    if (!payload?.ok || typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return;
    const item = {
      ok: true,
      lat: payload.lat,
      lng: payload.lng,
      accuracy: payload.accuracy || null,
      provider: payload.provider || 'gps',
      time: payload.time || Date.now(),
      savedAt: Date.now(),
    };
    localStorage.setItem('crewcheck_location_last_good_v2', JSON.stringify(item));
    const raw = localStorage.getItem('crewcheck_location_learning_v1');
    const list = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list : [];
    next.unshift({
      lat: Math.round(item.lat * 100000) / 100000,
      lng: Math.round(item.lng * 100000) / 100000,
      accuracy: item.accuracy,
      provider: item.provider,
      time: item.time,
    });
    localStorage.setItem('crewcheck_location_learning_v1', JSON.stringify(next.slice(0, 20)));
  } catch {
    // Local e silencioso por privacidade/LGPD.
  }
}

function saveCrewCheckGpsSample(payload: NativeLocationPayload | null, _context?: string) {
  if (payload?.ok) saveCrewCheckLastGoodLocation(payload);
}

function readCrewCheckLastGoodLocation(maxAgeMs = 20 * 60_000): NativeLocationPayload | null {
  try {
    const raw = localStorage.getItem('crewcheck_location_last_good_v2');
    if (!raw) return null;
    const item = JSON.parse(raw);
    const savedAt = Number(item.savedAt || item.time || 0);
    if (!savedAt || Date.now() - savedAt > maxAgeMs) return null;
    if (typeof item.lat !== 'number' || typeof item.lng !== 'number') return null;
    return { ok: true, lat: item.lat, lng: item.lng, accuracy: item.accuracy || null, provider: `${item.provider || 'gps'}-cache`, time: item.time || savedAt };
  } catch {
    return null;
  }
}

function requestBrowserLocation(timeoutMs = 18000): Promise<NativeLocationPayload> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      const cached = readCrewCheckLastGoodLocation();
      resolve(cached || { ok: false, error: 'Localização indisponível neste navegador.' });
      return;
    }
    const secureEnough = window.isSecureContext || location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!secureEnough) {
      resolve({ ok: false, permission: false, error: 'No modo web, a localização só funciona em HTTPS. Abra o CrewCheck pelo endereço seguro.' });
      return;
    }

    let done = false;
    let watchId: number | null = null;
    const finish = (payload: NativeLocationPayload) => {
      if (done) return;
      done = true;
      if (watchId !== null) {
        try { navigator.geolocation.clearWatch(watchId); } catch {}
      }
      if (payload?.ok) saveCrewCheckLastGoodLocation(payload);
      resolve(payload);
    };

    const success = (position: GeolocationPosition, provider = 'browser-gps-live') => {
      finish({
        ok: true,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        provider,
        time: position.timestamp,
      });
    };

    const fail = (geoError?: GeolocationPositionError) => {
      const cached = readCrewCheckLastGoodLocation();
      if (cached) {
        finish({ ...cached, provider: `${cached.provider || 'gps'}-fallback`, error: 'Usando última posição confiável salva localmente.' });
        return;
      }
      const denied = geoError?.code === 1;
      const timeout = geoError?.code === 3;
      finish({
        ok: false,
        permission: denied ? false : undefined,
        error: denied
          ? 'A permissão parece bloqueada no navegador. Libere Localização para o CrewCheck e tente novamente.'
          : timeout
          ? 'A permissão está liberada, mas o navegador não entregou o GPS a tempo. Ative localização precisa e tente novamente.'
          : 'Não consegui obter sua localização atual. Ative o GPS/localização precisa e tente novamente.',
      });
    };

    try {
      navigator.geolocation.getCurrentPosition((position) => success(position, 'browser-gps'), fail, { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 });
      window.setTimeout(() => {
        if (done) return;
        try {
          watchId = navigator.geolocation.watchPosition((position) => success(position, 'browser-gps-watch'), undefined, { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 10_000 });
        } catch {}
      }, 2200);
      window.setTimeout(() => {
        if (!done) fail({ code: 3, message: 'timeout', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      }, timeoutMs + 3500);
    } catch {
      fail();
    }
  });
}

async function requestCrewCheckPremiumLocation(): Promise<NativeLocationPayload> {
  let coords = await requestCrewCheckNativeCurrentLocation(16500);
  if (coords?.ok) {
    saveCrewCheckLastGoodLocation(coords);
    return coords;
  }
  coords = await requestBrowserLocation(18500);
  if (coords?.ok) return coords;
  const cached = readCrewCheckLastGoodLocation();
  return cached || coords;
}

function formatAccuracy(accuracy?: number | null) {
  if (!accuracy || !Number.isFinite(accuracy)) return 'precisão não informada';
  if (accuracy < 1000) return `±${Math.round(accuracy)} m`;
  return `±${(accuracy / 1000).toFixed(1)} km`;
}

function readCrewCheckAutoFlightOver250() {
  try { return localStorage.getItem('crewcheck_auto_flight_over_250') === 'true' || localStorage.getItem('crewcheck_departure_auto_flight_over_250') === 'true'; } catch { return false; }
}

function modeLabelFromSmartMode(value?: string) {
  const mode = String(value || 'AUTO').toUpperCase();
  if (mode === 'TRANSIT') return 'Transporte público';
  if (mode === 'RIDE_APP') return 'Uber/99';
  if (mode === 'TWO_WHEELER') return 'Moto/app';
  if (mode === 'DRIVE') return 'Carro';
  if (mode === 'DRIVE_FLIGHT') return 'Carro + voo';
  if (mode === 'RIDE_APP_FLIGHT') return 'Uber/99 + voo';
  if (mode === 'TRANSIT_FLIGHT') return 'Transporte + voo';
  if (mode === 'MOTO_FLIGHT') return 'Moto + voo';
  return 'Automático';
}

function SmartDepartureSummaryCard({ nextEvent, hasRoster, userBase, onOpen }: { nextEvent?: DashboardProps['nextEvent']; hasRoster: boolean; userBase?: string; onOpen?: () => void }) {
  const [plan, setPlan] = useState<(SmartDeparturePlan & { routeOptions?: SmartRouteOption[]; rideApps?: Array<{ id?: string; name?: string; fareLabel?: string; etaMinutes?: number; webUrl?: string; deepLink?: string; mapsUrl?: string; source?: string }> }) | null>(() => {
    try { return JSON.parse(localStorage.getItem('crewcheck_departure_last_plan') || 'null'); } catch { return null; }
  });
  const [nativeStatus, setNativeStatus] = useState<NativePermissionStatus>(() => readCrewCheckNativePermissionStatus());
  const [permission, setPermission] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [error, setError] = useState<string | null>(null);
  const airport = inferAirportForDeparture(nextEvent, userBase);
  const margin = getSmartDepartureMarginMinutes();
  const selectedMode = String(localStorage.getItem('crewcheck_departure_mode') || 'AUTO').toUpperCase();
  const planPresentationIso = String((plan as any)?.presentationIso || '');
  const planTargetIso = String(nextEvent?.smartDepartureTargetIso || nextEvent?.targetIso || '');
  const planTimeDeltaMs = planPresentationIso && planTargetIso ? Math.abs(new Date(planPresentationIso).getTime() - new Date(planTargetIso).getTime()) : 0;
  const planMatchesEvent = Boolean(plan?.ok && (!nextEvent?.smartDepartureTargetIso || !planPresentationIso || planTimeDeltaMs < 120000));
  const activePlan = planMatchesEvent ? plan : null;
  const routeOptions = Array.isArray(activePlan?.routeOptions) ? activePlan.routeOptions : [];
  const selectedRoute = routeOptions.find((route) => String(route.mode || '').toUpperCase() === selectedMode) || routeOptions[0];
  const transitRoute = routeOptions.find((route) => route.mode === 'TRANSIT');
  const rideRoute = routeOptions.find((route) => route.mode === 'RIDE_APP');
  const rideApps = [ ...(Array.isArray(plan?.rideApps) ? plan!.rideApps! : []), ...routeOptions.flatMap((route: any) => route?.rideApps || []) ].filter(Boolean);
  const bestMode = String(activePlan?.recommendedMode || activePlan?.fastestMode || selectedRoute?.mode || 'DRIVE').toUpperCase();
  const modeLabel = modeLabelFromSmartMode(bestMode);
  const selectedLabel = modeLabelFromSmartMode(selectedMode).toLowerCase();
  const firstTransit = transitRoute?.firstTransitDeparture || transitRoute?.transitSteps?.find((step) => step.departureLabel)?.departureLabel || activePlan?.transitBoard?.find((step) => step.departureLabel)?.departureLabel;
  const rideFare = (rideApps.find((app: any) => app?.fareLabel)?.fareLabel || (rideRoute as any)?.fareLabel || 'confirmar no app');
  const rideEta = rideApps.find((app: any) => app?.etaMinutes)?.etaMinutes || rideRoute?.durationMinutes;
  const leaveAt = selectedRoute?.leaveAtLabel || activePlan?.leaveAtLabel || 'Calcular';
  const notToday = Boolean(nextEvent?.relation === 'tomorrow' || nextEvent?.relation === 'future' || nextEvent?.relation === 'rest_followup');
  const departureHeadline = nextEvent?.isInProgress
    ? 'Em andamento'
    : nextEvent?.requiresDeparture === false
      ? 'Sem saída'
      : notToday
        ? (nextEvent?.isTomorrow ? 'Sair amanhã' : `Sair no dia ${String(nextEvent?.date || '').match(/\d{2}\/\d{2}/)?.[0] || 'programado'}`)
        : leaveAt;
  const friendlySource = selectedRoute?.humanSourceLabel || activePlan?.humanSourceLabel || (String(activePlan?.source || selectedRoute?.source || '').match(/Google|Uber|Dados reais/i) ? 'Dados reais' : 'Estimativa CrewCheck');
  const canCalculate = Boolean(hasRoster && (nextEvent?.smartDepartureTargetIso || nextEvent?.targetIso) && ((nextEvent?.requiresDeparture !== false) || /reserva|reserve|airport stand|asb|\bres\b|voo acionado|crm|cbf|emer|check|simulador|reunião|meeting/i.test(`${nextEvent?.title || ''} ${nextEvent?.status || ''} ${nextEvent?.route || ''}`)));
  const locationAllowed = nativeStatus.location === true || permission === 'granted';

  const refreshStatus = React.useCallback(() => setNativeStatus(readCrewCheckNativePermissionStatus()), []);

  const calculateNow = React.useCallback(async () => {
    if (!canCalculate) {
      setError('Importe uma escala ou abra uma programação que exija deslocamento para calcular a saída.');
      if (onOpen) onOpen();
      return;
    }
    setPermission('requesting');
    setError(null);
    try {
      const coords = await requestCrewCheckPremiumLocation();
      if (!coords?.ok || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
        setPermission(coords?.permission === false ? 'denied' : 'unsupported');
        setNativeStatus((current) => ({ ...current, location: false }));
        throw new Error(coords?.error || 'Não consegui puxar sua localização. Libere a localização do CrewCheck e toque em calcular novamente.');
      }
      setPermission('granted');
      setNativeStatus((current) => ({ ...current, location: true }));
      const autoFlightEnabled = readCrewCheckAutoFlightOver250();
      const targetIso = String(nextEvent?.smartDepartureTargetIso || nextEvent?.targetIso || '');
      const params = new URLSearchParams({
        lat: String(coords.lat),
        lng: String(coords.lng),
        accuracy: String(coords.accuracy || ''),
        airport,
        targetIso,
        scheduleOriginAirport: String(nextEvent?.origin || ''),
        scheduleDestinationAirport: String(nextEvent?.destination || ''),
        marginMinutes: String(margin),
        mode: selectedMode,
        provider: String(coords.provider || ''),
        locationTime: String(coords.time || ''),
        learning: 'local-only',
        autoFlightOver250: autoFlightEnabled ? 'true' : 'false',
        longDistancePolicy: autoFlightEnabled ? 'flight_if_over_250' : 'ground_only',
      });
      const response = await fetch(`/api/smart-departure?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => null) as SmartDeparturePlan | null;
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível calcular a saída agora.');
      setPlan(payload as any);
      saveCrewCheckGpsSample(coords, airport);
      try {
        localStorage.setItem('crewcheck_departure_location_permission', 'granted');
        localStorage.setItem('crewcheck_preferred_airport', airport);
        localStorage.setItem('crewcheck_departure_last_airport', airport);
        localStorage.setItem('crewcheck_departure_last_plan', JSON.stringify(payload));
        localStorage.setItem('crewcheck_departure_mode', selectedMode);
        localStorage.setItem('crewcheck_departure_margin_minutes', String(margin));
        localStorage.setItem('crewcheck_auto_flight_over_250', autoFlightEnabled ? 'true' : 'false');
        localStorage.setItem('crewcheck_departure_auto_flight_over_250', autoFlightEnabled ? 'true' : 'false');
      } catch {}
      window.dispatchEvent(new CustomEvent('crewcheck:refresh-smart-departure'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao calcular saída inteligente.');
    }
  }, [airport, canCalculate, margin, nextEvent?.destination, nextEvent?.origin, nextEvent?.smartDepartureTargetIso, nextEvent?.targetIso, onOpen, selectedMode]);

  useEffect(() => {
    const refresh = () => {
      try { const saved = localStorage.getItem('crewcheck_departure_last_plan'); if (saved) setPlan(JSON.parse(saved)); } catch {}
      refreshStatus();
    };
    refresh();
    window.addEventListener('crewcheck:permissions-updated', refresh);
    window.addEventListener('crewcheck:refresh-smart-departure', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 90_000);
    return () => {
      window.removeEventListener('crewcheck:permissions-updated', refresh);
      window.removeEventListener('crewcheck:refresh-smart-departure', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [refreshStatus]);

  return (
    <section className="crewcheck-v10855-smart-summary rounded-[1.8rem] border border-cyan-200/15 bg-[linear-gradient(135deg,rgba(34,211,238,.12),rgba(255,255,255,.055),rgba(16,185,129,.075))] p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur-2xl">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-cyan-100/60">Saída inteligente</p>
          <h3 className="mt-2 text-4xl font-black tracking-tight text-white">{departureHeadline}</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
            {nextEvent?.isInProgress ? 'A programação já começou; confira detalhes e alterações na escala oficial.' : notToday ? (nextEvent?.dayContext || `A programação exibida é ${nextEvent?.isTomorrow ? 'amanhã' : 'futura'}. A rota será recalculada pelo painel usando sua localização real e o aeroporto de origem da programação.`) : nextEvent?.requiresDeparture === false ? 'A próxima programação não exige deslocamento de casa.' : (activePlan?.ok ? `Melhor: ${modeLabel}. Chegue em ${activePlan.airport || airport} até ${activePlan.arrivalDeadlineLabel || nextEvent?.time || '—'}.` : `Toque em Calcular para usar sua localização real e escolher o melhor deslocamento até ${airport}.`)}
          </p>
        </div>
        <button onClick={onOpen} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-cyan-300/12 text-cyan-100 transition hover:bg-cyan-300/18" title="Abrir painel de saída inteligente"><Navigation className="h-7 w-7" /></button>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <GlassPill label="Selecionado" value={selectedLabel} />
        <GlassPill label="Tempo" value={selectedRoute?.durationMinutes ? `${selectedRoute.durationMinutes} min` : activePlan?.durationMinutes ? `${activePlan.durationMinutes} min` : '—'} />
        <GlassPill label="Fonte" value={activePlan?.ok ? friendlySource : 'Aguardando cálculo'} />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3">
          <p className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-slate-500">Transporte público</p>
          <p className="mt-1 text-lg font-black text-cyan-50">{firstTransit ? `1º embarque ${firstTransit}` : 'abrir painel'}</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">{transitRoute?.durationMinutes ? `${transitRoute.durationMinutes} min até o destino` : 'horários em tempo real quando disponíveis'}</p>
        </div>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-3">
          <p className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-cyan-100/75">Uber/99</p>
          <p className="mt-1 text-lg font-black text-cyan-50">{rideFare}</p>
          <p className="mt-1 text-xs font-semibold text-cyan-50/75">{rideEta ? `chamar cerca de ${rideEta} min antes + margem` : 'valor final no app oficial'}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={calculateNow} disabled={permission === 'requesting' || !canCalculate} className="cc-button-primary rounded-2xl px-4 py-3 text-sm font-black shadow-lg transition active:scale-95 disabled:opacity-50">{permission === 'requesting' ? 'Puxando GPS...' : activePlan?.ok ? 'Recalcular' : 'Calcular'}</button>
        <button onClick={onOpen} className="cc-button-secondary rounded-2xl px-4 py-3 text-sm font-black transition active:scale-95">Painel</button>
        {!canCalculate && <button onClick={onOpen} className="cc-button-secondary rounded-2xl px-4 py-3 text-sm font-black transition active:scale-95">Importar escala</button>}
        <span className={`inline-flex items-center gap-1 rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${locationAllowed ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-50'}`}><MapPin className="h-3.5 w-3.5" /> {locationAllowed ? 'GPS ok' : 'GPS pendente'}</span>
      </div>
      {error ? <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold leading-5 text-amber-50/90">{error}</p> : null}
    </section>
  );
}

function SmartDepartureCard({ nextEvent, hasRoster, userBase, onOpen }: { nextEvent?: DashboardProps['nextEvent']; hasRoster: boolean; userBase?: string; onOpen?: () => void }) {
  const [permission, setPermission] = useState<'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [nativeStatus, setNativeStatus] = useState<NativePermissionStatus>(() => readCrewCheckNativePermissionStatus());
  const [plan, setPlan] = useState<(SmartDeparturePlan & { routeOptions?: SmartRouteOption[]; recommendedMode?: string; accuracyMeters?: number | null; permissionConfidence?: string; mapsUrl?: string; label?: string; mode?: string; transitSteps?: SmartRouteOption['transitSteps']; rideApps?: Array<{ id?: string; name?: string; status?: string; fareLabel?: string; fareConfidence?: string; etaMinutes?: number; webUrl?: string; deepLink?: string; mapsUrl?: string; source?: string }> }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [travelMode, setTravelMode] = useState<SmartTravelMode>(() => (localStorage.getItem('crewcheck_departure_mode') as SmartTravelMode) || 'AUTO');
  const [autoFlightOver250, setAutoFlightOver250] = useState<boolean>(() => readCrewCheckAutoFlightOver250());
  const [margin, setMargin] = useState(() => getSmartDepartureMarginMinutes());
  const [lastLocation, setLastLocation] = useState<NativeLocationPayload | null>(null);
  const airport = inferAirportForDeparture(nextEvent, userBase);
  const canCalculate = Boolean(hasRoster && nextEvent?.targetIso && ((nextEvent?.requiresDeparture !== false) || /reserva|reserve|airport stand|asb|\bres\b|voo acionado|crm|cbf|emer|check|simulador|reunião|meeting/i.test(`${nextEvent?.title || ''} ${nextEvent?.status || ''} ${nextEvent?.route || ''}`)));
  const locationAllowed = nativeStatus.location === true || permission === 'granted';
  const notificationsAllowed = nativeStatus.notifications === true;
  const routeOptions = Array.isArray(plan?.routeOptions) ? plan.routeOptions : [];
  const bestRoute = routeOptions[0];
  const transitOption = routeOptions.find((item) => item.mode === 'TRANSIT');
  const rideOption = routeOptions.find((item) => item.mode === 'RIDE_APP');
  const transitBoard = Array.isArray(plan?.transitBoard) ? plan.transitBoard : (transitOption?.transitSteps || []);
  const rideBoard = [ ...(Array.isArray(plan?.rideApps) ? plan!.rideApps! : []), ...routeOptions.flatMap((route: any) => route?.rideApps || []) ].filter(Boolean);
  const bestMode = String(plan?.recommendedMode || plan?.fastestMode || bestRoute?.mode || plan?.mode || '').toUpperCase();
  const bestModeLabel = modeLabelFromSmartMode(bestMode || travelMode);
  const sourceLabel = bestRoute?.humanSourceLabel || plan?.humanSourceLabel || (String(plan?.source || bestRoute?.source || '').match(/Google|Uber|Dados reais/i) ? 'Dados reais' : (plan?.ok ? 'Estimativa CrewCheck' : 'aguardando cálculo'));
  const arrivalLabel = plan?.arrivalDeadlineLabel || (nextEvent?.time ? `${nextEvent.time} · margem ${margin} min` : '—');

  const refreshPermissionStatus = React.useCallback((event?: Event) => {
    const detail = (event as CustomEvent<NativePermissionStatus> | undefined)?.detail || {};
    setNativeStatus({ ...readCrewCheckNativePermissionStatus(), ...detail });
  }, []);

  useEffect(() => {
    refreshPermissionStatus();
    const refresh = (event: Event) => refreshPermissionStatus(event);
    window.addEventListener('crewcheck:native-ready', refresh);
    window.addEventListener('crewcheck:permissions-updated', refresh);
    window.addEventListener('crewcheck:location-permission', refresh);
    window.addEventListener('crewcheck:notification-permission', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(() => refreshPermissionStatus(), 2500);
    return () => {
      window.removeEventListener('crewcheck:native-ready', refresh);
      window.removeEventListener('crewcheck:permissions-updated', refresh);
      window.removeEventListener('crewcheck:location-permission', refresh);
      window.removeEventListener('crewcheck:notification-permission', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, [refreshPermissionStatus]);

  const fetchSmartPlan = React.useCallback(async (coords: NativeLocationPayload) => {
    if (!coords.ok || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') throw new Error(coords.error || 'Localização real não retornada pelo Android.');
    const params = new URLSearchParams({
      lat: String(coords.lat),
      lng: String(coords.lng),
      accuracy: String(coords.accuracy || ''),
      airport,
      targetIso: String((nextEvent as any)?.smartDepartureTargetIso || nextEvent?.targetIso || ''),
      scheduleOriginAirport: String(nextEvent?.origin || ''),
      scheduleDestinationAirport: String(nextEvent?.destination || ''),
      marginMinutes: String(margin),
      mode: travelMode,
      provider: String(coords.provider || ''),
      locationTime: String(coords.time || ''),
      learning: 'local-only',
      autoFlightOver250: autoFlightOver250 ? 'true' : 'false',
      longDistancePolicy: autoFlightOver250 ? 'flight_if_over_250' : 'ground_only',
    });
    try {
      params.set('localSamples', String(JSON.parse(localStorage.getItem('crewcheck_location_learning_v1') || '[]').length || 0));
    } catch {}
    const response = await fetch(`/api/smart-departure?${params.toString()}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null) as SmartDeparturePlan | null;
    if (!response.ok || !payload?.ok) throw new Error(payload?.message || 'Não foi possível calcular a saída.');
    setPlan(payload as any);
    setLastLocation(coords);
    saveCrewCheckGpsSample(coords, airport);
    try {
      localStorage.setItem('crewcheck_departure_location_permission', 'granted');
      localStorage.setItem('crewcheck_preferred_airport', airport);
      localStorage.setItem('crewcheck_departure_last_airport', airport);
      localStorage.setItem('crewcheck_departure_last_plan', JSON.stringify(payload));
      localStorage.setItem('crewcheck_departure_mode', travelMode);
      localStorage.setItem('crewcheck_departure_margin_minutes', String(margin));
      localStorage.setItem('crewcheck_departure_auto_flight_over_250', autoFlightOver250 ? 'true' : 'false');
      localStorage.setItem('crewcheck_auto_flight_over_250', autoFlightOver250 ? 'true' : 'false');
    } catch {}
    return payload;
  }, [airport, margin, nextEvent?.targetIso, (nextEvent as any)?.smartDepartureTargetIso, nextEvent?.origin, nextEvent?.destination, travelMode, autoFlightOver250]);

  const runGeolocationCalculation = React.useCallback(async () => {
    if (!canCalculate) {
      setError('Importe uma escala para calcular a hora de sair.');
      return;
    }
    setPermission('requesting');
    setError(null);
    try {
      const coords = await requestCrewCheckPremiumLocation();
      if (!coords?.ok) {
        setPermission(coords?.permission ? 'denied' : 'unsupported');
        setNativeStatus((current) => ({ ...current, location: false }));
        throw new Error(coords?.error || 'Não consegui puxar a localização real. Verifique se o GPS está ativo e se o CrewCheck tem permissão de localização.');
      }
      setPermission('granted');
      setNativeStatus((current) => ({ ...current, location: true }));
      await fetchSmartPlan(coords);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao calcular saída inteligente.');
    }
  }, [canCalculate, fetchSmartPlan]);

  const calculate = React.useCallback(() => {
    if (!canCalculate) {
      setError('Importe uma escala para calcular a hora de sair.');
      return;
    }
    const latestStatus = readCrewCheckNativePermissionStatus();
    setNativeStatus(latestStatus);
    const native = getCrewCheckNativeBridge();
    if (native?.requestLocation && latestStatus.location !== true) {
      setPermission('requesting');
      setError('Toque em Permitir no aviso do Android. Assim que liberar, o CrewCheck recalcula automaticamente.');
      requestCrewCheckNativeLocation();
      window.setTimeout(() => refreshPermissionStatus(), 700);
      window.setTimeout(() => void runGeolocationCalculation(), 1600);
      return;
    }
    void runGeolocationCalculation();
  }, [canCalculate, refreshPermissionStatus, runGeolocationCalculation]);

  useEffect(() => {
    if (permission === 'requesting' && nativeStatus.location === true) {
      setError(null);
      void runGeolocationCalculation();
    }
  }, [nativeStatus.location, permission, runGeolocationCalculation]);

  const requestNotifications = React.useCallback(() => {
    const immediate = requestCrewCheckNativeNotifications();
    window.setTimeout(() => refreshPermissionStatus(), 700);
    setNativeStatus((current) => ({ ...current, notifications: immediate || current.notifications }));
  }, [refreshPermissionStatus]);

  useEffect(() => {
    if (!canCalculate) return;
    let timer: number | undefined;
    const refresh = () => {
      try {
        const saved = localStorage.getItem('crewcheck_departure_last_plan');
        if (saved) setPlan(JSON.parse(saved));
        refreshPermissionStatus();
        if (localStorage.getItem('crewcheck_departure_location_permission') === 'granted' || readCrewCheckNativePermissionStatus().location === true) void runGeolocationCalculation();
      } catch {}
    };
    refresh();
    timer = window.setInterval(refresh, 4 * 60_000);
    window.addEventListener('crewcheck:refresh-smart-departure', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      if (timer) window.clearInterval(timer);
      window.removeEventListener('crewcheck:refresh-smart-departure', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [runGeolocationCalculation, canCalculate, refreshPermissionStatus]);

  const updateMode = (mode: SmartTravelMode) => {
    setTravelMode(mode);
    try { localStorage.setItem('crewcheck_departure_mode', mode); } catch {}
  };
  const updateMargin = (value: string) => {
    setMargin(value);
    try { localStorage.setItem('crewcheck_departure_margin_minutes', value); } catch {}
  };

  const toggleAutoFlightOver250 = () => {
    setAutoFlightOver250((current) => {
      const next = !current;
      try { localStorage.setItem('crewcheck_departure_auto_flight_over_250', next ? 'true' : 'false'); localStorage.setItem('crewcheck_auto_flight_over_250', next ? 'true' : 'false'); } catch {}
      return next;
    });
  };

  const modeButtons: Array<{ value: SmartTravelMode; label: string }> = [
    { value: 'AUTO', label: 'Automático' },
    { value: 'DRIVE', label: 'Carro' },
    { value: 'TRANSIT', label: 'Transporte' },
    { value: 'RIDE_APP', label: 'Uber/99' },
    { value: 'TWO_WHEELER', label: 'Moto/app' },
    { value: 'DRIVE_FLIGHT', label: 'Carro + voo' },
    { value: 'RIDE_APP_FLIGHT', label: 'Uber/99 + voo' },
    { value: 'TRANSIT_FLIGHT', label: 'Transporte + voo' },
  ];

  return (
    <div className="crewcheck-smart-departure-premium crewcheck-smart-departure-minimal rounded-[1.8rem] border border-cyan-200/15 bg-[linear-gradient(135deg,rgba(34,211,238,.12),rgba(255,255,255,.055),rgba(16,185,129,.075))] p-5 shadow-2xl shadow-cyan-950/10 backdrop-blur-2xl">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.68rem] font-black uppercase tracking-[0.24em] text-cyan-100/60">Saída inteligente · Cockpit</p>
              <h3 className="mt-2 text-4xl font-black tracking-tight text-white sm:text-5xl">{plan?.leaveAtLabel || 'Calcular'}</h3>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
                {plan?.ok ? `Chegue em ${plan.airport || airport} até ${arrivalLabel}. Melhor opção: ${bestModeLabel}. Rota calculada pelo CrewCheck.` : `Ative a localização para comparar carro, transporte público, moto/app e Uber/99 até ${airport}. Voo só entra quando a opção de longa distância estiver ativada.`}
              </p>
            </div>
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-cyan-300/12 text-cyan-100"><Navigation className="h-7 w-7" /></div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
            {modeButtons.map((item) => (
              <button key={item.value} onClick={() => updateMode(item.value)} className={`rounded-2xl border px-3 py-3 text-[11px] font-black uppercase tracking-[0.12em] transition ${travelMode === item.value ? 'border-cyan-300/35 bg-cyan-300/18 text-cyan-50 shadow-lg shadow-cyan-950/10' : 'border-white/10 bg-white/[0.035] text-slate-400 hover:bg-white/[0.06] hover:text-cyan-50'}`}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-3 rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-3">
            <button onClick={toggleAutoFlightOver250} className={`w-full rounded-2xl border px-4 py-3 text-left text-xs font-black uppercase tracking-[0.12em] transition ${autoFlightOver250 ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-50' : 'border-amber-300/25 bg-amber-300/10 text-amber-50'}`}>
              Voo em longa distância: {autoFlightOver250 ? 'ativado' : 'desativado'}
              <span className="mt-1 block text-[11px] font-semibold normal-case tracking-normal opacity-80">No modo Automático, o CrewCheck compara os meios terrestres e só considera voo em trajetos longos quando esta opção estiver ligada.</span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {[15, 30, 45, 60].map((item) => (
              <button key={item} onClick={() => updateMargin(String(item))} className={`rounded-2xl border px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] transition ${String(item) === String(margin) ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-50' : 'border-white/10 bg-white/[0.035] text-slate-400'}`}>{item} min</button>
            ))}
          </div>

          {routeOptions.length ? (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {routeOptions.slice(0, 4).map((option, index) => (
                <div key={`${option?.mode}-${option?.leaveAtLabel}-${index}`} className={`rounded-3xl border p-4 ${index === 0 ? 'border-emerald-300/25 bg-emerald-300/[0.10]' : 'border-white/10 bg-white/[0.045]'}`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/55">{index === 0 ? 'melhor opção' : modeLabelFromSmartMode(option?.mode)}</p>
                  <p className="mt-1 text-2xl font-black text-cyan-50">{option?.leaveAtLabel || '—'}</p>
                  <p className="text-xs font-semibold leading-5 text-slate-400">{option?.durationMinutes || '—'} min · {option?.label || option?.source || 'rota'}</p>
                  {option?.mode === 'TRANSIT' && option.firstTransitDeparture ? <p className="mt-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-100">1º embarque {option.firstTransitDeparture}</p> : null}
                  {option?.mode === 'RIDE_APP' && (option as any).fareLabel ? <p className="mt-2 text-[11px] font-black uppercase tracking-[0.12em] text-fuchsia-100">{(option as any).fareLabel}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          {transitBoard?.length ? (
            <div className="mt-4 rounded-[1.5rem] border border-cyan-300/15 bg-cyan-300/[0.07] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-50/70">timeline ônibus/metrô</p>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-100">tempo real quando disponível</span>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {transitBoard.slice(0, 4).map((step, index) => (
                  <div key={`${step.line}-${step.departureLabel}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-black text-cyan-50">{step.mode || 'Transporte'} {step.line ? `· ${step.line}` : ''}</p>
                      <p className="rounded-xl bg-white/10 px-2 py-1 text-xs font-black text-emerald-100">{step.departureLabel || 'a confirmar'}</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold leading-5 text-cyan-50/75">{step.from || 'origem'} → {step.to || 'destino'}{step.arrivalLabel ? ` · chega ${step.arrivalLabel}` : ''}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {rideBoard.length ? (
            <div className="mt-4 rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/[0.07] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-50/70">corrida por app</p>
                <span className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-50">Fonte real + estimativa</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {rideBoard.slice(0, 3).map((app: any, index) => (
                  <a key={`${app.id || app.name}-${index}`} href={app.webUrl || app.deepLink || app.mapsUrl || '#'} target="_blank" rel="noreferrer" className="rounded-2xl border border-fuchsia-200/20 bg-fuchsia-300/10 px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-fuchsia-300/15">
                    Abrir {app.name || 'Uber'} · {app.fareLabel || 'confirmar'}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="rounded-[1.5rem] border border-white/10 bg-white/[0.045] p-4 shadow-xl shadow-black/10">
          <p className="text-[10px] font-black uppercase tracking-[0.20em] text-cyan-100/60">Resumo claro</p>
          <div className="mt-3 space-y-2">
            <GlassPill label="Chegar até" value={arrivalLabel} />
            <GlassPill label="Tempo" value={plan?.durationMinutes ? `${plan.durationMinutes} min` : '—'} />
            <GlassPill label="Modo" value={bestModeLabel} />
            <GlassPill label="Fonte" value={plan?.ok ? sourceLabel : 'Aguardando cálculo'} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1 rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] ${locationAllowed ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-white/10 bg-white/[0.045] text-slate-400'}`}>
              <MapPin className="h-3.5 w-3.5" /> {locationAllowed ? 'GPS ok' : 'GPS pendente'}
            </span>
            <button onClick={requestNotifications} className={`inline-flex items-center gap-1 rounded-2xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.12em] transition active:scale-95 ${notificationsAllowed ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100' : 'border-amber-300/25 bg-amber-300/10 text-amber-50'}`}>
              <Bell className="h-3.5 w-3.5" /> {notificationsAllowed ? 'push ok' : 'push' }
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            <button onClick={calculate} disabled={permission === 'requesting' || !canCalculate} className="cc-button-primary rounded-2xl px-4 py-3 text-sm font-black shadow-lg transition active:scale-95 disabled:opacity-50">
              {permission === 'requesting' ? 'Puxando localização...' : plan?.ok ? 'Atualizar rota' : locationAllowed ? 'Calcular rota' : 'Ativar localização'}
            </button>
            {plan?.mapsUrl ? <button onClick={() => { window.location.href = plan.mapsUrl || ''; }} className="cc-button-secondary rounded-2xl px-4 py-3 text-sm font-black transition active:scale-95">Abrir TomTom</button> : null}
            {onOpen ? <button onClick={onOpen} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-black text-cyan-50 transition hover:bg-white/[0.07]">Painel completo</button> : null}
          </div>
          {error ? <p className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-bold leading-5 text-amber-50/90">{error}</p> : null}
          {plan?.warning ? <p className="crewcheck-maps-warning mt-3 rounded-2xl border px-3 py-2 text-xs font-semibold leading-5">{plan.warning}</p> : null}
          {plan?.airportName ? <p className="mt-3 text-xs font-semibold leading-5 text-cyan-50/70">Destino: {plan.airportName}. Precisão: {formatAccuracy(lastLocation?.accuracy || plan.accuracyMeters)}.</p> : null}
        </aside>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">O CrewCheck aplica a política operacional internamente e mostra ao usuário apenas a recomendação final de deslocamento. Tarifas oficiais continuam sendo confirmadas no app ou no provedor.</p>
    </div>
  );
}

function ProfileAvatar({ avatar, initials, size = 'sm' }: { avatar?: string; initials: string; size?: 'sm' | 'lg' }) {
  const sizeClass = size === 'lg' ? 'h-16 w-16 sm:h-20 sm:w-20 rounded-[1.65rem] max-w-full max-h-full' : 'h-11 w-11 rounded-2xl max-w-full max-h-full';
  const textClass = size === 'lg' ? 'text-xl' : 'text-sm';
  if (avatar) {
    return <img src={avatar} alt="Foto de perfil" className={`${sizeClass} object-cover shadow-xl shadow-cyan-950/35 ring-2 ring-cyan-200/20`} loading="lazy" />;
  }
  return <div className={`${sizeClass} flex items-center justify-center bg-white/10 ${textClass} font-black text-cyan-50 shadow-xl shadow-cyan-950/25 ring-2 ring-cyan-200/15`}>{initials}</div>;
}

function useLiveCountdown(targetIso?: string, fallback = '—') {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => formatLiveCountdown(targetIso, now, fallback), [targetIso, now, fallback]);
}

function formatLiveCountdown(targetIso?: string, now = Date.now(), fallback = '—') {
  if (!targetIso) return fallback || '—';
  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return fallback || '—';
  const diff = target - now;
  if (diff <= 0) return 'agora';
  const totalMinutes = Math.max(0, Math.floor(diff / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function FeatureLine({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-3xl border border-white/8 bg-white/[0.035] p-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-300/10 text-cyan-200"><Icon className="h-5 w-5" /></div>
      <div><p className="text-sm font-black">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-400">{text}</p></div>
    </div>
  );
}

function MiniStatus({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-center backdrop-blur-xl">
      <Icon className="mx-auto mb-1 h-4 w-4 text-cyan-200" />
      <p className="text-sm font-black">{value}</p>
      <p className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">{label}</p>
    </div>
  );
}

function GlassPill({ label, value }: { label: string; value: string }) {
  return <div className="cc-glass-pill min-w-0 rounded-2xl border px-3 py-3"><p className="cc-glass-pill-label truncate text-[0.58rem] font-black uppercase tracking-[0.16em]">{label}</p><p className="cc-glass-pill-value mt-1 truncate text-sm font-black">{value}</p></div>;
}

function MenuCard({ icon: Icon, label, caption, color, onClick, compact = false, adminMode = false, onAdminNavigate }: { icon: LucideIcon; label: string; caption: string; color: string; onClick: () => void; compact?: boolean; adminMode?: boolean; onAdminNavigate?: (view: string) => void }) {
  const adminTargets = [
    { label: 'Abrir módulo', action: onClick },
    { label: 'Dashboard admin', action: () => onAdminNavigate?.('admin') },
    { label: 'Status do sistema', action: () => onAdminNavigate?.('systemstatus') },
    { label: 'Relatórios', action: () => onAdminNavigate?.('reports') },
  ];
  return (
    <div className={`cc-menu-card group rounded-[1.45rem] border border-white/10 bg-white/[0.045] ${compact ? 'min-h-0 p-3' : 'min-h-[7.2rem] p-3 sm:p-4'} text-left shadow-xl shadow-black/15 transition hover:-translate-y-0.5 hover:bg-white/[0.075]`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={onClick} className="min-w-0 flex-1 text-left active:scale-[0.99]">
          <div className={`${compact ? 'mb-0 mr-3 inline-flex h-10 w-10 align-middle' : 'mb-3 flex h-11 w-11'} items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-[#06101d] shadow-lg shadow-black/20 transition group-hover:scale-105`}>
            <Icon className="h-5 w-5" />
          </div>
          <span className={compact ? 'inline-flex min-w-0 flex-col align-middle' : 'block'}>
            <p className="text-[0.74rem] font-black leading-tight text-white sm:text-sm">{label}</p>
            <p className="mt-1 hidden text-[10px] font-bold leading-4 text-slate-500 sm:block">{caption}</p>
          </span>
        </button>
        {adminMode ? (
          <details className="relative shrink-0">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-300/10 text-cyan-50 transition hover:bg-cyan-300/18" title={`Menu admin · ${label}`}>
              <MoreVertical className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 top-10 z-30 w-48 rounded-2xl border border-cyan-200/15 bg-[#07111f]/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <p className="px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/60">Admin · {label}</p>
              {adminTargets.map((target) => (
                <button key={target.label} type="button" onClick={target.action} className="block w-full rounded-xl px-3 py-2 text-left text-[11px] font-black text-slate-100 transition hover:bg-cyan-300/12">
                  {target.label}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function SideKpi({ icon: Icon, label, value, tone = 'text-cyan-200' }: { icon: LucideIcon; label: string; value: string; tone?: string }) {
  return <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/15 backdrop-blur-xl"><Icon className={`h-6 w-6 ${tone}`} /><p className="mt-3 text-[0.62rem] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-white">{value}</p></div>;
}

function SideCard({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-[1.65rem] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/20 backdrop-blur-xl">
      <Icon className="mb-4 h-9 w-9 text-cyan-200" />
      <p className="font-black">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-400">{text}</p>
    </div>
  );
}

function NavItem({ icon: Icon, label, active, badge, onClick }: { icon: LucideIcon; label: string; active?: boolean; badge?: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`crewcheck-bottom-item flex min-w-12 flex-1 flex-col items-center gap-1 rounded-2xl px-1.5 py-1.5 transition active:scale-95 ${active ? 'is-active' : ''}`}>
      <span className="relative flex h-6 w-6 items-center justify-center">
        <Icon className="h-5 w-5" />
        {badge ? <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-black text-white">{badge}</span> : null}
      </span>
      <span className="text-[10px] font-black leading-none">{label}</span>
    </button>
  );
}


export default Dashboard;
