import type { MyCrewCareAdapter, MyCrewCareStorage } from './myCrewCarePersistentSession.mjs';
export function createMyCrewCareNativeAdapter(options?: {
  bridge?: unknown;
  events?: EventTarget;
  wait?: (ms: number) => Promise<void>;
  cleanupTimeoutMs?: number;
  newOperationId?: () => string;
}): MyCrewCareAdapter;
export function createMyCrewCareNativeStorage(options?: { bridge?: unknown }): MyCrewCareStorage;
export function decodeMyCrewCareObservedNativePage(raw: string, request: {
  kind: 'profile-before' | 'profile-after' | 'cards' | 'detail';
  scope: { accountId: string; sessionId: string; requestId: string; generation: number; employeeId: string; username: string };
  card?: Record<string, string>;
}, pageUrl: string): Readonly<{ schemaVersion: 3; operationalImportAllowed: false; accountId: string; sessionId: string; requestId: string; generation: number; kind: string; rows: readonly Readonly<Record<string, string>>[] }>;
