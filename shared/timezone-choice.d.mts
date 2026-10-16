export function validTimeZone(zone: unknown): boolean;
export function deviceTimeZone(intl?: typeof Intl): string;
export function timeZoneChoices(current?: string): string[];
export function baseTimeZone(base: unknown): string;
export function resolveTimeZoneChoice(
  source: string,
  options?: { device?: string; base?: string; manual?: string; local?: string; strict?: boolean },
): { zone: string; source: string; fallback: boolean; message: string };
export function timeZoneOffsetLabel(zone: string, instant?: string | null): string;
