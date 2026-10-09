import { useEffect, useId, useMemo, useRef, useState, type ComponentProps } from 'react';
import { rosterDisplayIso } from '@/lib/rosterDisplayDate';
import { getStoredUser } from '@/lib/authClient';
import { AimsRosterTable } from './AimsRosterTable';
import './aims-document.css';

type Event = ComponentProps<typeof AimsRosterTable>['events'][number];
type Description = { mode: string; label: string };
const MIN_ZOOM = .01, MAX_ZOOM = 2;
const bounded = (value: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
const code = (event: Event) => event.flightNumber || event.day?.pairingCode || event.day?.type || event.title || 'Programação';
// Keep source clocks intact: suffixes such as (+1) and explicit unknowns matter.
const clock = (value?: string) => String(value || '').trim() || '—';

/** Read-only document projection. Array positions identify duplicate IDs without
 * guessing a match, creating events, or using coordinates from a private PDF. */
export function AimsDocumentView({ events, month, day, describe, focusEventId }: {
  events: Event[]; month: string; day?: string; describe: (event: Event) => Description; focusEventId?: string;
}) {
  const id = useId(), viewport = useRef<HTMLDivElement>(null), sheet = useRef<HTMLDivElement>(null);
  const detail = useRef<HTMLDivElement>(null), opener = useRef<HTMLButtonElement | HTMLSelectElement | null>(null);
  const [zoom, setZoom] = useState(1), [size, setSize] = useState({ width: 3744, height: 0 });
  const [selection, setSelection] = useState<{ event: Event; owner: string | null } | null>(null);
  const owner = getStoredUser()?.id || null;
  const selected = selection?.owner === owner && events.includes(selection.event) ? selection.event : null;
  const suppressUntil = useRef(0), mouse = useRef<{ x: number; scroll: number; moved: boolean } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number; anchor: number; center: number } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [fit, setFit] = useState(true);
  const dates = useMemo(() => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
    const [year, m] = month.split('-').map(Number);
    const all = Array.from({ length: new Date(Date.UTC(year, m, 0)).getUTCDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    return day ? (all.includes(day) ? [day] : []) : all;
  }, [month, day]);
  const groups = useMemo(() => dates.map(iso => ({ iso, entries: events.map((event, index) => ({ event, index })).filter(({ event }) => rosterDisplayIso(event) === iso) })), [dates, events]);
  const outside = events.filter(event => !dates.includes(rosterDisplayIso(event) || ''));
  useEffect(() => { setSelection(null); setZoom(1); setFit(true); if (viewport.current) viewport.current.scrollLeft = 0; }, [owner, month, day]);
  useEffect(() => {
    const el = sheet.current, frame = viewport.current;
    if (!el || !frame) return;
    const update = () => { setSize({ width: el.offsetWidth, height: el.offsetHeight }); if (fit) setZoom(bounded(frame.clientWidth / el.offsetWidth)); };
    update(); const observer = new ResizeObserver(update); observer.observe(el); observer.observe(frame);
    return () => observer.disconnect();
  }, [fit, groups]);
  useEffect(() => { const el = viewport.current; if (!el) return; const preventPinchScroll = (event: TouchEvent) => { if (event.touches.length === 2 && event.cancelable) event.preventDefault(); }; el.addEventListener('touchmove', preventPinchScroll, { passive: false }); return () => el.removeEventListener('touchmove', preventPinchScroll); }, []);
  function open(event: Event, button?: HTMLButtonElement) { if (button) opener.current = button; setSelection({ event, owner }); }
  useEffect(() => { if (selected && detail.current) { detail.current.focus({ preventScroll: true }); detail.current.scrollIntoView({ block: 'start', behavior: 'instant' }); } }, [selected]);
  const consumed = useRef<string>();
  useEffect(() => { if (focusEventId && consumed.current !== focusEventId) { const event = events.find(e => e.id === focusEventId); if (event) { consumed.current = focusEventId; open(event); } } }, [focusEventId, events]);
  function close() { setSelection(null); requestAnimationFrame(() => opener.current?.focus()); }
  function changeZoom(value: number, anchorX?: number, centerX?: number) {
    const frame = viewport.current; const next = bounded(value); setZoom(next); setFit(false);
    if (frame) { const center = centerX ?? frame.clientWidth / 2; const anchor = anchorX ?? (frame.scrollLeft + center) / zoom; requestAnimationFrame(() => { frame.scrollLeft = anchor * next - center; }); }
  }
  function touchDistance(list: React.TouchList) { return Math.hypot(list[0].clientX - list[1].clientX, list[0].clientY - list[1].clientY); }
  return <section className="cc-aims-document" data-document-scope={day ? 'day' : 'month'} aria-label="Documento interativo da escala">
    <header><h2>Escala em documento</h2><p>Mês inteiro em colunas contínuas. Toque numa programação para abrir os mesmos detalhes do AIMS.</p></header>
    <div className="cc-doc-toolbar" role="group" aria-label="Ampliar documento">
      <button type="button" aria-label="Diminuir documento" disabled={zoom <= MIN_ZOOM} onClick={() => changeZoom(zoom - .25)}>−</button>
      <output aria-live="polite">{Math.round(zoom * 100)}%</output>
      <button type="button" aria-label="Ampliar documento" disabled={zoom >= MAX_ZOOM} onClick={() => changeZoom(zoom + .25)}>+</button>
      <button type="button" onClick={() => { setFit(true); if (viewport.current) { setZoom(bounded(viewport.current.clientWidth / size.width)); viewport.current.scrollLeft = 0; } }}>Ajustar</button>
      <button type="button" onClick={() => { changeZoom(1); if (viewport.current) viewport.current.scrollLeft = 0; }}>100%</button>
    </div>
    <p id={`${id}-help`} className="cc-doc-help">Arraste lateralmente para percorrer os dias; deslize na vertical para continuar a página. Use dois dedos ou +/− para ampliar. Ajustar mostra o mês inteiro. Amplie para ler; os detalhes também podem ser abertos pelo seletor abaixo.</p>
    <label className="cc-doc-picker">Abrir programação publicada<select aria-label="Abrir programação publicada" value="" onChange={e=>{const index=Number(e.target.value);if(e.target.value!==''&&events[index]){opener.current=e.currentTarget;open(events[index]);}}}><option value="">Escolher programação</option>{events.map((event,index)=><option key={index} value={index}>{rosterDisplayIso(event) || 'Data não informada'} · {describe(event).label} · {code(event)}</option>)}</select></label>
    {!events.length && <p role="status">Nenhuma programação informada no período selecionado.</p>}
    <div ref={viewport} className="cc-doc-viewport" tabIndex={0} role="region" aria-label="Dias do documento; rolagem horizontal" aria-describedby={`${id}-help`}
      onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); event.currentTarget.scrollLeft += event.key === 'ArrowRight' ? 160 : -160; } if (event.key === 'Home') { event.preventDefault(); event.currentTarget.scrollLeft = 0; } if (event.key === 'End') { event.preventDefault(); event.currentTarget.scrollLeft = event.currentTarget.scrollWidth; } }}
      onClickCapture={event => { if (performance.now() < suppressUntil.current) { event.preventDefault(); event.stopPropagation(); } }}
      onPointerDown={event => { if (event.pointerType === 'mouse' && event.button === 0) mouse.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, moved: false }; }}
      onPointerMove={event => { const drag = mouse.current; if (!drag || !event.buttons) return; if (Math.abs(event.clientX - drag.x) > 8) { drag.moved = true; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.scrollLeft = drag.scroll - (event.clientX - drag.x); } }}
      onPointerUp={() => { if (mouse.current?.moved) suppressUntil.current = performance.now() + 350; mouse.current = null; }} onPointerCancel={() => { mouse.current = null; }}
      onTouchStart={event => { const list = event.touches; touch.current = list.length === 1 ? { x: list[0].clientX, y: list[0].clientY } : null; if (list.length === 2) { const frame = event.currentTarget; const center = (list[0].clientX + list[1].clientX) / 2 - frame.getBoundingClientRect().left; pinch.current = { distance: touchDistance(list), zoom, anchor: (frame.scrollLeft + center) / zoom, center }; suppressUntil.current = performance.now() + 1000; } }}
      onTouchMove={event => { const list = event.touches; if (list.length === 2 && pinch.current) { const start = pinch.current; changeZoom(start.zoom * touchDistance(list) / Math.max(1, start.distance), start.anchor, start.center); suppressUntil.current = performance.now() + 1000; } else if (list.length === 1 && touch.current && Math.hypot(list[0].clientX - touch.current.x, list[0].clientY - touch.current.y) > 8) suppressUntil.current = performance.now() + 350; }}
      onTouchEnd={() => { if (pinch.current) suppressUntil.current = performance.now() + 350; pinch.current = null; touch.current = null; }} onTouchCancel={() => { pinch.current = null; touch.current = null; suppressUntil.current = performance.now() + 350; }}>
      <div className="cc-doc-scaled" style={{ width: size.width * zoom, height: size.height * zoom }}>
        <div ref={sheet} className="cc-doc-sheet" style={{ transform: `scale(${zoom})`, '--doc-width': `${groups.length * 120 + 24}px`, '--doc-days':groups.length } as React.CSSProperties}>
          {<div className="cc-doc-strip">
            {groups.map(group => <section key={group.iso} className="cc-doc-day" data-roster-iso={group.iso} aria-label={`Dia ${group.iso}`}>
              <h3><time dateTime={group.iso}>{group.iso.slice(8)}/{group.iso.slice(5, 7)}</time><small>{new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${group.iso}T12:00:00Z`))}</small></h3>
              {group.entries.map(({ event, index }) => { const meta = describe(event); return <div className="cc-doc-entry cc-roster-legend-v1397" key={index}>
                <span data-mode={meta.mode} className="cc-doc-token"><button type="button" data-roster-event-id={event.id} data-event-index={index} aria-label={`${meta.label}: ${code(event)}, dia ${group.iso}. Abrir detalhes publicados`} aria-expanded={selected === event} onClick={e => open(event, e.currentTarget)}>
                  <small>{meta.label}</small><strong>{code(event)}</strong><span>{event.origin || '—'}{event.destination ? ` → ${event.destination}` : ''}</span>
                  {event.presentation && <span>Apresentação {clock(event.presentation)}</span>}
                  <span>{clock(event.kind === 'flight' ? event.departure : event.day?.dutyReport || event.day?.startTime || event.departure)} → {clock(event.kind === 'flight' ? event.arrival : event.day?.dutyDebrief || event.day?.endTime || event.arrival)}</span>
                  <span className="cc-doc-detail-hint">Ver detalhes</span>
                </button></span>
              </div>; })}
              {!group.entries.length && <p className="cc-doc-empty">Sem programação informada</p>}
            </section>)}
          </div>}
        </div>
      </div>
    </div>
    {outside.length > 0 && <AimsRosterTable events={outside} showHistory={false} title="Programações sem posição confirmada no documento"/>}
    {selected && <div className="cc-doc-detail" tabIndex={-1} ref={detail} role="region" aria-label="Programação selecionada" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
      <button type="button" onClick={close}>Fechar detalhes</button>
      <AimsRosterTable key={events.indexOf(selected)} events={[selected]} focusEventId={selected.id} title="Detalhes da programação selecionada"/>
    </div>}
    <p className="cc-doc-help">Horários e códigos preservados da escala. Campo — indica dado não informado; nenhuma atividade é inferida para os dias vazios. As cores seguem a legenda CrewCheck; os rótulos identificam cada tipo.</p>
  </section>;
}
