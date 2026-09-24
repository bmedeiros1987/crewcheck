import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Clock, History, Home, Hotel, MapPin, Save, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { CREW_HOTEL_CATALOG } from '@/data/crewHotels';
import { buildConciergeRoomMemory } from '@/lib/conciergeRoomHistory';
import { buildConciergeRoomIntelligence } from '@/lib/conciergeRoomIntelligence';
import {
  findConciergeRoomPreference,
  listConciergeRoomPreferences,
  nextConciergeRoomTrait,
  saveConciergeRoomPreference,
  type ConciergeRoomPreference,
  type ConciergeRoomPreferenceValue,
  type ConciergeRoomTraitValue,
} from '@/lib/conciergeRoomPreferences';
import { buildConciergeStaySuggestions, selectConciergeStayFocus, type ConciergeHotelSource } from '@/lib/conciergeStayInference';
import { listConciergeStays, saveConciergeStay } from '@/lib/conciergeStaySync';
import { v139Api } from '@/components/v139/api';
import { V139Header } from '@/components/v139/Shell';
import '@/components/v139/v139.css';

type RosterEvent = {
  id: string;
  kind?: string;
  title?: string;
  date?: Date | string;
  origin?: string;
  destination?: string;
  hotel?: string;
  presentation?: string;
  arrival?: string;
  departure?: string;
  canonical?: {
    kind?: string;
    date?: string;
    startDateTime?: string;
    endDateTime?: string;
    groundBeforeMinutes?: number | null;
    showPresentation?: boolean;
  };
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

type RoomTraitKey = 'quiet' | 'blackout' | 'wifi' | 'climate' | 'shower';

const ROOM_TRAITS: Array<{ key: RoomTraitKey; label: string }> = [
  { key: 'quiet', label: 'Silêncio' },
  { key: 'blackout', label: 'Blackout' },
  { key: 'wifi', label: 'Wi-Fi' },
  { key: 'climate', label: 'Ar-condicionado' },
  { key: 'shower', label: 'Chuveiro' },
];

function isoDay(value?: Date | string) {
  if (typeof value === 'string') {
    const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) return `${br[3]}-${String(Number(br[2])).padStart(2, '0')}-${String(Number(br[1])).padStart(2, '0')}`;
  }
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

function labelStayDay(day: string) {
  const match = String(day || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : day;
}

function timesLabel(value: number) {
  return value === 1 ? '1 vez' : `${value} vezes`;
}

function hotelSourceLabel(source: ConciergeHotelSource) {
  if (source === 'saved') return 'Salvo por você';
  if (source === 'roster') return 'Publicado na escala';
  if (source === 'history-unique') return 'Sugestão pelo seu histórico nesta localidade';
  if (source === 'catalog-unique') return 'Único hotel do catálogo nesta localidade';
  return 'Hotel a confirmar';
}

function roomPreferenceLabel(value: ConciergeRoomPreferenceValue | undefined) {
  if (value === 'prefer') return 'Prefiro este quarto';
  if (value === 'avoid') return 'Evitar este quarto';
  return 'Sem preferência definida';
}

function roomTraitLabel(value: ConciergeRoomTraitValue | undefined) {
  if (value === 'good') return 'Bom';
  if (value === 'bad') return 'Ruim';
  return 'Não avaliado';
}

export default function PresentationStayManagerView({ events }: { events: RosterEvent[] }) {
  const operational = useMemo(() => events.filter((event) => !event.kind || ['flight', 'duty', 'stay'].includes(event.kind)).filter((event) => Number.isFinite(eventStart(event).getTime())).sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime()), [events]);
  const [stays, setStays] = useState<any[]>([]);
  const [homeAddress, setHomeAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [selectedId, setSelectedId] = useState(() => operational.find((event) => event.kind === 'stay' || event.canonical?.kind === 'stay')?.id || operational[0]?.id || '');
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [roomPreferences, setRoomPreferences] = useState<ConciergeRoomPreference[]>(() => listConciergeRoomPreferences());
  const didAutoFocusStay = useRef(false);
  const selected = operational.find((event) => event.id === selectedId) || operational[0] || null;
  const [draft, setDraft] = useState<StayDraft>({ hotelName: '', airport: '', stayDate: isoDay(), room: '', presentationTime: '', leadMinutes: '90', shareSameHotel: false });

  const staySuggestions = useMemo(
    () => buildConciergeStaySuggestions(operational, stays, CREW_HOTEL_CATALOG),
    [operational, stays],
  );
  const preferredStay = useMemo(() => selectConciergeStayFocus(staySuggestions), [staySuggestions]);
  const selectedStaySuggestion = staySuggestions.find((item) => item.eventId === selected?.id) || null;

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
  const targetAirport = selectedStaySuggestion?.airport || selected?.destination || selected?.origin || draft.airport;
  const catalogResults = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return CREW_HOTEL_CATALOG
      .map((hotel) => ({ hotel, exactAirport: [hotel.airport, hotel.alternateAirport].includes(String(targetAirport || '').toUpperCase()) }))
      .filter(({ hotel, exactAirport }) => exactAirport || !normalizedQuery || `${hotel.name} ${hotel.city} ${hotel.airport} ${hotel.alternateAirport}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      .sort((a, b) => Number(b.exactAirport) - Number(a.exactAirport) || a.hotel.name.localeCompare(b.hotel.name, 'pt-BR'))
      .slice(0, 12)
      .map(({ hotel }) => hotel);
  }, [query, targetAirport]);
  const roomMemory = useMemo(
    () => buildConciergeRoomMemory(stays, draft.hotelName, draft.room, draft.stayDate),
    [stays, draft.hotelName, draft.room, draft.stayDate],
  );
  const roomIntelligence = useMemo(
    () => buildConciergeRoomIntelligence(stays, draft.hotelName, draft.stayDate),
    [stays, draft.hotelName, draft.stayDate],
  );
  const currentRoomPreference = useMemo(
    () => findConciergeRoomPreference(roomPreferences, draft.hotelName, draft.room),
    [roomPreferences, draft.hotelName, draft.room],
  );

  async function refresh() {
    const [stayPayload, addressPayload] = await Promise.all([
      listConciergeStays(),
      v139Api('/api/platform/home-address').catch(() => ({ address: null })),
    ]);
    setStays(stayPayload.stays || []);
    setPendingSyncCount(Number(stayPayload.pendingSyncCount || 0));
    if (addressPayload.address) {
      setHomeAddress(addressPayload.address.formattedAddress || '');
      setPostalCode(addressPayload.address.postalCode || '');
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    const handleOnline = () => refresh().catch(() => undefined);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  useEffect(() => {
    if (didAutoFocusStay.current || !preferredStay) return;
    setSelectedId(preferredStay.eventId);
    didAutoFocusStay.current = true;
  }, [preferredStay?.eventId]);

  useEffect(() => {
    if (!selected) return;
    const suggestion = staySuggestions.find((item) => item.eventId === selected.id);
    const date = suggestion?.stayDate || isoDay(selected.canonical?.date || selected.date || selected.canonical?.startDateTime);
    const saved = stays.find((item) => String(item.stayDate || '').slice(0, 10) === date);
    setDraft({
      hotelName: saved?.hotelName || suggestion?.hotelName || selected.hotel || '',
      airport: saved?.airport || suggestion?.airport || selected.destination || selected.origin || '',
      stayDate: date,
      room: saved?.room || '',
      presentationTime: saved?.presentationTime || suggestion?.presentationTime || (selected.presentation && selected.presentation !== 'Conexão/Solo' ? selected.presentation : ''),
      leadMinutes: String(saved?.leadMinutes || 90),
      shareSameHotel: Boolean(saved?.shareSameHotel),
    });
    setManual(false);
  }, [selectedId, selected?.id, stays, staySuggestions]);

  function chooseHotel(hotel: (typeof CREW_HOTEL_CATALOG)[number]) {
    setDraft((current) => ({ ...current, hotelName: hotel.name, airport: hotel.airport || hotel.alternateAirport || current.airport }));
    setManual(false);
    toast.success('Hotel do catálogo selecionado.');
  }

  function updateRoomPreference(preference: ConciergeRoomPreferenceValue) {
    if (!draft.hotelName.trim() || !draft.room.trim()) return toast.info('Informe hotel e quarto antes de registrar sua experiência.');
    setRoomPreferences(saveConciergeRoomPreference(draft.hotelName, draft.room, { preference, observedStayDate: draft.stayDate }));
    toast.success('Preferência do quarto salva neste aparelho.');
  }

  function cycleRoomTrait(key: RoomTraitKey) {
    if (!draft.hotelName.trim() || !draft.room.trim()) return toast.info('Informe hotel e quarto antes de registrar sua experiência.');
    const current = currentRoomPreference?.[key] || 'unknown';
    setRoomPreferences(saveConciergeRoomPreference(draft.hotelName, draft.room, {
      [key]: nextConciergeRoomTrait(current),
      observedStayDate: draft.stayDate,
    }));
  }

  async function saveStay() {
    if (!draft.hotelName.trim()) return toast.info('Informe o hotel ou use o endereço de casa para descanso na base.');
    setBusy(true);
    try {
      const existing = stays.find((item) => String(item.stayDate || '').slice(0, 10) === draft.stayDate);
      const payload = await saveConciergeStay({
        id: existing?.id,
        stayDate: draft.stayDate,
        hotelName: draft.hotelName.trim(),
        airport: draft.airport.trim().toUpperCase(),
        room: draft.room.trim(),
        presentationTime: draft.presentationTime.trim(),
        leadMinutes: Number(draft.leadMinutes) || 90,
        learnRule: true,
        shareSameHotel: draft.shareSameHotel,
        shareWithVisitors: false,
        source: manual ? 'contingency-manual' : `concierge-${selectedStaySuggestion?.hotelSource || 'catalog-preferred'}`,
      });
      setStays(payload.stays || stays);
      setPendingSyncCount(Number(payload.pendingSyncCount || 0));
      if (payload.queued) {
        toast.info('Pernoite salvo neste aparelho. O CrewCheck sincronizará automaticamente quando a internet voltar.');
      } else {
        await refresh();
        toast.success('Hotel, quarto e apresentação salvos para esta programação.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não consegui salvar o pernoite.');
    } finally {
      setBusy(false);
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
    <section className="cc139-grid">
      <article><Clock/><span>Programações</span><strong>{operational.length}</strong></article>
      <article><Hotel/><span>Pernoites detectados</span><strong>{staySuggestions.length}</strong></article>
      <article><MapPin/><span>Tempos em solo ≥ 60 min</span><strong>{groundGaps.length}</strong></article>
    </section>
    <section className="cc139-card">
      <Hotel/><h2>Pernoite automático</h2>
      {staySuggestions.length > 0 ? <>
        <p>O CrewCheck localizou os pernoites usando somente eventos canônicos de estadia e priorizou automaticamente a estadia atual ou a próxima.</p>
        <div className="cc139-choices">{staySuggestions.slice(0, 8).map((stay) => <button key={stay.eventId} className={selected?.id === stay.eventId ? 'active' : ''} onClick={() => setSelectedId(stay.eventId)}>
          <Hotel/>{stay.airport || 'Localidade'} · {labelStayDay(stay.stayDate)}
          <small>{stay.hotelName ? `${stay.hotelName} · ${hotelSourceLabel(stay.hotelSource)}` : 'Hotel ainda não identificado — escolha no catálogo ou informe uma contingência.'}</small>
          {stay.presentationTime && <small>Próxima apresentação · {stay.presentationTime}</small>}
        </button>)}</div>
      </> : <p>Nenhum pernoite canônico foi encontrado na escala carregada.</p>}
      <small>A detecção automática usa apenas eventos canônicos de estadia. Ela não promove `journey-rest` a pernoite e não altera parser, APZ, journey ou a escala canônica.</small>
    </section>
    <section className="cc139-card">
      <h2>Programação a editar</h2>
      <div className="cc139-form">
        <label className="wide">Programação
          <select value={selected?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>{operational.map((item) => <option key={item.id} value={item.id}>{isoDay(item.canonical?.date || item.date || item.canonical?.startDateTime)} · {item.title || item.id} · {item.origin || '—'} → {item.destination || '—'}</option>)}</select>
        </label>
        <label>Hotel<input value={draft.hotelName} onChange={(event) => { setDraft({ ...draft, hotelName: event.target.value }); setManual(true); }} placeholder="Hotel de pernoite ou contingência"/></label>
        <label>Número do quarto<input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Opcional e protegido"/></label>
        <label>Aeroporto/local<input value={draft.airport} onChange={(event) => setDraft({ ...draft, airport: event.target.value.toUpperCase() })} placeholder="Ex.: FOR"/></label>
        <label>Apresentação<input type="time" value={draft.presentationTime} onChange={(event) => setDraft({ ...draft, presentationTime: event.target.value })}/></label>
        <label>Antecedência do despertador<select value={draft.leadMinutes} onChange={(event) => setDraft({ ...draft, leadMinutes: event.target.value })}><option value="60">60 min</option><option value="75">75 min</option><option value="90">90 min</option><option value="120">120 min</option></select></label>
        <label><input type="checkbox" checked={draft.shareSameHotel} onChange={(event) => setDraft({ ...draft, shareSameHotel: event.target.checked })}/> Autorizar colegas no mesmo hotel a me localizar em emergência</label>
      </div>
      {selectedStaySuggestion && <small>{selectedStaySuggestion.hotelName ? `${hotelSourceLabel(selectedStaySuggestion.hotelSource)}. Revise apenas se houve troca operacional ou contingência.` : 'A localidade do pernoite foi detectada, mas o hotel permanece a confirmar.'}</small>}
      <div className="cc139-actions"><button className="primary" onClick={saveStay} disabled={busy}><Save/> Salvar hotel, quarto e horário</button><button onClick={() => setManual(true)}><Building2/> Hotel de contingência / manual</button></div>
      {pendingSyncCount > 0 && <small>{pendingSyncCount === 1 ? '1 alteração de pernoite aguarda sincronização.' : `${pendingSyncCount} alterações de pernoite aguardam sincronização.`} O envio será retomado automaticamente quando houver conexão.</small>}
    </section>
    <section className="cc139-card">
      <History/><h2>Memória do pernoite</h2>
      {!draft.hotelName.trim() ? <p>Selecione ou informe o hotel para consultar seu histórico privado de estadias.</p> : <>
        <p>{roomMemory.hotelVisits > 0 ? `Você já ficou neste hotel ${timesLabel(roomMemory.hotelVisits)}.` : 'Ainda não há outra estadia registrada neste hotel.'}</p>
        {draft.room.trim() ? <>
          <p>{roomMemory.roomVisits > 0 ? `Você já ficou neste quarto ${timesLabel(roomMemory.roomVisits)}.` : `O quarto ${draft.room.trim()} ainda não aparece no seu histórico anterior.`}</p>
          {roomMemory.roomStayDates.length > 0 && <div className="cc139-badges">{roomMemory.roomStayDates.slice(0, 3).map((day) => <span key={day}>Estadia · {labelStayDay(day)}</span>)}</div>}
        </> : <p>Informe o número do quarto para o CrewCheck reconhecer automaticamente quando você voltar ao mesmo quarto.</p>}
        <small>Esta memória é privada e usa apenas suas próprias estadias salvas. A estadia atual não entra na contagem histórica.</small>
      </>}
    </section>
    <section className="cc139-card">
      <History/><h2>Room Intelligence</h2>
      {!draft.hotelName.trim() ? <p>Selecione ou informe o hotel para o CrewCheck analisar seus quartos anteriores.</p> : roomIntelligence.hotelVisits === 0 ? <>
        <p>Ainda não há estadias anteriores suficientes neste hotel para formar inteligência de quarto.</p>
        <small>O CrewCheck começa a aprender automaticamente conforme seus pernoites e quartos são salvos.</small>
      </> : <>
        <p>Seu histórico neste hotel tem {roomIntelligence.hotelVisits} {roomIntelligence.hotelVisits === 1 ? 'estadia anterior' : 'estadias anteriores'} e {roomIntelligence.distinctRooms} {roomIntelligence.distinctRooms === 1 ? 'quarto identificado' : 'quartos identificados'}.</p>
        {roomIntelligence.mostFrequentRoom ? <>
          <p>Quarto mais recorrente: <strong>{roomIntelligence.mostFrequentRoom.room}</strong> · {timesLabel(roomIntelligence.mostFrequentRoom.visits)} · última em {labelStayDay(roomIntelligence.mostFrequentRoom.lastStayDate)}.</p>
          {roomIntelligence.mostRecentRoom && roomIntelligence.mostRecentRoom.room !== roomIntelligence.mostFrequentRoom.room && <p>Último quarto registrado: <strong>{roomIntelligence.mostRecentRoom.room}</strong> · {labelStayDay(roomIntelligence.mostRecentRoom.lastStayDate)}.</p>}
          <div className="cc139-badges">{roomIntelligence.knownRooms.slice(0, 3).map((item) => <span key={item.room}>Quarto {item.room} · {timesLabel(item.visits)} · {labelStayDay(item.lastStayDate)}</span>)}</div>
        </> : <p>Há histórico do hotel, mas os pernoites anteriores não possuem número de quarto registrado.</p>}
        <small>Room Intelligence usa apenas seu histórico privado sincronizado. Um quarto recorrente é uma referência histórica e não significa que este seja o quarto atribuído agora.</small>
      </>}
    </section>
    <section className="cc139-card">
      <History/><h2>Minha experiência neste quarto</h2>
      {!draft.hotelName.trim() ? <p>Selecione ou informe o hotel para registrar sua experiência.</p> : !draft.room.trim() ? <p>Informe o número do quarto para salvar uma preferência privada e observações objetivas.</p> : <>
        <p>Quarto <strong>{draft.room.trim()}</strong> · {roomPreferenceLabel(currentRoomPreference?.preference)}.</p>
        <div className="cc139-form">
          <label>Minha preferência
            <select value={currentRoomPreference?.preference || 'neutral'} onChange={(event) => updateRoomPreference(event.target.value as ConciergeRoomPreferenceValue)}>
              <option value="neutral">Sem preferência definida</option>
              <option value="prefer">Prefiro este quarto</option>
              <option value="avoid">Evitar este quarto</option>
            </select>
          </label>
        </div>
        <div className="cc139-choices">{ROOM_TRAITS.map((trait) => {
          const value = currentRoomPreference?.[trait.key] || 'unknown';
          return <button key={trait.key} className={value === 'good' ? 'active' : ''} onClick={() => cycleRoomTrait(trait.key)}>{trait.label}<small>{roomTraitLabel(value)} · toque para alterar</small></button>;
        })}</div>
        {currentRoomPreference?.updatedAt && <small>Observação vinculada à estadia de {labelStayDay(currentRoomPreference.observedStayDate || draft.stayDate)} · atualizada em {labelDate(new Date(currentRoomPreference.updatedAt))}.</small>}
        <small>Estas observações são privadas e ficam somente neste aparelho nesta etapa. A data da estadia fica registrada para evitar tratar uma percepção antiga como fato atual.</small>
      </>}
    </section>
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
