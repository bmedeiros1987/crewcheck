import fs from 'node:fs';

const HOME_PATH = 'client/src/pages/Home.tsx';
const CSS_PATH = 'client/src/components/v1406/premium-layout.css';
const MARKER = 'p0-smart-mobility-radar-v1';

function mustRead(path) {
  if (!fs.existsSync(path)) throw new Error(`[smart-mobility] arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function blockBounds(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`[smart-mobility] bloco não localizado: ${label}. start=${start} end=${end}`);
  return { start, end };
}

function patchBlock(source, startMarker, endMarker, label, transform) {
  const { start, end } = blockBounds(source, startMarker, endMarker, label);
  const before = source.slice(start, end);
  const after = transform(before);
  return after === before ? source : `${source.slice(0, start)}${after}${source.slice(end)}`;
}

function insertBefore(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`[smart-mobility] âncora ausente: ${label}`);
  return source.replace(anchor, `${value.trimEnd()}\n\n${anchor}`);
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[smart-mobility] ponto de aplicação ausente: ${label}`);
  return source.replace(before, after);
}

const homeStandbyHelper = `function isHomeStandbyDepartureEvent(event: ZeroLeg): boolean {
  if (event.kind !== 'duty') return false;
  // Deliberadamente usa apenas identidade local do evento. day.rawText agrega o dia
  // inteiro e, em 08/09, contém HSB + ASB; usá-lo contaminaria a reserva presencial.
  const ownIdentity = [
    event.flightNumber,
    event.title,
    (event.canonical as any)?.flightNumber,
    (event.canonical as any)?.pairingCode,
    (event.canonical as any)?.activityCode,
  ].map((value) => String(value || '').trim().toUpperCase()).filter(Boolean).join(' ');
  return /(^|\\s)(HSB|HOME[ _-]*STANDBY|SOBREAVISO)(\\s|$)/.test(ownIdentity);
}`;

const radarTargetHelper = `function departureRadarTarget(event: ZeroLeg, radarEvent?: ZeroLeg): ZeroLeg {
  if (event.kind === 'flight' && !event.placeholder) return event;
  if (!radarEvent || radarEvent.placeholder || radarEvent.kind !== 'flight') return placeholderLeg();
  const activityStart = eventStartDateTime(event);
  const activityEnd = eventEndDateTime(event);
  const flightStart = eventStartDateTime(radarEvent);
  if (![activityStart, activityEnd, flightStart].every((date) => Number.isFinite(date.getTime()))) return placeholderLeg();
  const sameCivilDay = dateChip(activityStart) === dateChip(flightStart);
  const samePresentationAirport = String(radarEvent.origin || '').trim().toUpperCase() === String(event.origin || '').trim().toUpperCase();
  const inOperationalWindow = flightStart.getTime() >= activityStart.getTime()
    && flightStart.getTime() <= activityEnd.getTime() + 6 * 60 * 60_000;
  return sameCivilDay && samePresentationAirport && inOperationalWindow ? radarEvent : placeholderLeg();
}`;

let home = mustRead(HOME_PATH);

home = insertBefore(home, 'function isDepartureEligibleEvent(', homeStandbyHelper, 'helper de HSB local');
home = patchBlock(home, 'function isDepartureEligibleEvent(', 'function nextDepartureEvent(', 'seletor de deslocamento', (block) => {
  if (block.includes('isDepartureRestEvent(event) || isHomeStandbyDepartureEvent(event)')) return block;
  return replaceRequired(
    block,
    '  if (isDepartureRestEvent(event)) return false;',
    '  if (isDepartureRestEvent(event) || isHomeStandbyDepartureEvent(event)) return false;',
    'HSB não pode ancorar deslocamento físico',
  );
});

home = insertBefore(home, 'function Departure(', radarTargetHelper, 'alvo operacional do Radar');

