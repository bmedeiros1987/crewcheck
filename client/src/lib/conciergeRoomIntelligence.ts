import {
  normalizeConciergeHotelName,
  normalizeConciergeRoom,
  type ConciergeStayRecord,
} from './conciergeRoomHistory';

export type ConciergeKnownRoom = {
  room: string;
  visits: number;
  lastStayDate: string;
  stayDates: string[];
};

export type ConciergeRoomIntelligence = {
  hotelVisits: number;
  staysWithKnownRoom: number;
  distinctRooms: number;
  knownRooms: ConciergeKnownRoom[];
  mostFrequentRoom: ConciergeKnownRoom | null;
  mostRecentRoom: ConciergeKnownRoom | null;
};

function normalizedStayDay(value: unknown): string {
  const raw = String(value || '').trim();
  const isoDay = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay;

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

export function buildConciergeRoomIntelligence(
  stays: ConciergeStayRecord[],
  hotelName: unknown,
  currentStayDate?: unknown,
): ConciergeRoomIntelligence {
  const targetHotel = normalizeConciergeHotelName(hotelName);
  const currentDay = normalizedStayDay(currentStayDate);

  if (!targetHotel) {
    return {
      hotelVisits: 0,
      staysWithKnownRoom: 0,
      distinctRooms: 0,
      knownRooms: [],
      mostFrequentRoom: null,
      mostRecentRoom: null,
    };
  }

  const hotelDays = new Set<string>();
  const roomDays = new Map<string, Set<string>>();

  for (const stay of Array.isArray(stays) ? stays : []) {
    if (normalizeConciergeHotelName(stay?.hotelName) !== targetHotel) continue;
    const day = normalizedStayDay(stay?.stayDate);
    if (!day || (currentDay && day === currentDay)) continue;

    hotelDays.add(day);
    const room = normalizeConciergeRoom(stay?.room);
    if (!room) continue;

    const days = roomDays.get(room) || new Set<string>();
    days.add(day);
    roomDays.set(room, days);
  }

  const knownRooms = Array.from(roomDays.entries())
    .map(([room, days]) => {
      const stayDates = Array.from(days).sort((a, b) => b.localeCompare(a));
      return {
        room,
        visits: stayDates.length,
        lastStayDate: stayDates[0],
        stayDates,
      };
    })
    .sort((a, b) => b.visits - a.visits || b.lastStayDate.localeCompare(a.lastStayDate) || a.room.localeCompare(b.room, 'pt-BR'));

  const roomVisitDays = new Set<string>();
  for (const room of knownRooms) for (const day of room.stayDates) roomVisitDays.add(day);

  const mostRecentRoom = [...knownRooms]
    .sort((a, b) => b.lastStayDate.localeCompare(a.lastStayDate) || b.visits - a.visits || a.room.localeCompare(b.room, 'pt-BR'))[0] || null;

  return {
    hotelVisits: hotelDays.size,
    staysWithKnownRoom: roomVisitDays.size,
    distinctRooms: knownRooms.length,
    knownRooms,
    mostFrequentRoom: knownRooms[0] || null,
    mostRecentRoom,
  };
}
