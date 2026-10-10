import { Plane } from 'lucide-react';

export function V139Header({ title, detail, onBack, backLabel, hideBrand }: { title: string; detail: string; onBack?: () => void; backLabel?: string; hideBrand?: boolean }) {
  return <>
    {!hideBrand && <header className="cc139-brand">
      <button onClick={onBack || (() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' })))} aria-label={backLabel || 'Voltar'}>←</button>
      <span><Plane/><strong>CrewCheck</strong></span>
    </header>}
    <section className="cc139-head">
      <h1>{title}</h1>
      <p>{detail}</p>
    </section>
  </>;
}