home = patchBlock(home, 'function Departure(', 'function MonthlyMapView', 'Deslocamento Inteligente', (block) => {
  let patched = block;

  patched = patched.replace(
    'function Departure({ event }: { event: ZeroLeg })',
    'function Departure({ event, radarEvent }: { event: ZeroLeg; radarEvent?: ZeroLeg })',
  );
  if (!patched.includes('radarEvent?: ZeroLeg')) throw new Error('[smart-mobility] assinatura de Departure não atualizada');

  if (!patched.includes('const radarTarget = departureRadarTarget(event, radarEvent);')) {
    const modeAnchor = "  const modeLabel = departureModes.find((item) => item.id === mode)?.label || 'Automático';";
    if (!patched.includes(modeAnchor)) throw new Error('[smart-mobility] modeLabel não localizado em Departure');
    patched = patched.replace(modeAnchor, `${modeAnchor}\n  const radarTarget = departureRadarTarget(event, radarEvent);\n  const radar = useRadarSnapshot(radarTarget);\n  const radarAvailable = !radarTarget.placeholder;`);
  }

  patched = patched
    .replaceAll('Planejador de Saída', 'Deslocamento Inteligente')
    .replaceAll('Saída Inteligente aguardando escala real', 'Deslocamento Inteligente aguardando escala real')
    .replaceAll('SAÍDA PREVISTA', 'APRESENTAÇÃO INTELIGENTE')
    .replaceAll('HORA RECOMENDADA PARA SAIR', 'HORÁRIO RECOMENDADO');

  if (!patched.includes('cc-smart-mobility-radar')) {
    const radarMarkup = `{radarAvailable && <div className="cc-smart-mobility-radar"><Radar size={17}/><span><strong>Radar · {radarTarget.flightNumber}</strong><small>{radar?.updatedAt ? \`${'${'}safe(radar.status, 'Programado')} · portão ${'${'}safe(radar.gate, 'a confirmar')} · terminal ${'${'}safe(radar.terminal, 'a confirmar')}\` : 'Sincronizando status operacional…'}</small></span></div>}\n      `;
    const detailAnchor = '<div className="cz-depart-detail">';
    const detailIndex = patched.indexOf(detailAnchor);
    if (detailIndex >= 0) {
      patched = `${patched.slice(0, detailIndex)}${radarMarkup}${patched.slice(detailIndex)}`;
    } else {
      const mapIndex = patched.indexOf('<GoogleMapsRoutePreview');
      if (mapIndex < 0) throw new Error('[smart-mobility] local para status Radar não encontrado');
      patched = `${patched.slice(0, mapIndex)}${radarMarkup}${patched.slice(mapIndex)}`;
    }
  }

  if (!patched.includes('cc-smart-mobility-settings')) {
    // O layout passou por vários patches e o título da toolbox mudou ao longo das
    // versões. Localizamos a seção pelos próprios departureModes, não por texto.
    const modesIndex = patched.indexOf('departureModes.map');
    const mapStart = modesIndex >= 0 ? patched.indexOf('<GoogleMapsRoutePreview', modesIndex) : -1;
    const toolboxStart = modesIndex >= 0 ? patched.lastIndexOf('<section className="cz-toolbox', modesIndex) : -1;
    if (modesIndex < 0 || toolboxStart < 0 || mapStart < 0 || toolboxStart >= mapStart) {
      throw new Error(`[smart-mobility] controles de trajeto não localizados. modes=${modesIndex} toolbox=${toolboxStart} map=${mapStart}`);
    }
    const toolbox = patched.slice(toolboxStart, mapStart);
    const wrapped = `<details className="cc-smart-mobility-settings"><summary><Settings size={18}/><span>Ajustar trajeto e margem</span><small>{modeLabel} · margem {margin} min</small></summary>${toolbox}</details>`;
    patched = `${patched.slice(0, toolboxStart)}${wrapped}${patched.slice(mapStart)}`;
  }

  return patched;
});

