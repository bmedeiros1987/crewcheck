import { useEffect, useState } from 'react';
import './startup-progress.css';
import { useStartupCopy } from './startupCopy';

export type StartupStage = 'session' | 'profile';

/** Milestones reflect completed work, never elapsed-time percentages. */
export function StartupProgress({ stage }: { stage: StartupStage }) {
  const copy = useStartupCopy();
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
  const labels = [copy.loaded, copy.session, copy.profile];
  return <div className="cc-startup-progress" data-i18n-skip="true">
    <p role="status" aria-live="polite" aria-atomic="true">{labels[current]}</p>
    <div role="progressbar" aria-label={copy.opening} aria-valuetext={copy.step.replace('{step}', String(current + 1)).replace('{label}', labels[current])} className="cc-startup-track"><span /></div>
    <ol aria-label={copy.steps}>
      {labels.map((label, index) => <li key={label} data-state={index < current ? 'done' : index === current ? 'active' : 'pending'} aria-current={index === current ? 'step' : undefined}><span aria-hidden="true">{index < current ? '✓' : index + 1}</span>{label}</li>)}
    </ol>
    {(slow || offline) && <div className="cc-startup-help" role="status">
      <p>{offline ? copy.offline : copy.slow}</p>
      <button type="button" onClick={() => window.location.reload()}>{copy.retry}</button>
    </div>}
  </div>;
}
