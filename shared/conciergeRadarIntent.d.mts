export function radarCivilDate(value: unknown): string;
export function radarReadIntent(text?: string): { kind: 'followed' | 'flight'; flight?: string; date?: string; invalidDate?: boolean; ambiguous?: boolean } | null;
