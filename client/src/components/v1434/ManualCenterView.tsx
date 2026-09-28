import { BookOpen, Download, ExternalLink, GraduationCap, HeartPulse, PlayCircle, ShieldCheck } from 'lucide-react';

const MANUAL_FULL = '/manuals/Manual_Completo_CrewCheck_v14.3.4.pdf';
const MANUAL_FEATURES = '/manuals/Guia_Principais_Funcionalidades_CrewCheck_v14.3.4.pdf';

export default function ManualCenterView() {
  function restartTour() {
    window.dispatchEvent(new Event('crewcheck:tour:restart'));
  }

  return <section className="cc-manual-center" aria-labelledby="cc-manual-title">
    <header className="cc-manual-hero">
      <span><BookOpen/></span>
      <div><small>CENTRAL DE AJUDA · V14.3.4</small><h1 id="cc-manual-title">Manual CrewCheck</h1><p>Manual completo, guia rápido e tutorial interativo no mesmo lugar.</p></div>
    </header>
    <div className="cc-manual-actions">
      <a className="primary" href={MANUAL_FULL} target="_blank" rel="noreferrer"><Download/> Manual completo em PDF</a>
      <a href={MANUAL_FEATURES} target="_blank" rel="noreferrer"><GraduationCap/> Principais funcionalidades</a>
      <button onClick={restartTour}><PlayCircle/> Reiniciar tutorial</button>
      <a href="/manual.html" target="_blank" rel="noreferrer"><ExternalLink/> Abrir manual web</a>
    </div>
    <section className="cc-manual-highlights">
      <article><HeartPulse/><h2>CrewCheck Life</h2><p>Consentimento, entrada manual, Health Connect/Samsung Health, Apple Health e controles de privacidade.</p><a href="/manual.html#crewcheck-life">Ler esta seção</a></article>
      <article><ShieldCheck/><h2>Uso confiável</h2><p>Permissões, notificações, regulamentação, saída inteligente e confirmação nos canais oficiais.</p><a href="/manual.html#confiabilidade">Ver boas práticas</a></article>
      <article><BookOpen/><h2>Consulta no sistema</h2><p>O conteúdo abaixo é a versão web incorporada e acompanha a versão publicada do CrewCheck.</p></article>
    </section>
    <iframe className="cc-manual-frame" src="/manual.html?embedded=1" title="Manual web completo do CrewCheck" loading="lazy"/>
  </section>;
}
