export const AMIL_GUIDE_URL: string;
export const AMIL_EVIDENCE_MAX_AGE_DAYS: number;
export function amilPlanFamily(value: unknown): string;
export function officialAmilSource(value: string): boolean;
export function amilCoverage(provider: any, selection?: any, now?: Date): { status: string; reason: string; evidence?: any };
export function amilConfirmedProviders(providers: any[], selection: any, now?: Date): any[];
export function amilUnknownMessage(planCode?: string): string;
