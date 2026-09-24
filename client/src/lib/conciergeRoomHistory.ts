export type ConciergeStayRecord = {
  id?: string;
  stayDate?: string;
  hotelName?: string;
  hotelKey?: string;
  airport?: string;
  room?: string;
  updatedAt?: string;
};

export type ConciergeRoomMemory = {
  hotelVisits: number;
  roomVisits: number;
  lastHotelStayDate: string | null;
  lastRoomStayDate: string | null;
  hotelStayDates: string[];
  roomStayDates: string[];
};

export function normalizeConciergeHotelName(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeConciergeRoom(value: unknown): string {
  let normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim()
    .replace(/^(?:QUARTO|ROOM|APTO|APT)\s*[-:#]?\s*/i, '')
    .replace(/[^A-Z0-9]/g, '');

  if (/^\d+$/.test(normalized)) normalized = String(Number(normalized));
  return normalized;
}

function normalizedStayDay(value: unknown): string {
  const raw = String(value || '').trim();
  const isoDay = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return isoDay;

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function uniqueSortedDays(records: ConciergeStayRecord[]): string[] {
  return Array.from(new Set(records.map((item) => normalizedStayDay(item.stayDate)).filter(Boolean)))
    .sort((a, b) => b.localeCompare(a));
}

export function buildConciergeRoomMemory(
  stays: ConciergeStayRecord[],
  hotelName: unknown,
  room: unknown,
  currentStayDate?: unknown,
): ConciergeRoomMemory {
  const targetHotel = normalizeConciergeHotelName(hotelName);
  const targetRoom = normalizeConciergeRoom(room);
  const currentDay = normalizedStayDay(currentStayDate);

  if (!targetHotel) {
    return {
      hotelVisits: 0,
      roomVisits: 0,
      lastHotelStayDate: null,
      lastRoomStayDate: null,
      hotelStayDates: [],
      roomStayDates: [],
    };
  }

  const historicalHotelStays = (Array.isArray(stays) ? stays : []).filter((item) => {
    const day = normalizedStayDay(item?.stayDate);
    if (!day || (currentDay && day === currentDay)) return false;
    return normalizeConciergeHotelName(item?.hotelName) === targetHotel;
  });

  const hotelStayDates = uniqueSortedDays(historicalHotelStays);
  const roomStayDates = targetRoom
    ? uniqueSortedDays(historicalHotelStays.filter((item) => normalizeConciergeRoom(item?.room) === targetRoom))
    : [];

  return {
    hotelVisits: hotelStayDates.length,
    roomVisits: roomStayDates.length,
    lastHotelStayDate: hotelStayDates[0] || null,
    lastRoomStayDate: roomStayDates[0] || null,
    hotelStayDates,
    roomStayDates,
  };
}
