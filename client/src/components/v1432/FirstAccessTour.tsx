import { useEffect, useMemo, useState } from 'react';
import { Bell, BookOpen, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, CloudSun, HeartPulse, Plane, X } from 'lucide-react';

type TourStep = {
  view: string;
  target: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: typeof Plane;
};

const TOUR_SEEN_KEY = 'crewcheck:first-access-tour:v1434:disabled';
const TOUR_SESSION_KEY = 'crewcheck:first-access-tour:v1434:dismissed';

const STEPS: TourStep[] = [
  {
    view: 'cockpit',
    target: '.cz-brand-row',
    eyebrow: 'PASSO 1 DE 7',
    title: 'Seu cockpit operacional',
    description: 'Aqui você acompanha a próxima programação, alertas, valores e os atalhos que mais usa antes de cada jornada.',
    icon: Plane,
  },
  {
    view: 'roster',
    target: '.cz-roster-date, .cz-empty-real',
    eyebrow: 'PASSO 2 DE 7',
    title: 'Escala conectada',
    description: 'Importe o PDF oficial para liberar horários, regulamentação, mudanças, diárias, meteorologia e alertas automáticos.',
    icon: CalendarDays,
  },
  {
    view: 'regulation',
    target: '.cz-regulation-heading',
    eyebrow: 'PASSO 3 DE 7',
    title: 'Corte e fim da jornada',
    description: 'O cálculo usa a programação do dia, mostra o horário do corte e o fim da jornada 30 minutos depois. Todos os campos continuam editáveis.',
    icon: Clock3,
  },
  {
    view: 'weather',
    target: '.cc-meteo-follow, .cz-panel-head',
    eyebrow: 'PASSO 4 DE 7',
    title: 'Meteorologia acompanhada',
    description: 'Consulte origem e destino e ative acompanhamento. O CrewCheck prioriza mudanças novas e relevantes para evitar excesso de avisos.',
    icon: CloudSun,
  },
  {
    view: 'life',
    target: '.cc-life-hero',
    eyebrow: 'PASSO 5 DE 7',
    title: 'CrewCheck Life é opcional',
    description: 'Organize descanso, estudos, atividade física e tempo pessoal. O recurso só é ativado com seu consentimento e não pede permissões de saúde durante o tutorial.',
    icon: HeartPulse,
  },
  {
    view: 'manual',
    target: '.cc-manual-center',
    eyebrow: 'PASSO 6 DE 7',
    title: 'Manual sempre dentro do sistema',
    description: 'Consulte o manual completo, abra os PDFs, veja as principais funcionalidades e reinicie este tutorial quando quiser.',
    icon: BookOpen,
  },
  {
    view: 'cockpit',
    target: '.cz-bottom-nav',
    eyebrow: 'PASSO 7 DE 7',
    title: 'Navegação sempre disponível',
    description: 'Use o rodapé para voltar ao cockpit, abrir a escala, revisar alertas, conferir carga ou acessar o menu completo.',
    icon: Bell,
  },
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
    if (!open || currentView === step.view) return;
    onNavigate(step.view);
  }, [open, currentView, onNavigate, step.view]);

  useEffect(() => {
    if (!open) return;
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

  if (!open) return null;

  return <aside className="cc-first-tour" aria-label="Tutorial interativo do CrewCheck" aria-live="polite">
    <section className="cc-tour-card cc-readable-surface">
      <header>
        <span className="cc-tour-icon"><Icon/></span>
        <div><small>{step.eyebrow}</small><h2>{step.title}</h2></div>
        <button className="cc-tour-close" onClick={finish} aria-label="Fechar tutorial"><X/></button>
      </header>
      <p>{step.description}</p>
      <div className="cc-tour-progress" aria-label={`Progresso ${stepIndex + 1} de ${STEPS.length}`}><span style={{ width: `${progress}%` }}/></div>
      <label className="cc-tour-never"><input type="checkbox" checked={neverShowAgain} onChange={(event) => setNeverShowAgain(event.target.checked)}/><span>Não exibir novamente</span></label>
      <footer>
        <button className="secondary" onClick={finish}>Explorar depois</button>
        <nav aria-label="Passos do tutorial">
          {stepIndex > 0 && <button className="secondary" onClick={() => setStepIndex((value) => Math.max(0, value - 1))}><ChevronLeft/> Voltar</button>}
          {stepIndex < STEPS.length - 1
            ? <button className="primary" onClick={() => setStepIndex((value) => Math.min(STEPS.length - 1, value + 1))}>Próximo <ChevronRight/></button>
            : <button className="primary" onClick={finish}><Check/> Concluir</button>}
        </nav>
      </footer>
    </section>
  </aside>;
}
