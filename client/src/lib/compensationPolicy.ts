export type AllowanceSlot = 'breakfast' | 'lunch' | 'dinner' | 'supper';

export type AllowanceOccurrence = {
  slot: AllowanceSlot;
  iso: string;
  window: string;
};

export type AllowanceActivity = {
  start: Date;
  end: Date;
  kind: 'flight' | 'reserve' | 'standby' | 'training' | 'stay_external' | 'stay_base' | 'other';
  originAtContractualBase?: boolean;
  destinationAtContractualBase?: boolean;
  activated?: boolean;
  breakfastIncluded?: boolean;
  enginesOff?: Date | null;
  clockBasis?: AllowanceClockBasis;
};

export type AllowanceStatementCycle = {
  start: Date;
  end: Date;
  payment: Date;
  label: string;
  clockBasis?: AllowanceClockBasis;
};

const WINDOWS: Record<AllowanceSlot, { start: number; end: number; label: string }> = {
  breakfast: { start: 5, end: 8, label: '05:00–08:00' },
  lunch: { start: 11, end: 13, label: '11:00–13:00' },
  dinner: { start: 19, end: 20, label: '19:00–20:00' },
  supper: { start: 0, end: 1, label: '00:00–01:00' },
};

// Canonical roster instants are published BRT (UTC-03). This is a clock
// reference, not an ACT rule or the device's current timezone.
export type AllowanceClockBasis = 'device_local' | 'roster_brt';
const BRT_OFFSET_MS = 3 * 60 * 60_000;
export function rosterOperationalIso(value: Date): string {
  if (!Number.isFinite(value.getTime())) return '';
  return new Date(value.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}
export function rosterOperationalDateAt(iso: string, hour: number, minute = 0): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return new Date(NaN);
  return new Date(`${iso}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`);
}
export function rosterPresentationBeforeDeparture(departure: Date, clock: string): Date | null {
  const match = String(clock || '').match(/^(\d{1,2}):(\d{2})(?:\(\+\d+\))?$/);
  if (!match || !Number.isFinite(departure.getTime())) return null;
  const start = rosterOperationalDateAt(rosterOperationalIso(departure), Number(match[1]), Number(match[2]));
  if (!Number.isFinite(start.getTime())) return null;
  if (start > departure) start.setTime(start.getTime() - 24 * 60 * 60_000);
  // Reuse the canonical parser's maximum trustworthy presentation lead.
  return departure.getTime() - start.getTime() <= 180 * 60_000 ? start : null;
}
export function allowanceIntervalState(start: Date, end: Date): 'available' | 'invalid_interval' {
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end >= start ? 'available' : 'invalid_interval';
}

