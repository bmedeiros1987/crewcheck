import fs from 'node:fs';
const file='client/src/pages/Home.tsx'; let source=fs.readFileSync(file,'utf8');
if (!source.includes('function FollowFlightPanel(')) {
 source="import { followedFlight, followedFlightKey, readFollowedFlights, changeFollowedFlights, type FollowedFlight } from '@shared/followedFlights.mjs';\n"+source;
 const helper=`function FollowFlightPanel({ candidate }: { candidate: FollowedFlight | null }) {
  const owner = manualGateAccountKey(getStoredUser());
  const token = getToken();
  const [revision, setRevision] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setRevision(n => n + 1), 30_000); return () => window.clearInterval(timer); }, []);
  void revision;
  if (!token || owner === 'local') return null;
  const rows = readFollowedFlights(localStorage, owner);
  function change(item: FollowedFlight, follow: boolean) {
    if (getToken() !== token || manualGateAccountKey(getStoredUser()) !== owner) return;
    if (!changeFollowedFlights(localStorage, owner, item, follow)) { toast.error('Não foi possível salvar.'); return; }
    setRevision(n => n + 1);
  }
  const selected = candidate && rows.some(item => followedFlightKey(item) === followedFlightKey(candidate));
  return <section className="cz-toolbox" data-followed-flights="cache-only"><h2>Acompanhados</h2>{candidate && !selected && <button onClick={() => change(candidate, true)}>Acompanhar {candidate.flight} · {candidate.origin} → {candidate.destination}</button>}{!rows.length && <small>Nenhum voo selecionado</small>}{rows.map(item => {
    const event = { id: item.eventId, kind: 'flight', flightNumber: item.flight, origin: item.origin, destination: item.destination, day: { date: item.date }, canonical: { startDateTime: item.scheduledDepartureUtc, date: item.date } } as unknown as ZeroLeg;
    const snapshot = readRadarSnapshot(event);
    const info = radarGateInfo(event, snapshot);
    const gate = info.gateSource === 'radar' ? info.gate : '';
    const status = info.statusSource === 'radar' ? info.status : '';
    return <article key={followedFlightKey(item)}><strong>{item.flight} · {item.origin} → {item.destination}</strong><span>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(item.scheduledDepartureUtc))} UTC</span><p>{status || 'Status sem dados'} · Portão {gate || 'sem dados'}</p>{snapshot && (gate || status) ? <small>Fonte: {(snapshot as RadarSnapshot & {source?:string}).source || 'não informada'} · recebida {new Intl.DateTimeFormat('pt-BR', {timeStyle:'short'}).format(new Date(Number(snapshot.updatedAt)))}</small> : <small>Sem dados operacionais válidos no cache</small>}<button aria-label={'Parar acompanhamento de ' + item.flight + ' ' + item.origin + ' para ' + item.destination} onClick={() => change(item, false)}>Parar</button></article>;
  })}<details><summary>ℹ️</summary><small>Seleção local, separada da escala. Usa apenas dados já consultados e válidos; não cria consultas, reserva, bilhete nem alerta fora do app.</small></details></section>;
}
function positioningFollowCandidate(record: any): FollowedFlight | null {
  if (!record || !Number.isFinite(Date.parse(record.departureAt))) return null;
  return followedFlight({eventId:'positioning:' + String(record.eventId),flight:record.flightNumber,origin:record.origin,destination:record.destination,scheduledDepartureUtc:record.departureAt,date:new Date(Date.parse(record.departureAt) - 3 * 60 * 60_000).toISOString().slice(0,10)});
}
function followCandidate(event: ZeroLeg): FollowedFlight | null {
  return followedFlight({eventId:event.id,flight:String(event.flightNumber || '').replace(/\\s+/g,'').toUpperCase(),origin:event.origin,destination:event.destination,scheduledDepartureUtc:event.canonical?.startDateTime,date:event.day?.date || event.canonical?.date});
}
`;
 const anchor='function RadarView({ event }: { event: ZeroLeg }) {';
 if(!source.includes(anchor)) throw Error('Missing Radar view'); source=source.replace(anchor,helper+anchor);
 const marker='<ManualGateEditor event={event}/></>;';
 if(!source.includes(marker)) throw Error('Missing Radar footer');source=source.replace(marker,"<FollowFlightPanel key={manualGateAccountKey(getStoredUser())} candidate={followCandidate(event)}/><ManualGateEditor event={event}/></>;");
 const departureStart=source.indexOf('function AirportDeparture('), departureEnd=source.indexOf('\nfunction MonthlyMapView(', departureStart);
 if(departureStart<0 || departureEnd<0) throw Error('Missing departure scope');
 let departure=source.slice(departureStart,departureEnd);
 const end='</section></>;';
 const last=departure.lastIndexOf(end); if(last<0) throw Error('Missing departure footer');
 const panel=`</section><FollowFlightPanel key={manualGateAccountKey(getStoredUser())} candidate={positioningFollowCandidate(positioningRecord)}/></>;`;
 departure=departure.slice(0,last)+panel+departure.slice(last+end.length);
 source=source.slice(0,departureStart)+departure+source.slice(departureEnd);
 // Existing positioning selection is already occurrence-scoped; reuse it without a new search.
 const position='<section className="cz-radar-screen">';
 // No additional query effects or changes to the original roster.
 fs.writeFileSync(file,source);
}
