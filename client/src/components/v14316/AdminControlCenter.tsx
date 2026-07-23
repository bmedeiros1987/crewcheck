import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Database, FileClock, Mail, QrCode, RefreshCw, ShieldCheck, TicketCheck, UserRound, UsersRound } from 'lucide-react';
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

function bytesLabel(value: number) {
  const bytes = Number(value || 0);
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function AdminControlCenter() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { setOverview(await authFetch<Overview & { ok: boolean }>('/api/admin/overview', { cache: 'no-store' })); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível carregar a dashboard.'); }
    finally { setBusy(false); }
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

  return <section className="cc-control-shell">
    <header className="cc-control-hero admin"><span><BarChart3/></span><div><small>ADMIN · VISÃO AGREGADA</small><h1>Central de controle CrewCheck</h1><p>Indicadores operacionais e de crescimento sem abrir nomes, e-mails, escalas, localizações ou informações de saúde.</p></div><button onClick={load} disabled={busy}><RefreshCw className={busy ? 'cc-spin' : ''}/> Atualizar</button></header>
    <div className="cc-admin-privacy"><ShieldCheck/><div><strong>LGPD por padrão</strong><span>{overview?.dataPolicy || 'Somente contagens agregadas são exibidas.'}</span></div></div>
    <div className="cc-admin-grid">{cards.map(([label, value, Icon]) => <article key={label}><Icon/><span>{label}</span><strong>{value ?? '—'}</strong></article>)}</div>
    <section className="cc-control-card"><div className="cc-section-title"><div><small>ÚLTIMOS 14 DIAS</small><h2>Atividade agregada</h2></div><span>{overview?.generatedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(overview.generatedAt)) : 'Carregando…'}</span></div>{daily.length ? <div className="cc-mini-chart">{daily.map((item) => <div key={item.day} title={`${item.day}: ${item.value}`}><i style={{ height: `${item.height}%` }}/><small>{item.day.slice(5).replace('-', '/')}</small><b>{item.value}</b></div>)}</div> : <div className="cc-empty-panel"><BarChart3/><h3>Aguardando eventos agregados</h3><p>Os acessos começarão a aparecer sem identificar usuários individualmente.</p></div>}</section>
    <section className="cc-control-card"><h2>O que esta dashboard não mostra</h2><div className="cc-privacy-list"><span>✕ nomes e endereços de e-mail</span><span>✕ conteúdo de escalas</span><span>✕ localização individual</span><span>✕ sono, passos ou dados de saúde</span><span>✕ mensagens e tickets completos</span><span>✕ senhas, tokens ou segredos</span></div></section>
  </section>;
}
