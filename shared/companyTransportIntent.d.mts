export interface CompanyTransportIntent { origin: string; destination: string; serviceDate: string; boardingPoint: string; alightingPoint: string; operator: string; requestedVehicle: 'bus' | 'van' | null }
export function companyTransportIntent(text?: string): CompanyTransportIntent | null;
export function companyTransportFold(value: unknown): string;
