/** Presentation only: never mutate published codes or classification inputs. */
export function rosterActivityLabel(value: string): string {
  const normalized = value.trim().replace(/_/g, ' ');
  if (/^DESCANSO(?: BASE CONTINUIDADE|(?: BASE)? ENTRE JORNADAS| ENTRE JORNADAS NA BASE| NA BASE)(?:\s*·.*)?$/i.test(normalized)) return 'Descanso';
  if (/^PERNOITE(?: CONTINUIDADE| ENTRE JORNADAS| EM .+)?$/i.test(normalized)) return 'Pernoite';
  return value;
}
