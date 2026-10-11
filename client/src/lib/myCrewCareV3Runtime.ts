import { createMyCrewCareController, type MyCrewCareController } from '../../../shared/myCrewCareController.mjs';

let controller: MyCrewCareController | null = null;

/** Single shared controller. The feature key lives in the controller; callers cannot override it. */
export function getMyCrewCareController(): MyCrewCareController {
  if (!controller) {
    controller = createMyCrewCareController({
      bridge: (window as unknown as { AndroidCrewCheckNative?: unknown }).AndroidCrewCheckNative,
      events: window,
      isForeground: () => document.visibilityState === 'visible',
      isOnline: () => navigator.onLine !== false,
    });
  }
  return controller;
}
