export function normalizeWellhubLocation(value?: unknown): string;
export function wellhubLocationMatches(partner: { city?: string; state?: string; region?: string; name?: string; address?: string }, location?: {city?: string; state?: string}): boolean;
export function wellhubLocationTextMatches(partner: { city?: string; state?: string; region?: string; name?: string; address?: string }, text?: string): boolean;
