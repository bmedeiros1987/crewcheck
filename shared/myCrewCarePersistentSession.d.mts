import type { MyCrewCareContext, MyCrewCareHotelFact, MyCrewCareLogisticsFact, MyCrewCarePersistedStay, MyCrewCarePickupFact } from './myCrewCareLogistics.mjs';

export const MYCREWCARE_PROTOCOL: 3;
export const MYCREWCARE_PERSISTENCE_SCHEMA: 1;
export const MYCREWCARE_LIVE_MAX_AGE_MS: number;

export type MyCrewCareRequest = { schemaVersion: 3; requestId: string; context: MyCrewCareContext };
export type MyCrewCareAdapter = {
  read(request: MyCrewCareRequest, signal: AbortSignal): Promise<unknown>;
  disconnect?(accountId: string | null, forgetData: boolean): Promise<void> | void;
};
export type MyCrewCareStorage = {
  read(accountId: string): Promise<string | null> | string | null;
  write(accountId: string, payload: string): Promise<void> | void;
  clear(accountId: string): Promise<void> | void;
};
export type MyCrewCarePersistentSession = {
  setContext(context: MyCrewCareContext | null, stays?: readonly MyCrewCarePersistedStay[]): void;
  setAutomatic(enabled: boolean): void;
  restore(): Promise<boolean>;
  state(): Readonly<{
    status: string;
    connected: boolean;
    automatic: boolean;
    hasCachedData: boolean;
    lastSuccessfulSyncAt: string | null;
    dataAgeMs: number | null;
    live: boolean;
    lastAttemptAt: string | null;
    lastError: string | null;
    changes: Readonly<{
      added: readonly MyCrewCareLogisticsFact[];
      changed: readonly Readonly<{ before: MyCrewCareLogisticsFact; after: MyCrewCareLogisticsFact }>[];
      removed: readonly MyCrewCareLogisticsFact[];
      hasChanges: boolean;
    }>;
  }>;
  hotel(stayId: string, options?: { allowCached?: boolean }): Readonly<MyCrewCareHotelFact & { dataState: 'fresh' | 'cached' }> | null;
  pickup(stayId: string, options?: { allowCached?: boolean }): Readonly<MyCrewCarePickupFact & { dataState: 'fresh' | 'cached' }> | null;
  sync(options?: { reason?: string }): Promise<boolean>;
  disconnect(options?: { forgetData?: boolean }): Promise<void>;
  logout(): Promise<void>;
};

export function createMyCrewCarePersistentSession(options: {
  adapter: MyCrewCareAdapter;
  storage?: MyCrewCareStorage;
  now?: () => number;
  timeoutMs?: number;
}): MyCrewCarePersistentSession;
