import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import ConciergeStayContextCard from '@/components/v1391/ConciergeStayContextCard';
import { buildConciergeHotelKnowledge } from '@/lib/conciergeHotelKnowledge';
import {
  buildConciergeRoomNoiseSummary,
  findCurrentConciergeRoomNoise,
  listConciergeRoomNoiseObservations,
  saveConciergeRoomNoiseObservation,
  type ConciergeNoiseDayPeriod,
  type ConciergeNoiseDurability,
  type ConciergeNoiseIntensity,
  type ConciergeNoiseOrigin,
  type ConciergeNoiseRecurrence,
  type ConciergeRoomNoiseObservation,
} from '@/lib/conciergeRoomNoise';

type QuickNoisePreset = {
  origin: ConciergeNoiseOrigin;
  label: string;
  detail: string;
  intensity: ConciergeNoiseIntensity;
  recurrence: ConciergeNoiseRecurrence;
};

const QUICK_NOISE_PRESETS: QuickNoisePreset[] = [
  {
    origin: 'neighbor',
    label: 'Vizinho barulhento',
    detail: 'Pontual e com validade curta.',
    intensity: 'high',
    recurrence: 'isolated',
  },
  {
    origin: 'construction',
    label: 'Obra / reforma',
    detail: 'Temporário e precisa ser revalidado.',
    intensity: 'moderate',
    recurrence: 'recurring',
  },
  {
    origin: 'traffic',
    label: 'Trânsito / avenida',
    detail: 'Fica como candidato estrutural, nunca como fato confirmado.',
    intensity: 'moderate',
    recurrence: 'recurring',
  },
];

function currentDayPeriod(date: Date): ConciergeNoiseDayPeriod {
  const hour = date.getHours();
  if (hour < 6) return 'overnight';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function originLabel(origin: ConciergeNoiseOrigin) {
  if (origin === 'traffic') return 'Trânsito / avenida';
  if (origin === 'aircraft') return 'Aeronaves';
  if (origin === 'construction') return 'Obra / reforma';
  if (origin === 'elevator') return 'Elevador';
  if (origin === 'corridor') return 'Corredor';
  if (origin === 'neighbor') return 'Quarto vizinho';
  if (origin === 'leisure-events') return 'Lazer / eventos';
  if (origin === 'hotel-infrastructure') return 'Infraestrutura do hotel';
  if (origin === 'nightlife') return 'Vida noturna externa';
  if (origin === 'temporary-event') return 'Evento temporário';
  return 'Origem não definida';
}

function intensityLabel(intensity: ConciergeNoiseIntensity) {
  if (intensity === 'low') return 'baixo';
  if (intensity === 'moderate') return 'moderado';
  if (intensity === 'high') return 'alto';
  return 'intensidade não avaliada';
}

function periodLabel(period: ConciergeNoiseDayPeriod) {
  if (period === 'overnight') return 'madrugada';
  if (period === 'morning') return 'manhã';
  if (period === 'afternoon') return 'tarde';
  return 'noite';
}

function durabilityLabel(durability: ConciergeNoiseDurability) {
  if (durability === 'structural-candidate') return 'candidato estrutural · não confirmado';
  if (durability === 'temporal') return 'temporário · precisa de revalidação';
  if (durability === 'circumstantial') return 'circunstancial · validade curta';
  return 'contexto ainda indefinido';
}

function validityLabel(observation: ConciergeRoomNoiseObservation) {
  if (observation.durability === 'structural-candidate') return 'candidato estrutural · não confirmado';
  if (!observation.validUntil) return 'sem prazo definido';
  const expiry = new Date(observation.validUntil);
  if (!Number.isFinite(expiry.getTime())) return 'validade desconhecida';
  const date = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(expiry);
  if (observation.durability === 'temporal') return `temporário · revalidar após ${date}`;
  if (observation.durability === 'circumstantial') return `circunstancial · expira em ${date}`;
  return `válido até ${date}`;
}

function observedDateLabel(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'data desconhecida';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date);
}

