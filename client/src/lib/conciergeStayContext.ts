export type ConciergeStayContextStep =
  | 'confirm-hotel'
  | 'register-room'
  | 'set-presentation'
  | 'rest'
  | 'wake'
  | 'presentation'
  | 'completed';

export type ConciergeStayContextInput = {
  stayDate?: unknown;
  hotelName?: unknown;
  room?: unknown;
  presentationTime?: unknown;
  leadMinutes?: unknown;
};

export type ConciergeStayContext = {
  step: ConciergeStayContextStep;
  stayDate: string;
  hotelKnown: boolean;
  roomKnown: boolean;
  presentationTime: string;
  presentationAt: Date | null;
  wakeAt: Date | null;
  leadMinutes: number | null;
  minutesUntilPresentation: number | null;
  minutesUntilWake: number | null;
  canPrepareWakeReminder: boolean;
  isPast: boolean;
};

const PRESENTATION_GRACE_MINUTES = 30;
const SAME_DAY_RESOLUTION_GRACE_HOURS = 6;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function parseStayDate(value: unknown): { year: number; month: number; day: number; key: string } | null {
  const match = text(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;
  return { year, month, day, key: `${match[1]}-${match[2]}-${match[3]}` };
}

function parseClock(value: unknown): { hour: number; minute: number; value: string } | null {
  const match = text(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDate(
  parts: { year: number; month: number; day: number },
  clock: { hour: number; minute: number },
  dayOffset = 0,
): Date {
  return new Date(parts.year, parts.month - 1, parts.day + dayOffset, clock.hour, clock.minute, 0, 0);
}

function resolvePresentationAt(stayDate: unknown, presentationTime: unknown, now: Date): { at: Date; time: string } | null {
  const day = parseStayDate(stayDate);
  const clock = parseClock(presentationTime);
  if (!day || !clock) return null;

  const sameDay = localDate(day, clock, 0);
  const nextDay = localDate(day, clock, 1);
  const nowKey = localDayKey(now);
  const nextDayKey = localDayKey(nextDay);

  if (nowKey < day.key) return { at: sameDay, time: clock.value };
  if (nowKey > nextDayKey) return { at: nextDay, time: clock.value };
  if (nowKey === nextDayKey) return { at: nextDay, time: clock.value };

  // On the stay date, keep a recently passed presentation on the same day so
  // the Concierge can close the timeline instead of silently rolling it to tomorrow.
  // Once it is clearly old, the next-day occurrence is the conservative overnight candidate.
  const sameDayGrace = new Date(sameDay.getTime() + SAME_DAY_RESOLUTION_GRACE_HOURS * 60 * 60 * 1000);
  return { at: now <= sameDayGrace ? sameDay : nextDay, time: clock.value };
}

function normalizeLeadMinutes(value: unknown): number | null {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  return rounded >= 15 && rounded <= 360 ? rounded : null;
}

function minutesBetween(from: Date, to: Date): number {
  return Math.ceil((to.getTime() - from.getTime()) / 60000);
}

export function buildConciergeStayContext(
  input: ConciergeStayContextInput,
  nowInput: Date = new Date(),
): ConciergeStayContext {
  const now = Number.isFinite(nowInput.getTime()) ? nowInput : new Date();
  const stayDate = parseStayDate(input?.stayDate)?.key || '';
  const hotelKnown = Boolean(text(input?.hotelName));
  const roomKnown = Boolean(text(input?.room));
  const resolvedPresentation = resolvePresentationAt(input?.stayDate, input?.presentationTime, now);
  const leadMinutes = normalizeLeadMinutes(input?.leadMinutes);
  const presentationAt = resolvedPresentation?.at || null;
  const wakeAt = presentationAt && leadMinutes !== null
    ? new Date(presentationAt.getTime() - leadMinutes * 60 * 1000)
    : null;
  const minutesUntilPresentation = presentationAt ? minutesBetween(now, presentationAt) : null;
  const minutesUntilWake = wakeAt ? minutesBetween(now, wakeAt) : null;
  const isPast = Boolean(
    presentationAt
    && now.getTime() > presentationAt.getTime() + PRESENTATION_GRACE_MINUTES * 60 * 1000
  );

  let step: ConciergeStayContextStep;
  if (isPast) {
    step = 'completed';
  } else if (presentationAt && now.getTime() >= presentationAt.getTime() - 20 * 60 * 1000) {
    step = 'presentation';
  } else if (wakeAt && now.getTime() >= wakeAt.getTime()) {
    step = 'wake';
  } else if (!hotelKnown) {
    step = 'confirm-hotel';
  } else if (!roomKnown) {
    step = 'register-room';
  } else if (!presentationAt) {
    step = 'set-presentation';
  } else {
    step = 'rest';
  }

  return {
    step,
    stayDate,
    hotelKnown,
    roomKnown,
    presentationTime: resolvedPresentation?.time || '',
    presentationAt,
    wakeAt,
    leadMinutes,
    minutesUntilPresentation,
    minutesUntilWake,
    canPrepareWakeReminder: Boolean(wakeAt && presentationAt && !isPast),
    isPast,
  };
}
