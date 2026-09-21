import fs from 'node:fs';

const TAG = '[p2-738-vacation-work-first]';
const homePath = 'client/src/pages/Home.tsx';
const snippetPath = 'scripts/p2-738-vacation-work-first/vacation-home.snippet';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(TAG + ' missing file: ' + path);
  return fs.readFileSync(path, 'utf8');
}

function write(path, source) {
  fs.writeFileSync(path, source, 'utf8');
}

function insertAfter(source, anchor, value, label) {
  if (source.includes(value)) return source;
  if (!source.includes(anchor)) throw new Error(TAG + ' missing anchor: ' + label);
  return source.replace(anchor, anchor + '\n' + value);
}

function insertBefore(source, anchor, value, label) {
  if (source.includes(value.trim())) return source;
  if (!source.includes(anchor)) throw new Error(TAG + ' missing anchor: ' + label);
  return source.replace(anchor, value.trimEnd() + '\n\n' + anchor);
}

function patchBlock(source, startMarker, endMarker, transform, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(TAG + ' block not found: ' + label);
  const before = source.slice(start, end);
  const after = transform(before);
  return before === after ? source : source.slice(0, start) + after + source.slice(end);
}

let home = read(homePath);
const snippet = read(snippetPath).trim();

home = insertAfter(
  home,
  "import '@/components/v1399/premium.css';",
  "import '@/components/v14738/vacation.css';",
  'vacation css import',
);

home = insertBefore(
  home,
  'function Cockpit(',
  snippet,
  'vacation helper block',
);

home = patchBlock(home, 'function Cockpit(', 'function rosterCode(', (block) => {
  let next = block;
  const contextAnchor = '  const vacationEvent = nextVacationRestV14353(events, nowMs);';
  const contextLine = '  const vacationContextV14738 = vacationContextForEventsV14738(events, nowMs);';
  if (!next.includes(contextLine)) {
    if (!next.includes(contextAnchor)) throw new Error(TAG + ' missing Cockpit vacation context anchor');
    next = next.replace(contextAnchor, contextAnchor + '\n' + contextLine);
  }

  const emptyAnchor = '  if (!loaded || event.placeholder) {';
  const vacationReturn = "  if (vacationContextV14738) return <VacationModeCardV14738 context={vacationContextV14738} setView={setView} openMenu={openMenu}/>;";
  if (!next.includes(vacationReturn)) {
    if (!next.includes(emptyAnchor)) throw new Error(TAG + ' missing Cockpit empty-state anchor');
    next = next.replace(emptyAnchor, vacationReturn + '\n\n' + emptyAnchor);
  }
  return next;
}, 'Cockpit');

home = patchBlock(home, 'function Departure(', 'function MonthlyMapView(', (block) => {
  let next = block;
  const oldSignature = 'function Departure({ event }: { event: ZeroLeg }) {';
  const newSignature = 'function Departure({ event, events, setView }: { event: ZeroLeg; events: ZeroLeg[]; setView: (v: ZeroView) => void }) {';
  if (!next.includes(newSignature)) {
    if (!next.includes(oldSignature)) throw new Error(TAG + ' missing Departure signature');
    next = next.replace(oldSignature, newSignature);
  }

  const originAnchor = "  const [originLabel, setOriginLabel] = useState(() => eventRouteOriginLabel(event));";
  const vacationState = "  const [prepareVacationReturn, setPrepareVacationReturn] = useState(false);\n  const vacationContextV14738 = vacationContextForEventsV14738(events, Date.now());\n  if (vacationContextV14738 && !prepareVacationReturn) return <><Brand back/><VacationDepartureV14738 event={event} setView={setView} onPrepare={() => setPrepareVacationReturn(true)}/></>;";
  if (!next.includes('if (vacationContextV14738 && !prepareVacationReturn)')) {
    if (!next.includes(originAnchor)) throw new Error(TAG + ' missing Departure state anchor');
    next = next.replace(originAnchor, originAnchor + '\n' + vacationState);
  }
  return next;
}, 'Departure');

const oldRoute = "{view === 'departure' && <Departure event={event}/>}";
const newRoute = "{view === 'departure' && <Departure event={event} events={events} setView={setView}/>}"; 
if (!home.includes(newRoute)) {
  if (!home.includes(oldRoute)) throw new Error(TAG + ' missing Departure router anchor');
  home = home.replace(oldRoute, newRoute);
}

write(homePath, home);
console.log(TAG + ' applied successfully.');
