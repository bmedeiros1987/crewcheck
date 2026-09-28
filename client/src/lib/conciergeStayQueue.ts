export type ConciergeStayPatch = Record<string, unknown> & {
  id?: unknown;
  stayDate?: unknown;
  hotelKey?: unknown;
  hotelName?: unknown;
};

export type ConciergePendingStay = {
  key: string;
  patch: ConciergeStayPatch;
  queuedAt: string;
  attempts: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function stayDay(value: unknown): string {
  const raw = text(value);
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

export function isServerStayId(value: unknown): boolean {
  return UUID_PATTERN.test(text(value));
}

export function sanitizeConciergeStayPatch(patch: ConciergeStayPatch): ConciergeStayPatch {
  const next = { ...(patch || {}) };
  if (Object.hasOwn(next, 'id') && !isServerStayId(next.id)) delete next.id;
  return next;
}

export function conciergeStayKey(patch: ConciergeStayPatch): string {
  const id = text(patch?.id);
  if (isServerStayId(id)) return `id:${id.toLowerCase()}`;

  const day = stayDay(patch?.stayDate);
  if (day) return `day:${day}`;

  const hotelKey = text(patch?.hotelKey).toLocaleLowerCase('pt-BR');
  if (hotelKey) return `hotel:${hotelKey}`;

  const hotelName = text(patch?.hotelName).toLocaleLowerCase('pt-BR');
  return hotelName ? `name:${hotelName}` : 'stay:unknown';
}

export function coalescePendingConciergeStays(
  queue: ConciergePendingStay[],
  patch: ConciergeStayPatch,
  queuedAt = new Date().toISOString(),
): ConciergePendingStay[] {
  const cleanPatch = sanitizeConciergeStayPatch(patch);
  const key = conciergeStayKey(cleanPatch);
  const current = Array.isArray(queue) ? queue : [];
  const index = current.findIndex((item) => item?.key === key);
  const nextItem: ConciergePendingStay = index >= 0
    ? {
        ...current[index],
        patch: sanitizeConciergeStayPatch({ ...current[index].patch, ...cleanPatch }),
        queuedAt,
        attempts: 0,
      }
    : { key, patch: cleanPatch, queuedAt, attempts: 0 };

  if (index < 0) return [...current, nextItem];
  return current.map((item, itemIndex) => itemIndex === index ? nextItem : item);
}

export function removePendingConciergeStay(
  queue: ConciergePendingStay[],
  patch: ConciergeStayPatch,
): ConciergePendingStay[] {
  const key = conciergeStayKey(sanitizeConciergeStayPatch(patch));
  return (Array.isArray(queue) ? queue : []).filter((item) => item?.key !== key);
}

export function markPendingConciergeStayAttempt(
  queue: ConciergePendingStay[],
  key: string,
): ConciergePendingStay[] {
  return (Array.isArray(queue) ? queue : []).map((item) => item?.key === key
    ? { ...item, attempts: Math.max(0, Number(item.attempts || 0)) + 1 }
    : item);
}

export function overlayPendingConciergeStays(
  stays: ConciergeStayPatch[],
  queue: ConciergePendingStay[],
): ConciergeStayPatch[] {
  let next = Array.isArray(stays) ? stays.map((item) => ({ ...item })) : [];
  for (const pending of Array.isArray(queue) ? queue : []) {
    if (!pending?.patch) continue;
    const patch = sanitizeConciergeStayPatch(pending.patch);
    const key = conciergeStayKey(patch);
    let index = next.findIndex((item) => conciergeStayKey(item) === key);

    if (index < 0 && !isServerStayId(patch.id)) {
      const day = stayDay(patch.stayDate);
      if (day) {
        const sameDayIndexes = next
          .map((item, itemIndex) => stayDay(item?.stayDate) === day ? itemIndex : -1)
          .filter((itemIndex) => itemIndex >= 0);
        if (sameDayIndexes.length === 1) index = sameDayIndexes[0];
      }
    }

    if (index >= 0) {
      const existing = next[index];
      next[index] = { ...existing, ...patch, id: patch.id || existing.id };
    } else {
      next.push({ ...patch });
    }
  }
  return next;
}
