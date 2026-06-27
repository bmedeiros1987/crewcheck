import type { CrewRoster, RosterDay } from './pdfParser';

/**
 * Normaliza a escala sem perder linhas duplicadas do mesmo dia.
 *
 * Importante para CrewRosterReport: é comum a mesma data aparecer mais de uma
 * vez, por exemplo CBF + EMER em 02/06. Versões anteriores usavam Map por data
 * e acabavam sobrescrevendo atividades do mesmo dia. Esta rotina preserva todas
 * as linhas oficiais e apenas acrescenta os dias que faltam.
 */
export function detectAndMarkLayovers(roster: CrewRoster): CrewRoster {
  const officialDays = [...roster.days]
    .map(day => ({ ...day, legs: [...(day.legs || [])] }))
    .sort(compareRosterDays);

  const output: RosterDay[] = [...officialDays];

  addOvernightContinuationMarkers(output, officialDays, roster.base, roster.month, roster.year);

  // Cria inativo/pernoite apenas quando há lacuna real entre uma chegada fora
  // da base e a próxima programação saindo da mesma estação.
  for (let i = 0; i < officialDays.length - 1; i++) {
    const current = officialDays[i];
    if (!isFlightDay(current)) continue;

    const destination = current.legs[current.legs.length - 1]?.destination;
    if (!destination || destination === roster.base) continue;

    const nextFlight = findNextFlightFromStation(officialDays, i + 1, destination);
    if (!nextFlight) continue;

    const currentDate = parseDate(current.date);
    const nextDate = parseDate(nextFlight.date);
    if (!currentDate || !nextDate) continue;

    const gapDays = Math.round((startOfDay(nextDate).getTime() - startOfDay(currentDate).getTime()) / DAY_MS);
    if (gapDays <= 1) continue;

    for (let offset = 1; offset < gapDays; offset++) {
      const inactiveDate = new Date(startOfDay(currentDate));
      inactiveDate.setDate(inactiveDate.getDate() + offset);
      const key = formatDate(inactiveDate);
      const sameDate = output.filter(day => day.date === key);

      if (sameDate.length === 0) {
        output.push(createInativoDay(inactiveDate, roster.base, destination));
        continue;
      }

      // Se já existe dia oficial com DO/DR/DOF/OFF/ASB/HSB/HSBE, respeita.
      // Só transforma dia vazio real em inativo.
      const emptyIndex = output.findIndex(day => day.date === key && isEmptyDay(day));
      if (emptyIndex >= 0) {
        output[emptyIndex] = {
          ...output[emptyIndex],
          type: 'LAYOVER',
          pairingCode: output[emptyIndex].pairingCode || 'INATIVO',
          hotel: destination,
          dutyHours: 0,
          flyingHours: 0,
          legs: [],
          rawText: `${output[emptyIndex].rawText || ''}\nINATIVO/PERNOITE ${destination}`.trim(),
        };
      }
    }
  }

  // v10.8.77: não cria mais calendário completo artificial.
  // Mantém somente dias realmente lidos/gerados por continuidade operacional
  // (incluindo dias do próximo mês já publicados na escala) e remove vazios.
  const officialOrOperationalDays = output.filter(day => {
    if (isEmptyDay(day)) return false;
    if (/Dia sem programação publicada no PDF/i.test(day.rawText || '')) return false;
    const parsed = parseDate(day.date);
    if (!parsed) return false;
    return true;
  });

  return {
    ...roster,
    days: officialOrOperationalDays.sort(compareRosterDays),
  };
}


function addOvernightContinuationMarkers(output: RosterDay[], officialDays: RosterDay[], base: string, rosterMonth: number, rosterYear: number): void {
  for (const day of officialDays) {
    if (!isFlightDay(day)) continue;
    const lastLeg = day.legs[day.legs.length - 1];
    if (!lastLeg?.isNextDay && !day.isNextDay) continue;

    const currentDate = parseDate(day.date);
    if (!currentDate) continue;
    const nextDate = new Date(startOfDay(currentDate));
    nextDate.setDate(nextDate.getDate() + 1);
    // v10.8.77: se a programação cruza para o próximo mês, mantém a continuação real.
    // Não bloqueamos mais por mês de referência, para preservar escalas que já trazem dias do mês seguinte.
    const key = formatDate(nextDate);
    const hasOfficialProgram = output.some(candidate => candidate.date === key && !isEmptyDay(candidate) && candidate.rawText !== 'Dia sem programação publicada no PDF; incluído para exibir a escala completa.');
    if (hasOfficialProgram) continue;

    const arrival = cleanTime(lastLeg.arrivalTime || '00:00');
    const debrief = cleanTime(day.dutyDebrief || addMinutes(arrival, 30));
    const marker = createOvernightContinuationDay(nextDate, base, lastLeg.destination, arrival, debrief, lastLeg.flightNumber);

    const emptyIndex = output.findIndex(candidate => candidate.date === key && isEmptyDay(candidate));
    if (emptyIndex >= 0) output[emptyIndex] = marker;
    else output.push(marker);
  }
}

