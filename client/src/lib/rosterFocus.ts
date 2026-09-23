import {
  consumePendingNavigationContext,
  peekPendingNavigationContext,
  setPendingNavigationContext,
} from './navigationContext';

/**
 * Backward-compatible roster focus adapter (#560 -> #566).
 *
 * Existing FlightDeck/Linha do Dia callers keep the same API. Underneath, the date
 * now travels through the shared Navigation Context as a one-shot context addressed
 * only to `roster`. This preserves the original consume-once behavior while giving
 * #566 one common relay for future contextual pairs.
 */

/** Deposita a data que a próxima abertura da escala deve focar. */
export function setPendingRosterFocus(date: Date | null | undefined): void {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    setPendingNavigationContext(null);
    return;
  }
  setPendingNavigationContext({
    targetView: 'roster',
    dateEpochMs: date.getTime(),
    policy: 'once',
  });
}

/** Lê e esvazia. Uma navegação depositada vale para uma abertura só. */
export function consumePendingRosterFocus(): Date | null {
  const epoch = consumePendingNavigationContext('roster')?.dateEpochMs;
  if (typeof epoch !== 'number' || !Number.isFinite(epoch)) return null;
  const value = new Date(epoch);
  return Number.isNaN(value.getTime()) ? null : value;
}

/** Só para teste: inspeciona sem consumir. */
export function peekPendingRosterFocus(): Date | null {
  const epoch = peekPendingNavigationContext('roster')?.dateEpochMs;
  if (typeof epoch !== 'number' || !Number.isFinite(epoch)) return null;
  const value = new Date(epoch);
  return Number.isNaN(value.getTime()) ? null : value;
}
