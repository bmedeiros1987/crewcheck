import { Activity, CalendarDays, Clock3, Cloud, Lock, Menu, Plane, ShieldCheck, Wrench } from 'lucide-react';

type MaintenanceState = {
  enabled?: boolean;
  title?: string;
  message?: string;
  status?: string;
  updatedAt?: string | null;
  estimatedReturnAt?: string | null;
  etaMinutes?: number | null;
};

function estimateText(state?: MaintenanceState) {
  if (state?.estimatedReturnAt) {
    const date = new Date(state.estimatedReturnAt);
    if (!Number.isNaN(date.getTime())) return `Previsão de retorno: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)}.`;
  }
  const minutes = Number(state?.etaMinutes || 0);
  if (minutes > 0) return `Estimativa atual: cerca de ${minutes} minutos.`;
  return 'A equipe já está ciente e trabalhando. A previsão será atualizada assim que a análise permitir.';
}

export default function MaintenanceModePage({ state, onAdminAccess }: { state?: MaintenanceState; onAdminAccess?: () => void }) {
  return (
    <main className="cc1267-maintenance-page" data-version="14.3.16">
      <div className="cc1267-wallpaper" aria-hidden="true" />
      <header className="cc1267-maintenance-header">
        <button type="button" className="cc1267-icon-button" aria-label="Menu"><Menu size={25} /></button>
        <div className="cc1267-brand-mini"><span className="cc1267-logo"><Plane size={22} /></span><div><strong>CrewCheck</strong><div><span>Premium</span><b>Manutenção</b></div></div></div>
      </header>
      <section className="cc1267-maintenance-hero">
        <div className="cc1267-maintenance-illustration" aria-hidden="true"><Plane className="plane" /><Wrench className="wrench" /><div className="tower" /><div className="barrier" /></div>
        <h1>{state?.title || 'CrewCheck em manutenção'}</h1>
        <p>{state?.message || 'Identificamos a necessidade de uma atualização e já estamos trabalhando para restabelecer o funcionamento.'}</p>
        <span className="cc1267-maintenance-badge"><ShieldCheck size={18} /> A equipe já está ciente</span>
        <div className="cc1267-maintenance-lock"><Clock3 size={24} /> {estimateText(state)}</div>
        <a href="/status" className="cc1267-secondary-action"><Activity size={20} /> Ver status e atualizações</a>
        <button type="button" onClick={onAdminAccess} className="cc1267-primary-action"><Lock size={20} /> Acesso administrativo <span>›</span></button>
        <a href="/sobre" className="cc1267-link-action">Conheça o CrewCheck</a>
      </section>
      <section className="cc1267-maintenance-status">
        <div className="cc1267-section-row"><h2>Trabalho em andamento</h2><span><i /> {state?.status || 'Em manutenção'}</span></div>
        <div className="cc1267-status-grid">
          <div><CalendarDays /><strong>Escala e importação em revisão</strong><em /></div>
          <div><Activity /><strong>Alertas sendo validados</strong><em /></div>
          <div><Cloud /><strong>Informações operacionais sincronizando</strong><em /></div>
        </div>
        {state?.updatedAt && <p style={{ textAlign: 'center', opacity: .72, marginTop: 16 }}>Última atualização: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(state.updatedAt))}</p>}
      </section>
      <footer className="cc1267-maintenance-footer"><ShieldCheck size={18} /> Estamos trabalhando para devolver o sistema com segurança e estabilidade.</footer>
    </main>
  );
}
