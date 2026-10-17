// Mobile Core integration entrypoint. Deliberately not mounted in Home/MainActivity
// until provider selectors, authenticated identity proof and physical SSO/MFA tests pass.
export {
  MYCREWCARE_PROTOCOL,
  MYCREWCARE_PERSISTENCE_SCHEMA,
  MYCREWCARE_LIVE_MAX_AGE_MS,
  createMyCrewCarePersistentSession,
} from '../../../shared/myCrewCarePersistentSession.mjs';
export {
  MYCREWCARE_LOGISTICS_SCHEMA,
  MYCREWCARE_SOURCE,
  MYCREWCARE_CACHE_MAX_AGE_MS,
  diffMyCrewCareFacts,
  isMyCrewCareTravelUrl,
  normalizeMyCrewCareContext,
  normalizeMyCrewCareRecord,
  normalizeMyCrewCareStays,
  reconcileMyCrewCareLogistics,
  selectMyCrewCareHotel,
  selectMyCrewCarePickup,
} from '../../../shared/myCrewCareLogistics.mjs';
export {
  MYCREWCARE_BACKGROUND_CAPABILITY,
  planMyCrewCareSync,
} from '../../../shared/myCrewCareSyncPolicy.mjs';
export {
  createMyCrewCareNativeAdapter,
  createMyCrewCareNativeStorage,
} from '../../../shared/myCrewCareNativeAdapter.mjs';

export type {
  MyCrewCareAdapter,
  MyCrewCarePersistentSession,
  MyCrewCareStorage,
} from '../../../shared/myCrewCarePersistentSession.mjs';
export type {
  MyCrewCareContext,
  MyCrewCareLogisticsFact,
  MyCrewCarePersistedStay,
  MyCrewCareProviderRecord,
  MyCrewCareProviderSnapshot,
} from '../../../shared/myCrewCareLogistics.mjs';
export type {
  MyCrewCareSyncAction,
  MyCrewCareSyncPlan,
} from '../../../shared/myCrewCareSyncPolicy.mjs';
