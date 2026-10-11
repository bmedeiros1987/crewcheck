import type { MyCrewCareAdapter, MyCrewCareStorage } from './myCrewCarePersistentSession.mjs';
export function createMyCrewCareNativeAdapter(options?: {
  bridge?: unknown;
  events?: EventTarget;
  wait?: (ms: number) => Promise<void>;
  cleanupTimeoutMs?: number;
  newOperationId?: () => string;
}): MyCrewCareAdapter;
export function createMyCrewCareNativeStorage(options?: { bridge?: unknown }): MyCrewCareStorage;
