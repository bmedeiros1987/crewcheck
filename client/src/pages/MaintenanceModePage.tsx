import { Activity, CalendarDays, Cloud, Lock, Menu, Plane, ShieldCheck, Wrench } from 'lucide-react';

type MaintenanceState = {
  enabled?: boolean;
  title?: string;
  message?: string;
  status?: string;
  updatedAt?: string | null;
};

export default function MaintenanceModePage({ state, onAdminAccess }: { state?: MaintenanceState; onAdminAccess?: () => void }) {
  return (
    <main className="cc1267-maintenance-page" data-version="12.5.68">
      <div className="cc1267-wallpaper" aria-hidden="true" />
      <header className="cc1267-maintenance-header">
        <button type="button" className="cc1267-icon-button" aria-label="Menu"><Menu size={25} /></button>
        <div className="cc1267-brand-mini">
          <span className="cc1267-logo"><Plane size={22} /></span>
          <div><strong>CrewCheck</strong><div><span>Premium</span><b>Beta</b></div></div>
        </div>
      </header>
      <section className="cc1267-maintenance-hero">
        <div className="cc1267-maintenance-illustration" aria-hidden="true">
          <Plane className="plane" />
          <Wrench className="wrench" />
          <div className="tower" />
          <div className="barrier" />
        </div>
        <h1>{state?.title || 'Site em manutenção'}</h1>
        <p>{state?.message || 'Estamos realizando melhorias e atualizações no CrewCheck. Em breve o sistema estará disponível novamente.'}</p>
        <span className="cc1267-maintenance-badge"><ShieldCheck size={18} /> Modo ativado pelo administrador</span>
        <div className="cc1267-maintenance-lock"><Lock size={24} /> Apenas administradores podem acessar o painel durante a manutenção.</div>
        <button type="button" onClick={onAdminAccess} className="cc1267-primary-action"><Lock size={20} /> Acessar painel admin <span>›</span></button>
        <button type="button" className="cc1267-secondary-action"><Activity size={20} /> Ver status</button>
        <button type="button" className="cc1267-link-action">Voltar mais tarde</button>
      </section>
      <section className="cc1267-maintenance-status">
        <div className="cc1267-section-row"><h2>Status da operação</h2><span><i /> {state?.status || 'Em andamento'}</span></div>
        <div className="cc1267-status-grid">
          <div><CalendarDays /><strong>Escala em atualização</strong><em /></div>
          <div><Activity /><strong>Alertas em revisão</strong><em /></div>
          <div><Cloud /><strong>Meteorologia sincronizando</strong><em /></div>
        </div>
      </section>
      <footer className="cc1267-maintenance-footer"><ShieldCheck size={18} /> Manutenção segura para garantir a melhor experiência para sua operação.</footer>
    </main>
  );
}
