import fs from 'node:fs';
const file = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(file, 'utf8');
if (!source.includes('data-transit-operation="unknown"')) {
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error('[transit-availability] Missing anchor: ' + before.slice(0, 100));
    source = source.replace(before, after);
  };
  source = "import { evaluateTransitAvailability } from '@shared/transitAvailability.mjs';\n" + source;
  replace('<header><div><b>Rota ao vivo</b><span>{routeModeLabel} · atualização automática a cada minuto · {routeProviderLabel}</span></div>', '<header><div><b>{mapsMode === \'transit\' ? \'Itinerário de transporte público\' : \'Rota ao vivo\'}</b><span>{mapsMode === \'transit\' ? \'Itinerário atualizado a cada minuto · operação não verificada · \' + routeProviderLabel : routeModeLabel + \' · atualização automática a cada minuto · \' + routeProviderLabel}</span></div>');
  replace(" : 'Rota confirmada nesta consulta.'}", " : mapsMode === 'transit' ? 'Itinerário calculado nesta consulta; funcionamento do transporte não confirmado.' : 'Rota confirmada nesta consulta.'}");
  replace('    <div className="cz-route-kpis">', `    {mapsMode === 'transit' && <aside className="cz-mini-status" data-transit-operation="unknown" role="status"><strong>{evaluateTransitAvailability().label}</strong><p>Horários de serviço, últimas conexões e interrupções ainda não foram verificados para a viagem. Fonte operacional: não conectada. Atualização operacional: indisponível.</p><a className="cc-premium-action" href={buildGoogleMapsDirectionsUrl(origin, destination, 'driving')} target="_blank" rel="noreferrer">Conferir alternativa de carro</a></aside>}
    <div className="cz-route-kpis">`);
  fs.writeFileSync(file, source);
}
if (!source.includes('data-transit-presentation=')) {
  const replace = (before, after) => {
    if (!source.includes(before)) throw new Error('[transit-presentation] Missing anchor: ' + before.slice(0, 100));
    source = source.replace(before, after);
  };
  replace("import { evaluateTransitAvailability }", "import { transitDeparturePresentation }");
  replace("  const mapsMode = mode.includes('transit') ? 'transit' : 'driving';", "  const mapsMode = mode.includes('transit') ? 'transit' : 'driving';\n  const transitPresentation = transitDeparturePresentation(mapsMode);");
  replace('{evaluateTransitAvailability().label}', '{transitPresentation?.availability.label}');
  replace('type RoutePreviewInfo = {', "type RoutePreviewInfo = {\n  clientTravelMode?: 'driving' | 'transit';");
  const start = source.indexOf('async function fetchRoutePreviewInfo('), end = source.indexOf('\nfunction ', start);
  if (start < 0 || end < 0) throw new Error('[transit-presentation] Missing route fetch');
  let fetcher = source.slice(start, end);
  fetcher = fetcher.replace('return payload;', 'return { ...payload, clientTravelMode: mode };').replaceAll('configured: false,', 'configured: false,\n      clientTravelMode: mode,');
  source = source.slice(0, start) + fetcher + source.slice(end);
  replace('function smartDepartureEstimate(event: ZeroLeg, route: RoutePreviewInfo | null, margin: number): SmartDepartureEstimate {', "function smartDepartureEstimate(event: ZeroLeg, route: RoutePreviewInfo | null, margin: number, mode = route?.clientTravelMode || 'driving'): SmartDepartureEstimate {\n  const transitPresentation = transitDeparturePresentation(mode);");
  replace("if (liveMinutes > 0 && route?.clientRouteState !== 'stale') saveDepartureTravelMinutes(event, liveMinutes);", "if (!transitPresentation && liveMinutes > 0 && route?.clientRouteState !== 'stale') saveDepartureTravelMinutes(event, liveMinutes);");
  replace('    leaveLabel: formatTime(leaveDate),', "    leaveLabel: transitPresentation && !transitPresentation.showDepartureTime ? 'A confirmar' : formatTime(leaveDate),");
  replace("    sourceLabel: source === 'live'", "    sourceLabel: transitPresentation ? transitPresentation.availability.label : source === 'live'");
  const airportStart = source.indexOf('function AirportDeparture('), airportEnd = source.indexOf('\nfunction MonthlyMapView(', airportStart);
  if (airportStart < 0 || airportEnd < 0) throw new Error('[transit-presentation] Missing airport component');
  let airport = source.slice(airportStart, airportEnd);
  const edit = (before, after) => { if (!airport.includes(before)) throw new Error('[transit-presentation] Airport anchor: ' + before); airport = airport.replace(before, after); };
  edit('  const estimate = smartDepartureEstimate(event, route, margin);', '  const transitPresentation = transitDeparturePresentation(mode);\n  const estimate = smartDepartureEstimate(event, route, margin, mode);');
  edit('const primaryDepartureLabel = positioningPlan.requiresFlight', "const primaryDepartureLabel = transitPresentation && !transitPresentation.showDepartureTime ? 'A confirmar' : positioningPlan.requiresFlight");
  edit('const statusLabel = positioningPlan.requiresFlight', 'const statusLabel = transitPresentation?.statusLabel || (positioningPlan.requiresFlight');
  edit(": 'ESTIMATIVA PROTEGIDA';", ": 'ESTIMATIVA PROTEGIDA');");
  edit('data-departure-v14334="true"', 'data-departure-v14334="true" data-transit-presentation={transitPresentation?.availability.recommendation}');
  edit('<span>SAÍDA PREVISTA</span>', "<span>{transitPresentation ? 'TRANSPORTE PÚBLICO' : 'SAÍDA PREVISTA'}</span>");
  edit("${liveMinutes ? 'ready' : 'pending'}", "${liveMinutes && (!transitPresentation || transitPresentation.showDepartureTime) ? 'ready' : 'pending'}");
  edit("{positioningUnresolved ? 'Apresentação em' : 'Sair em'}", "{transitPresentation?.whenLabel || (positioningUnresolved ? 'Apresentação em' : 'Sair em')}");
  edit("{positioningUnresolved ? 'Apresentação em' : positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed ? 'Posicionar em' : 'Sair em'}", "{transitPresentation?.whenLabel || (positioningUnresolved ? 'Apresentação em' : positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed ? 'Posicionar em' : 'Sair em')}");
  edit('<span>Deslocamento</span>', "<span>{transitPresentation ? 'Duração do itinerário' : 'Deslocamento'}</span>");
  edit('<p>Escolha o trajeto completo. A saída considera o tempo real ou protegido de deslocamento e planeja a chegada ao aeroporto com a margem escolhida. O padrão é 15 minutos antes da apresentação.</p>', "<p>{transitPresentation ? 'Confira o itinerário e a operadora antes de definir a saída. A duração calculada não confirma horários de serviço, conexões ou interrupções para a viagem.' : 'Escolha o trajeto completo. A saída considera o tempo real ou protegido de deslocamento e planeja a chegada ao aeroporto com a margem escolhida. O padrão é 15 minutos antes da apresentação.'}</p>");
  edit('{!liveMinutes && !routeMismatch', '{!transitPresentation && !liveMinutes && !routeMismatch');
  edit("if (minutes && next?.clientRouteState === 'valid')", "if (!mode.includes('transit') && minutes && next?.clientRouteState === 'valid')");
  source = source.slice(0, airportStart) + airport + source.slice(airportEnd);
  replace('<small>Tempo com trânsito</small>', "<small>{mapsMode === 'transit' ? 'Duração do itinerário' : 'Tempo com trânsito'}</small>");
  replace('<small>Atraso do trânsito</small><strong>{route?.trafficDelayText || (route ? \'Sem dado\' : \'Calculando\')}</strong>', "<small>{mapsMode === 'transit' ? 'Interrupções' : 'Atraso do trânsito'}</small><strong>{mapsMode === 'transit' ? 'Não verificadas' : route?.trafficDelayText || (route ? 'Sem dado' : 'Calculando')}</strong>");
  replace('{route.message} O horário de saída se ajusta sozinho enquanto esta tela estiver aberta; com Telegram vinculado, o servidor continua monitorando.', "{route.message}{mapsMode === 'transit' ? ' O itinerário não confirma funcionamento nem ativa monitoramento operacional do transporte.' : ' O horário de saída se ajusta sozinho enquanto esta tela estiver aberta; com Telegram vinculado, o servidor continua monitorando.'}");
  fs.writeFileSync(file, source);
}
