export interface TransitEvidence {
  source: { name: string; url: string };
  sourceUpdatedAt: string;
  sourceTimestampKind: 'last-change' | 'refresh';
  fetchedAt: string;
  maxAgeSeconds: number;
  timeZone: string;
  validFrom: string;
  validUntil: string;
  coverage: Array<{ lineId: string; stationId?: string }>;
}
export interface TransitSchedule extends TransitEvidence {
  serviceDate: string;
  calendarConfirmed: boolean;
  serviceRuns: boolean;
  windows: Array<{ opensAtSeconds: number; closesAtSeconds: number; lastBoardAtSeconds: number }>;
}
export interface TransitOperation extends TransitEvidence { state: 'normal' | 'disrupted' | 'suspended' | 'unknown' }
export interface TransitLeg { lineId: string; stationId: string; serviceDate: string; boardAt: string; alightAt: string }
export interface TransitAvailabilityInput { now: string; departureAt: string; timeZone: string; legs: TransitLeg[]; schedules?: TransitSchedule[]; operations?: TransitOperation[] }
export interface TransitAvailabilityResult {
  schedule: 'available' | 'unavailable' | 'unknown';
  operational: 'normal' | 'disrupted' | 'suspended' | 'unknown';
  recommendation: 'blocked' | 'alternative-required' | 'confirmed' | 'unconfirmed';
  label: string;
  departureAt: string | null;
  timeZone: string | null;
  evidence: Array<Pick<TransitEvidence, 'source' | 'sourceUpdatedAt' | 'sourceTimestampKind' | 'fetchedAt' | 'validFrom' | 'validUntil' | 'coverage'>>;
}
export function transitServiceSeconds(at: string, serviceDate: string, timeZone: string): number | null;
export function evaluateTransitAvailability(input?: Partial<TransitAvailabilityInput>): TransitAvailabilityResult;
