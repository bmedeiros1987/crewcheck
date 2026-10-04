import type { MyCrewCareAdapter } from './myCrewCare.mjs';
export type MyCrewCareNativeBridge = {
  myCrewCareProtocolVersion(): number;
  myCrewCareReleaseEnabled(): boolean;
  openMyCrewCareV2(requestJson: string, automaticConsent: boolean): boolean;
  disconnectMyCrewCareV2(): void;
};
export function createMyCrewCareNativeAdapter(options: {
  bridge?: MyCrewCareNativeBridge; events?: EventTarget;
}): MyCrewCareAdapter;
