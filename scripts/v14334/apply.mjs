import fs from 'node:fs';

const VERSION = '14.3.34';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const helperSnippet = fs.readFileSync('scripts/v14334/positioning-helpers.snippet', 'utf8').trim();
const recordSnippet = fs.readFileSync('scripts/v14334/positioning-record.snippet', 'utf8').trim();

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14334] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertBeforeRequired(source, anchor, value, label) {
  if (source.includes(value)) return source;
  if (!source.includes(anchor)) throw new Error(`[v14334] Âncora ausente: ${label}`);
  return source.replace(anchor, `${value}\n\n${anchor}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14334] Ponto de aplicação não localizado: ${label}`);
  return source.replace(before, after);
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[v14334] Bloco não localizado: ${label}. start=${start} end=${end}`);
  const before = source.slice(start, end);
  const after = transform(before);
  return after === before ? source : `${source.slice(0, start)}${after}${source.slice(end)}`;
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: posicionamento extra-base consulta o Radar com cache e mantém fallback seguro no dia anterior';`);

  next = insertBeforeRequired(next, 'function monthlyMapDestinations(events: ZeroLeg[]) {', helperSnippet, 'helpers de posicionamento pelo Radar');

  next = patchBlock(next, 'function departurePositioningRecord(', 'function departureConfirmedSameDayPositioning(', 'registro de posicionamento por evento', () => `${recordSnippet}\n`);

  next = patchBlock(next, 'function SmartCard(', 'function UpdateCenterView', 'card da Saída Inteligente', (block) => {
    let patched = block;
    if (!patched.includes('const positioningRecord = departurePositioningRecord(event);')) {
      patched = patched.replace(
        '  const positioningPlan = departurePositioningPlan(event, route);',
        '  const positioningPlan = departurePositioningPlan(event, route);\n  const positioningRecord = departurePositioningRecord(event);',
      );
    }
    patched = patched.replace(
      "  const departurePrimaryLabel = positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed ? 'Dia anterior' : estimate.leaveLabel;",
      "  const departurePrimaryLabel = positioningPlan.requiresFlight && positioningPlan.sameDayConfirmed && positioningRecord ? positioningRecord.flightNumber : positioningPlan.requiresFlight ? 'Dia anterior' : estimate.leaveLabel;",
    );
    patched = patched.replace(
      "  const departureRouteLabel = positioningPlan.requiresFlight ? `${positioningPlan.originAirport?.code || 'Aeroporto local'} → ${event.origin}` : `${eventRouteOriginLabel(event)} → ${event.origin}`;",
      "  const departureRouteLabel = positioningPlan.requiresFlight && positioningRecord ? positioningRecordLabel(positioningRecord) : positioningPlan.requiresFlight ? `${positioningPlan.originAirport?.code || 'Aeroporto local'} → ${event.origin}` : `${eventRouteOriginLabel(event)} → ${event.origin}`;",
    );
    return patched;
  });

  next = patchBlock(next, 'function Departure(', 'function MonthlyMapView', 'busca automática na tela de Saída Inteligente', (block) => {
    let patched = block;
    const originStateAnchor = "  const [originLabel, setOriginLabel] = useState(() => eventRouteOriginLabel(event));";
    if (!patched.includes('const [positioningRevision, setPositioningRevision]')) {
      patched = replaceRequired(
        patched,
        originStateAnchor,
        `${originStateAnchor}\n  const [positioningRevision, setPositioningRevision] = useState(0);\n  const [positioningBusy, setPositioningBusy] = useState(false);\n  useEffect(() => {\n    let alive = true;\n    if (event.placeholder) return () => { alive = false; };\n    const plan = departurePositioningPlan(event, route);\n    if (!plan.requiresFlight || plan.sameDayConfirmed || !plan.originAirport || plan.originAirport.code === String(event.origin || '').toUpperCase()) return () => { alive = false; };\n    setPositioningBusy(true);\n    discoverSameDayPositioningFlight(event, plan.originAirport.code, String(event.origin || ''))\n      .then(() => { if (alive) setPositioningRevision((value) => value + 1); })\n      .finally(() => { if (alive) setPositioningBusy(false); });\n    return () => { alive = false; };\n  }, [event.id, event.origin, event.presentation, event.departure, route?.distanceMeters, route?.durationSeconds]);`,
        'estado e efeito da busca econômica',
      );
    }

    if (!patched.includes('const positioningRecord = departurePositioningRecord(event);')) {
      patched = patched.replace(
        '  const positioningPlan = departurePositioningPlan(event, route);',
        '  const positioningPlan = departurePositioningPlan(event, route);\n  const positioningRecord = departurePositioningRecord(event);\n  const positioningSearch = readPositioningSearch(event);\n  void positioningRevision;',
      );
    }

    patched = patched.replace(
      "  const primaryDepartureLabel = positioningPlan.requiresFlight && !positioningPlan.sameDayConfirmed ? 'Selecionar voo' : routeMismatch ? '—' : estimate.leaveLabel;",
      "  const primaryDepartureLabel = positioningPlan.requiresFlight && positioningPlan.sameDayConfirmed && positioningRecord ? positioningRecord.flightNumber : positioningPlan.requiresFlight ? (positioningBusy ? 'Consultando voo' : 'Dia anterior') : routeMismatch ? '—' : estimate.leaveLabel;",
    );
    patched = patched.replace(
      "  const routeHeadline = positioningPlan.requiresFlight\n    ? `Posicionamento ${positioningPlan.originAirport?.code || 'aeroporto local'} → ${event.origin}`",
      "  const routeHeadline = positioningPlan.requiresFlight\n    ? positioningRecord ? positioningRecordLabel(positioningRecord) : `Posicionamento ${positioningPlan.originAirport?.code || 'aeroporto local'} → ${event.origin}`",
    );
    patched = patched.replace(
      "  const statusLabel = positioningPlan.requiresFlight ? (positioningPlan.sameDayConfirmed ? 'VOO DE POSICIONAMENTO CONFIRMADO' : 'PLANEJAR VOO NO DIA ANTERIOR') : routeMismatch ? 'REVISAR PROGRAMAÇÃO' : liveMinutes ? 'TRÂNSITO ATUALIZADO' : routePending ? 'CALCULANDO TRÂNSITO' : 'ESTIMATIVA PROTEGIDA';",
      "  const statusLabel = positioningPlan.requiresFlight ? (positioningBusy ? 'CONSULTANDO CACHE DO RADAR' : positioningPlan.sameDayConfirmed ? 'VOO DE POSICIONAMENTO LOCALIZADO' : 'PLANEJAR VOO NO DIA ANTERIOR') : routeMismatch ? 'REVISAR PROGRAMAÇÃO' : liveMinutes ? 'TRÂNSITO ATUALIZADO' : routePending ? 'CALCULANDO TRÂNSITO' : 'ESTIMATIVA PROTEGIDA';",
    );

    const confirmedAnchor = '{positioningPlan.requiresFlight && positioningPlan.sameDayConfirmed && <p className="cz-mini-status">Voo de posicionamento no mesmo dia confirmado com chegada antes da apresentação.</p>}';
    const confirmedReplacement = '{positioningPlan.requiresFlight && positioningPlan.sameDayConfirmed && <p className="cz-mini-status">{positioningRecord ? `${positioningRecordLabel(positioningRecord)} · ${positioningRecord.source}` : \'Voo de posicionamento no mesmo dia localizado com chegada antes da apresentação.\'}</p>}\n      {positioningPlan.requiresFlight && positioningBusy && <p className="cz-mini-status">Consultando primeiro o cache econômico do Radar e validando a chegada no aeroporto de apresentação.</p>}\n      {positioningPlan.requiresFlight && !positioningBusy && !positioningPlan.sameDayConfirmed && positioningSearch && <p className="cz-mini-status">{positioningSearch.message}{positioningSearch.source ? ` · ${positioningSearch.source}` : \'\'}</p>}';
    patched = replaceRequired(patched, confirmedAnchor, confirmedReplacement, 'mensagem do voo de posicionamento');

    if (!patched.includes('data-departure-v14334="true"')) {
      patched = patched.replace('data-departure-v14331="true"', 'data-departure-v14331="true" data-departure-v14334="true"');
    }
    return patched;
  });

  return next;
});

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
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
fs.writeFileSync('client/public/release.json', `${JSON.stringify({ version: VERSION, channel: 'web', updatePolicy: 'automatic', notes: 'Posicionamento extra-base consulta o cache do Radar, valida chegada segura e mantém o dia anterior quando não houver opção válida.' }, null, 2)}\n`, 'utf8');

console.log(`[v14334] CrewCheck Web ${VERSION}: posicionamento extra-base consulta o Radar apenas até 72h antes, limita confirmações externas, persiste por evento e mantém fallback seguro no dia anterior.`);
