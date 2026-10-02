import fs from 'node:fs';
const file = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(file, 'utf8');
if (source.includes('data-departure-route-state')) process.exitCode = 0;
else {
  function replace(before, after) {
    if (!source.includes(before)) throw new Error('[departure-route-state] missing anchor: ' + before.slice(0, 100));
    source = source.replace(before, after);
  }
  source = "import { createDepartureRouteSession, type DepartureRouteState } from '@/lib/departureRouteState';\n" + source;
  replace('type RoutePreviewInfo = {', `type RoutePreviewInfo = {
  clientRouteState?: DepartureRouteState;
  clientRouteError?: string;
  clientRouteCheckedAt?: string;`);
  replace("  const lastAlertedIncidentFingerprintRef = useRef<string | null>(null);", "  const refreshRouteRef = useRef<(() => void) | null>(null);\n  const routeLocationRevisionRef = useRef<number | null>(null);\n  const routeAccountId = getStoredUser()?.id || null;\n  const lastAlertedIncidentFingerprintRef = useRef<string | null>(null);");
  replace(`    let alive = true;
    const refresh = () => fetchRoutePreviewInfo(origin, destination, mapsMode).then((info) => {
      if (!alive) return;
      setRoute(info);
      onRoute?.(info);
    });
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [origin, destination, mapsMode, locationRevision]);`, `    const session = createDepartureRouteSession<RoutePreviewInfo>((info) => {
      setRoute(info);
      onRoute?.(info);
    });
    const refresh = () => {
      const request = session.begin();
      void fetchRoutePreviewInfo(origin, destination, mapsMode).then((info) => session.complete(request, info));
    };
    refreshRouteRef.current = refresh;
    routeLocationRevisionRef.current = locationRevision;
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { refreshRouteRef.current = null; session.dispose(); window.clearInterval(timer); };
  }, [event.id, origin, destination, mapsMode, routeAccountId]);
  useEffect(() => {
    if (locationRevision > 0 && routeLocationRevisionRef.current !== locationRevision) {
      routeLocationRevisionRef.current = locationRevision;
      refreshRouteRef.current?.();
    }
  }, [locationRevision]);`);
  replace("if (mapsMode !== 'driving' || departureRouteMismatch", "if (route?.clientRouteState !== 'valid' || mapsMode !== 'driving' || departureRouteMismatch");
  replace('route?.distanceMeters, route?.message]);', 'route?.distanceMeters, route?.message, route?.clientRouteState]);');
  replace("      setOrigin(next);\n      setOriginLabel('Localizando endereço próximo…');", "      setOrigin(next);\n      setLocationRevision((value) => value + 1);\n      setOriginLabel('Localizando endereço próximo…');");
  replace("  const routeReady = route?.ok === true;", "  const routeReady = route?.ok === true;\n  const routeState = route?.clientRouteState || 'pending';");
  replace("const trafficText = !route", "const trafficText = routeState === 'stale' ? 'Última leitura: ' + (route?.durationInTrafficText || route?.durationText || 'tempo indisponível') : routeState === 'pending' || !route");
  replace("safe(route?.distanceText, (Number(route?.distanceMeters) / 1000).toFixed(1).replace('.', ',') + ' km') : route ? 'Rota indisponível'", "safe(route?.distanceText, (Number(route?.distanceMeters) / 1000).toFixed(1).replace('.', ',') + ' km') : routeState === 'pending' ? 'Calculando rota' : route ? 'Rota indisponível'");
  replace('return <article className="cz-google-route-card">', 'return <article className="cz-google-route-card" data-departure-route-state={routeState}>');
  replace('    <div className="cz-route-kpis">', `    <p role="status" className="cz-mini-status">{routeState === 'pending' ? 'Consultando rota. Distância e trânsito ainda não confirmados.' : routeState === 'stale' ? (route?.clientRouteError ? 'Consulta falhou. Exibindo a última rota confirmada, desatualizada.' : 'Atualizando rota. Exibindo a última leitura, ainda não reconfirmada.') : routeState === 'error' ? 'Rota não confirmada. Não há leitura válida para este trajeto.' : 'Rota confirmada nesta consulta.'}{route?.clientRouteError ? ' ' + route.clientRouteError : ''}{routeReady && route?.updatedAt ? ' Última confirmação: ' + new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(route.updatedAt)) + ' · ' + routeProviderLabel : ''}</p>
    <div className="cz-route-kpis">`);
  replace("liveMinutes ? 'TRÂNSITO ATUALIZADO' : routePending", "route?.clientRouteState === 'stale' ? 'ROTA DESATUALIZADA' : liveMinutes ? 'TRÂNSITO ATUALIZADO' : routePending");
  replace(">{statusLabel}</em>", ">{route?.clientRouteState === 'stale' ? 'ÚLTIMA ROTA · ' : ''}{statusLabel}</em>");
  replace("key={event.id + '-' + originLabel}", "key={event.id}");
  replace("if (liveMinutes > 0) saveDepartureTravelMinutes(event, liveMinutes);", "if (liveMinutes > 0 && route?.clientRouteState !== 'stale') saveDepartureTravelMinutes(event, liveMinutes);");
  replace("if (minutes) saveDepartureTravelMinutes(event, minutes);", "if (minutes && next?.clientRouteState === 'valid') saveDepartureTravelMinutes(event, minutes);");
  replace("setRoutePending(false); const minutes", "setRoutePending(next?.clientRouteState === 'pending'); const minutes");
  replace("  const leaveDayLabel = positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed", "  const positioningUnresolved = positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed && (positioningBusy || positioningSearch?.status !== 'none');\n  const leaveDayLabel = positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed && !positioningUnresolved");
  replace("positioningPlan.requiresFlight ? (positioningBusy ? 'Consultando voo' : 'Dia anterior')", "positioningPlan.requiresFlight ? (positioningUnresolved ? (positioningBusy || positioningSearch?.status === 'checking' ? 'Consultando voo' : 'Confirmar posicionamento') : 'Dia anterior')");
  replace("(positioningBusy ? 'CONSULTANDO CACHE DO RADAR' : positioningPlan.sameDayConfirmed", "(positioningUnresolved ? 'POSICIONAMENTO A CONFIRMAR' : positioningPlan.sameDayConfirmed");
  replace('{positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed && <p className="cz-depart-warning">A base', '{positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed && !positioningUnresolved && <p className="cz-depart-warning">A base');
  replace('      {positioningPlan.requiresFlight && positioningPlan.sameDayConfirmed && <p', `      {positioningUnresolved && <p className="cz-depart-warning">A última rota confirmada até a apresentação supera 250 km. O voo de posicionamento ainda não está confirmado; aguarde a consulta ou confira as opções antes de definir o dia de saída.</p>}
      {positioningPlan.requiresFlight && positioningPlan.sameDayConfirmed && <p`);
  replace('<span>Sair em {leaveDayLabel}</span>', "<span>{positioningUnresolved ? 'Apresentação em' : 'Sair em'} {leaveDayLabel}</span>");
  replace("{positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed ? 'Posicionar em' : 'Sair em'}", "{positioningUnresolved ? 'Apresentação em' : positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed ? 'Posicionar em' : 'Sair em'}");
  replace("positioningPlan.requiresFlight ? 'Dia anterior' : estimate.leaveLabel;", "positioningPlan.requiresFlight ? (readPositioningSearch(event)?.status === 'none' ? 'Dia anterior' : 'Confirmar posicionamento') : estimate.leaveLabel;");
  fs.writeFileSync(file, source);
}
