export type WellhubPublicUnit = { id: string; name: string; city: string; state: string; address: string; sourceUrl: string; verifiedAt: string };
export type WellhubPublicDestination = { kind: 'public-unit'; unitId: string; city: string; state: string; sourceUrl: string; verifiedAt: string; latitude: number; longitude: number };
export type WellhubUnitActions = { ficheUrl: string; officialUrl: string; mapUrl: string; uberUrl: string; uberWebUrl: string; autoDestination: boolean; uberLabel: string; uberNotice: string };
export const WELLHUB_UNIT_PAGE_ORIGIN: string;
export function wellhubUnitPageUrl(id: unknown): string;
export function wellhubUnitActions(partner: WellhubPublicUnit, options?: { clientId?: string; destination?: WellhubPublicDestination | null; now?: Date }): WellhubUnitActions;
export function wellhubTelegramMessage(text: string, partners: WellhubPublicUnit[]): { text: string; entities: {type: string; offset: number; length: number; url: string}[] };
export function wellhubPlainMessage(text: string, partners: WellhubPublicUnit[]): string;
