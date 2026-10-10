export type OpeningStatus = { status: 'open' | 'closed' | 'unknown'; label: string; reason: string; timeZone: string };
export type OpeningPartner = { verifiedAt?: string; timeZone?: string; holidayHoursUncertain?: boolean; openingHours?: string[]; is24Hours?: boolean };
export function wellhubOpeningStatus(partner: OpeningPartner, now?: Date): OpeningStatus;
export function prioritizeWellhubOpening<T extends OpeningPartner>(partners: T[], now?: Date): Array<T & { openingStatus: OpeningStatus }>;
