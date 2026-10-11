import { useSyncExternalStore } from 'react';
import type { MyCrewCareController, MyCrewCareControllerSnapshot } from '../../../shared/myCrewCareController.mjs';
import { getMyCrewCareController } from '@/lib/myCrewCareV3Runtime';

export function useMyCrewCareV3(): { controller: MyCrewCareController; snapshot: MyCrewCareControllerSnapshot } {
  const controller = getMyCrewCareController();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { controller, snapshot };
}
