import { useEffect, useState } from 'react';
import './startup-progress.css';

export type StartupStage = 'session' | 'profile';

/** Milestones reflect completed work, never elapsed-time percentages. */
export function StartupProgress({ stage }: { stage: StartupStage }) {
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    const onConnection = () => setOffline(!navigator.onLine);
    window.addEventListener('online', onConnection);
    window.addEventListener('offline', onConnection);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('online', onConnection);
      window.removeEventListener('offline', onConnection);
    };
  }, []);
  const current = stage === 'session' ? 1 : 2;
  const labels = ['Aplicativo carregado', 'Verificando sessão', 'Preparando seu acesso'];
  return <div className="cc-startup-progress">
    <p role="status" aria-live="polite" aria-atomic="true">{labels[current]}</p>
    <div role="progressbar" aria-label="Abertura do CrewCheck" aria-valuetext={`Etapa ${current + 1} de 3: ${labels[current]}`} className="cc-startup-track"><span /></div>
    <ol aria-label="Etapas da abertura">
      {labels.map((label, index) => <li key={label} data-state={index < current ? 'done' : index === current ? 'active' : 'pending'} aria-current={index === current ? 'step' : undefined}><span aria-hidden="true">{index < current ? '✓' : index + 1}</span>{label}</li>)}
    </ol>
    {(slow || offline) && <div className="cc-startup-help" role="status">
      <p>{offline ? 'Seu dispositivo está sem conexão. Aguardando a verificação de acesso.' : 'Está levando mais tempo que o normal. A verificação continua em andamento.'}</p>
      <button type="button" onClick={() => window.location.reload()}>Tentar novamente</button>
    </div>}
  </div>;
}
