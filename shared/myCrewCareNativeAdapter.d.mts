import type { MyCrewCareAdapter, MyCrewCareStorage } from './myCrewCarePersistentSession.mjs';
export function createMyCrewCareNativeAdapter(options?: { bridge?: unknown; events?: EventTarget }): MyCrewCareAdapter;
export function createMyCrewCareNativeStorage(options?: { bridge?: unknown }): MyCrewCareStorage;