home = home.replace(
  "{view === 'departure' && <Departure event={departureEvent}/>}",
  "{view === 'departure' && <Departure event={departureEvent} radarEvent={flightEvent}/>}",
);
if (!home.includes("<Departure event={departureEvent} radarEvent={flightEvent}/>")) {
  throw new Error('[smart-mobility] ligação Departure ↔ Radar não aplicada');
}

home = home.replace("['departure','Saída',Navigation]", "['departure','Desloc.',Navigation]");

home = patchBlock(home, 'function GoogleMapsRoutePreview(', 'function isAdmin()', 'alertas de rota', (block) => {
  let patched = block;
  if (!patched.includes('const rawIncidents = Array.isArray(route?.incidents)')) {
    const incidentLine = patched.match(/^(\s*)const incidents = Array\.isArray\(route\?\.incidents\) \? ([^\n;]+) : \[\];/m);
    if (!incidentLine) throw new Error('[smart-mobility] lista de incidentes não localizada');
    const indent = incidentLine[1];
    const rhs = incidentLine[2];
    patched = patched.replace(
      incidentLine[0],
      `${indent}const rawIncidents = Array.isArray(route?.incidents) ? ${rhs} : [];\n${indent}const incidents = rawIncidents.filter((item) => item.roadClosure || item.severity === 'critical' || Number(item.delaySeconds || 0) >= 300);`,
    );
  }
  patched = patched.replace("const title = critical ? 'Bloqueio ou ocorrência crítica na rota' : 'Nova ocorrência na rota';", "const title = critical ? 'Bloqueio crítico na rota' : 'Trânsito com impacto na rota';");
  return patched;
});

if (!home.includes('Number(item.delaySeconds || 0) >= 300')) throw new Error('[smart-mobility] filtro de impacto de trânsito ausente');
if (home.includes("const title = critical ? 'Bloqueio ou ocorrência crítica na rota' : 'Nova ocorrência na rota';")) throw new Error('[smart-mobility] aviso genérico de ocorrência ainda ativo');

home = `${home.trimEnd()}\n// ${MARKER}\n`;
fs.writeFileSync(HOME_PATH, home, 'utf8');

let css = mustRead(CSS_PATH);
if (!css.includes(`/* ${MARKER} */`)) {
  css = `${css.trimEnd()}\n\n/* ${MARKER} */
.cz-depart-time {
  white-space: nowrap !important;
  word-break: keep-all !important;
  overflow-wrap: normal !important;
  font-variant-numeric: tabular-nums;
  max-width: 100% !important;
  font-size: clamp(3rem, 15vw, 6.25rem) !important;
  line-height: .92 !important;
}
.cc-smart-mobility-settings {
  border: 1px solid rgba(148, 163, 184, .2);
  border-radius: 18px;
  overflow: hidden;
}
.cc-smart-mobility-settings > summary {
  list-style: none;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 14px 16px;
  cursor: pointer;
}
.cc-smart-mobility-settings > summary::-webkit-details-marker { display: none; }
.cc-smart-mobility-settings > summary small { opacity: .72; text-align: right; }
.cc-smart-mobility-settings > .cz-toolbox { margin: 0 !important; border: 0 !important; border-radius: 0 !important; }
.cc-smart-mobility-radar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(14, 165, 233, .08);
  border: 1px solid rgba(56, 189, 248, .2);
}
.cc-smart-mobility-radar span { display: grid; gap: 2px; min-width: 0; }
.cc-smart-mobility-radar small { opacity: .78; overflow-wrap: anywhere; }
@media (max-width: 720px) {
  .cz-depart-time { font-size: clamp(3rem, 14vw, 4.8rem) !important; }
  .cz-depart-kpis { display: none !important; }
  .cc-smart-mobility-settings > summary { grid-template-columns: auto 1fr; }
  .cc-smart-mobility-settings > summary small { grid-column: 2; text-align: left; }
}
`;
  fs.writeFileSync(CSS_PATH, css, 'utf8');
}

console.log('[smart-mobility] HSB excluído da âncora física; ASB preservado; Deslocamento Inteligente + Radar contextual + alertas de rota com impacto real aplicados.');
