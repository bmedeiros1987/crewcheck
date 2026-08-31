import { ArrowLeft, Plane, Route } from 'lucide-react';
import { loadCrewContext } from '@/lib/contextualNavigation';

function labelForContext(context: ReturnType<typeof loadCrewContext>): string {
  if (!context) return '';
  if (context.flightNumber) return context.flightNumber;
  if (context.origin || context.destination) return [context.origin, context.destination].filter(Boolean).join(' → ');
  if (context.date) return context.date;
  return 'programação';
}

export default function ContextualReturnBar({ view }: { view: string }) {
  const context = loadCrewContext();
  if (!context || context.target !== view || !context.sourceView) return null;
  const label = labelForContext(context);
  const hasRoute = Boolean(context.origin || context.destination);
  const Icon = context.flightNumber ? Plane : Route;

  return <nav className="cc-context-return" aria-label="Contexto de navegação">
    <button type="button" onClick={() => window.dispatchEvent(new Event('crewcheck:go-back'))}>
      <ArrowLeft size={17}/><span>Voltar à {context.sourceView === 'roster' ? 'Escala' : 'tela anterior'}</span>
    </button>
    <span className="cc-context-return-trail"><Icon size={15}/><span>{label}</span>{hasRoute && context.flightNumber ? <small>{[context.origin, context.destination].filter(Boolean).join(' → ')}</small> : null}</span>
  </nav>;
}
