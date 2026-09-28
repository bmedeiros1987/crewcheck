import fs from 'node:fs';

const VERSION = '14.3.96';
const file = 'client/src/pages/Home.tsx';
if (!fs.existsSync(file)) throw new Error('[v14388] Home.tsx ausente.');
let source = fs.readFileSync(file, 'utf8');

const oldStart = `function HotelsView({ events }: { events: ZeroLeg[] }) {
  const stays = events.filter((event) => event.kind === 'stay' || event.hotel);
  const [saved, setSaved] = useState<any[]>([]);
  const [companions, setCompanions] = useState<Record<string, any[]>>({});
  const [selectedEventId, setSelectedEventId] = useState(() => stays[0]?.id || '');`;

const legacyStart = `function contextualStayId(stays: ZeroLeg[], now = new Date()): string {
  if (!stays.length) return '';
  const localDay = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  const dated = stays
    .map((event) => ({ event, date: rosterDayIso(event.day) }))
    .filter((item) => /^\\d{4}-\\d{2}-\\d{2}$/.test(item.date));
  const current = dated.find((item) => item.date === localDay);
  if (current) return current.event.id;
  const future = dated.filter((item) => item.date > localDay).sort((a, b) => a.date.localeCompare(b.date) || a.event.id.localeCompare(b.event.id))[0];
  if (future) return future.event.id;
  const past = dated.filter((item) => item.date < localDay).sort((a, b) => b.date.localeCompare(a.date) || a.event.id.localeCompare(b.event.id))[0];
  if (past) return past.event.id;
  return [...stays].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]?.id || '';
}`;

const previousSharedAdapter = `function contextualStayId(stays: ZeroLeg[], now = new Date()): string {
  const selected = selectContextualStay(
    stays.map((event) => ({ id: event.id, date: event.date, event })),
    now,
  );
  return selected?.event.id || '';
}`;

const sharedAdapter = `function contextualStayId(stays: ZeroLeg[], now = new Date()): string {
  const selected = selectContextualStay(
    stays.map((event) => ({
      id: event.id,
      date: event.date,
      startAt: event.kind === 'stay' ? event.canonical?.startDateTime : null,
      endAt: event.kind === 'stay' ? event.canonical?.endDateTime : null,
      event,
    })),
    now,
  );
  return selected?.event.id || '';
}`;

if (!source.includes("from '@/lib/stayContext'")) {
  const anchor = "import { airportCity } from '@/lib/airports';";
  if (!source.includes(anchor)) throw new Error('[v14388] âncora de import não localizada.');
  source = source.replace(anchor, `${anchor}\nimport { selectContextualStay } from '@/lib/stayContext';`);
}

if (source.includes(legacyStart)) source = source.replace(legacyStart, sharedAdapter);
if (source.includes(previousSharedAdapter)) source = source.replace(previousSharedAdapter, sharedAdapter);

if (!source.includes('function contextualStayId(stays: ZeroLeg[]')) {
  const newStart = `${sharedAdapter}\n\nfunction HotelsView({ events }: { events: ZeroLeg[] }) {
  const stays = events.filter((event) => event.kind === 'stay' || event.hotel);
  const [saved, setSaved] = useState<any[]>([]);
  const [companions, setCompanions] = useState<Record<string, any[]>>({});
  const [selectedEventId, setSelectedEventId] = useState(() => contextualStayId(stays));`;
  if (!source.includes(oldStart)) throw new Error('[v14388] início de HotelsView não localizado.');
  source = source.replace(oldStart, newStart);
}

const oldSelected = `  const selectedEvent = stays.find((event) => event.id === selectedEventId) || stays[0] || null;`;
const newSelected = `  const contextualEventId = contextualStayId(stays);
  const selectedEvent = stays.find((event) => event.id === selectedEventId)
    || stays.find((event) => event.id === contextualEventId)
    || null;`;
if (source.includes(oldSelected)) source = source.replace(oldSelected, newSelected);

const oldEffect = `  useEffect(() => {
    if (!selectedEventId && stays[0]) setSelectedEventId(stays[0].id);
  }, [selectedEventId, stays]);`;
const newEffect = `  useEffect(() => {
    if (!stays.length) {
      if (selectedEventId) setSelectedEventId('');
      return;
    }
    if (!stays.some((event) => event.id === selectedEventId)) setSelectedEventId(contextualStayId(stays));
  }, [selectedEventId, stays]);`;
if (source.includes(oldEffect)) source = source.replace(oldEffect, newEffect);

for (const required of [
  "import { selectContextualStay } from '@/lib/stayContext';",
  'const selected = selectContextualStay(',
  "startAt: event.kind === 'stay' ? event.canonical?.startDateTime : null",
  "endAt: event.kind === 'stay' ? event.canonical?.endDateTime : null",
  'const [selectedEventId, setSelectedEventId] = useState(() => contextualStayId(stays));',
  'const contextualEventId = contextualStayId(stays);',
  "if (!stays.some((event) => event.id === selectedEventId)) setSelectedEventId(contextualStayId(stays));",
]) {
  if (!source.includes(required)) throw new Error(`[v14388] contrato não aplicado: ${required}`);
}

const hotelsStart = source.indexOf('function HotelsView(');
const hotelsEnd = source.indexOf('\nfunction ', hotelsStart + 1);
const hotelsScope = hotelsStart >= 0 ? source.slice(hotelsStart, hotelsEnd > hotelsStart ? hotelsEnd : undefined) : '';
if (/selectedEventId[^\n]*stays\[0\]|selectedEvent[^\n]*stays\[0\]/.test(hotelsScope)) {
  throw new Error('[v14388] HotelsView ainda usa stays[0] como regra de contexto.');
}

fs.writeFileSync(file, source, 'utf8');
console.log(`[v14388] CrewCheck ${VERSION}: HotelsView usa limites canônicos do pernoite e seleção contextual determinística.`);
