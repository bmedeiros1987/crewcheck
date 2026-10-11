export const MYCREWCARE_PROTOCOL: 2;
export const MYCREWCARE_MAX_AGE_MS: number;
export const MYCREWCARE_FUTURE_SKEW_MS: number;
export type MyCrewCareContext = {
  accountId: string; rosterId: string; rosterRevision: string; providerSubject: string;
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
  hotelName: string;
  timeZone: string;
  startAt: string;
  endAt: string;
};
export type MyCrewCareTransport = {
  direction: 'to_airport'; date: string; time: string; airport: string;
  pairingId: string; hotel: string; transitMinutes: number | null;
};
export type MyCrewCareRequest = { requestId: string; context: MyCrewCareContext };
export type MyCrewCareAdapter = {
  read(request: MyCrewCareRequest, signal: AbortSignal): Promise<unknown>;
  disconnect(): void;
};
export type MyCrewCarePickup = MyCrewCareTransport & {
  stayId: string; rosterEventId: string; source: 'mycrewcare'; pickupAt: string;
};
export type MyCrewCareSession = {
  setContext(context: MyCrewCareContext | null, persistedStays?: readonly MyCrewCarePersistedStay[]): void;
  setAutomatic(enabled: boolean): void;
  disconnect(): void;
  logout(): void;
  state(): Readonly<{ status: string; connected: boolean; automatic: boolean }>;
  pickup(stayId: string): Readonly<MyCrewCarePickup> | null;
  sync(): Promise<boolean>;
};
export function isMyCrewCareTravelUrl(value: unknown): boolean;
export function normalizeMyCrewCareContext(value: unknown): Readonly<MyCrewCareContext> | null;
export function normalizeMyCrewCareStays(values: unknown, context: MyCrewCareContext | null): readonly unknown[];
export function myCrewCareLocalInstant(date: string, time: string, timeZone: string): number | null;
export function createMyCrewCareSession(options: { adapter: MyCrewCareAdapter; now?: () => number; timeoutMs?: number }): MyCrewCareSession;
