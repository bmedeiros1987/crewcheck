import fs from 'node:fs';

const TAG = '[p1-744-web-roster-footer-parity]';
const homePath = 'client/src/pages/Home.tsx';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(TAG + ' missing file: ' + path);
  return fs.readFileSync(path, 'utf8');
}
function write(path, source) {
  fs.writeFileSync(path, source, 'utf8');
}
function insertBefore(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(TAG + ' missing anchor: ' + label);
  return source.replace(anchor, value.trimEnd() + '\n\n' + anchor);
}

let home = read(homePath);

const helper = `function webNonFlightSubtitleV14744(
  day: RosterDay,
  event: Pick<CanonicalRosterEvent, 'presentation' | 'departure' | 'arrival'>,
  base: string,
): string {
  const normalize = (value: unknown) => String(value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .trim()
    .toUpperCase();
  const type = normalize((day as any)?.type);
  const pairing = normalize((day as any)?.pairingCode);
  const specializedDayOff = type === 'DO' && ['VC', 'FERIAS', 'DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA'].includes(pairing);
  const formalOperation = ['ASB', 'HSB', 'SA', 'RES', 'RSV', 'EAD'].includes(type);
  const code = formalOperation ? type : specializedDayOff ? pairing : (type || pairing);
  const label = ({
    VC: 'Férias',
    FERIAS: 'Férias',
    DO: 'Folga',
    DOF: 'Folga',
    DOP: 'Folga programada',
    DOPR: 'Folga programada',
    DR: 'Folga pedida',
    OFF: 'Folga',
    FOLGA: 'Folga',
    REST: 'Repouso',
    REPOUSO: 'Repouso',
    DESCANSO: 'Repouso',
    HSB: 'Sobreaviso',
    SA: 'Sobreaviso',
    ASB: 'Reserva',
    RES: 'Reserva',
    RSV: 'Reserva',
    EAD: 'Treinamento EAD',
  } as Record<string, string>)[code] || code || 'Programação';
  const cleanClock = (value: unknown) => {
    const match = String(value || '').match(/(\\d{1,2}):(\\d{2})/);
    return match ? String(Number(match[1])).padStart(2, '0') + ':' + match[2] : '';
  };
  const start = cleanClock((day as any)?.dutyReport || event.presentation || event.departure);
  const end = cleanClock((day as any)?.dutyDebrief || event.arrival);
  const range = start && end ? start + ' → ' + end : start ? 'Início ' + start : end ? 'Fim ' + end : '';
  const safeBase = String(base || '').trim().toUpperCase() || '—';

  if (['VC', 'FERIAS', 'DO', 'DOF', 'DOP', 'DOPR', 'DR', 'OFF', 'FOLGA'].includes(code)) {
    return label + ' · Sem programação operacional · Base ' + safeBase;
  }
  if (['REST', 'REPOUSO', 'DESCANSO'].includes(code)) {
    return label + (range ? ' · ' + range : '') + ' · Base ' + safeBase;
  }
  if (['HSB', 'SA', 'ASB', 'RES', 'RSV', 'EAD'].includes(code)) {
    return label + (range ? ' · ' + range : '') + ' · Base ' + safeBase;
  }
  return label + (range ? ' · ' + range : '') + ' · Base ' + safeBase;
}`;

home = insertBefore(home, 'function buildLegs(roster: CrewRoster): ZeroLeg[] {', helper, 'structured Web non-flight subtitle helper');

const oldSubtitle = "subtitle: kind === 'stay' ? `Hotel/pernoite em ${safe((day as any).hotel || city(base), city(base))}` : safe((day as any).description || (day as any).rawText, 'Programação operacional'),";
const newSubtitle = "subtitle: kind === 'stay' ? `Hotel/pernoite em ${safe((day as any).hotel || city(base), city(base))}` : webNonFlightSubtitleV14744(day, event, base),";
if (!home.includes(newSubtitle)) {
  if (!home.includes(oldSubtitle)) throw new Error(TAG + ' non-flight subtitle anchor missing');
  home = home.replace(oldSubtitle, newSubtitle);
}

write(homePath, home);
console.log(TAG + ' applied successfully.');
