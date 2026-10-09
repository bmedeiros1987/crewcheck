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

export type MyCrewCareProviderRecord = {
  direction: 'to_airport';
  date: string;
  time: string;
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
