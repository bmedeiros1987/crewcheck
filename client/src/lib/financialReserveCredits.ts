export type ReserveCreditWindow = {
  start: Date;
  end: Date;
};

function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export function reserveWindowHours(start: Date, end: Date): number {
  if (!validDate(start) || !validDate(end)) return 0;
  const milliseconds = end.getTime() - start.getTime();
  return milliseconds > 0 ? milliseconds / 36e5 : 0;
}

/**
 * Crédito financeiro da Reserva.
 *
 * - Reserva não acionada: remunera a janela publicada integral.
 * - Reserva acionada: remunera somente do início da Reserva até o início do
 *   primeiro voo que comece dentro da janela publicada.
 *
 * Esta função não altera jornada, apresentação, limites ou regulamentação.
 */
export function payableReserveHours(
  reserveStart: Date,
  reserveEnd: Date,
  flightStarts: readonly Date[] = [],
): number {
  const fullHours = reserveWindowHours(reserveStart, reserveEnd);
  if (fullHours <= 0) return 0;

  const firstActivation = flightStarts
    .filter(validDate)
    .filter((flightStart) => flightStart.getTime() >= reserveStart.getTime() && flightStart.getTime() <= reserveEnd.getTime())
    .sort((left, right) => left.getTime() - right.getTime())[0];

  if (!firstActivation) return fullHours;
  return Math.max(0, (firstActivation.getTime() - reserveStart.getTime()) / 36e5);
}
