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
};

const WINDOWS: Record<AllowanceSlot, { start: number; end: number; label: string }> = {
  breakfast: { start: 5, end: 8, label: '05:00–08:00' },
  lunch: { start: 11, end: 13, label: '11:00–13:00' },
  dinner: { start: 19, end: 20, label: '19:00–20:00' },
  supper: { start: 0, end: 1, label: '00:00–01:00' },
};

function pad2(value: number): string { return String(value).padStart(2, '0'); }
function localIso(value: Date): string { return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`; }

export function mealWindowOccurrences(start: Date, end: Date, slot: AllowanceSlot): AllowanceOccurrence[] {
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const rule = WINDOWS[slot];
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
      ...mealWindowOccurrences(start, end, 'lunch'),
      ...mealWindowOccurrences(start, end, 'dinner'),
      ...mealWindowOccurrences(end, end, 'supper'),
    ];
  } else if (activity.kind === 'reserve') {
    allowed.push('breakfast', 'lunch', 'dinner', 'supper');
  } else if (activity.kind === 'flight') {
    if ((activity.originAtContractualBase || activity.destinationAtContractualBase) && !activity.breakfastIncluded) allowed.push('breakfast');
    allowed.push('lunch', 'dinner', 'supper');
  } else if (activity.kind === 'training' || activity.kind === 'other') {
    allowed.push('lunch', 'dinner', 'supper');
  }

  return allowed.flatMap(slot => mealWindowOccurrences(start, end, slot));
}

export function isNonPayableRosterCode(value: string): boolean {
  return /^(?:DO|DOF|DOP|DOPR|DR|OFF|VC|FOLGA|FERIAS|FÉRIAS)$/.test(String(value || '').trim().toUpperCase());
}

export function observedStatementCycle(date: Date): { start: Date; end: Date; payment: Date; label: string } {
  const value = new Date(date); value.setHours(12, 0, 0, 0);
  const daysSinceWednesday = (value.getDay() - 3 + 7) % 7;
  const start = new Date(value); start.setDate(value.getDate() - daysSinceWednesday);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const payment = new Date(start); payment.setDate(start.getDate() + 8);
  return { start, end, payment, label: 'Ciclo observado no demonstrativo: quarta a terça, pagamento na quinta' };
}

export function freeDayPostponementIndemnity(delayHours: number, exceptionalOperationalNeed = false): number {
  const threshold = exceptionalOperationalNeed ? 12 : 4;
  return Number(delayHours) > threshold ? 700 : 0;
}