function pad2(value: number): string { return String(value).padStart(2, '0'); }
function localIso(value: Date): string { return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`; }

export function mealWindowOccurrences(start: Date, end: Date, slot: AllowanceSlot, clockBasis: AllowanceClockBasis = 'device_local'): AllowanceOccurrence[] {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const rule = WINDOWS[slot];
  if (clockBasis === 'roster_brt') {
    const first = rosterOperationalIso(start), last = rosterOperationalIso(end);
    const cursor = new Date(`${first}T00:00:00Z`);
    const result: AllowanceOccurrence[] = [];
    while (cursor.toISOString().slice(0, 10) <= last) {
      const iso = cursor.toISOString().slice(0, 10);
      const windowStart = rosterOperationalDateAt(iso, rule.start);
      const windowEnd = rosterOperationalDateAt(iso, rule.end);
      if (start <= windowEnd && end >= windowStart) result.push({ slot, iso, window: rule.label });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  const result: AllowanceOccurrence[] = [];
  while (cursor <= last) {
    const windowStart = new Date(cursor); windowStart.setHours(rule.start, 0, 0, 0);
    const windowEnd = new Date(cursor); windowEnd.setHours(rule.end, 0, 0, 0);
    // As janelas do ACT são inclusivas. Assim, liberação exatamente 00:00
    // conta ceia, enquanto 23:59 permanece fora da janela.
    if (start.getTime() <= windowEnd.getTime() && end.getTime() >= windowStart.getTime()) {
      result.push({ slot, iso: localIso(cursor), window: rule.label });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export function classifyAllowanceWindows(activity: AllowanceActivity): AllowanceOccurrence[] {
  const start = new Date(activity.start);
  let end = new Date(activity.end);
  if (activity.kind === 'flight' && activity.enginesOff && Number.isFinite(activity.enginesOff.getTime())) {
    end = new Date(activity.enginesOff.getTime() + 30 * 60_000);
  }
  if (end < start) return [];
  if (activity.kind === 'stay_base') return [];
  if (activity.kind === 'standby' && !activity.activated) return [];

  const allowed: AllowanceSlot[] = [];
  if (activity.kind === 'stay_external') {
    // No pernoite, ceia depende da próxima apresentação estar dentro da
    // janela de 00:00–01:00; a simples permanência no hotel não a cria.
    return [
      ...mealWindowOccurrences(start, end, 'lunch', activity.clockBasis),
      ...mealWindowOccurrences(start, end, 'dinner', activity.clockBasis),
      ...mealWindowOccurrences(end, end, 'supper', activity.clockBasis),
    ];
  } else if (activity.kind === 'reserve') {
    allowed.push('breakfast', 'lunch', 'dinner', 'supper');
  } else if (activity.kind === 'flight') {
    if ((activity.originAtContractualBase || activity.destinationAtContractualBase) && !activity.breakfastIncluded) allowed.push('breakfast');
    allowed.push('lunch', 'dinner', 'supper');
  } else if (activity.kind === 'training' || activity.kind === 'other') {
    allowed.push('lunch', 'dinner', 'supper');
  }

  return allowed.flatMap(slot => mealWindowOccurrences(start, end, slot, activity.clockBasis));
}

export function isNonPayableRosterCode(value: string): boolean {
  return /^(?:DO|DOF|DOP|DOPR|DR|OFF|VC|FOLGA|FERIAS|FÉRIAS)$/.test(String(value || '').trim().toUpperCase());
}

export function observedStatementCycle(date: Date, clockBasis: AllowanceClockBasis = 'device_local'): AllowanceStatementCycle {
  if (clockBasis === 'roster_brt') {
    const civil = new Date(`${rosterOperationalIso(date)}T12:00:00Z`);
    civil.setUTCDate(civil.getUTCDate() - (civil.getUTCDay() - 3 + 7) % 7);
    const start = rosterOperationalDateAt(civil.toISOString().slice(0, 10), 0);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60_000 - 1);
    const payment = new Date(start.getTime() + 8 * 24 * 60 * 60_000);
    return { start, end, payment, clockBasis, label: 'Ciclo previsto: quarta a terça, com pagamento na quinta-feira' };
  }
  const value = new Date(date);
  value.setHours(12, 0, 0, 0);
  const daysSinceWednesday = (value.getDay() - 3 + 7) % 7;
  const start = new Date(value);
  start.setDate(value.getDate() - daysSinceWednesday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  const payment = new Date(start);
  payment.setDate(start.getDate() + 8);
  payment.setHours(0, 0, 0, 0);
  return { start, end, payment, label: 'Ciclo previsto: quarta a terça, com pagamento na quinta-feira' };
}

export function allowanceBelongsToStatementCycle(isoOrDate: string | Date, cycle: AllowanceStatementCycle): boolean {
  const value = isoOrDate instanceof Date ? new Date(isoOrDate) : new Date(`${String(isoOrDate).slice(0, 10)}T12:00:00`);
  return Number.isFinite(value.getTime()) && value.getTime() >= cycle.start.getTime() && value.getTime() <= cycle.end.getTime();
}

export function allowanceCycleNote(slot: AllowanceSlot, iso: string, cycle: AllowanceStatementCycle): string {
  const belongs = allowanceBelongsToStatementCycle(iso, cycle);
  if (slot === 'supper' && !belongs) return 'Ceia registrada após 00:00 de quarta-feira: entra no ciclo seguinte.';
  return belongs ? 'Item previsto no ciclo atual de quarta a terça.' : 'Item previsto em outro ciclo de pagamento.';
}

export function freeDayPostponementIndemnity(delayHours: number, exceptionalOperationalNeed = false): number {
  const threshold = exceptionalOperationalNeed ? 12 : 4;
  return Number(delayHours) > threshold ? 700 : 0;
}
