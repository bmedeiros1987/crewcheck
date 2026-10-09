export const WELLHUB_SNAPSHOT_MAX_AGE_DAYS: number;
export function normalizeWellhubPlan(value: unknown): string;
export function wellhubSnapshotAccess(partner: { verifiedAt: string; minimumPlan: string; accessConditions?: string; activityPlans?: string[] }, userPlan: string, activity?: string, now?: Date): 'included' | 'excluded' | 'unknown';
