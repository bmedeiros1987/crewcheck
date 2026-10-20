/** Presentation only: read explicit canonical bounds; do not infer location, hotel or duration. */
export type StayDisplayEvent = { id: string; kind?: string; canonical?: { startDateTime?: string; endDateTime?: string } };
function instant(value?: string) {
  if (!value || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const time = Date.parse(value); return Number.isFinite(time) ? time : null;
}
export function orderStayDisplay<T extends StayDisplayEvent>(events: readonly T[], now = Date.now()) {
  const entries = events.map(event => {
    const start = event.kind === 'stay' ? instant(event.canonical?.startDateTime) : null;
    const end = event.kind === 'stay' ? instant(event.canonical?.endDateTime) : null;
    const valid = start !== null && end !== null && end > start;
    const status = !valid ? 'unknown' : start! <= now && now < end! ? 'current' : start! > now ? 'next' : 'past';
    return {event,start,end,status};
  });
  const rank: Record<string,number> = {current:0,next:1,past:2,unknown:3};
  entries.sort((a,b)=>rank[a.status]-rank[b.status] || (a.status === 'past' ? (b.end ?? 0)-(a.end ?? 0) : (a.start ?? 0)-(b.start ?? 0)) || a.event.id.localeCompare(b.event.id));
  const current = entries.filter(item=>item.status === 'current');
  const future = entries.filter(item=>item.status === 'next');
  const nextOverlaps = future[0] ? future.filter(item=>item.start! < future[0].end! && item.end! > future[0].start!) : [];
  const ambiguous = current.length > 1 || (!current.length && nextOverlaps.length > 1);
  const recommended = ambiguous ? null : current[0]?.event || entries.find(item=>item.status === 'next')?.event || null;
  function label(id:string) {
    const item=entries.find(item=>item.event.id===id);
    return item?.status==='current' ? ambiguous ? 'Intervalos sobrepostos · confirme o pernoite' : 'Atual pela escala'
      : item?.status==='next' ? item.event===recommended ? 'Próximo pela escala' : !current.length && nextOverlaps.length>1 && nextOverlaps.includes(item) ? 'Futuro · intervalos sobrepostos' : 'Futuro'
      : item?.status==='past' ? 'Pernoite anterior' : 'Intervalo não confirmado';
  }
  return {events:entries.map(item=>item.event),recommended,ambiguous,label};
}
