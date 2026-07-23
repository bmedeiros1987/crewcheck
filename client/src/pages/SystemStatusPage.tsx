import { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, Clock3, Plane, RefreshCw, ShieldCheck, Wrench } from 'lucide-react';

type ComponentState = { key?: string; label?: string; status?: string; message?: string };
type StatusPayload = {
  enabled?: boolean;
  title?: string;
  message?: string;
  status?: string;
  updatedAt?: string | null;
  estimatedReturnAt?: string | null;
  etaMinutes?: number | null;
  components?: ComponentState[];
};

const DEFAULT_COMPONENTS: ComponentState[] = [
  { key: 'roster', label: 'Escala e importação', status: 'operational' },
  { key: 'notifications', label: 'Alertas e notificações', status: 'operational' },
  { key: 'flight', label: 'Acompanhamento de voos', status: 'operational' },
  { key: 'weather', label: 'Meteorologia', status: 'operational' },
  { key: 'life', label: 'CrewCheck Life', status: 'operational' },
  { key: 'concierge', label: 'Concierge e suporte', status: 'operational' },
];

function statusLabel(status?: string, maintenance?: boolean) {
  if (maintenance || /maint|manuten/i.test(String(status || ''))) return 'Em manutenção';
  if (/investig|analysis|verific/i.test(String(status || ''))) return 'Em análise';
  return 'Operacional';
}

function estimateText(state: StatusPayload) {
  if (state.estimatedReturnAt) {
    const date = new Date(state.estimatedReturnAt);
    if (!Number.isNaN(date.getTime())) return `Previsão de retorno: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)}.`;
  }
  const minutes = Number(state.etaMinutes || 0);
  if (minutes > 0) return `Estimativa atual: cerca de ${minutes} minutos para normalização.`;
  return state.enabled ? 'A equipe já está ciente e trabalhando. A previsão será informada assim que a análise permitir.' : 'Nenhuma manutenção geral em andamento.';
}

