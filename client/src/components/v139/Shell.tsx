import { Plane } from 'lucide-react';

export function V139Header({ title, detail }: { title: string; detail: string }) {
  return <>
    <header className="cc139-brand">
      <button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' }))} aria-label="Voltar">←</button>
      <span><Plane/><strong>CrewCheck</strong></span>
    </header>
    <section className="cc139-head">
      <h1>{title}</h1>
      <p>{detail}</p>
    </section>
  </>;
}
