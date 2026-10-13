export type GateQueryIdentity = { flight: string; origin: string; destination: string; departureDate: string; scheduledDepartureUtc?: string };
export function publishedGateDate(value: unknown): string;
export function gateQueryDay(identity: GateQueryIdentity | null, now?: number): { allowed: boolean; reason: string; originTimeZone: string; departureDate: string; scheduledDepartureUtc?: string };
export function findPublishedGateOccurrence(roster: unknown, request: GateQueryIdentity, canonicalEvents?: readonly unknown[]): GateQueryIdentity | null;
export function gateQuerySuppressed(decision: { reason: string }): { ok: false; querySuppressed: true; queryReason: string; configured: false; message: string; quality: number };

export function originFlightDate(instant: string | number, origin: string): string;
