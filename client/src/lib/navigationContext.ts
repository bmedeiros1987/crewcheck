/**
 * Shared Navigation Context foundation (#566/#568).
 *
 * This relay is deliberately small, in-memory and typed. It carries only explicit
 * navigation identifiers supplied by the caller; it never derives journey/flight/
 * airport/stay identities and it never persists context to localStorage/sessionStorage.
 *
 * Global navigation (menu/bottom-nav/Home) must call clearPendingNavigationContext()
 * before opening a destination. Contextual bridges call setPendingNavigationContext()
 * and the destination consumes only a context explicitly addressed to itself.
 */

export type NavigationContextPolicy = 'once' | 'persistent-until-return';

export type CrewCheckNavigationContext = {
  sourceView?: string;
  targetView: string;
  dateEpochMs?: number;
  journeyId?: string;
  programId?: string;
  flightKey?: string;
  airportCode?: string;
  stayId?: string;
  returnView?: string;
  returnLabel?: string;
  policy: NavigationContextPolicy;
};

let pending: CrewCheckNavigationContext | null = null;

function cleanString(value: unknown, max = 160): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function cleanEpoch(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : undefined;
}

function sanitizeContext(input: CrewCheckNavigationContext): CrewCheckNavigationContext | null {
  const targetView = cleanString(input?.targetView, 80);
  if (!targetView) return null;
  const policy: NavigationContextPolicy = input.policy === 'persistent-until-return'
    ? 'persistent-until-return'
    : 'once';

  return {
    targetView,
    policy,
    ...(cleanString(input.sourceView, 80) ? { sourceView: cleanString(input.sourceView, 80) } : {}),
    ...(cleanEpoch(input.dateEpochMs) ? { dateEpochMs: cleanEpoch(input.dateEpochMs) } : {}),
    ...(cleanString(input.journeyId) ? { journeyId: cleanString(input.journeyId) } : {}),
    ...(cleanString(input.programId) ? { programId: cleanString(input.programId) } : {}),
    ...(cleanString(input.flightKey) ? { flightKey: cleanString(input.flightKey) } : {}),
    ...(cleanString(input.airportCode, 12) ? { airportCode: cleanString(input.airportCode, 12)?.toUpperCase() } : {}),
    ...(cleanString(input.stayId) ? { stayId: cleanString(input.stayId) } : {}),
    ...(cleanString(input.returnView, 80) ? { returnView: cleanString(input.returnView, 80) } : {}),
    ...(cleanString(input.returnLabel, 80) ? { returnLabel: cleanString(input.returnLabel, 80) } : {}),
  };
}

function cloneContext(value: CrewCheckNavigationContext | null): CrewCheckNavigationContext | null {
  return value ? { ...value } : null;
}

/** Deposits an explicit context for one destination. Invalid/empty targets clear it. */
export function setPendingNavigationContext(input: CrewCheckNavigationContext | null | undefined): void {
  pending = input ? sanitizeContext(input) : null;
}

/**
 * Reads context only when it is addressed to targetView. A consume-once context is
 * removed immediately. Persistent context stays until the contextual return path
 * explicitly clears it.
 */
export function consumePendingNavigationContext(targetView: string): CrewCheckNavigationContext | null {
  const target = cleanString(targetView, 80);
  if (!pending || !target || pending.targetView !== target) return null;
  const value = cloneContext(pending);
  if (pending.policy === 'once') pending = null;
  return value;
}

/** Inspects a matching context without consuming it. Test/debug use only. */
export function peekPendingNavigationContext(targetView?: string): CrewCheckNavigationContext | null {
  if (!pending) return null;
  const target = cleanString(targetView, 80);
  if (target && pending.targetView !== target) return null;
  return cloneContext(pending);
}

/**
 * Global-navigation escape hatch. Menu/bottom-nav/Home callers use this before
 * setView so an old contextual focus can never leak into a clean entry path.
 */
export function clearPendingNavigationContext(): void {
  pending = null;
}
