import { isSmartDepartureEligible, type ScheduleActivityLike } from './scheduleActivityClassification';

type AirportActivity = ScheduleActivityLike & {
  origin?: string;
  destination?: string;
  airportAssignment?: boolean;
  reportLocation?: string;
};
function codes(activity: AirportActivity): string {
  return [activity.canonical?.code, activity.code, activity.flightNumber, activity.title, activity.day?.type, activity.day?.pairingCode]
    .filter(Boolean).join(' ').toUpperCase();
}
export function isHomeStandby(activity: AirportActivity): boolean {
  return /\bHSB(?:\d|[_-]ADM|D|E)?\b|\bSOBREAVISO\b/.test(codes(activity));
}
export function isAirportDepartureEligible(activity: AirportActivity): boolean {
  const code = codes(activity);
  // A base label or duty start never proves an airport assignment.
  const day = activity.day as Record<string, unknown> | null | undefined;
  const actualFlight = (activity.kind === 'flight' || activity.canonical?.kind === 'flight')
    && Boolean(activity.flightNumber) && /^[A-Z]{3}$/.test(activity.origin || '')
    && /^[A-Z]{3}$/.test(activity.destination || '') && activity.origin !== activity.destination;
  const airportAssigned = activity.airportAssignment === true || day?.airportAssignment === true
    || String(activity.reportLocation || day?.reportLocation || '').toLowerCase() === 'airport';
  if (actualFlight) return isSmartDepartureEligible({ ...activity, activated: true });
  if (!isSmartDepartureEligible({ ...activity, activated: activity.activated === true || day?.activated === true })) return false;
  if (!isHomeStandby(activity) && !/\b(?:RES|RSV|RESERVA)\b/.test(code)) return true;
  if (isHomeStandby(activity)) return airportAssigned && (activity.activated === true || activity.isActivated === true || day?.activated === true);
  return airportAssigned;
}