export default function ConciergeRoomNoiseCard({ hotelName, room, stayDate }: { hotelName: string; room: string; stayDate: string }) {
  const [observations, setObservations] = useState<ConciergeRoomNoiseObservation[]>(() => listConciergeRoomNoiseObservations());
  const current = useMemo(
    () => findCurrentConciergeRoomNoise(observations, hotelName, room),
    [observations, hotelName, room],
  );
  const summary = useMemo(
    () => buildConciergeRoomNoiseSummary(observations, hotelName, room),
    [observations, hotelName, room],
  );
  const hotelKnowledge = useMemo(
    () => buildConciergeHotelKnowledge(observations, hotelName),
    [observations, hotelName],
  );

  function recordNoise(preset: QuickNoisePreset) {
    if (!hotelName.trim() || !room.trim()) {
      toast.info('Informe hotel e quarto antes de registrar uma ocorrência de ruído.');
      return;
    }
    const now = new Date();
    setObservations(saveConciergeRoomNoiseObservation(hotelName, room, {
      origin: preset.origin,
      intensity: preset.intensity,
      recurrence: preset.recurrence,
      dayPeriods: [currentDayPeriod(now)],
      observedAt: now.toISOString(),
      confidence: 'medium',
      evidenceIds: stayDate ? [`stay:${stayDate}`] : [],
    }));
    toast.success('Observação de ruído salva de forma privada neste aparelho.');
  }

  return <>
    <ConciergeStayContextCard hotelName={hotelName} room={room} stayDate={stayDate}/>
    <section className="cc139-card">
      <History/><h2>Ruído observado neste quarto</h2>
      {!hotelName.trim() ? <p>Selecione ou informe o hotel para registrar uma ocorrência.</p> : !room.trim() ? <p>Informe o número do quarto para vincular a observação ao local correto.</p> : <>
        <p>Registre somente o que você percebeu nesta estadia. O CrewCheck mantém contexto e validade para não transformar um episódio pontual em característica permanente do quarto.</p>
        <div className="cc139-choices">{QUICK_NOISE_PRESETS.map((preset) => <button key={preset.origin} onClick={() => recordNoise(preset)}>
          {preset.label}
          <small>{preset.detail}</small>
        </button>)}</div>
        {current.length > 0 ? <>
          <div className="cc139-badges">{current.slice(0, 4).map((observation) => <span key={observation.id}>
            {originLabel(observation.origin)} · {intensityLabel(observation.intensity)}{observation.dayPeriods[0] ? ` · ${periodLabel(observation.dayPeriods[0])}` : ''}
          </span>)}</div>
          {current.slice(0, 4).map((observation) => <small key={`${observation.id}-validity`}>{originLabel(observation.origin)}: {validityLabel(observation)}.</small>)}
        </> : <small>Nenhuma ocorrência de ruído válida registrada neste quarto.</small>}
        {summary.expiredObservations > 0 && <small>{summary.expiredObservations === 1 ? '1 observação antiga já expirou.' : `${summary.expiredObservations} observações antigas já expiraram.`}</small>}
        {summary.structuralCandidateOrigins.length > 0 && <small>Há {summary.structuralCandidateOrigins.length} candidato(s) estrutural(is) no seu histórico privado deste quarto, mas nenhum é tratado como fato confirmado sem corroboração independente.</small>}

        <h3>Hotel Knowledge privado</h3>
        {hotelKnowledge.activeObservations > 0 ? <>
          <p>No seu histórico deste hotel há {hotelKnowledge.activeObservations} {hotelKnowledge.activeObservations === 1 ? 'observação ainda relevante' : 'observações ainda relevantes'} em {hotelKnowledge.roomsWithActiveObservations} {hotelKnowledge.roomsWithActiveObservations === 1 ? 'quarto' : 'quartos'}.</p>
          <div className="cc139-badges">{hotelKnowledge.signals.slice(0, 4).map((signal) => <span key={`${signal.durability}:${signal.origin}`}>
            {originLabel(signal.origin)} · {signal.roomCount} {signal.roomCount === 1 ? 'quarto' : 'quartos'} · última {observedDateLabel(signal.lastObservedAt)}
          </span>)}</div>
          {hotelKnowledge.signals.slice(0, 4).map((signal) => <small key={`${signal.durability}:${signal.origin}:knowledge`}>
            {originLabel(signal.origin)}: {durabilityLabel(signal.durability)} · {signal.observationCount} {signal.observationCount === 1 ? 'registro privado' : 'registros privados'}.
          </small>)}
        </> : <small>Ainda não há observações de ruído relevantes em outros registros privados deste hotel.</small>}
        {hotelKnowledge.expiredObservations > 0 && <small>{hotelKnowledge.expiredObservations === 1 ? '1 observação antiga deste hotel já expirou e não entra como contexto atual.' : `${hotelKnowledge.expiredObservations} observações antigas deste hotel já expiraram e não entram como contexto atual.`}</small>}
        <small>Hotel Knowledge resume somente o seu histórico privado e mantém cada ocorrência vinculada ao quarto em que foi observada. O CrewCheck não transforma um relato de um quarto em característica geral do hotel.</small>
        <small>As observações desta etapa são privadas e ficam somente neste aparelho. Outro tripulante nunca é identificado por esta memória.</small>
      </>}
    </section>
  </>;
}
