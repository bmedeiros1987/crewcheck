export type CrewCheckAlertKind =
  | 'report'
  | 'leave'
  | 'departure'
  | 'pickup'
  | 'wake'
  | 'roster-change'
  | 'gate-change'
  | 'reserve'
  | 'regulatory';

export type CrewCheckAlertSound =
  | 'signature-soft'
  | 'signature-operational'
  | 'signature-urgent'
  | 'signature-wake';

export type CrewCheckPrimaryFlightTime = 'report' | 'departure' | 'both';

export interface CrewCheckAlertPreference {
  enabled: boolean;
  leadMinutes: number;
  sound: CrewCheckAlertSound;
  vibrate: boolean;
  highPriority: boolean;
}

export interface CrewCheckAlertPreferences {
  primaryFlightTime: CrewCheckPrimaryFlightTime;
  kinds: Record<CrewCheckAlertKind, CrewCheckAlertPreference>;
}

export interface CrewCheckAlertInput {
  kind: CrewCheckAlertKind;
  title?: string;
  body?: string;
  eventEpochMillis?: number | null;
  reportEpochMillis?: number | null;
  departureEpochMillis?: number | null;
  pickupEpochMillis?: number | null;
  explicitEpochMillis?: number | null;
}

export interface CrewCheckScheduledAlert {
  kind: CrewCheckAlertKind;
  title: string;
  body: string;
  triggerEpochMillis: number;
  sound: CrewCheckAlertSound;
  vibrate: boolean;
  highPriority: boolean;
}

const MINUTE = 60_000;

export const DEFAULT_CREWCHECK_ALERT_PREFERENCES: CrewCheckAlertPreferences = {
  primaryFlightTime: 'report',
  kinds: {
    report: { enabled: true, leadMinutes: 60, sound: 'signature-operational', vibrate: true, highPriority: true },
    leave: { enabled: true, leadMinutes: 0, sound: 'signature-operational', vibrate: true, highPriority: true },
    departure: { enabled: false, leadMinutes: 30, sound: 'signature-soft', vibrate: true, highPriority: false },
    pickup: { enabled: true, leadMinutes: 30, sound: 'signature-operational', vibrate: true, highPriority: true },
    wake: { enabled: true, leadMinutes: 0, sound: 'signature-wake', vibrate: true, highPriority: true },
    'roster-change': { enabled: true, leadMinutes: 0, sound: 'signature-urgent', vibrate: true, highPriority: true },
    'gate-change': { enabled: true, leadMinutes: 0, sound: 'signature-operational', vibrate: true, highPriority: true },
    reserve: { enabled: true, leadMinutes: 30, sound: 'signature-operational', vibrate: true, highPriority: true },
    regulatory: { enabled: true, leadMinutes: 0, sound: 'signature-urgent', vibrate: true, highPriority: true },
  },
};

function finiteEpoch(value?: number | null): number | null {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : null;
}

function eventEpochFor(input: CrewCheckAlertInput): number | null {
  const explicit = finiteEpoch(input.explicitEpochMillis);
  if (explicit) return explicit;

  switch (input.kind) {
    case 'report':
      // APZ/report is sovereign. Never substitute departure/STD when it is absent.
      return finiteEpoch(input.reportEpochMillis);
    case 'departure':
      return finiteEpoch(input.departureEpochMillis);
    case 'pickup':
      return finiteEpoch(input.pickupEpochMillis);
    default:
      return finiteEpoch(input.eventEpochMillis);
  }
}

function defaultTitle(kind: CrewCheckAlertKind): string {
  switch (kind) {
    case 'report': return 'Apresentação (APZ)';
    case 'leave': return 'Hora de sair';
    case 'departure': return 'Decolagem';
    case 'pickup': return 'Pickup';
    case 'wake': return 'Despertador CrewCheck';
    case 'roster-change': return 'Sua escala mudou';
    case 'gate-change': return 'Alteração de portão';
    case 'reserve': return 'Reserva / sobreaviso';
    case 'regulatory': return 'Alerta operacional';
  }
}

export function buildCrewCheckAlert(
  input: CrewCheckAlertInput,
  preferences: CrewCheckAlertPreferences = DEFAULT_CREWCHECK_ALERT_PREFERENCES,
): CrewCheckScheduledAlert | null {
  const preference = preferences.kinds[input.kind];
  if (!preference?.enabled) return null;
  const eventEpochMillis = eventEpochFor(input);
  if (!eventEpochMillis) return null;

  const triggerEpochMillis = eventEpochMillis - Math.max(0, Number(preference.leadMinutes) || 0) * MINUTE;
  return {
    kind: input.kind,
    title: String(input.title || defaultTitle(input.kind)).trim(),
    body: String(input.body || '').trim(),
    triggerEpochMillis,
    sound: preference.sound,
    vibrate: preference.vibrate,
    highPriority: preference.highPriority,
  };
}

export function flightTimeLabels(
  primary: CrewCheckPrimaryFlightTime,
  reportEpochMillis?: number | null,
  departureEpochMillis?: number | null,
): Array<{ kind: 'report' | 'departure'; epochMillis: number }> {
  const report = finiteEpoch(reportEpochMillis);
  const departure = finiteEpoch(departureEpochMillis);
  if (primary === 'report') return report ? [{ kind: 'report', epochMillis: report }] : [];
  if (primary === 'departure') return departure ? [{ kind: 'departure', epochMillis: departure }] : [];
  return [
    ...(report ? [{ kind: 'report' as const, epochMillis: report }] : []),
    ...(departure ? [{ kind: 'departure' as const, epochMillis: departure }] : []),
  ];
}
