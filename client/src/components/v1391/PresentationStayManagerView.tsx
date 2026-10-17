import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { loadStayEditor, persistStayEditor, stayEditorAccount } from '@/lib/stayEditorStore';
import { preparedStayAlarmAdapter } from '../../lib/stayAlarmHost';
import { createStayAlarmController } from '@shared/stay-alarm-adapter.mjs';
import { sanitizeStayChoice, migrateLegacyStay } from '@shared/stay-editor-store.mjs';
import { getToken, getStoredUser } from '@/lib/authClient';
import { baseTimeZone, validTimeZone } from '@shared/timezone-choice.mjs';
import { airportTimeZone } from '@shared/airport-timezones.mjs';
import { resolveStayDisplayZone, stayTimeZonePreference, type StayTimeZonePreference } from '@shared/stay-time-presentation.mjs';
import { EventTimeZonePreference, IanaTimeZoneSelect } from '@/components/preferences/TimezoneChoice';
import { readStayEditorIntent, returnFromStayProgramEditor, hasStoredStayEditorOrigin } from '@/lib/stayEditorNavigation';
import { orderStayDisplay } from '@/lib/stayDisplayOrder';
import { stayLocalInstant, type StayAlarmChoice, type StayBreakfastPlan } from '@shared/stay-edit-plan.mjs';
import StayHotelAlarmPreview from './StayHotelAlarmPreview';
import { Building2, Clock, Home, Hotel, MapPin, Save, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { CREW_HOTEL_CATALOG } from '@/data/crewHotels';
import { listPlatformStays, updatePlatformStay } from '@/lib/platformClient';
import { v139Api } from '@/components/v139/api';
import { V139Header } from '@/components/v139/Shell';
import '@/components/v139/v139.css';
import './stay-editor.css';

type RosterEvent = {
  id: string;
  kind?: string;
  title?: string;
  date?: Date;
  origin?: string;
  destination?: string;
  hotel?: string;
  presentation?: string;
  arrival?: string;
  departure?: string;
  canonical?: { startDateTime?: string; endDateTime?: string; groundBeforeMinutes?: number | null };
};

type StayDraft = {
  hotelName: string;
  airport: string;
  stayDate: string;
  room: string;
  presentationTime: string;
  leadMinutes: string;
  shareSameHotel: boolean;
};

function isoDay(value?: Date | string) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (!Number.isFinite(date.getTime())) return new Date().toISOString().slice(0, 10);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function eventStart(event: RosterEvent) {
  return new Date(event.canonical?.startDateTime || event.date || 0);
}

function eventEnd(event: RosterEvent) {
  return new Date(event.canonical?.endDateTime || event.canonical?.startDateTime || event.date || 0);
}

function hoursBetween(a: Date, b: Date) {
  return Math.max(0, (b.getTime() - a.getTime()) / 3600000);
}

function labelDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

export default function PresentationStayManagerView({ events, initialStayId, initialFocus, embedded = false }: { events: RosterEvent[]; initialStayId?: string; initialFocus?: 'time-zone' | 'emergency-sharing'; embedded?: boolean }) {
  const renderToken = getToken(), renderAccount = stayEditorAccount();
  const editorSessionCurrent = () => Boolean(renderToken && renderAccount)
    && renderToken === getToken() && renderAccount === stayEditorAccount();
  const editorRoot = useRef<HTMLElement>(null);
  const editorAnchor = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const measure = () => {
      const root = editorRoot.current, anchor = editorAnchor.current; if (!root || !anchor) return;
      const frame = anchor.getBoundingClientRect();
      const nav = document.querySelector('.cz-bottom-nav')?.getBoundingClientRect();
      const header = document.querySelector('.cz-global-header')?.getBoundingClientRect();
      const top = Math.max(frame.top, (header?.bottom ?? 0) + 8);
      const visibleBottom = Math.min(nav?.top ?? window.innerHeight, window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : window.innerHeight);
      Object.assign(root.style, { position: 'fixed', top: `${top}px`, left: `${frame.left}px`, width: `${frame.width}px`, height: `${Math.max(0, visibleBottom - top - 16)}px` });
    };
    measure(); const observer = new ResizeObserver(measure);
    for (const element of [editorAnchor.current, document.querySelector('.cz-bottom-nav'), document.querySelector('.cz-global-header'), document.querySelector('.cc-header-notice')]) if(element) observer.observe(element);
    window.addEventListener('resize', measure); window.visualViewport?.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, []);
  const operational = useMemo(() => events.filter((event) => !event.kind || ['flight', 'duty', 'stay'].includes(event.kind)).filter((event) => Number.isFinite(eventStart(event).getTime())).sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime()), [events]);
  const [stays, setStays] = useState<any[]>([]);
  const [homeAddress, setHomeAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [entry] = useState(() => { const id = initialStayId || readStayEditorIntent(); return { id, orphaned: !id && hasStoredStayEditorOrigin() }; });
  const contextId = entry.id;
  const stayDisplay = orderStayDisplay(events);
  const [selectedId, setSelectedId] = useState(() => entry.orphaned ? '' : contextId || stayDisplay.recommended?.id || operational[0]?.id || '');
  const [hotelTimeZone, setHotelTimeZone] = useState('');
  const [displayPreference, setDisplayPreference] = useState<StayTimeZonePreference>(() => loadStayEditor().timeZonePreference);
  const [alarmChoice, setAlarmChoice] = useState<StayAlarmChoice | undefined>();
  const [defaultLead, setDefaultLead] = useState<number | undefined>(() => loadStayEditor().defaultLeadMinutes);
  const [defaultWithoutBreakfast, setDefaultWithoutBreakfast] = useState<number>(() => loadStayEditor().defaultWithoutBreakfastMinutes);
  const [breakfastPlan, setBreakfastPlan] = useState<StayBreakfastPlan>('unknown');
  const [apzConfirmed, setApzConfirmed] = useState(false);
  const [apzSource, setApzSource] = useState('absent');
  const [alarmCancelled, setAlarmCancelled] = useState(false);
  const nativeHost = useRef(preparedStayAlarmAdapter());
  const alarmController = useRef(createStayAlarmController(nativeHost.current));
  const [hostReady, setHostReady] = useState(() => Boolean(nativeHost.current?.ready()));
  useEffect(() => { const changed = () => setHostReady(Boolean(nativeHost.current?.ready()));
    window.addEventListener('crewcheck:stay-host-state', changed);
    return () => window.removeEventListener('crewcheck:stay-host-state', changed); }, []);

  const [defaultInput, setDefaultInput] = useState(() => String(loadStayEditor().defaultLeadMinutes));
  const [withoutBreakfastInput, setWithoutBreakfastInput] = useState(() => String(loadStayEditor().defaultWithoutBreakfastMinutes));
  const [apzDate, setApzDate] = useState('');
  const dirty = useRef(false);
  const owner = useRef(getToken());
  const editSession = useRef(0);
  const drafts = useRef(new Map<string, { draft: StayDraft; manual: boolean; timeZone: string; choice: StayAlarmChoice | undefined; breakfastPlan: StayBreakfastPlan; apzDate: string; signature: string; apzConfirmed: boolean; apzSource: string; alarmCancelled: boolean }>());
  const previousId = useRef('');
  const [removed, setRemoved] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const eventSignature = useRef('');
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedMatches = operational.filter(event => event.id === selectedId);
  const selected = selectedMatches.length === 1 ? selectedMatches[0] : null;
  useEffect(() => {
    if (!initialFocus || selected?.kind !== 'stay' || !editorSessionCurrent()) return;
    const id = initialFocus === 'time-zone' ? 'cc-stay-timezone-preference' : 'cc-stay-emergency-sharing';
    const control = document.getElementById(id)?.querySelector<HTMLElement>('select,input');
    control?.scrollIntoView({ block: 'center' }); control?.focus({ preventScroll: true });
  }, [initialFocus, selected?.id, renderToken, renderAccount]);
  const [draft, setDraft] = useState<StayDraft>({ hotelName: '', airport: '', stayDate: isoDay(), room: '', presentationTime: '', leadMinutes: '90', shareSameHotel: false });

  const gaps = useMemo(() => operational.slice(0, -1).map((event, index) => {
    const next = operational[index + 1];
    const end = eventEnd(event);
    const start = eventStart(next);
    const hours = hoursBetween(end, start);
    const location = event.destination || event.origin || '';
    const samePlace = Boolean(location && location === (next.origin || next.destination));
    return { event, next, end, start, hours, location, samePlace };
  }).filter((gap) => gap.hours >= 1), [operational]);

  const restGaps = gaps.filter((gap) => gap.hours >= 12 && gap.samePlace);
  const groundGaps = events.filter((event) => Number(event.canonical?.groundBeforeMinutes || 0) >= 60);
  const targetAirport = selected?.destination || selected?.origin || draft.airport;
  const catalogResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return CREW_HOTEL_CATALOG
      .map((hotel) => ({ hotel, exactAirport: [hotel.airport, hotel.alternateAirport].includes(String(targetAirport || '').toUpperCase()) }))
      .filter(({ hotel, exactAirport }) => exactAirport || !normalizedQuery || `${hotel.name} ${hotel.city} ${hotel.airport} ${hotel.alternateAirport}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .sort((a, b) => Number(b.exactAirport) - Number(a.exactAirport) || a.hotel.name.localeCompare(b.hotel.name, 'pt-BR'))
      .slice(0, 12)
      .map(({ hotel }) => hotel);
  }, [query, targetAirport]);

  async function refresh() {
    const session = editSession.current, token = getToken();
    if (!token) return;
    const [stayPayload, addressPayload] = await Promise.all([
      listPlatformStays(),
      v139Api('/api/platform/home-address').catch(() => ({ address: null })),
    ]);
    if (session !== editSession.current || token !== getToken()) return;
    // The legacy local fallback is not account scoped: never prefill it as this account's saved stay.
    setStays(stayPayload.localOnly ? [] : stayPayload.stays || []);
    if (addressPayload.address) {
      setHomeAddress(addressPayload.address.formattedAddress || '');
      setPostalCode(addressPayload.address.postalCode || '');
    }
  }

  useEffect(() => {
    const reset = () => { editSession.current++; owner.current = getToken(); drafts.current.clear(); dirty.current = false; previousId.current = ''; setStays([]); setHomeAddress(''); setPostalCode(''); setBusy(false); setQuery(''); setSelectedId(''); setHotelTimeZone(''); setApzDate(''); setAlarmChoice(undefined); setBreakfastPlan('unknown'); const settings = loadStayEditor(); setDisplayPreference(settings.timeZonePreference); setDefaultLead(settings.defaultLeadMinutes); setDefaultInput(String(settings.defaultLeadMinutes)); setDefaultWithoutBreakfast(settings.defaultWithoutBreakfastMinutes); setWithoutBreakfastInput(String(settings.defaultWithoutBreakfastMinutes)); setApzConfirmed(false); setApzSource('absent'); setAlarmCancelled(false); setDraft({ hotelName: '', airport: '', stayDate: '', room: '', presentationTime: '', leadMinutes: '', shareSameHotel: false }); };
    window.addEventListener('crewcheck:auth-changed', reset); window.addEventListener('crewcheck:auth-expired', reset);
    const onStorage = (event: StorageEvent) => { if (['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key || '')) reset(); };
    window.addEventListener('storage', onStorage);
    if (owner.current !== getToken()) reset();
    refresh().catch(() => undefined);
    return () => { editSession.current++; window.removeEventListener('crewcheck:auth-changed', reset); window.removeEventListener('crewcheck:auth-expired', reset); window.removeEventListener('storage', onStorage); };
  }, []);

  useEffect(() => {
    setRemoved(Boolean(selectedId && !selected));
    if (!selected || owner.current !== getToken()) return;
    const signature = [selected.id, selected.canonical?.startDateTime, selected.canonical?.endDateTime, selected.origin, selected.destination].join('|');
    if (previousId.current === selected.id && eventSignature.current && signature !== eventSignature.current) { setNeedsReview(true); setApzConfirmed(false); }
    eventSignature.current = signature;
    if (previousId.current === selected.id && dirty.current) return;
    previousId.current = selected.id;
    const cached = drafts.current.get(selected.id);
    if (cached) { setDraft(cached.draft); setManual(cached.manual); setHotelTimeZone(cached.timeZone); setAlarmChoice(cached.choice); setBreakfastPlan(cached.breakfastPlan); setApzDate(cached.apzDate); setNeedsReview(cached.signature !== signature); setApzConfirmed(cached.apzConfirmed && cached.signature === signature); setApzSource(cached.apzSource); setAlarmCancelled(cached.alarmCancelled); dirty.current = true; return; }
    const persisted = loadStayEditor().stays[selected.id];
    if (persisted) {
      const changed = persisted.signature !== signature;
      setDraft(persisted.draft); setManual(true); setHotelTimeZone(persisted.timeZone); setApzDate(persisted.apzDate);
      setAlarmChoice(persisted.choice); setBreakfastPlan(persisted.breakfastPlan); setApzConfirmed(persisted.apzConfirmed && !changed); setApzSource(persisted.apzSource);
      setAlarmCancelled(persisted.alarmState === 'cancelled'); setNeedsReview(changed); return;
    }
    const date = isoDay(selected.date || selected.canonical?.startDateTime);
    const direct = stays.filter(item => item.rosterEventId === selected.id);
    const airport = selected.destination || selected.origin || '';
    const legacy = stays.filter(item => !item.rosterEventId && String(item.stayDate || '').slice(0, 10) === date && item.airport === airport);
    const sameDay = operational.filter(item => item.kind === 'stay' && isoDay(item.date || item.canonical?.startDateTime) === date && (item.destination || item.origin) === airport);
    const saved = direct.length === 1 ? direct[0] : direct.length === 0 && legacy.length === 1 && sameDay.length <= 1 ? legacy[0] : null;
    const initialDraft: StayDraft = { hotelName: saved?.hotelName || selected.hotel || '', airport: saved?.airport || airport, stayDate: date,
      room: saved?.room || '',
      // PR991 guard: never promote roster stay/check-in/pickup to hotel APZ.
      presentationTime: saved?.presentationTime || (selected.kind !== 'stay' && selected.presentation && selected.presentation !== 'Conexão/Solo' ? selected.presentation : ''),
      leadMinutes: saved?.leadMinutes == null ? '' : String(saved.leadMinutes), shareSameHotel: Boolean(saved?.shareSameHotel) };
    setDraft(initialDraft);
    const migrated = migrateLegacyStay(saved, { accountId: stayEditorAccount(), eventId: selected.id, signature, draft: initialDraft });
    setApzDate(date); setHotelTimeZone(airportTimeZone(airport)); setApzConfirmed(false); setApzSource(saved?.presentationTime ? 'legacy-unconfirmed' : 'absent'); setAlarmCancelled(false);
    setAlarmChoice(migrated?.choice);
    setBreakfastPlan('unknown');
    setManual(false); dirty.current = false;
  }, [selectedId, selected, stays, operational]);

  function selectProgram(id: string) {
    if (selected && dirty.current) drafts.current.set(selected.id, { draft, manual, timeZone: hotelTimeZone, choice: alarmChoice, breakfastPlan, apzDate, signature: eventSignature.current, apzConfirmed, apzSource, alarmCancelled });
    dirty.current = false; setNeedsReview(false); setSelectedId(id);
  }
  function discardEdits() { if (!selected) return; drafts.current.delete(selected.id); dirty.current = false; previousId.current = ''; setStays(items => [...items]); }
  const apzEpoch = selected?.kind === 'stay' && apzConfirmed ? stayLocalInstant(apzDate, draft.presentationTime, hotelTimeZone) : null;
  const displayZone = resolveStayDisplayZone(displayPreference, { localZone: hotelTimeZone, baseZone: baseTimeZone(getStoredUser()?.base) });
  const zoneReferenceInstant = apzEpoch === null ? selected?.canonical?.startDateTime || null : new Date(apzEpoch).toISOString();
  function saveDisplayPreference(value: StayTimeZonePreference) {
    if (!editorSessionCurrent()) return toast.info('A conta mudou. Reabra este pernoite.');
    try {
      const preference = stayTimeZonePreference(value), current = loadStayEditor();
      persistStayEditor({ ...current, timeZonePreference: preference }, renderAccount);
      setDisplayPreference(preference);
    } catch { toast.error('Não foi possível salvar a preferência de exibição.'); }
  }

  useEffect(() => { void nativeHost.current?.invalidate(); }, [events, selectedId, apzEpoch, apzConfirmed, hotelTimeZone, alarmChoice, defaultLead, defaultWithoutBreakfast, breakfastPlan, draft.hotelName]);

  function chooseHotel(hotel: (typeof CREW_HOTEL_CATALOG)[number]) {
    dirty.current = true;
    setDraft((current) => ({ ...current, hotelName: hotel.name, airport: hotel.airport || hotel.alternateAirport || current.airport }));
    setManual(false); setApzConfirmed(false);
    toast.success('Hotel do catálogo selecionado.');
  }

  function saveLocalStay(cancelled = alarmCancelled) {
    const accountId = stayEditorAccount();
    if (!selected || !accountId || owner.current !== getToken() || !editorSessionCurrent()) throw new Error('Reabra este pernoite na sua conta.');
    if (!draft.hotelName.trim()) throw new Error('Informe o hotel.');
    if (apzConfirmed && apzEpoch === null) throw new Error('Confirme uma data, horário e fuso válidos para a APZ no hotel.');
    const choice = sanitizeStayChoice(alarmChoice);
    if (choice === null) throw new Error('Confirme o horário exato ou a antecedência individual antes de salvar.');
    const current = loadStayEditor();
    persistStayEditor({ ...current, lastEditedEventId: selected.id, stays: { ...current.stays, [selected.id]: {
      eventId: selected.id, signature: eventSignature.current, draft, timeZone: hotelTimeZone, apzDate,
      apzConfirmed: apzConfirmed && apzEpoch !== null, apzSource: apzConfirmed ? 'manual' : apzSource, choice, breakfastPlan,
      alarmState: cancelled ? 'cancelled' : 'not-programmed',
    } } }, accountId);
    dirty.current = false; drafts.current.delete(selected.id);
  }
  function applyDefault() {
    if (!editorSessionCurrent()) return toast.info('A conta mudou. Reabra este pernoite.');
    const value = Number(defaultInput);
    const withoutBreakfast = Number(withoutBreakfastInput);
    if (!defaultInput.trim() || !withoutBreakfastInput.trim() || ![value, withoutBreakfast].every(minutes => Number.isInteger(minutes) && minutes >= 0 && minutes <= 720)) return toast.info('Informe os dois padrões entre 0 e 720 minutos.');
    try { const current = loadStayEditor(); persistStayEditor({ ...current, defaultLeadMinutes: value, defaultWithoutBreakfastMinutes: withoutBreakfast }, renderAccount); setDefaultLead(value); setDefaultWithoutBreakfast(withoutBreakfast); toast.success('Padrões salvos para sua conta neste aparelho. Overrides individuais preservados.'); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível salvar o padrão.'); }
  }
  async function cancelStayAlarm() {
    try {
      const accountId = stayEditorAccount();
      if (!selected || !accountId || owner.current !== getToken() || !editorSessionCurrent()) throw new Error('Reabra este pernoite na sua conta.');
      const current = loadStayEditor();
      const record = current.stays[selected.id] || { eventId: selected.id, signature: eventSignature.current, draft, timeZone: hotelTimeZone, apzDate, apzSource: 'absent', apzConfirmed: false };
      persistStayEditor({ ...current, stays: { ...current.stays, [selected.id]: { ...record, alarmState: 'cancelled' } } }, accountId);
      setAlarmCancelled(true);
      const result = await alarmController.current.cancel({ accountId: stayEditorAccount(), eventId: selected?.id });
      toast.info(result.state === 'cancelled' ? 'Cancelamento confirmado.' : 'Preferência cancelada. O cancelamento de alarmes antigos no aparelho não pode ser confirmado por esta integração.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Cancelamento não confirmado.'); }
  }

  async function saveStay() {
    if (!selected || owner.current !== getToken() || !editorSessionCurrent()) return toast.info('Selecione a programação nesta conta.');
    if (selected.kind === 'stay') {
      try { saveLocalStay(); toast.success('Pernoite e preferências salvos para sua conta neste aparelho. Despertador não programado.'); }
      catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
      return;
    }
    const session = editSession.current, token = getToken();
    if (!draft.hotelName.trim()) return toast.info('Informe o hotel ou use o endereço de casa para descanso na base.');
    setBusy(true);
    try {
      const matches = stays.filter(item => item.rosterEventId === selected.id || (!item.rosterEventId && String(item.stayDate || '').slice(0, 10) === draft.stayDate && item.airport === draft.airport));
      const sameDay = operational.filter(item => item.kind === 'stay' && isoDay(item.date || item.canonical?.startDateTime) === draft.stayDate && (item.destination || item.origin) === draft.airport);
      if (matches.length > 1 || sameDay.length > 1) throw new Error('Há mais de um pernoite nesta data/local. Confirme o vínculo antes de salvar.');
      const existing = matches[0];
      const payload = await updatePlatformStay({
        id: existing?.id,
        stayDate: draft.stayDate,
        hotelName: draft.hotelName.trim(),
        airport: draft.airport.trim().toUpperCase(),
        room: draft.room.trim(),
        presentationTime: draft.presentationTime.trim(),
        leadMinutes: alarmChoice?.mode === 'relative' && Number.isInteger(alarmChoice.leadMinutes) ? alarmChoice.leadMinutes : defaultLead,
        learnRule: true,
        shareSameHotel: draft.shareSameHotel,
        shareWithVisitors: false,
        source: manual ? 'contingency-manual' : 'catalog-preferred',
      });
      if (session !== editSession.current || token !== getToken()) return;
      if (payload.localOnly) return toast.info('Edição guardada neste aparelho; sincronização no servidor não confirmada.');
      setStays(payload.stays || stays);
      await refresh();
      toast.success('Hotel, quarto e apresentação salvos para esta programação.');
    } catch (error) {
      if (session === editSession.current && token === getToken()) toast.error(error instanceof Error ? error.message : 'Não consegui salvar o pernoite.');
    } finally {
      if (session === editSession.current && token === getToken()) setBusy(false);
    }
  }

  async function saveHome() {
    if (!homeAddress.trim()) return toast.info('Informe o endereço de casa.');
    setBusy(true);
    try {
      await v139Api('/api/platform/home-address', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: 'Casa', formattedAddress: homeAddress, postalCode }),
      });
      toast.success('Endereço de casa salvo. O CrewCheck usará nos descansos na base.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar o endereço.');
    } finally {
      setBusy(false);
    }
  }

  return <div ref={editorAnchor} className="cc-stay-editor-anchor"><section ref={editorRoot} className="cc-stay-editor">
    <div className="cc-stay-editor-header"><V139Header hideBrand={embedded} title="Apresentação, hotel e descanso" detail="Edite o horário, informe hotel/quarto e mantenha o endereço de casa para descansos na base." onBack={contextId || entry.orphaned ? () => { returnFromStayProgramEditor(); } : undefined} backLabel={contextId ? 'Voltar ao pernoite' : entry.orphaned ? 'Voltar à lista de pernoites' : undefined}/></div>
    <div className="cc-stay-editor-content">
    {entry.orphaned && <p role="alert">O editor foi recarregado. Nenhum pernoite foi selecionado automaticamente. Volte à lista ou selecione a programação explicitamente.</p>}
    {needsReview && <p role="alert">A programação foi atualizada. Seus ajustes manuais foram preservados; confirme a data, o fuso e a APZ no hotel.</p>}
    {removed && <p role="alert">O pernoite selecionado saiu da escala. Nenhum outro item foi selecionado automaticamente.</p>}
    <section className="cc139-grid">
      <article><Clock/><span>Programações</span><strong>{operational.length}</strong></article>
      <article><Hotel/><span>Descansos ≥ 12 h</span><strong>{restGaps.length}</strong></article>
      <article><MapPin/><span>Tempos em solo ≥ 60 min</span><strong>{groundGaps.length}</strong></article>
    </section>
    <section className="cc139-card">
      <h2>Programação a editar</h2><p>As alterações são privadas, salvas para sua conta neste aparelho. Não são sincronizadas ou compartilhadas automaticamente.</p>
      {selected?.kind === 'stay' && <p role="status">{stayDisplay.label(selected.id)}</p>}
      <div className="cc139-form" onChange={() => { dirty.current = true; }}>
        <label className="wide">Programação
          <select value={selected?.id || ''} onChange={(event) => selectProgram(event.target.value)}><option value="">Escolher programação</option>{operational.map((item) => <option key={item.id} value={item.id}>{item.kind === 'stay' ? stayDisplay.label(item.id) + ' · ' : ''}{isoDay(item.date || item.canonical?.startDateTime)} · {item.title || item.id} · {item.origin || '—'} → {item.destination || '—'}</option>)}</select>
        </label>
        <label>Hotel<input value={draft.hotelName} onChange={(event) => { setDraft({ ...draft, hotelName: event.target.value }); setManual(true); setApzConfirmed(false); }} placeholder="Hotel de pernoite ou contingência"/></label>
        <label>Número do quarto<input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Opcional e protegido"/></label>
        <label>Aeroporto/local<input value={draft.airport} onChange={(event) => setDraft({ ...draft, airport: event.target.value.toUpperCase() })} placeholder="Ex.: FOR"/></label>
        <label>{selected?.kind === 'stay' ? 'APZ no hotel (manual ou salva)' : 'Apresentação'}<input type="time" value={draft.presentationTime} onChange={(event) => { setDraft({ ...draft, presentationTime: event.target.value }); setApzConfirmed(false); setApzSource('manual'); }}/></label>
        {selected?.kind === 'stay' && <><label>Data da APZ no hotel<input type="date" value={apzDate} onChange={event => { setApzDate(event.target.value); setApzConfirmed(false); }}/></label>
        <IanaTimeZoneSelect label="Fuso do hotel" value={hotelTimeZone} instant={zoneReferenceInstant} onChange={zone => { setHotelTimeZone(zone); setApzConfirmed(false); }}/><p id="cc-stay-hall-reference">Para o despertador, informe a apresentação no hall do hotel. Decolagem, check-in e pickup não são essa referência.</p><label className="wide"><input type="checkbox" aria-describedby="cc-stay-hall-reference" checked={apzConfirmed} onChange={event => { setApzConfirmed(event.target.checked); if(event.target.checked) { setApzSource('manual'); setNeedsReview(false); } }}/> Confirmo esta data, horário e fuso como APZ no hotel</label><p>Origem da APZ: {apzSource === 'legacy-unconfirmed' ? 'horário salvo antigo; origem não confirmada' : apzSource === 'manual' ? 'informada/confirmada por você' : 'não informada'}. {apzConfirmed ? 'Confirmada.' : 'Confirmação necessária; não usamos escala ou pickup.'}</p></>}

        <label id="cc-stay-emergency-sharing"><input type="checkbox" checked={draft.shareSameHotel} onChange={(event) => setDraft({ ...draft, shareSameHotel: event.target.checked })}/> Autorizar colegas no mesmo hotel a me localizar em emergência</label><p>Esta autorização não muda ao escolher fuso. Para revogar a preferência, desmarque e salve o pernoite.</p>
      </div>
      {selected?.kind === 'stay' && !validTimeZone(hotelTimeZone) && <p role="status">Fuso da fonte ausente ou inválido. Confirme o local do evento; a preferência de exibição não preenche a zona de um pickup.</p>}
      {selected?.kind === 'stay' && apzConfirmed && apzEpoch === null && validTimeZone(hotelTimeZone) && <p role="alert">Data ou hora local inválida, inexistente ou duplicada por mudança de horário (DST). Confira a fonte; nenhuma ocorrência foi escolhida automaticamente.</p>}
      <div className="cc139-actions"><button className="primary" onClick={saveStay} disabled={busy || !selected}><Save/> Salvar alterações do pernoite</button><details><summary>Mais opções da edição</summary><button type="button" onClick={() => setManual(true)}><Building2/> Hotel de contingência / manual</button><button type="button" onClick={discardEdits} disabled={!selected}>Descartar edição deste pernoite</button>{selected?.kind === 'stay' && <button type="button" onClick={cancelStayAlarm}>Cancelar despertador deste pernoite</button>}</details></div>
    </section>
    {nativeHost.current && !hostReady && <button type="button" onClick={() => { void nativeHost.current.authenticate(); }}>Validar sessão deste aparelho</button>}
    {selected?.kind === 'stay' && <><div id="cc-stay-timezone-preference"><EventTimeZonePreference value={displayPreference} onChange={saveDisplayPreference} localZone={hotelTimeZone} baseZone={baseTimeZone(getStoredUser()?.base)} instant={zoneReferenceInstant}/></div><StayHotelAlarmPreview eventId={selected.id} hotelApzIso={apzEpoch === null ? '' : new Date(apzEpoch).toISOString()} displayTimeZone={displayZone.zone || null}
      timeZone={hotelTimeZone} choice={alarmChoice} defaultLeadMinutes={defaultLead} defaultWithoutBreakfastMinutes={defaultWithoutBreakfast}
      breakfastPlan={breakfastPlan} onBreakfastPlan={value => { dirty.current = true; void nativeHost.current?.invalidate(); setBreakfastPlan(value); }} onChoice={choice => { dirty.current = true; void nativeHost.current?.invalidate(); setAlarmChoice(choice); }}
      nativeTestReady={hostReady} onProgram={async (alarmAt: string, hotelReportAt: string) => {
        if (!editorSessionCurrent()) return toast.info('A conta mudou. Reabra este pernoite.');
        const session = editSession.current;
        const result = await alarmController.current.replace({ accountId: stayEditorAccount(), eventId: selected.id,
          confirmed: true, apzConfirmed, permission: nativeHost.current?.permission() ? 'granted' : 'denied',
          alarmAt, hotelReportAt, now: Date.now(), cancelled: alarmCancelled, mode: alarmChoice?.mode });
        if (session === editSession.current && editorSessionCurrent()) toast.info(result.state === 'scheduled' ? 'Tentativa de notificação programada; entrega não confirmada.' : 'Programação não confirmada.');
      }}/></>}

    {alarmCancelled && <p role="status">Despertador cancelado nesta preferência. Editar ou importar não o reativa.</p>}
    <section className="cc139-card" aria-label="Antecedência padrão"><details><summary>Alterar antecedência padrão</summary><p>Alterar o padrão é uma ação separada. Antecedências individuais e horários exatos são preservados. O padrão é salvo para sua conta neste aparelho.</p>
      <label>Minutos do padrão · com café<input type="number" min="0" max="720" value={defaultInput} onChange={event => setDefaultInput(event.target.value)}/></label>
      <label>Minutos do padrão · sem café<input type="number" min="0" max="720" value={withoutBreakfastInput} onChange={event => setWithoutBreakfastInput(event.target.value)}/></label>
      <button type="button" onClick={applyDefault}>Salvar antecedência padrão</button></details></section>
    <section className="cc139-card">
      <h2>Hotéis preferenciais do catálogo</h2>
      <p>Resultados do aeroporto da programação aparecem primeiro. Use cadastro manual quando a contingência levar a outro hotel.</p>
      <div className="cc139-form"><label className="wide"><Search/> Buscar hotel, cidade ou aeroporto<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Prioridade: ${targetAirport || 'aeroporto da programação'}`}/></label></div>
      <div className="cc139-choices">{catalogResults.map((hotel) => <button type="button" key={`${hotel.name}-${hotel.airport}`} className={draft.hotelName === hotel.name ? 'active' : ''} onClick={() => chooseHotel(hotel)}><Hotel/><span><strong>{hotel.name}</strong><small>{hotel.airport || hotel.alternateAirport} · {hotel.city}</small></span></button>)}</div>
    </section>
    <section className="cc139-card">
      <h2>Endereço de casa para descanso na base</h2>
      <p>Depois de salvo, será reutilizado nos descansos entre jornadas na base. Pode ser alterado a qualquer momento.</p>
      <div className="cc139-form"><label>CEP<input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} placeholder="Opcional"/></label><label className="wide">Endereço<input value={homeAddress} onChange={(event) => setHomeAddress(event.target.value)} placeholder="Endereço de casa"/></label></div>
      <div className="cc139-actions"><button onClick={saveHome} disabled={busy}><Home/> Salvar ou alterar endereço</button></div>
    </section>
    <section className="cc139-list">
      {restGaps.map((gap) => <article className="cc139-card" key={`${gap.event.id}-${gap.next.id}`}>
        <header><span><strong>{gap.location === draft.airport ? 'Descanso na localidade' : `Descanso em ${gap.location || 'localidade'}`}</strong><small>{labelDate(gap.end)} até {labelDate(gap.start)}</small></span><b>{gap.hours.toFixed(1)} h</b></header>
        <div className="cc139-badges"><span>8 h de sono prioritárias</span><span>{gap.location === (draft.airport || '') ? draft.hotelName || 'Hotel a informar' : homeAddress || 'Endereço/hotel a informar'}</span></div>
      </article>)}
      {groundGaps.map((event) => <article className="cc139-card" key={`ground-${event.id}`}><header><span><strong>Tempo em solo · {event.origin || '—'}</strong><small>Antes de {event.title || 'próxima etapa'}</small></span><b>{event.canonical?.groundBeforeMinutes} min</b></header></article>)}
    </section>
    <section className="cc139-card"><ShieldCheck/><h2>Privacidade</h2><p>O quarto não aparece para visitantes nem em alertas coletivos. A presença no hotel só é usada com autorização do usuário.</p></section>
    </div>
  </section></div>;
}
