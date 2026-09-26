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

function stayIdentity(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function updatedAtTime(stay: ConciergeStayRecord): number {
  const time = Date.parse(String(stay.updatedAt || ''));
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Count stays, not calendar dates. Date-only legacy snapshots are conservative fallbacks. */
export function selectConciergeHistoricalStays(
  stays: ConciergeStayRecord[],
  hotelName: unknown,
  currentStayDate?: unknown,
  currentStayId?: unknown,
): ConciergeStayRecord[] {
  const targetHotel = normalizeConciergeHotelName(hotelName);
  if (!targetHotel) return [];
  const currentDay = normalizedStayDay(currentStayDate);
  const currentId = stayIdentity(currentStayId);
  const unique = new Map<string, ConciergeStayRecord>();

  for (const stay of Array.isArray(stays) ? stays : []) {
    const day = normalizedStayDay(stay?.stayDate);
    if (!day) continue;
    const id = stayIdentity(stay?.id);
    const hotel = normalizeConciergeHotelName(stay?.hotelName);
    const key = id ? `id:${id}` : `legacy:${hotel}:${day}`;
    const previous = unique.get(key);
    if (!previous || updatedAtTime(stay) > updatedAtTime(previous)) {
      unique.set(key, { ...stay, stayDate: day });
    }
  }

  const hotelStays = [...unique.values()].filter((stay) => normalizeConciergeHotelName(stay.hotelName) === targetHotel);
  const identifiedDays = new Set(hotelStays.filter((stay) => stayIdentity(stay.id)).map((stay) => stay.stayDate));
  return hotelStays.filter((stay) => {
    const id = stayIdentity(stay.id);
    // An unlinked legacy snapshot cannot prove an additional visit on an identified day.
    if (!id && identifiedDays.has(stay.stayDate)) return false;
    if (currentId && id === currentId) return false;
    // Without identity, keep the legacy exclusion; never guess that an anonymous row is a sibling.
    if (currentDay && stay.stayDate === currentDay && (!currentId || !id)) return false;
    return true;
  });
}

export function buildConciergeRoomMemory(
  stays: ConciergeStayRecord[],
  hotelName: unknown,
  room: unknown,
  currentStayDate?: unknown,
  currentStayId?: unknown,
): ConciergeRoomMemory {
  const targetHotel = normalizeConciergeHotelName(hotelName);
  const targetRoom = normalizeConciergeRoom(room);
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

  const historicalHotelStays = selectConciergeHistoricalStays(stays, hotelName, currentStayDate, currentStayId);
  const historicalRoomStays = targetRoom
    ? historicalHotelStays.filter((item) => normalizeConciergeRoom(item.room) === targetRoom)
    : [];
  const hotelStayDates = uniqueSortedDays(historicalHotelStays);
  const roomStayDates = uniqueSortedDays(historicalRoomStays);

  return {
    hotelVisits: historicalHotelStays.length,
    roomVisits: historicalRoomStays.length,
    lastHotelStayDate: hotelStayDates[0] || null,
    lastRoomStayDate: roomStayDates[0] || null,
    hotelStayDates,
    roomStayDates,
  };
}
