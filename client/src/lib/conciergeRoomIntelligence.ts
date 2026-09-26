import {
  normalizeConciergeHotelName,
  normalizeConciergeRoom,
  selectConciergeHistoricalStays,
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
  currentStayId?: unknown,
): ConciergeRoomIntelligence {
  const targetHotel = normalizeConciergeHotelName(hotelName);

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

  const historicalStays = selectConciergeHistoricalStays(stays, hotelName, currentStayDate, currentStayId);
  const roomStays = new Map<string, ConciergeStayRecord[]>();

  for (const stay of historicalStays) {
    const room = normalizeConciergeRoom(stay.room);
    if (!room) continue;
    const records = roomStays.get(room) || [];
    records.push(stay);
    roomStays.set(room, records);
  }

  const knownRooms = Array.from(roomStays.entries())
    .map(([room, records]) => {
      const stayDates = [...new Set(records.map((stay) => normalizedStayDay(stay.stayDate)))]
        .sort((a, b) => b.localeCompare(a));
      return {
        room,
        visits: records.length,
        lastStayDate: stayDates[0],
        stayDates,
      };
    })
    .sort((a, b) => b.visits - a.visits || b.lastStayDate.localeCompare(a.lastStayDate) || a.room.localeCompare(b.room, 'pt-BR'));

  const mostRecentRoom = [...knownRooms]
    .sort((a, b) => b.lastStayDate.localeCompare(a.lastStayDate) || b.visits - a.visits || a.room.localeCompare(b.room, 'pt-BR'))[0] || null;

  return {
    hotelVisits: historicalStays.length,
    staysWithKnownRoom: knownRooms.reduce((total, room) => total + room.visits, 0),
    distinctRooms: knownRooms.length,
    knownRooms,
    mostFrequentRoom: knownRooms[0] || null,
    mostRecentRoom,
  };
}