export default function SystemStatusPage() {
  const [state, setState] = useState<StatusPayload>({ enabled: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/maintenance/status', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : { enabled: false })
      .then((payload) => { if (alive) setState(payload || { enabled: false }); })
      .catch(() => { if (alive) setState({ enabled: false }); })
      .finally(() => { if (alive) setLoading(false); });
    load();
    const timer = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);

  const components = useMemo(() => Array.isArray(state.components) && state.components.length ? state.components : DEFAULT_COMPONENTS, [state.components]);
  const maintenance = Boolean(state.enabled);

  return <main className="cc-status-page" lang="pt-BR">
    <header className="cc-status-top"><a href="/"><span><Plane /></span><div><strong>CrewCheck</strong><small>Status do sistema</small></div></a><nav><a href="/sobre">Nossa origem</a><a href="mailto:suporte@crewcheck.com.br">Suporte</a></nav></header>

    <section className={`cc-status-hero ${maintenance ? 'maintenance' : 'operational'}`}>
      <span className="cc-status-icon">{loading ? <RefreshCw className="spin" /> : maintenance ? <Wrench /> : <CheckCircle2 />}</span>
      <div><small>STATUS ATUAL</small><h1>{loading ? 'Consultando o sistema' : maintenance ? (state.title || 'CrewCheck em manutenção') : 'CrewCheck operacional'}</h1><p>{loading ? 'Atualizando as informações mais recentes.' : maintenance ? (state.message || 'Estamos realizando melhorias e já estamos trabalhando para restabelecer a funcionalidade.') : 'Os principais recursos estão disponíveis normalmente.'}</p></div>
      <strong className="cc-status-badge">{loading ? 'Atualizando' : statusLabel(state.status, maintenance)}</strong>
    </section>

    <section className="cc-status-estimate"><Clock3 /><div><strong>{estimateText(state)}</strong><span>{state.updatedAt ? `Última atualização: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(state.updatedAt))}` : 'Esta página é atualizada automaticamente a cada minuto.'}</span></div></section>

    <section className="cc-status-components"><div className="cc-status-section-title"><div><small>FUNCIONALIDADES</small><h2>Situação por área</h2></div><span><ShieldCheck /> Informação sem detalhes técnicos internos</span></div><div className="cc-status-grid">{components.map((item, index) => { const itemMaintenance = maintenance && (/maint|manuten/i.test(String(item.status || '')) || !state.components?.length); return <article key={item.key || item.label || index} className={itemMaintenance ? 'maintenance' : 'operational'}><span>{itemMaintenance ? <Wrench /> : <CheckCircle2 />}</span><div><strong>{item.label || 'Funcionalidade CrewCheck'}</strong><small>{item.message || (itemMaintenance ? 'A equipe está trabalhando nesta funcionalidade.' : 'Funcionando normalmente.')}</small></div><b>{statusLabel(item.status, itemMaintenance)}</b></article>; })}</div></section>

    <section className="cc-status-transparency"><BellRing /><div><h2>Transparência durante a manutenção</h2><p>Quando houver manutenção, deixamos claro que o problema já foi identificado, que o trabalho está em andamento e qual é a melhor estimativa de retorno disponível. Não exibimos nomes de fornecedores, serviços internos ou detalhes que não ajudam o usuário.</p></div></section>

    <footer><div><strong>CrewCheck</strong><span>Bruno Medeiros Tecnologia</span></div><div><a href="/sobre">Quem somos</a><a href="/privacy">Privacidade</a><a href="mailto:suporte@crewcheck.com.br">Suporte</a></div></footer>

    <style>{`
      .cc-status-page,.cc-status-page *{box-sizing:border-box}.cc-status-page{min-height:100vh;background:radial-gradient(circle at 10% 0%,rgba(34,211,238,.18),transparent 30%),#06101f;color:#f8fafc;font-family:Inter,system-ui,sans-serif;padding-bottom:30px}.cc-status-top,.cc-status-hero,.cc-status-estimate,.cc-status-components,.cc-status-transparency,.cc-status-page footer{width:min(1080px,calc(100% - 28px));margin-inline:auto}.cc-status-top{display:flex;align-items:center;justify-content:space-between;padding:20px 0}.cc-status-top>a{display:flex;align-items:center;gap:11px;color:#fff;text-decoration:none}.cc-status-top>a>span{display:grid;place-items:center;width:46px;height:46px;border-radius:15px;background:linear-gradient(135deg,#22d3ee,#8b5cf6,#ec4899)}.cc-status-top>a div{display:grid}.cc-status-top small{color:#9fb3c8;font-size:11px;text-transform:uppercase;letter-spacing:.1em}.cc-status-top nav{display:flex;gap:8px}.cc-status-top nav a{color:#dbeafe;text-decoration:none;font-weight:800;padding:9px 11px;border-radius:11px}.cc-status-top nav a:hover{background:rgba(255,255,255,.06)}
      .cc-status-hero{display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;padding:28px;border:1px solid #2c4d68;border-radius:27px;background:linear-gradient(145deg,#0c243d,#091829);box-shadow:0 24px 70px rgba(0,0,0,.25)}.cc-status-hero.maintenance{border-color:#7c5c22;background:linear-gradient(145deg,#2b210c,#151306)}.cc-status-icon{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:rgba(74,222,128,.12);color:#4ade80}.cc-status-hero.maintenance .cc-status-icon{background:rgba(251,191,36,.12);color:#fbbf24}.cc-status-icon svg{width:31px;height:31px}.cc-status-hero small,.cc-status-section-title small{font-size:11px;letter-spacing:.16em;color:#67e8f9;font-weight:900}.cc-status-hero h1{font-size:clamp(27px,4vw,45px);margin:5px 0 8px}.cc-status-hero p{margin:0;color:#d3e0ec;line-height:1.55}.cc-status-badge{padding:9px 13px;border-radius:999px;background:rgba(74,222,128,.12);color:#86efac;white-space:nowrap}.cc-status-hero.maintenance .cc-status-badge{background:rgba(251,191,36,.12);color:#fde68a}.cc-status-estimate{display:flex;gap:12px;align-items:center;margin-top:14px;padding:15px 18px;border:1px solid #29465f;border-radius:18px;background:#0a1c30}.cc-status-estimate>svg{color:#67e8f9;flex:none}.cc-status-estimate div{display:grid;gap:4px}.cc-status-estimate span{font-size:12px;color:#9fb3c8}
      .cc-status-components{margin-top:18px;padding:23px;border:1px solid #29465f;border-radius:24px;background:#0a1c30}.cc-status-section-title{display:flex;justify-content:space-between;align-items:end;gap:16px}.cc-status-section-title h2{margin:5px 0 0}.cc-status-section-title>span{display:flex;align-items:center;gap:7px;color:#9fb3c8;font-size:12px}.cc-status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px;margin-top:18px}.cc-status-grid article{display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;padding:15px;border:1px solid #29465f;border-radius:16px;background:#071426}.cc-status-grid article>span{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:rgba(74,222,128,.1);color:#4ade80}.cc-status-grid article.maintenance>span{background:rgba(251,191,36,.1);color:#fbbf24}.cc-status-grid article div{display:grid;gap:4px}.cc-status-grid article small{color:#9fb3c8}.cc-status-grid article b{font-size:11px;color:#86efac}.cc-status-grid article.maintenance b{color:#fde68a}.cc-status-transparency{display:flex;gap:15px;margin-top:18px;padding:22px;border:1px solid #29465f;border-radius:22px;background:#0a1c30}.cc-status-transparency>svg{color:#67e8f9;flex:none}.cc-status-transparency h2{margin:0 0 7px}.cc-status-transparency p{margin:0;color:#cbd5e1;line-height:1.6}.cc-status-page footer{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;margin-top:24px;padding-top:22px;border-top:1px solid #29465f}.cc-status-page footer>div{display:flex;align-items:center;gap:11px;flex-wrap:wrap}.cc-status-page footer span{color:#9fb3c8}.cc-status-page footer a{color:#dbeafe;text-decoration:none;font-weight:800}.spin{animation:cc-status-spin 1s linear infinite}@keyframes cc-status-spin{to{transform:rotate(360deg)}}
      @media(max-width:760px){.cc-status-top nav{display:none}.cc-status-hero{grid-template-columns:auto 1fr}.cc-status-badge{grid-column:1/-1;text-align:center}.cc-status-grid{grid-template-columns:1fr}.cc-status-section-title{display:grid}.cc-status-grid article{grid-template-columns:auto 1fr}.cc-status-grid article b{grid-column:2}.cc-status-page footer{display:grid;text-align:center;justify-items:center}.cc-status-page footer>div{justify-content:center}}
    `}</style>
  </main>;
}
