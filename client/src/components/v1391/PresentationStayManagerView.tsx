import { useEffect, useMemo, useState } from 'react';
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

export default function PresentationStayManagerView({ events }: { events: RosterEvent[] }) {
  const operational = useMemo(() => events.filter((event) => !event.kind || ['flight', 'duty', 'stay'].includes(event.kind)).filter((event) => Number.isFinite(eventStart(event).getTime())).sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime()), [events]);
  const [stays, setStays] = useState<any[]>([]);
  const [homeAddress, setHomeAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [selectedId, setSelectedId] = useState(() => operational[0]?.id || '');
  const [query, setQuery] = useState('');
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const selected = operational.find((event) => event.id === selectedId) || operational[0] || null;
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
    const [stayPayload, addressPayload] = await Promise.all([
      listPlatformStays(),
      v139Api('/api/platform/home-address').catch(() => ({ address: null })),
    ]);
    setStays(stayPayload.stays || []);
    if (addressPayload.address) {
      setHomeAddress(addressPayload.address.formattedAddress || '');
      setPostalCode(addressPayload.address.postalCode || '');
    }
  }

  useEffect(() => { refresh().catch(() => undefined); }, []);

  useEffect(() => {
    if (!selected) return;
    const date = isoDay(selected.date || selected.canonical?.startDateTime);
    const saved = stays.find((item) => String(item.stayDate || '').slice(0, 10) === date);
    setDraft({
      hotelName: saved?.hotelName || selected.hotel || '',
      airport: saved?.airport || selected.destination || selected.origin || '',
      stayDate: date,
      room: saved?.room || '',
      presentationTime: saved?.presentationTime || (selected.presentation && selected.presentation !== 'Conexão/Solo' ? selected.presentation : ''),
      leadMinutes: String(saved?.leadMinutes || 90),
      shareSameHotel: Boolean(saved?.shareSameHotel),
    });
    setManual(false);
  }, [selectedId, selected?.id, stays.length]);

  function chooseHotel(hotel: (typeof CREW_HOTEL_CATALOG)[number]) {
    setDraft((current) => ({ ...current, hotelName: hotel.name, airport: hotel.airport || hotel.alternateAirport || current.airport }));
    setManual(false);
    toast.success('Hotel do catálogo selecionado.');
  }

  async function saveStay() {
    if (!draft.hotelName.trim()) return toast.info('Informe o hotel ou use o endereço de casa para descanso na base.');
    setBusy(true);
    try {
      const existing = stays.find((item) => String(item.stayDate || '').slice(0, 10) === draft.stayDate);
      const payload = await updatePlatformStay({
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
        source: manual ? 'contingency-manual' : 'catalog-preferred',
      });
      setStays(payload.stays || stays);
      await refresh();
      toast.success('Hotel, quarto e apresentação salvos para esta programação.');
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
      <article><Hotel/><span>Descansos ≥ 12 h</span><strong>{restGaps.length}</strong></article>
      <article><MapPin/><span>Tempos em solo ≥ 60 min</span><strong>{groundGaps.length}</strong></article>
    </section>
    <section className="cc139-card">
      <h2>Programação a editar</h2>
      <div className="cc139-form">
        <label className="wide">Programação
          <select value={selected?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>{operational.map((item) => <option key={item.id} value={item.id}>{isoDay(item.date || item.canonical?.startDateTime)} · {item.title || item.id} · {item.origin || '—'} → {item.destination || '—'}</option>)}</select>
        </label>
        <label>Hotel<input value={draft.hotelName} onChange={(event) => { setDraft({ ...draft, hotelName: event.target.value }); setManual(true); }} placeholder="Hotel de pernoite ou contingência"/></label>
        <label>Número do quarto<input value={draft.room} onChange={(event) => setDraft({ ...draft, room: event.target.value })} placeholder="Opcional e protegido"/></label>
        <label>Aeroporto/local<input value={draft.airport} onChange={(event) => setDraft({ ...draft, airport: event.target.value.toUpperCase() })} placeholder="Ex.: FOR"/></label>
        <label>Apresentação<input type="time" value={draft.presentationTime} onChange={(event) => setDraft({ ...draft, presentationTime: event.target.value })}/></label>
        <label>Antecedência do despertador<select value={draft.leadMinutes} onChange={(event) => setDraft({ ...draft, leadMinutes: event.target.value })}><option value="60">60 min</option><option value="75">75 min</option><option value="90">90 min</option><option value="120">120 min</option></select></label>
        <label><input type="checkbox" checked={draft.shareSameHotel} onChange={(event) => setDraft({ ...draft, shareSameHotel: event.target.checked })}/> Autorizar colegas no mesmo hotel a me localizar em emergência</label>
      </div>
      <div className="cc139-actions"><button className="primary" onClick={saveStay} disabled={busy}><Save/> Salvar hotel, quarto e horário</button><button onClick={() => setManual(true)}><Building2/> Hotel de contingência / manual</button></div>
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
