import fs from 'node:fs';

const MARKER = 'p1-566-stay-wakeup-concierge-context';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[${MARKER}] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function required(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[${MARKER}] Âncora ausente: ${label}`);
  return source.replace(before, after);
}

function updateFunction(source, signature, transform, label) {
  const start = source.indexOf(signature);
  const end = start >= 0 ? source.indexOf('\nfunction ', start + signature.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[${MARKER}] Função ausente/incompleta: ${label}`);
  const before = source.slice(start, end);
  const after = transform(before);
  return source.slice(0, start) + after + source.slice(end);
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source;

  const navigationImport = "import { clearPendingNavigationContext, peekPendingNavigationContext, setPendingNavigationContext } from '@/lib/navigationContext';";
  if (!next.includes(navigationImport)) {
    throw new Error(`[${MARKER}] Navigation Context final de #566 não localizado; não criar barramento paralelo.`);
  }

  if (!next.includes("from '@/components/navigation/StayNavigationContext'")) {
    const anchor = "import FlightDeckNavigationContext, { FlightDeckContextUnavailable } from '@/components/navigation/FlightDeckNavigationContext';";
    if (!next.includes(anchor)) throw new Error(`[${MARKER}] Ponte FlightDeck #566 não localizada.`);
    next = next.replace(anchor, `${anchor}\nimport StayNavigationContext from '@/components/navigation/StayNavigationContext';`);
  }

  next = updateFunction(next, 'function HotelsView(', (hotelsSource) => {
    let hotels = hotelsSource;

    if (!hotels.includes("function openStaySurface(event: ZeroLeg, targetView: 'wakeup' | 'concierge')")) {
      const anchor = '  const [saving, setSaving] = useState(false);';
      if (!hotels.includes(anchor)) throw new Error(`[${MARKER}] Estado do HotelsView não localizado.`);
      hotels = hotels.replace(anchor, `${anchor}\n  function openStaySurface(event: ZeroLeg, targetView: 'wakeup' | 'concierge') {\n    setPendingNavigationContext({\n      sourceView: 'hotels',\n      targetView,\n      dateEpochMs: event.date.getTime(),\n      stayId: event.id,\n      airportCode: String(event.destination || event.origin || '').trim() || undefined,\n      returnView: 'hotels',\n      returnLabel: 'Voltar ao Pernoite',\n      policy: 'persistent-until-return',\n    });\n    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: targetView }));\n  }`);
    }

    const actionsBefore = '<button className="primary" onClick={() => openEditor(event)}><Save/> Editar pernoite</button><button onClick={() => loadCompanions(event)}><UserRound/> Colegas no hotel</button>';
    const actionsAfter = '<button className="primary" onClick={() => openEditor(event)}><Save/> Editar pernoite</button><button onClick={() => openStaySurface(event, \'wakeup\')}><Bell/> Despertador</button><button onClick={() => openStaySurface(event, \'concierge\')}><Send/> Concierge</button><button onClick={() => loadCompanions(event)}><UserRound/> Colegas no hotel</button>';
    return required(hotels, actionsBefore, actionsAfter, 'ações contextuais do card de pernoite');
  }, 'HotelsView');

  next = updateFunction(next, 'function WakeupView(', (wakeupSource) => required(
    wakeupSource,
    'return <><Brand back/><section className="cz-panel-head"><h1>Despertador Inteligente</h1>',
    'return <><Brand back/><StayNavigationContext targetView="wakeup"/><section className="cz-panel-head"><h1>Despertador Inteligente</h1>',
    'retorno contextual do Despertador',
  ), 'WakeupView');

  next = updateFunction(next, 'function TelegramConciergeView(', (conciergeSource) => {
    if (conciergeSource.includes('<StayNavigationContext targetView="concierge"/>')) return conciergeSource;
    const anchor = 'return <><Brand back/><section className="cz-panel-head">';
    if (!conciergeSource.includes(anchor)) throw new Error(`[${MARKER}] Retorno principal do Concierge não localizado.`);
    return conciergeSource.replace(anchor, 'return <><Brand back/><StayNavigationContext targetView="concierge"/><section className="cz-panel-head">');
  }, 'TelegramConciergeView');

  return next;
});

console.log(`[${MARKER}] Pernoite ↔ Despertador/Concierge usa o Navigation Context único, sem recalcular APZ ou criar alarmes.`);
