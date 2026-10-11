import type { MyCrewCareContext, MyCrewCareHotelFact, MyCrewCarePersistedStay, MyCrewCarePickupFact } from './myCrewCareLogistics.mjs';
import type { MyCrewCarePersistentSession } from './myCrewCarePersistentSession.mjs';

export const MYCREWCARE_UI_ENABLED: false;

export type MyCrewCareControllerSnapshot = Readonly<{
  bindingKey: string | null;
  capability: 'disabled' | 'available';
  status: string;
  connected: boolean;
  automatic: boolean;
  busy: boolean;
  hasCachedData: boolean;
  live: boolean;
  dataAgeMs: number | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  canRetryCleanup: boolean;
  refreshSuggested: boolean;
  requiresInteraction: boolean;
  changes: ReturnType<MyCrewCarePersistentSession['state']>['changes'] | null;
}>;

export type MyCrewCareController = Readonly<{
  getSnapshot(): MyCrewCareControllerSnapshot;
  isBoundTo(context: MyCrewCareContext | null, stays?: readonly MyCrewCarePersistedStay[]): boolean;
  subscribe(listener: () => void): () => void;
  bind(context: MyCrewCareContext | null, stays?: readonly MyCrewCarePersistedStay[]): Promise<boolean>;
  setAutomatic(enabled: boolean): void;
  refresh(options?: { userInitiated?: boolean }): Promise<boolean>;
  hotel(stayId: string, options?: { allowCached?: boolean }): Readonly<MyCrewCareHotelFact & { dataState: 'fresh' | 'cached' }> | null;
  pickup(stayId: string, options?: { allowCached?: boolean }): Readonly<MyCrewCarePickupFact & { dataState: 'fresh' | 'cached' }> | null;
  disconnect(options?: { forgetData?: boolean }): Promise<void>;
  logout(): Promise<void>;
}>;

export function createMyCrewCareController(options?: {
  bridge?: unknown;
  events?: unknown;
  uiEnabled?: boolean;
  now?: () => number;
  isForeground?: () => boolean;
  isOnline?: () => boolean;
  session?: MyCrewCarePersistentSession;
}): MyCrewCareController;

export function myCrewCareBindingKey(context: MyCrewCareContext | null, stays?: readonly MyCrewCarePersistedStay[]): string | null;
