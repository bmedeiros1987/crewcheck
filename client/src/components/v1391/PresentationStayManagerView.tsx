import { useEffect, useMemo, useRef, useState } from 'react';
import { getToken } from '@/lib/authClient';
import { readStayEditorIntent, returnFromStayProgramEditor } from '@/lib/stayEditorNavigation';
import { orderStayDisplay } from '@/lib/stayDisplayOrder';
import { stayLocalInstant, type StayAlarmChoice } from '@shared/stay-edit-plan.mjs';
import StayHotelAlarmPreview from './StayHotelAlarmPreview';
import { Building2, Clock, Home, Hotel, MapPin, Save, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { CREW_HOTEL_CATALOG } from '@/data/crewHotels';
import { listPlatformStays, updatePlatformStay } from '@/lib/platformClient';
import { v139Api } from '@/components/v139/api';
import { V139Header } from '@/components/v139/Shell';
import '@/components/v139/v139.css';

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
  canonical?: { startDateTime?: string; endDateTime?: string; groundBeforeMinutes?: number };
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

export default function PresentationStayManagerView({ events, initialStayId }: { events: RosterEvent[]; initialStayId?: string }) {
  const operational = useMemo(() => events.filter((event) => !event.kind || ['flight', 'duty', 'stay'].includes(event.kind)).filter((event) => Number.isFinite(eventStart(event).getTime())).sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime()), [events]);
  const [stays, setStays] = useState<any[]>([]);
  const [homeAddress, setHomeAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [contextId] = useState(() => initialStayId || readStayEditorIntent());
  const stayDisplay = orderStayDisplay(events);
  const [selectedId, setSelectedId] = useState(() => contextId || stayDisplay.recommended?.id || operational[0]?.id || '');
  const [hotelTimeZone, setHotelTimeZone] = useState('');
  const [alarmChoice, setAlarmChoice] = useState<StayAlarmChoice | undefined>();
  const [defaultLead, setDefaultLead] = useState<number | undefined>();
  const [defaultInput, setDefaultInput] = useState('');
  const [apzDate, setApzDate] = useState('');
  const dirty = useRef(false);
  const owner = useRef(getToken());
  const editSession = useRef(0);
  const drafts = useRef(new Map<string, { draft: StayDraft; manual: boolean; timeZone: string; choice: StayAlarmChoice | undefined; apzDate: string }>());
  const previousId = useRef('');
  const [removed, setRemoved] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const eventSignature = useRef('');
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const selectedMatches = operational.filter(event => event.id === selectedId);
  const selected = selectedMatches.length === 1 ? selectedMatches[0] : null;
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
    const reset = () => { editSession.current++; owner.current = getToken(); drafts.current.clear(); dirty.current = false; previousId.current = ''; setStays([]); setHomeAddress(''); setPostalCode(''); setBusy(false); setQuery(''); setSelectedId(''); setHotelTimeZone(''); setApzDate(''); setAlarmChoice(undefined); setDefaultLead(undefined); setDefaultInput(''); setDraft({ hotelName: '', airport: '', stayDate: '', room: '', presentationTime: '', leadMinutes: '', shareSameHotel: false }); };
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
    if (previousId.current === selected.id && eventSignature.current && signature !== eventSignature.current) setNeedsReview(true);
    eventSignature.current = signature;
    if (previousId.current === selected.id && dirty.current) return;
    previousId.current = selected.id;
    const cached = drafts.current.get(selected.id);
    if (cached) { setDraft(cached.draft); setManual(cached.manual); setHotelTimeZone(cached.timeZone); setAlarmChoice(cached.choice); setApzDate(cached.apzDate); dirty.current = true; return; }
    const date = isoDay(selected.date || selected.canonical?.startDateTime);
    const direct = stays.filter(item => item.rosterEventId === selected.id);
    const airport = selected.destination || selected.origin || '';
    const legacy = stays.filter(item => !item.rosterEventId && String(item.stayDate || '').slice(0, 10) === date && item.airport === airport);
    const sameDay = operational.filter(item => item.kind === 'stay' && isoDay(item.date || item.canonical?.startDateTime) === date && (item.destination || item.origin) === airport);
    const saved = direct.length === 1 ? direct[0] : direct.length === 0 && legacy.length === 1 && sameDay.length <= 1 ? legacy[0] : null;
    setDraft({ hotelName: saved?.hotelName || selected.hotel || '', airport: saved?.airport || airport, stayDate: date,
      room: saved?.room || '',
      // PR991 guard: never promote roster stay/check-in/pickup to hotel APZ.
      presentationTime: saved?.presentationTime || (selected.kind !== 'stay' && selected.presentation && selected.presentation !== 'Conexão/Solo' ? selected.presentation : ''),
      leadMinutes: saved?.leadMinutes == null ? '' : String(saved.leadMinutes), shareSameHotel: Boolean(saved?.shareSameHotel) });
    setApzDate(date); setHotelTimeZone('');
    setAlarmChoice(saved?.leadMinutes == null ? undefined : { mode: 'relative', leadMinutes: Number(saved.leadMinutes) });
    setManual(false); dirty.current = false;
  }, [selectedId, selected, stays, operational]);

  function selectProgram(id: string) {
    if (selected && dirty.current) drafts.current.set(selected.id, { draft, manual, timeZone: hotelTimeZone, choice: alarmChoice, apzDate });
    dirty.current = false; setNeedsReview(false); setSelectedId(id);
  }
  function discardEdits() { if (!selected) return; drafts.current.delete(selected.id); dirty.current = false; previousId.current = ''; setStays(items => [...items]); }
  const apzEpoch = selected?.kind === 'stay' ? stayLocalInstant(apzDate, draft.presentationTime, hotelTimeZone) : null;

  function chooseHotel(hotel: (typeof CREW_HOTEL_CATALOG)[number]) {
    dirty.current = true;
    setDraft((current) => ({ ...current, hotelName: hotel.name, airport: hotel.airport || hotel.alternateAirport || current.airport }));
    setManual(false);
    toast.success('Hotel do catálogo selecionado.');
  }

  async function saveStay() {
    if (!selected || owner.current !== getToken()) return toast.info('Selecione a programação nesta conta.');
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

  return <>
    <V139Header title="Apresentação, hotel e descanso" detail="Edite o horário, informe hotel/quarto e mantenha o endereço de casa para descansos na base."/>
    {contextId && <section className="cc139-card"><button type="button" onClick={returnFromStayProgramEditor}>Voltar ao pernoite</button></section>}
    {needsReview && <p role="alert">A programação foi atualizada. Seus ajustes manuais foram preservados; confirme a data, o fuso e a APZ no hotel.</p>}
    {removed && <p role="alert">O pernoite selecionado saiu da escala. Nenhum outro item foi selecionado automaticamente.</p>}
    <section className="cc139-grid">
      <article><Clock/><span>Programações</span><strong>{operational.length}</strong></article>
      <article><Hotel/><span>Descansos ≥ 12 h</span><strong>{restGaps.length}</strong></article>
      <article><MapPin/><span>Tempos em solo ≥ 60 min</span><strong>{groundGaps.length}</strong></article>
    </section>
    <section className="cc139-card">
      <h2>Programação a editar</h2>
      {selected?.kind === 'stay' && <p role="status">{stayDisplay.label(selected.id)}</p>}
      <div className="cc139-form" onChange={() => { dirty.current = true; }}>
        <label className="wide">Programação
          <select value={selected?.id || ''} onChange={(event) => selectProgram(event.target.value)}><option value="">Escolher programação</option>{operational.map((item) => <option key={item.id} value={item.id}>{item.kind === 'stay' ? stayDisplay.label(item.id) + ' · ' : ''}{isoDay(item.date || item.canonical?.startDateTime)} · {item.title || item.id} · {item.origin || '—'} → {item.destination || '—'}</option>)}</select>
        </label>
        <label>Hotel<input value={draft.hotelName} onChange={(event) => { setDraft({ ...draft, hotelName: event.target.value }); setManual(true); }} placeholder="Hotel de pernoite ou contingência"/></label>
        <label>Número do quarto<input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Opcional e protegido"/></label>
        <label>Aeroporto/local<input value={draft.airport} onChange={(event) => setDraft({ ...draft, airport: event.target.value.toUpperCase() })} placeholder="Ex.: FOR"/></label>
        <label>{selected?.kind === 'stay' ? 'APZ no hotel (manual ou salva)' : 'Apresentação'}<input type="time" value={draft.presentationTime} onChange={(event) => setDraft({ ...draft, presentationTime: event.target.value })}/></label>
        {selected?.kind === 'stay' && <><label>Data da APZ no hotel<input type="date" value={apzDate} onChange={event => setApzDate(event.target.value)}/></label>
        <label>Fuso do hotel<input value={hotelTimeZone} onChange={event => setHotelTimeZone(event.target.value)} placeholder="Ex.: America/Fortaleza"/></label></>}

        <label><input type="checkbox" checked={draft.shareSameHotel} onChange={(event) => setDraft({ ...draft, shareSameHotel: event.target.checked })}/> Autorizar colegas no mesmo hotel a me localizar em emergência</label>
      </div>
      <div className="cc139-actions"><button className="primary" onClick={saveStay} disabled={busy || !selected}><Save/> Salvar hotel, quarto e horário</button><button onClick={() => setManual(true)}><Building2/> Hotel de contingência / manual</button><button type="button" onClick={discardEdits} disabled={!selected}>Descartar edição deste pernoite</button></div>
    </section>
    {selected?.kind === 'stay' && <StayHotelAlarmPreview eventId={selected.id} hotelApzIso={apzEpoch === null ? '' : new Date(apzEpoch).toISOString()}
      timeZone={hotelTimeZone} choice={alarmChoice} defaultLeadMinutes={defaultLead} onChoice={choice => { dirty.current = true; setAlarmChoice(choice); }}/>}
    <section className="cc139-card" aria-label="Antecedência padrão"><h2>Antecedência padrão</h2><p>Alterar o padrão é uma ação separada. Antecedências individuais e horários exatos são preservados. Este padrão ainda é uma prévia desta sessão.</p>
      <label>Minutos do padrão<input type="number" min="0" max="720" value={defaultInput} onChange={event => setDefaultInput(event.target.value)}/></label>
      <button type="button" onClick={() => { const value = Number(defaultInput); if (defaultInput.trim() && Number.isInteger(value) && value >= 0 && value <= 720) setDefaultLead(value); else toast.info('Informe um padrão entre 0 e 720 minutos.'); }}>Aplicar padrão nesta sessão</button></section>
    <section className="cc139-card">
      <h2>Hotéis preferenciais do catálogo</h2>
      <p>Resultados do aeroporto da programação aparecem primeiro. Use cadastro manual quando a contingência levar a outro hotel.</p>
      <div className="cc139-form"><label className="wide"><Search/> Buscar hotel, cidade ou aeroporto<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Prioridade: ${targetAirport || 'aeroporto da programação'}`}/></label></div>
      <div className="cc139-choices">{catalogResults.map((hotel) => <button key={`${hotel.name}-${hotel.airport}`} className={draft.hotelName === hotel.name ? 'active' : ''} onClick={() => chooseHotel(hotel)}><Hotel/>{hotel.name}<small>{hotel.airport || hotel.alternateAirport} · {hotel.city}</small></button>)}</div>
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
  </>;
}
