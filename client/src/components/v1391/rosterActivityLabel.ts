/** Presentation only: never mutate published codes or classification inputs. */
export function rosterActivityLabel(value: string): string {
  const normalized = value.trim().replace(/_/g, ' ');
  // completeContinuityDays emits bare codes for one missing date and i/n for multi-day gaps.
  const generated = /^(DESCANSO BASE|PERNOITE)(?: ([1-9]\d*)\/([1-9]\d*))?$/i.exec(normalized);
  if (generated) {
    const part = Number(generated[2]), total = Number(generated[3]);
    if (!generated[2] || (Number.isSafeInteger(part) && Number.isSafeInteger(total) && total > 1 && part <= total)) {
      return generated[1].toUpperCase() === 'PERNOITE' ? 'Pernoite' : 'Descanso';
    }
  }
  if (/^DESCANSO(?: BASE CONTINUIDADE|(?: BASE)? ENTRE JORNADAS| ENTRE JORNADAS NA BASE| NA BASE)(?:\s*·.*)?$/i.test(normalized)) return 'Descanso';
  if (/^PERNOITE(?: CONTINUIDADE| ENTRE JORNADAS| EM .+)?$/i.test(normalized)) return 'Pernoite';
  return value;
}
