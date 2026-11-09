import { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Plane, Send, X } from 'lucide-react';

type TourStep = {
  view: string;
  target: string;
  title: string;
  description: string;
  icon: typeof Plane;
};

const TOUR_SEEN_KEY = 'crewcheck:first-access-tour:v1434:disabled';
const TOUR_SESSION_KEY = 'crewcheck:first-access-tour:v1434:dismissed';

const STEPS: TourStep[] = [
  {view:'cockpit',target:'.cz-brand-row',title:'Seu cockpit operacional',description:'Revise a programação e os atalhos disponíveis. Confira a fonte e a atualização dos dados antes de usá-los.',icon:Plane},
  {view:'roster',target:'.cz-roster-date, .cz-empty-real',title:'Sua escala no app',description:'Importe o PDF oficial e confira os dados antes de confirmar a escala. Importar não ativa canais nem autoriza avisos.',icon:CalendarDays},
  {view:'concierge',target:'#cc-concierge-channels',title:'Concierge: vínculos e briefing',description:'Abra Menu → Concierge → WhatsApp e Telegram. O botão de vínculos abre a seção existente na central de Notificações. Confira o status antes de gerar um código; se já estiver vinculado, não gere outro. Vínculo não confirma entrega nem ativa avisos.',icon:Send},
  {view:'manual',target:'.cc-manual-center',title:'Ajuda quando precisar',description:'Abra Menu → Manual CrewCheck para consultar as orientações e reiniciar este tutorial.',icon:BookOpen},
  {view:'cockpit',target:'.cz-bottom-nav',title:'Continue pelo menu',description:'Você pode explorar outras telas enquanto o tutorial estiver aberto, fechar ou voltar a ele depois. As opções dependem da disponibilidade de cada recurso.',icon:Bell},
];

function shouldStartTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) !== '1' && sessionStorage.getItem(TOUR_SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

export default function FirstAccessTour({ currentView, onNavigate }: { currentView: string; onNavigate: (view: string) => void }) {
  const [open, setOpen] = useState(shouldStartTour);
  const [stepIndex, setStepIndex] = useState(0);
  const [neverShowAgain, setNeverShowAgain] = useState(false);
  const step = STEPS[stepIndex];
  const Icon = step.icon;
  const progress = useMemo(() => ((stepIndex + 1) / STEPS.length) * 100, [stepIndex]);

  useEffect(() => {
    const restart = () => {
      try { sessionStorage.removeItem(TOUR_SESSION_KEY); } catch {}
      setStepIndex(0);
      setNeverShowAgain(false);
      setOpen(true);
    };
    window.addEventListener('crewcheck:tour:restart', restart);
    return () => window.removeEventListener('crewcheck:tour:restart', restart);
  }, []);

  useEffect(() => {
    if (!open || currentView !== step.view) return;
    let highlighted: Element | null = null;
    const timer = window.setTimeout(() => {
      highlighted = document.querySelector(step.target);
      highlighted?.classList.add('cc-tour-highlight');
      highlighted?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      highlighted?.classList.remove('cc-tour-highlight');
      document.querySelectorAll('.cc-tour-highlight').forEach((element) => element.classList.remove('cc-tour-highlight'));
    };
  }, [open, step.target, currentView]);

  function finish() {
    try {
      sessionStorage.setItem(TOUR_SESSION_KEY, '1');
      if (neverShowAgain) localStorage.setItem(TOUR_SEEN_KEY, '1');
    } catch {}
    document.querySelectorAll('.cc-tour-highlight').forEach((element) => element.classList.remove('cc-tour-highlight'));
    setOpen(false);
  }

  function goToStep(index: number) {
    const next = Math.max(0, Math.min(STEPS.length - 1, index));
    setStepIndex(next);
    onNavigate(STEPS[next].view);
  }

  if (!open) return null;

  return <aside className="cc-first-tour" aria-label="Tutorial interativo do CrewCheck" aria-live="polite">
    <section className="cc-tour-card cc-readable-surface">
      <header>
        <span className="cc-tour-icon"><Icon/></span>
        <div><small>PASSO {stepIndex + 1} DE {STEPS.length}</small><h2>{step.title}</h2></div>
        <button className="cc-tour-close" onClick={finish} aria-label="Fechar tutorial"><X/></button>
      </header>
      <p>{step.description}</p>
      {step.view === 'concierge' ? <button className="cc-tour-destination primary" type="button" onClick={() => { finish(); onNavigate('concierge'); }}>Abrir Concierge e vínculos</button> : currentView !== step.view && <button className="cc-tour-destination secondary" type="button" onClick={() => onNavigate(step.view)}>Ver esta etapa</button>}
      <div className="cc-tour-progress" aria-label={`Progresso ${stepIndex + 1} de ${STEPS.length}`}><span style={{ width: `${progress}%` }}/></div>
      <label className="cc-tour-never"><input type="checkbox" checked={neverShowAgain} onChange={(event) => setNeverShowAgain(event.target.checked)}/><span>Não exibir novamente</span></label>
      <footer>
        <button className="secondary" onClick={finish}>Explorar depois</button>
        <nav aria-label="Passos do tutorial">
          {stepIndex > 0 && <button className="secondary" onClick={() => goToStep(stepIndex - 1)}><ChevronLeft/> Voltar</button>}
          {stepIndex < STEPS.length - 1
            ? <button className="primary" onClick={() => goToStep(stepIndex + 1)}>Próximo <ChevronRight/></button>
            : <button className="primary" onClick={finish}><Check/> Concluir</button>}
        </nav>
      </footer>
    </section>
  </aside>;
}
