export const MYCREWCARE_LOGISTICS_SCHEMA: 1;
export const MYCREWCARE_SOURCE: 'mycrewcare';
export const MYCREWCARE_MAX_RECORDS: number;
export const MYCREWCARE_MAX_STAYS: number;
export const MYCREWCARE_CACHE_MAX_AGE_MS: number;

export type MyCrewCareContext = {
  accountId: string;
  rosterId: string;
  rosterRevision: string;
  providerSubject: string;
};

export type MyCrewCarePersistedStay = {
  id: string;
  rosterEventId: string;
  rosterEventKind: 'stay';
  source: 'persisted-platform-stay';
  localOnly?: false;
  accountId: string;
  rosterId: string;
  rosterRevision: string;
  airport: string;
  pairingId: string;
  hotelName?: string | null;
  timeZone: string;
  startAt: string;
  endAt: string;
};

type MyCrewCareRecordCommon = {
  airport: string;
  pairingId: string;
  hotelName?: string;
  hotel?: string;
  providerRecordId?: string | null;
  hotelAddress?: string | null;
  hotelPhone?: string | null;
  reservationStartAt?: string | null;
  reservationEndAt?: string | null;
  pickupLocation?: string | null;
  transportProvider?: string | null;
  transportPhone?: string | null;
  transitMinutes?: number | null;
  status?: 'published' | 'changed' | 'cancelled';
};

export type MyCrewCareProviderRecord = MyCrewCareRecordCommon & ({
  direction: 'to_airport';
  date: string;
  time: string;
} | {
  direction: 'hotel_only';
  confirmation: 'confirmed';
  status: 'published' | 'changed' | 'cancelled';
  reservationStartAt: string;
  reservationEndAt: string;
  date?: null;
  time?: null;
  pickupLocation?: null;
  transportProvider?: null;
  transportPhone?: null;
  transitMinutes?: null;
});

type MyCrewCareFactCommon = {
  schemaVersion: 1;
  source: 'mycrewcare';
  status: 'published' | 'changed' | 'cancelled';
  accountId: string;
  rosterId: string;
  rosterRevision: string;
  providerRecordId: string | null;
  stayId: string;
  rosterEventId: string;
  airport: string;
  pairingId: string;
  observedAt: string;
  contentFingerprint: string;
};

export type MyCrewCareHotelFact = MyCrewCareFactCommon & {
  kind: 'hotel';
  hotelName: string;
  hotelAddress: string | null;
  hotelPhone: string | null;
  reservationStartAt: string | null;
  reservationEndAt: string | null;
};

export type MyCrewCarePickupFact = MyCrewCareFactCommon & {
  kind: 'pickup';
  hotelName: string;
  timeZone: string;
  pickupAt: string;
  pickupLocation: string | null;
  transportProvider: string | null;
  transportPhone: string | null;
  transitMinutes: number | null;
};

export type MyCrewCareLogisticsFact = MyCrewCareHotelFact | MyCrewCarePickupFact;

export type MyCrewCareProviderSnapshot = {
  observedAt?: string;
  syncedAt?: string;
  emptyConfirmed?: boolean;
  records: readonly MyCrewCareProviderRecord[];
};

