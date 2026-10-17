export type StayTimeZonePreference = { source: 'local' | 'base' | 'utc' | 'manual'; manualZone: string };
export function stayTimeZonePreference(value?: unknown): StayTimeZonePreference;
export function resolveStayDisplayZone(preference: unknown, context?: { localZone?: string; baseZone?: string }): {zone: string; source: string; fallback: boolean; message: string};
export function presentStayInstant(instant: string, zone: string): Record<string, any>;
export function normalizePickupLocal(value?: { date?: string; clock?: string; timeZone?: string }): Readonly<Record<string, any>>;
export function presentPickup(pickup: Record<string, any>, preference: unknown, context?: { localZone?: string; baseZone?: string }): Record<string, any>;
