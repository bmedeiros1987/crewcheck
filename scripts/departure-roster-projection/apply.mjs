import fs from 'node:fs';
const file = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(file, 'utf8');
if (!source.includes('function PlannedRosterDeparture(')) {
  source = "import { departureRosterProjection } from '@shared/departureRosterProjection.mjs';\n" + source;
  const anchor = '  return <AirportDeparture {...props}/>;';
  if (!source.includes(anchor)) throw Error('Missing departure wrapper');
  source = source.replace(anchor, "  return <PlannedRosterDeparture key={String(getStoredUser()?.id || '') + ':' + props.event.id} {...props}/>;");
  const component = `function PlannedRosterDeparture(props: { event: ZeroLeg; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const location = eventRouteOrigin(props.event);
  const airport = nearestDepartureAirport(location);
  const distance = airport ? departureOriginAirportDistanceKm({ ...props.event, origin: airport.code }, location) : null;
  const projection = !storage.get('crewcheck_manual_route_origin', '') && departureRosterProjection({
    events: props.events.map(item => ({ id: item.id, kind: item.kind, placeholder: item.placeholder, origin: item.origin, destination: item.destination, status: item.status,
      startAt: item.canonical?.startDateTime || '', endAt: item.canonical?.endDateTime || '' })),
    targetId: props.event.id, presentationAt: departurePresentationDateTime(props.event).toISOString(), origin: props.event.origin,
    currentAirport: airport?.code || '', now,
  });
  if (!projection || useCurrentLocation) return <AirportDeparture {...props}/>;
  return <><Brand back/><section className="cz-panel-head"><h1>Saída Inteligente</h1></section><article className="cz-empty-real" data-roster-positioning="planned"><Navigation/><h2>Escala → {projection.airport}</h2><p>Chegada prevista {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(projection.arrivalAt))}</p><small>Deslocamento previsto na escala · realização não confirmada</small><button onClick={() => props.setView('roster')}>Ver escala</button><button onClick={() => setUseCurrentLocation(true)}>Calcular da localização atual</button></article></>;
}
`;
  source = source.replace('function AirportDeparture(', component + 'function AirportDeparture(');
  // Guard invalid presentation before ISO serialization.
  source = source.replace("const projection = !storage.get('crewcheck_manual_route_origin', '') &&", "const presentation = departurePresentationDateTime(props.event);\n  const projection = Number.isFinite(presentation.getTime()) && distance != null && distance <= 80 && !storage.get('crewcheck_manual_route_origin', '') &&");
  source = source.replace('presentationAt: departurePresentationDateTime(props.event).toISOString()', 'presentationAt: presentation.toISOString()');
  source = source.replace('    if (stopped()) return null;\n    const candidates = positioningBoardRows(board)', "    if (stopped()) return null;\n    if (!boardResponse.ok || board?.ok !== true || !Array.isArray(board?.rows || board?.flights)) throw Error('Board unavailable');\n    const candidates = positioningBoardRows(board)");
  source = source.replace('      if (stopped()) return null;\n      if (positioningCancelled', "      if (stopped()) return null;\n      if (!response.ok || status?.ok !== true) throw Error('Status unavailable');\n      if (positioningCancelled");
  source = source.replace("message: 'Nenhum voo direto no mesmo dia chegou com antecedência segura. Mantido o posicionamento no dia anterior.'", "message: 'Nenhuma opção confirmada nos dados consultados. Posicionamento a confirmar.'");
  source = source.replace("message: 'Radar temporariamente indisponível. Mantido o planejamento seguro no dia anterior.'", "message: 'Consulta indisponível. Posicionamento a confirmar.'");
  fs.writeFileSync(file, source);
}