function createOvernightContinuationDay(date: Date, base: string, station: string, arrival: string, debrief: string, flightNumber: string): RosterDay {
  return {
    date: formatDate(date),
    dayNumber: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
    dayOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][date.getDay()],
    type: 'LAYOVER',
    pairingCode: 'FIM-JORNADA',
    dutyReport: arrival,
    dutyDebrief: debrief,
    legs: [],
    dutyHours: timeDiffHours(arrival, debrief),
    flyingHours: 0,
    isNextDay: false,
    hotel: station,
    base,
    rawText: `CONTINUACAO_MADRUGADA voo ${flightNumber}: chegada ${station} ${arrival}; fim da jornada ${debrief}`,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function compareRosterDays(a: RosterDay, b: RosterDay): number {
  const da = parseDate(a.date)?.getTime() ?? 0;
  const db = parseDate(b.date)?.getTime() ?? 0;
  if (da !== db) return da - db;
  const ta = a.dutyReport ? timeToMinutes(a.dutyReport) : 9999;
  const tb = b.dutyReport ? timeToMinutes(b.dutyReport) : 9999;
  return ta - tb;
}

function isFlightDay(day: RosterDay): boolean {
  return day.type === 'VOO' && Array.isArray(day.legs) && day.legs.length > 0;
}

function isEmptyDay(day: RosterDay): boolean {
  return day.type === 'OTHER' && !day.dutyReport && !day.dutyDebrief && !(day.legs || []).length && !day.pairingCode;
}

function findNextFlightFromStation(days: RosterDay[], startIndex: number, station: string): RosterDay | null {
  for (let i = startIndex; i < days.length; i++) {
    const day = days[i];
    if (!isFlightDay(day)) continue;
    const origin = day.legs[0]?.origin;
    if (origin === station) return day;
  }
  return null;
}

function fillMissingCalendarDays(days: RosterDay[], base: string, rosterMonth: number, rosterYear: number): void {
  const parsedDates = days
    .map(day => parseDate(day.date))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());

  if (parsedDates.length === 0) return;

  const firstOfficial = startOfDay(parsedDates[0]);
  const lastOfficial = startOfDay(parsedDates[parsedDates.length - 1]);
  const monthStart = new Date(rosterYear, rosterMonth - 1, 1);
  const monthEnd = new Date(rosterYear, rosterMonth, 0);

  // Completa somente o mês de referência. Dias de transbordo são contexto de
  // leitura e não devem bagunçar a tela principal com dois meses.
  const first = monthStart;
  const last = monthEnd;
  const existingDates = new Set(days.map(day => day.date));
  const cursor = new Date(first);

  while (cursor.getTime() <= last.getTime()) {
    const key = formatDate(cursor);
    if (!existingDates.has(key)) {
      days.push(createEmptyRosterDay(cursor, base));
      existingDates.add(key);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
}

function createEmptyRosterDay(date: Date, base: string): RosterDay {
  return {
    date: formatDate(date),
    dayNumber: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
    dayOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][date.getDay()],
    type: 'OTHER',
    pairingCode: '',
    dutyReport: null,
    dutyDebrief: null,
    legs: [],
    dutyHours: 0,
    flyingHours: 0,
    isNextDay: false,
    hotel: null,
    base,
    rawText: 'Dia sem programação publicada no PDF; incluído para exibir a escala completa.',
  };
}

function createInativoDay(date: Date, base: string, station: string): RosterDay {
  return {
    date: formatDate(date),
    dayNumber: date.getDate(),
    month: date.getMonth() + 1,
    year: date.getFullYear(),
    dayOfWeek: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][date.getDay()],
    type: 'LAYOVER',
    pairingCode: 'INATIVO',
    dutyReport: null,
    dutyDebrief: null,
    legs: [],
    dutyHours: 0,
    flyingHours: 0,
    isNextDay: false,
    hotel: station,
    base,
    rawText: `Dia em branco na escala após programação: INATIVO/PERNOITE ${station}`,
  };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function formatDate(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.replace('(+1)', '').split(':').map(Number);
  return (hour || 0) * 60 + (minute || 0);
}


function cleanTime(value: string): string {
  return String(value || '').replace('(+1)', '').replace(/^([0-9]):/, '0$1:');
}

function addMinutes(time: string, minutes: number): string {
  const [hour, minute] = cleanTime(time).split(':').map(Number);
  const total = (hour || 0) * 60 + (minute || 0) + minutes;
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function timeDiffHours(start: string, end: string): number {
  let diff = timeToMinutes(end) - timeToMinutes(start);
  if (diff < 0) diff += 1440;
  return Math.round((diff / 60) * 100) / 100;
}
