import fs from 'node:fs';

const VERSION = '14.3.31';
const VERSION_DIGITS = VERSION.replace(/\./g, '');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14331] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[v14331] Âncora ausente: ${label}`);
  return source.replace(anchor, `${value.trimEnd()}\n\n${anchor}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14331] Ponto de aplicação não localizado: ${label}`);
  return source.replace(before, after);
}

function blockBounds(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14331] Bloco não localizado: ${label}. start=${start} end=${end}`);
  return { start, end };
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const { start, end } = blockBounds(source, startMarker, endMarker, label);
  const before = source.slice(start, end);
  const after = transform(before);
  return after === before ? source : `${source.slice(0, start)}${after}${source.slice(end)}`;
}

const selectorHelpers = `function validDepartureClock(value: unknown): boolean {
  return /^\\d{1,2}:\\d{2}$/.test(String(value || '').trim());
}
function hasPublishedPresentationForDeparture(event: ZeroLeg): boolean {
  if (!validDepartureClock(event.presentation)) return false;
  const canonicalFallback = event.kind === 'flight'
    && event.canonical?.sourceConfidence === 'media'
    && String(event.presentation || '') === String(event.departure || '');
  return !canonicalFallback;
}
function departurePresentationDateTime(event: ZeroLeg): Date {
  const hasPublishedPresentation = hasPublishedPresentationForDeparture(event);
  const clock = hasPublishedPresentation ? event.presentation : validDepartureClock(event.departure) ? event.departure : '';
  const value = eventClockDate(event, clock);
  if (!hasPublishedPresentation && validDepartureClock(event.departure)) value.setMinutes(value.getMinutes() - 60);
  return value;
}
function departureEventCode(event: ZeroLeg): string {
  return [event.flightNumber, (event.day as any)?.type, (event.day as any)?.pairingCode, (event.day as any)?.description, (event.day as any)?.rawText]
    .map((value) => String(value || '').toUpperCase())
    .join(' ');
}
function isDepartureEligibleEvent(event: ZeroLeg): boolean {
  if (event.placeholder || event.kind === 'stay' || event.canonical?.kind === 'rest') return false;
  const code = departureEventCode(event);
  if (/(^|\\s)(DO|DOF|DOP|DOPR|OFF|FOLGA|FERIAS|FÉRIAS|EAD|VC)(\\s|$)/.test(code)) return false;
  if (/(SOBREAVISO|HSB)/.test(code) && !/(ACION|ACIONADO|CHAMAD|VOO|RESERVA|LA\\d{3,4})/.test(code)) return false;
  if (event.kind === 'flight') {
    return event.canonical?.showPresentation !== false
      && validDepartureClock(event.departure)
      && /^[A-Z]{3}$/.test(String(event.origin || '').toUpperCase())
      && Boolean(String(event.flightNumber || '').trim());
  }
  if (event.kind !== 'duty' || !validDepartureClock(event.presentation)) return false;
  return /(RESERVA|(^|\\s)RES(\\s|$)|CRM|MCK|TREIN|REUNIAO|REUNIÃO|SIMULADOR|CHECK|BRIEFING|CURSO|EXAME|MEDICAL|RCFI)/.test(code);
}
function nextDepartureEvent(events: ZeroLeg[], now = new Date()): ZeroLeg {
  const candidates = events
    .filter(isDepartureEligibleEvent)
    .map((event) => ({ event, presentationAt: departurePresentationDateTime(event), startsAt: eventStartDateTime(event) }))
    .filter((item) => Number.isFinite(item.presentationAt.getTime()) && Number.isFinite(item.startsAt.getTime()))
    .sort((a, b) => a.presentationAt.getTime() - b.presentationAt.getTime());
  const awaitingDeparture = candidates.find((item) => item.presentationAt.getTime() <= now.getTime() && item.startsAt.getTime() >= now.getTime());
  if (awaitingDeparture) return awaitingDeparture.event;
  const future = candidates.find((item) => item.presentationAt.getTime() > now.getTime());
  return future?.event || noFutureLeg(events);
}
function departureCivilDateLabel(event: ZeroLeg): string {
  const value = departurePresentationDateTime(event);
  if (!Number.isFinite(value.getTime())) return 'Data a confirmar';
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(value);
}`;

