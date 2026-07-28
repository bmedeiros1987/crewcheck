import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Database, FileClock, Mail, Navigation, QrCode, RefreshCw, ShieldCheck, TicketCheck, UserRound, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { authFetch } from '@/lib/authClient';
import './control-center.css';

type Overview = {
  generatedAt: string;
  privacyMode: string;
  dataPolicy: string;
  cards: Record<string, number>;
  trends: Array<{ day: string; kind: string; count: number }>;
};

type MapsProviderStatus = {
  ok: boolean;
  primary: string;
  fallback: string;
  googleConfigured: boolean;
  tomtomConfigured: boolean;
  message: string;
  budget: {
    monthKey: string;
    used: number;
    limit: number;
    remaining: number;
    percent: number;
    warning: boolean;
    critical: boolean;
    blocked: boolean;
    fallbackActive: boolean;
    blockedReason: string;
    provider: string;
    resetAt: string;
    persistence: string;
    kinds?: Record<string, number>;
  };
};

function bytesLabel(value: number) {
  const bytes = Number(value || 0);
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function dateTimeLabel(value = '') {
  if (!value) return 'próxima competência';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'próxima competência';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date);
}

export default function AdminControlCenter() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [maps, setMaps] = useState<MapsProviderStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const [overviewResult, mapsResult] = await Promise.allSettled([
      authFetch<Overview & { ok: boolean }>('/api/admin/overview', { cache: 'no-store' }),
      authFetch<MapsProviderStatus>('/api/maps/provider/status', { cache: 'no-store' }),
    ]);
    if (overviewResult.status === 'fulfilled') setOverview(overviewResult.value);
    if (mapsResult.status === 'fulfilled') setMaps(mapsResult.value);
    if (overviewResult.status === 'rejected' && mapsResult.status === 'rejected') {
      const reason = overviewResult.reason instanceof Error ? overviewResult.reason.message : 'Não foi possível carregar a dashboard.';
      toast.error(reason);
    } else if (mapsResult.status === 'rejected') {
      toast.warning('O controle mensal de mapas não respondeu agora. As demais métricas continuam disponíveis.');
    }
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const daily = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of overview?.trends || []) map.set(item.day, (map.get(item.day) || 0) + Number(item.count || 0));
    const values = [...map.entries()].slice(-14);
    const max = Math.max(1, ...values.map(([, value]) => value));
    return values.map(([day, value]) => ({ day, value, height: Math.max(8, Math.round(value / max * 100)) }));
  }, [overview]);

  const c = overview?.cards || {};
  const cards = [
    ['Usuários cadastrados', c.users, UserRound], ['Escalas armazenadas', c.rosters, FileClock], ['Escalas ativas', c.activeRosters, BarChart3],
    ['Acessos em 30 dias', c.accesses30d, UsersRound], ['Acessos hoje', c.accessesToday, UsersRound], ['Visitantes ativos', c.visitors, ShieldCheck],
    ['E-mails rastreados', c.emails, Mail], ['Falhas de e-mail', c.emailFailures, Mail], ['Tickets abertos', c.ticketsOpen, TicketCheck],
    ['QR Guardian ativos', c.guardianActive, QrCode], ['Tabelas do banco', c.tableCount, Database], ['Armazenamento do banco', bytesLabel(c.databaseBytes), Database],
  ] as const;
  const budget = maps?.budget;
  const budgetPercent = Math.min(100, Math.max(0, Number(budget?.percent || 0)));

  return <section className="cc-control-shell">
    <header className="cc-control-hero admin"><span><BarChart3/></span><div><small>ADMIN · VISÃO AGREGADA</small><h1>Central de controle CrewCheck</h1><p>Indicadores operacionais e de crescimento sem abrir nomes, e-mails, escalas, localizações ou informações de saúde.</p></div><button onClick={load} disabled={busy}><RefreshCw className={busy ? 'cc-spin' : ''}/> Atualizar</button></header>
    <div className="cc-admin-privacy"><ShieldCheck/><div><strong>LGPD por padrão</strong><span>{overview?.dataPolicy || 'Somente contagens agregadas são exibidas.'}</span></div></div>
    <section className="cc-control-card cc-maps-budget" data-maps-budget-status={budget?.blocked ? 'fallback' : 'google'}>
      <div className="cc-section-title"><div><small>MAPAS E ROTAS · {budget?.monthKey || 'COMPETÊNCIA ATUAL'}</small><h2>Controle mensal do Google Maps</h2></div><span>{maps?.primary || 'Carregando…'}</span></div>
      {budget ? <>
        <div className="cc-maps-budget-head"><Navigation/><div><strong>{budget.blocked ? 'TomTom ativo automaticamente' : 'Google Routes é o provedor principal'}</strong><span>{maps?.message}</span></div><b>{budget.used.toLocaleString('pt-BR')} / {budget.limit.toLocaleString('pt-BR')}</b></div>
        <div className="cc-maps-budget-track" role="progressbar" aria-label="Uso mensal do Google Maps" aria-valuemin={0} aria-valuemax={budget.limit} aria-valuenow={budget.used}><i style={{ width: `${budgetPercent}%` }}/></div>
        <div className="cc-maps-budget-facts"><span><small>Restante</small><strong>{budget.remaining.toLocaleString('pt-BR')}</strong></span><span><small>Uso</small><strong>{budgetPercent.toLocaleString('pt-BR')}%</strong></span><span><small>Fallback</small><strong>{maps?.fallback || 'TomTom'}</strong></span><span><small>Reinício</small><strong>{dateTimeLabel(budget.resetAt)}</strong></span><span><small>Controle</small><strong>{budget.persistence === 'database' ? 'Banco persistente' : 'Contingência em memória'}</strong></span></div>
        {budget.blockedReason && <div className="cc-maps-budget-alert"><ShieldCheck/><span>Google pausado nesta competência: {budget.blockedReason.replaceAll('_', ' ')}. Nenhuma nova solicitação Google será enviada até o reset.</span></div>}
      </> : <div className="cc-empty-panel compact"><Navigation/><h3>Aguardando diagnóstico dos mapas</h3><p>O provedor continuará operando mesmo que este painel demore a responder.</p></div>}
    </section>
    <div className="cc-admin-grid">{cards.map(([label, value, Icon]) => <article key={label}><Icon/><span>{label}</span><strong>{value ?? '—'}</strong></article>)}</div>
    <section className="cc-control-card"><div className="cc-section-title"><div><small>ÚLTIMOS 14 DIAS</small><h2>Atividade agregada</h2></div><span>{overview?.generatedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(overview.generatedAt)) : 'Carregando…'}</span></div>{daily.length ? <div className="cc-mini-chart">{daily.map((item) => <div key={item.day} title={`${item.day}: ${item.value}`}><i style={{ height: `${item.height}%` }}/><small>{item.day.slice(5).replace('-', '/')}</small><b>{item.value}</b></div>)}</div> : <div className="cc-empty-panel"><BarChart3/><h3>Aguardando eventos agregados</h3><p>Os acessos começarão a aparecer sem identificar usuários individualmente.</p></div>}</section>
    <section className="cc-control-card"><h2>O que esta dashboard não mostra</h2><div className="cc-privacy-list"><span>✕ nomes e endereços de e-mail</span><span>✕ conteúdo de escalas</span><span>✕ localização individual</span><span>✕ sono, passos ou dados de saúde</span><span>✕ mensagens e tickets completos</span><span>✕ senhas, tokens ou segredos</span></div></section>
  </section>;
}
