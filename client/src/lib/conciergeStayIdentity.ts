/** Resolve a saved stay without borrowing a same-day sibling's private or operational data. */
export function selectConciergeSavedStay<T extends { id?: unknown; stayDate?: unknown }>(
  stays: T[],
  stayDate: unknown,
  stayId?: unknown,
): T | null {
  const day = typeof stayDate === 'string' ? stayDate.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const id = typeof stayId === 'string' ? stayId.trim() : '';
  const candidates = (Array.isArray(stays) ? stays : []).filter((stay) => {
    const savedDay = typeof stay?.stayDate === 'string' ? stay.stayDate.trim().slice(0, 10) : '';
    if (savedDay !== day) return false;
    return !id || (typeof stay?.id === 'string' && stay.id.trim() === id);
  });
  // An explicit unmatched ID never falls back to another stay; ambiguity also fails closed.
  return candidates.length === 1 ? candidates[0] : null;
}
