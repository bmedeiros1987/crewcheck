import type { CanonicalRosterEvent } from './canonicalRoster';
import type { publishedNightJourneySequence } from './publishedNightJourneys';

export type AlertDateEvidence = { date: string; journeyId: string; description: string };
const clock = (instant: number) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);

/** Evidence comes from the same confirmed/possible sequence used by the engine. */
export function nightSequenceEvidence(sequence: ReturnType<typeof publishedNightJourneySequence>, events: CanonicalRosterEvent[], possible = false): AlertDateEvidence[] {
  return (possible ? sequence.possibleLongest : sequence.longest).flatMap(journey => {
    const group = events.filter(event => event.journeyId === journey.journeyId && ['flight', 'duty'].includes(event.kind));
    const intervals = group.filter(event => event.kind === 'flight' || journey.timingKnown).map(event => `${event.kind === 'flight' ? 'Voo' : 'Atividade'} ${clock(Date.parse(event.startDateTime))} → ${clock(Date.parse(event.endDateTime))} BRT`);
    const endpoints = `Apresentação ${journey.startProven === null ? 'não comprovada' : clock(journey.startProven)}; término ${journey.endProven === null ? 'não comprovado' : clock(journey.endProven)} (BRT).`;
    return [...new Set(group.map(event => event.date))].map(date => ({ date, journeyId: journey.journeyId,
      description: `${journey.night && journey.timingKnown ? 'Madrugada trabalhada: intervalo toca 00:00–06:00 BRT.' : 'Participação apenas possível; horário de atividade não comprovado.'} ${intervals.join('; ')}. ${endpoints}` }));
  });
}

/** Civil dates are evidence, not the legal journey streak or rolling window. */
export function workedCivilNightEvidence(
  sequence: ReturnType<typeof publishedNightJourneySequence>,
  events: readonly CanonicalRosterEvent[],
) {
  const hour = 3_600_000, day = 24 * hour, brtOffset = 3 * hour;
  const dates = new Set<number>();
  for (const journey of sequence.longest) {
    if (!journey.night || !journey.timingKnown) continue;
    for (const event of events) {
      if (event.journeyId !== journey.journeyId || !['flight', 'duty'].includes(event.kind)) continue;
      const start = Date.parse(event.startDateTime), end = Date.parse(event.endDateTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const firstDay = Math.floor((start - brtOffset) / day) * day;
      for (let civilDay = firstDay; civilDay + brtOffset < end; civilDay += day) {
        const midnight = civilDay + brtOffset;
        if (start < midnight + 6 * hour && end > midnight) dates.add(civilDay);
      }
    }
  }
  const sorted = [...dates].sort((a, b) => a - b);
  let previous: number | null = null, run = 0, longest = 0;
  for (const date of sorted) {
    run = previous !== null && date - previous === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return {
    dates: sorted.map(date => new Date(date).toISOString().slice(0, 10).split('-').reverse().join('/')),
    maxConsecutiveDates: longest,
  };
}