export function myCrewCareFingerprint(value: unknown): string;
export function normalizeMyCrewCareContext(value: unknown): Readonly<MyCrewCareContext> | null;
export function isMyCrewCareTravelUrl(value: unknown): boolean;
export function myCrewCareInstant(value: unknown): number;
export function myCrewCareLocalInstant(date: string, time: string, timeZone: string): number | null;
export function normalizeMyCrewCareStays(values: unknown, context: unknown): readonly unknown[];
export function normalizeMyCrewCareRecord(value: unknown): Readonly<MyCrewCareProviderRecord> | null;
export function reconcileMyCrewCareLogistics(options: {
  context: MyCrewCareContext;
  stays: readonly MyCrewCarePersistedStay[];
  snapshot: MyCrewCareProviderSnapshot;
  now?: number;
}): Readonly<{
  accepted: boolean;
  facts: readonly MyCrewCareLogisticsFact[];
  unmatched: readonly MyCrewCareProviderRecord[];
  conflicts: readonly unknown[];
  error: string | null;
}>;
export function diffMyCrewCareFacts(previous: readonly MyCrewCareLogisticsFact[], next: readonly MyCrewCareLogisticsFact[]): Readonly<{
  added: readonly MyCrewCareLogisticsFact[];
  changed: readonly Readonly<{ before: MyCrewCareLogisticsFact; after: MyCrewCareLogisticsFact }>[];
  removed: readonly MyCrewCareLogisticsFact[];
  hasChanges: boolean;
}>;
export function selectMyCrewCareHotel(
  facts: readonly MyCrewCareLogisticsFact[],
  stayId: string,
  options?: { now?: number; freshForMs?: number; includeCancelled?: boolean },
): Readonly<MyCrewCareHotelFact & { dataState: 'fresh' | 'cached' }> | null;
export function selectMyCrewCarePickup(
  facts: readonly MyCrewCareLogisticsFact[],
  stayId: string,
  options?: { now?: number; freshForMs?: number; includeCancelled?: boolean },
): Readonly<MyCrewCarePickupFact & { dataState: 'fresh' | 'cached' }> | null;

export type MyCrewCareObservedPending =
  | 'status-awaiting-user-policy'
  | 'status-cancelled'
  | 'status-unknown'
  | 'time-zone-unavailable'
  | 'reservation-local-time-invalid-or-ambiguous'
  | 'reservation-instants-unavailable'
  | 'pickup-date-unavailable'
  | 'stay-binding-unavailable'
  | 'transport-to-hotel-out-of-schema'
  | 'operational-import-vetoed';

export type MyCrewCareBrasiliaClock = { instant: string; date: string; clock: string; offset: string };

export type MyCrewCareObservedCandidate = {
  source: 'mycrewcare';
  provenance: 'observed-dom';
  requestId: string;
  providerReservationId: string;
  dutyPeriodNumber: string;
  airport: string;
  pairingId: string;
  hotelName: string;
  rawStatus: string;
  statusDisplay: string;
  acceptance: 'accepted-by-user-policy' | 'awaiting-user-policy' | 'not-accepted-cancelled' | 'not-accepted-unknown-status';
  acceptanceBasis: 'user-policy-planned-as-confirmed' | null;
  providerConfirmation: 'not-observed';
  checkInWallDateTime: string;
  checkOutWallDateTime: string;
  timeZone: null;
  derivedTimeZone: Readonly<{
    zone: string;
    origin: 'derived';
    providerStated: false;
    basis: 'reviewed-airport-evidence' | 'base-airport-catalog';
    airport: string;
    evidence: Readonly<{ icao: string; region: string; reviewedOn: string }> | null;
  }> | null;
  reservationStartAt: string | null;
  reservationEndAt: string | null;
  brasilia: Readonly<{
    label: 'Brasília';
    timeZone: 'America/Sao_Paulo';
    origin: 'derived';
    checkIn: Readonly<MyCrewCareBrasiliaClock>;
    checkOut: Readonly<MyCrewCareBrasiliaClock>;
  }> | null;
  transportToAirport: Readonly<{
    providerName: string;
    pickupWallTime: string;
    pickupDate: null;
    pickupAt: null;
    transitMinutes: number;
  }>;
  pending: readonly MyCrewCareObservedPending[];
  operationalImportAllowed: false;
};

export function mapMyCrewCareObservedCandidates(options?: {
  observation?: unknown;
  expected?: { accountId?: string; requestId?: string };
  observedAt?: string;
  now?: number;
  policy?: { plannedAcceptedAsConfirmed?: boolean } | null;
  freshForMs?: number;
}): Readonly<{
  operationalImportAllowed: false;
  accountId: string | null;
  requestId: string | null;
  observedAt: string | null;
  dataState: 'fresh' | 'cached' | null;
  candidates: readonly Readonly<MyCrewCareObservedCandidate>[];
  error: null | 'invalid-scope' | 'invalid-observation' | 'identity-mismatch' | 'invalid-observed-at' | 'expired-observation';
}>;
