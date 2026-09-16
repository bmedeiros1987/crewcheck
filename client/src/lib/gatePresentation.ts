export type GateType = 'CONTACT' | 'REMOTE' | 'UNKNOWN';

export interface GatePresentationInput {
  gate?: string | null;
  stand?: string | null;
  gateType?: GateType | string | null;
  terminal?: string | null;
}

function clean(value?: string | null): string {
  return String(value ?? '').trim();
}

export function normalizeGateType(value?: string | null): GateType {
  const normalized = clean(value).toUpperCase();
  if (normalized === 'REMOTE' || normalized === 'REMOTA') return 'REMOTE';
  if (normalized === 'CONTACT' || normalized === 'CONTATO') return 'CONTACT';
  return 'UNKNOWN';
}

export function presentGate(input: GatePresentationInput = {}) {
  const gate = clean(input.gate);
  const stand = clean(input.stand);
  const terminal = clean(input.terminal);
  const gateType = normalizeGateType(input.gateType);
  if (gateType === 'REMOTE') {
    const position = stand || gate;
    return { gateType, primary: 'Remota', detail: position ? `Posição ${position}` : (terminal || 'Área remota') } as const;
  }
  if (gateType === 'CONTACT') {
    return { gateType, primary: gate || 'A confirmar', detail: terminal || 'Terminal a confirmar' } as const;
  }
  return { gateType: 'UNKNOWN' as const, primary: gate || 'A confirmar', detail: terminal || 'Terminal a confirmar' };
}