const routeSafetyHelpers = `function departureOriginAirportDistanceKm(event: ZeroLeg, origin = eventRouteOrigin(event)): number | null {
  const pair = coordinatePair(origin);
  const airport = airportPoint(event.origin);
  if (!pair || !airport) return null;
  const current: AirportMapPoint = { code: 'ATUAL', lat: pair.lat, lon: pair.lng };
  return routeDistanceKm(current, airport);
}
function departureRouteMismatch(event: ZeroLeg, route: RoutePreviewInfo | null, origin = eventRouteOrigin(event)): boolean {
  const localDistance = departureOriginAirportDistanceKm(event, origin);
  const routeMinutes = routeDurationMinutes(route);
  const routeDistanceKmValue = Number(route?.distanceMeters || 0) / 1000;
  const message = String(route?.message || '').toLowerCase();
  const explicitMismatch = /não combina|nao combina|incompat[ií]vel|trajeto de \\d+ horas|rota terrestre.*programa/.test(message);
  return explicitMismatch
    || (localDistance != null && localDistance > 350)
    || routeMinutes > 360
    || routeDistanceKmValue > 350;
}`;

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Saída Inteligente ligada à primeira apresentação real, data civil e aeroporto de origem';`);

  next = insertBeforeRequired(next, 'function currentDayAnchor(events: ZeroLeg[]) {', selectorHelpers, 'seletor canônico da Saída Inteligente');
  next = insertBeforeRequired(next, 'function monthlyMapDestinations(events: ZeroLeg[]) {', routeSafetyHelpers, 'proteção geográfica da rota');

  next = patchBlock(next, 'function smartDepartureEstimate(', 'function eventClockDate', 'motor da Saída Inteligente', (block) => {
    let patched = block;
    if (!patched.includes('const routeMismatch = departureRouteMismatch(event, route);')) {
      patched = replaceRequired(
        patched,
        '  const rawLiveMinutes = routeDurationMinutes(route);',
        '  const routeMismatch = departureRouteMismatch(event, route);\n  const rawLiveMinutes = routeMismatch ? 0 : routeDurationMinutes(route);',
        'bloqueio de rota incompatível no cálculo',
      );
    }
    patched = patched.replace(
      "  const hasPublishedPresentation = /^\\d{1,2}:\\d{2}$/.test(String(event.presentation || '').trim());",
      '  const hasPublishedPresentation = hasPublishedPresentationForDeparture(event);',
    );
    return patched;
  });

  next = patchBlock(next, 'function GoogleMapsRoutePreview(', 'function isAdmin()', 'prévia e monitoramento da rota', (block) => {
    let patched = block;
    patched = patched.replace(
      "    if (mapsMode !== 'driving') { setMonitor(null); return; }",
      "    if (mapsMode !== 'driving' || departureRouteMismatch(event, route, origin)) { setMonitor(null); return; }",
    );
    patched = patched.replace(
      '  }, [event.id, event.presentation, origin, destination, mapsMode, margin]);',
      '  }, [event.id, event.presentation, origin, destination, mapsMode, margin, route?.durationInTrafficSeconds, route?.durationSeconds, route?.distanceMeters, route?.message]);',
    );
    return patched;
  });

  next = patchBlock(next, 'function Departure(', 'function MonthlyMapView', 'tela da Saída Inteligente', (block) => {
    let patched = block;
    if (!patched.includes('const routeMismatch = departureRouteMismatch(event, route);')) {
      patched = replaceRequired(
        patched,
        '  const rawLiveMinutes = routeDurationMinutes(route);\n  const liveMinutes = rawLiveMinutes >= 5 && rawLiveMinutes <= 300 ? rawLiveMinutes : 0;',
        '  const routeMismatch = departureRouteMismatch(event, route);\n  const rawLiveMinutes = routeMismatch ? 0 : routeDurationMinutes(route);\n  const liveMinutes = rawLiveMinutes >= 5 && rawLiveMinutes <= 300 ? rawLiveMinutes : 0;',
        'estado de incompatibilidade dentro da tela',
      );
    }
    patched = patched.replace(
      "  const leaveDayLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(estimate.leaveDate);",
      '  const leaveDayLabel = departureCivilDateLabel(event);',
    );
    patched = patched.replace(
      "  const statusLabel = liveMinutes ? 'TRÂNSITO ATUALIZADO' : routePending ? 'CALCULANDO TRÂNSITO' : 'ESTIMATIVA PROTEGIDA';",
      "  const statusLabel = routeMismatch ? 'REVISAR PROGRAMAÇÃO' : liveMinutes ? 'TRÂNSITO ATUALIZADO' : routePending ? 'CALCULANDO TRÂNSITO' : 'ESTIMATIVA PROTEGIDA';",
    );
    patched = patched.replace(
      '<strong className="cz-depart-time">{estimate.leaveLabel}</strong>',
      '<strong className="cz-depart-time">{routeMismatch ? \'—\' : estimate.leaveLabel}</strong>',
    );
    patched = patched.replace(
      '<h2>{originLabel} → {event.origin}</h2>',
      '<h2>{event.kind === \'flight\' ? `${event.flightNumber} · ${event.origin} → ${event.destination}` : `${event.flightNumber} · ${event.origin}`}</h2>',
    );
    patched = patched.replace(
      '<div className="cz-depart-detail"><span>{modeLabel}</span><span>{estimate.travelLabel} de deslocamento</span><span>margem {estimate.marginMinutes} min</span><span>apresentação {estimate.presentationLabel}</span></div>',
      '<div className="cz-depart-detail"><span>{originLabel} → aeroporto de apresentação {event.origin}</span><span>{modeLabel}</span><span>{estimate.travelLabel} de deslocamento</span><span>margem {estimate.marginMinutes} min</span><span>apresentação {estimate.presentationLabel}</span></div>',
    );
    patched = patched.replace(
      '{rawLiveMinutes > 300 && <p className="cz-depart-warning">A rota terrestre encontrada não combina com esta programação. Mantive uma estimativa local protegida e não usei o trajeto de {Math.floor(rawLiveMinutes / 60)} horas.</p>}',
      '{routeMismatch && <p className="cz-depart-warning">A localização atual não combina com o aeroporto de apresentação desta programação. O cálculo de saída e os alertas automáticos foram pausados para evitar um horário incorreto. Confirme a escala, o voo e a localização.</p>}',
    );
    patched = patched.replace(
      '<span>Sair em {leaveDayLabel}</span><strong>{estimate.leaveLabel}</strong>',
      '<span>Sair em {leaveDayLabel}</span><strong>{routeMismatch ? \'—\' : estimate.leaveLabel}</strong>',
    );
    patched = patched.replace('{!liveMinutes && <p className="cz-mini-status">', '{!liveMinutes && !routeMismatch && <p className="cz-mini-status">');
    if (!patched.includes('margin={margin} onRoute=')) {
      patched = patched.replace('event={event} mode={mode} onRoute=', 'event={event} mode={mode} margin={margin} onRoute=');
    }
    patched = patched.replace('data-departure-v14327="true"', 'data-departure-v14327="true" data-departure-v14331="true"');
    return patched;
  });

  next = patchBlock(next, 'function Cockpit(', 'function rosterCode', 'Cockpit', (block) => {
    let patched = block;
    if (!patched.includes('const departureEvent = nextDepartureEvent(events);')) {
      patched = patched.replace('  const event = nextFlight(events);', '  const event = nextFlight(events);\n  const departureEvent = nextDepartureEvent(events);');
    }
    patched = patched.replace('<SmartCard event={event} setView={setView}/>', '<SmartCard event={departureEvent} setView={setView}/>');
    return patched;
  });

  if (!next.includes('const departureEvent = nextDepartureEvent(events);\n  const compliance = currentCompliance(bundle);')) {
    next = replaceRequired(
      next,
      '  const event = nextFlight(events);\n  const flightEvent = nextRealFlight(events);\n  const compliance = currentCompliance(bundle);',
      '  const event = nextFlight(events);\n  const flightEvent = nextRealFlight(events);\n  const departureEvent = nextDepartureEvent(events);\n  const compliance = currentCompliance(bundle);',
      'evento dedicado da Saída Inteligente no Home',
    );
  }
  next = next.replace("{view === 'departure' && <Departure event={event}/>}", "{view === 'departure' && <Departure event={departureEvent}/>}");
  next = next.replace("{view === 'wakeup' && <WakeupView event={event}/>}", "{view === 'wakeup' && <WakeupView event={departureEvent}/>}");

  return next;
});

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/, `data-crewcheck-release="${VERSION}"`)
  .replace(/<meta name="crewcheck-release" content="[^"]+"\s*\/>/, `<meta name="crewcheck-release" content="${VERSION}" />`)
  .replace(/crewcheck-cache-reset-[^']+/, `crewcheck-cache-reset-${VERSION.replace(/\./g, '-')}`)
  .replace(/manifest\.json\?v=[^"']+/, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/\/sw\.js\?v=\d+/, `/sw.js?v=${VERSION_DIGITS}`)
  .replace(/var currentRelease = '[^']+';/, `var currentRelease = '${VERSION}';`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'crewcheck-v${VERSION}-shell';`)
  .replace(/const RUNTIME_CACHE = '[^']+';/, `const RUNTIME_CACHE = 'crewcheck-v${VERSION}-runtime';`), { optional: true });
fs.mkdirSync('client/public', { recursive: true });
fs.writeFileSync('client/public/release.json', `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic' }, null, 2)}\n`, 'utf8');

console.log(`[v14331] CrewCheck Web ${VERSION}: Saída Inteligente usa a primeira apresentação real, preserva data/voo/origem e bloqueia rotas incompatíveis sem fallback silencioso.`);
