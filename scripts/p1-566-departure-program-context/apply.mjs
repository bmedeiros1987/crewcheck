import fs from 'node:fs';

const MARKER = 'p1-566-departure-program-context';
const HOME = 'client/src/pages/Home.tsx';
const BRIDGE = 'client/src/components/navigation/FlightDeckNavigationContext.tsx';

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

function updateRegion(source, startMarker, endMarker, transform, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[${MARKER}] Região ausente: ${label}`);
  const before = source.slice(start, end);
  const after = transform(before);
  return source.slice(0, start) + after + source.slice(end);
}

update(BRIDGE, (source) => {
  let next = required(
    source,
    "type FlightContextTarget = 'radar' | 'weather';",
    "type FlightContextTarget = 'radar' | 'weather' | 'departure';",
    'tipo dos destinos do FlightDeck',
  );

  next = required(
    next,
    "<strong>{targetView === 'radar' ? 'Situação do voo selecionado' : 'Meteorologia do voo selecionado'}</strong>",
    "<strong>{targetView === 'radar' ? 'Situação do voo selecionado' : targetView === 'weather' ? 'Meteorologia do voo selecionado' : 'Saída da programação selecionada'}</strong>",
    'rótulo contextual da Saída',
  );

  next = next
    .replace('O voo selecionado não está mais na escala ativa', 'A programação selecionada não está mais na escala ativa')
    .replace('Volte ao FlightDeck e escolha novamente.', 'Volte ao FlightDeck e escolha novamente.');

  return next;
});

update(HOME, (source) => {
  let next = source;

  if (!next.includes("from '@/components/navigation/FlightDeckNavigationContext'")) {
    throw new Error(`[${MARKER}] Ponte única do FlightDeck não materializada; não criar barramento paralelo.`);
  }
  if (!next.includes("peekPendingNavigationContext")) {
    throw new Error(`[${MARKER}] Navigation Context canônico não materializado.`);
  }

  next = updateRegion(next, 'function Cockpit(', '\nfunction rosterCode', (cockpitSource) => {
    let cockpit = cockpitSource.replace(
      "function openFlightSurface(targetView: 'radar' | 'weather')",
      "function openFlightSurface(targetView: 'radar' | 'weather' | 'departure')",
    );

    cockpit = required(
      cockpit,
      "onClick={() => setView('departure')}><Navigation/> Planejar saída",
      "onClick={() => openFlightSurface('departure')}><Navigation/> Planejar saída",
      'ação Planejar saída do FlightDeck',
    );

    if (!cockpit.includes("openFlightSurface('departure')")) {
      throw new Error(`[${MARKER}] FlightDeck não publicou contexto para Saída.`);
    }
    return cockpit;
  }, 'Cockpit/FlightDeck');

  if (!next.includes("const departureSurfaceContext = view === 'departure'")) {
    const anchor = "  const departureEvent = nextDepartureEvent(events);\n  const compliance = currentCompliance(bundle);";
    if (!next.includes(anchor)) throw new Error(`[${MARKER}] Seleção canônica da Saída não localizada.`);
    next = next.replace(anchor, `  const departureEvent = nextDepartureEvent(events);
  const departureSurfaceContext = view === 'departure' ? peekPendingNavigationContext('departure') : null;
  const contextualDepartureEvent = departureSurfaceContext?.programId
    ? events.find((candidate) => candidate.id === departureSurfaceContext.programId && !candidate.placeholder && isSmartDepartureEligible(candidate)) || null
    : null;
  // Entrada contextual nunca troca silenciosamente a programação escolhida por outra.
  // Entrada global continua usando a seleção canônica existente da Saída Inteligente.
  const departureSurfaceEvent = departureSurfaceContext?.programId ? contextualDepartureEvent : departureEvent;
  const compliance = currentCompliance(bundle);`);
  }

  const contextualRender = "    {view === 'departure' && (departureSurfaceEvent ? <Departure event={departureSurfaceEvent} events={events} setView={setView}/> : <><Brand back/><FlightDeckContextUnavailable targetView=\"departure\"/></>)}";
  if (!next.includes(contextualRender)) {
    const candidates = [
      "    {view === 'departure' && <Departure event={departureEvent} events={events} setView={setView}/>} ",
      "    {view === 'departure' && <Departure event={departureEvent} events={events} setView={setView}/>}\n",
      "    {view === 'departure' && <Departure event={event} events={events} setView={setView}/>} ",
      "    {view === 'departure' && <Departure event={event} events={events} setView={setView}/>}\n",
    ];
    const anchor = candidates.find((value) => next.includes(value));
    if (!anchor) throw new Error(`[${MARKER}] Render final da Saída não localizado.`);
    next = next.replace(anchor, `${contextualRender}\n`);
  }

  next = updateRegion(next, 'function Departure(', '\nfunction MonthlyMapView', (departureSource) => {
    if (departureSource.includes('<FlightDeckNavigationContext targetView="departure"/>')) return departureSource;
    const patched = departureSource.replace(
      /<><Brand back\/>/g,
      '<><Brand back/><FlightDeckNavigationContext targetView="departure"/>',
    );
    if (patched === departureSource) throw new Error(`[${MARKER}] Brand da Saída não localizado.`);
    return patched;
  }, 'Departure');

  return next;
});

console.log('[p1-566-departure] FlightDeck → Saída preserva programação explícita e retorno contextual sem recalcular domínio.');
