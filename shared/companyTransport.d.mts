export interface CompanyTransportReference {
  schemaVersion: 1; id: string; operator: string; direction: string; timeZone: string;
  provenance: { label: string; publishedAt?: string; sourceUrl?: string };
  validity: { status: 'unknown' | 'confirmed'; from?: string; until?: string };
  eligibility: { status: 'unknown' | 'confirmed'; description: string };
  days: number[]; exceptions: Array<{ date: string; runs: boolean; note: string }>;
  stops: Array<{ id: string; label: string; boardingPoint: string }>;
  trips: number[][];
}
export interface CompanyTransportQuery { referenceId?: string; serviceDate?: string; originStopId?: string; destinationStopId?: string }
export function companyTransportPresentation(catalogue?: CompanyTransportReference[], query?: CompanyTransportQuery): {
  operational: 'unknown'; recommendation: 'unconfirmed'; leaveAt: null; travelMinutes: null; label: string;
  references: Array<CompanyTransportReference & { serviceDate: string; originStopId: string; destinationStopId: string; calendarRuns: boolean; outsideValidity: boolean; plannedTimes: Array<{ boardAtSeconds: number; alightAtSeconds: number }>; verificationRequired: true }>;
};
