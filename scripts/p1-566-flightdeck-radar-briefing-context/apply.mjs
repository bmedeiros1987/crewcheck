import fs from 'node:fs';

const MARKER = 'p1-566-flightdeck-radar-briefing-context';

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

update('client/src/pages/Home.tsx', (source) => {
  let next = source;

  next = required(
    next,
    "import { clearPendingNavigationContext, peekPendingNavigationContext } from '@/lib/navigationContext';",
    "import { clearPendingNavigationContext, peekPendingNavigationContext, setPendingNavigationContext } from '@/lib/navigationContext';",
    'Navigation Context import',
  );

  if (!next.includes("from '@/components/navigation/FlightDeckNavigationContext'")) {
    const candidates = [
      "import ManualRegulationView from '@/components/v1432/ManualRegulationView';",
      "import ManualRegulationView from '@/components/v1392/ManualRegulationView';",
    ];
    const anchor = candidates.find((value) => next.includes(value));
    if (!anchor) throw new Error(`[${MARKER}] Import de ManualRegulationView não localizado.`);
    next = next.replace(
      anchor,
      `${anchor}\nimport FlightDeckNavigationContext, { FlightDeckContextUnavailable } from '@/components/navigation/FlightDeckNavigationContext';`,
    );
  }

  if (!next.includes("function openFlightSurface(targetView: 'radar' | 'weather')")) {
    const anchor = "  const isFlight = event.kind === 'flight';";
    if (!next.includes(anchor)) throw new Error(`[${MARKER}] isFlight do FlightDeck não localizado.`);
    next = next.replace(anchor, `${anchor}\n  function openFlightSurface(targetView: 'radar' | 'weather') {\n    setPendingNavigationContext({\n      sourceView: 'cockpit',\n      targetView,\n      dateEpochMs: eventStartDateTime(event).getTime(),\n      programId: event.id,\n      flightKey: String(event.flightNumber || '').trim() || undefined,\n      airportCode: String(event.origin || '').trim() || undefined,\n      returnView: 'cockpit',\n      returnLabel: 'Voltar ao FlightDeck',\n      policy: 'persistent-until-return',\n    });\n    setView(targetView);\n  }`);
  }

  next = required(
    next,
    "{isFlight ? <button onClick={() => setView('radar')}><Radar/> Radar</button> : null}",
    "{isFlight ? <button onClick={() => openFlightSurface('radar')}><Radar/> Radar</button> : null}\n        {isFlight ? <button onClick={() => openFlightSurface('weather')}><CloudSun/> Meteorologia</button> : null}",
    'ações contextuais do FlightDeck',
  );

  if (!next.includes("const flightSurfaceContext = (view === 'radar' || view === 'weather')")) {
    const anchor = '  const flightEvent = nextRealFlight(events);';
    if (!next.includes(anchor)) throw new Error(`[${MARKER}] flightEvent canônico do Home não localizado.`);
    next = next.replace(anchor, `${anchor}\n  const flightSurfaceContext = (view === 'radar' || view === 'weather') ? peekPendingNavigationContext(view) : null;\n  const contextualFlightEvent = flightSurfaceContext?.programId\n    ? events.find((candidate) => candidate.id === flightSurfaceContext.programId && candidate.kind === 'flight' && !candidate.placeholder) || null\n    : null;\n  // Contexto explícito deve falhar fechado: se a programação sumiu da escala ativa,\n  // nunca substitua silenciosamente por outro voo. Entrada global continua usando flightEvent.\n  const flightSurfaceEvent = flightSurfaceContext?.programId ? contextualFlightEvent : flightEvent;`);
  }

  next = required(
    next,
    "    {view === 'radar' && <RadarView event={flightEvent}/>}\n    {view === 'weather' && <WeatherView event={flightEvent}/>}",
    "    {view === 'radar' && (flightSurfaceEvent ? <RadarView event={flightSurfaceEvent}/> : <><Brand back/><FlightDeckContextUnavailable targetView=\"radar\"/></>)}\n    {view === 'weather' && (flightSurfaceEvent ? <WeatherView event={flightSurfaceEvent}/> : <><Brand back/><FlightDeckContextUnavailable targetView=\"weather\"/></>)}",
    'render contextual de Radar/Meteorologia',
  );

  next = required(
    next,
    'return <><Brand back/><section className="cz-panel-head"><h1>Radar de voos</h1>',
    'return <><Brand back/><FlightDeckNavigationContext targetView="radar"/><section className="cz-panel-head"><h1>Radar de voos</h1>',
    'faixa contextual do Radar',
  );

  next = required(
    next,
    'return <><Brand back/>\n    <section className="cz-panel-head cc-weather-heading">',
    'return <><Brand back/><FlightDeckNavigationContext targetView="weather"/>\n    <section className="cz-panel-head cc-weather-heading">',
    'faixa contextual da Meteorologia',
  );

  if (!next.includes('function openWeatherFromRadar()')) {
    const anchor = "  const latency = state?.latencyMs ? `${state.latencyMs} ms` : '—';";
    if (!next.includes(anchor)) throw new Error(`[${MARKER}] latência do Radar não localizada.`);
    next = next.replace(anchor, `${anchor}\n  function openWeatherFromRadar() {\n    const inheritedContext = peekPendingNavigationContext('radar');\n    if (inheritedContext?.sourceView === 'cockpit' && inheritedContext.returnView === 'cockpit' && inheritedContext.programId) {\n      setPendingNavigationContext({ ...inheritedContext, targetView: 'weather' });\n    } else {\n      clearPendingNavigationContext();\n    }\n    window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'weather' }));\n  }`);
  }

  next = required(
    next,
    "<button onClick={() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'weather' }))}><CloudSun/> Meteorologia</button>",
    "<button onClick={openWeatherFromRadar}><CloudSun/> Meteorologia</button>",
    'handoff Radar → Meteorologia',
  );

  return next;
});

console.log(`[${MARKER}] FlightDeck ↔ Radar/Meteorologia usa Navigation Context explícito e fail-closed.`);
