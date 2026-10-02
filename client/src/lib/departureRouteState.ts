/** A route observation belongs to one event/origin/destination/mode context. */
export type DepartureRouteState = 'pending' | 'valid' | 'stale' | 'error';
export type DepartureRouteObservation = {
  ok?: boolean;
  distanceMeters?: number;
  updatedAt?: string;
  message?: string;
  clientRouteState?: DepartureRouteState;
  clientRouteError?: string;
  clientRouteCheckedAt?: string;
};

export function createDepartureRouteSession<T extends DepartureRouteObservation>(
  publish: (route: T & DepartureRouteObservation) => void,
  now: () => string = () => new Date().toISOString(),
) {
  let request = 0;
  let active = true;
  let lastValid: T | null = null;
  return {
    begin() {
      const id = ++request;
      publish({ ...(lastValid || { ok: false }), clientRouteState: lastValid ? 'stale' : 'pending', clientRouteError: '', clientRouteCheckedAt: now() } as T & DepartureRouteObservation);
      return id;
    },
    complete(id: number, incoming: T | null) {
      if (!active || id !== request) return;
      const valid = incoming?.ok === true && Number.isFinite(Number(incoming.distanceMeters)) && Number(incoming.distanceMeters) > 0;
      if (valid) lastValid = { ...incoming, updatedAt: incoming.updatedAt || now() } as T;
      publish({ ...(lastValid || incoming || { ok: false }), clientRouteState: valid ? 'valid' : lastValid ? 'stale' : 'error', clientRouteError: valid ? '' : incoming?.message || 'Consulta de rota indisponível.', clientRouteCheckedAt: now() } as T & DepartureRouteObservation);
    },
    dispose() { active = false; ++request; },
  };
}
