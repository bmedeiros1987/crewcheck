import { requireIdentity, sendJson } from '../v139/common.mjs';
import { diagnoseCirium, diagnoseCiriumFlight } from '../cirium-diagnostic.mjs';

export async function handleCiriumHealthRoute(req, res, url) {
  if (url.pathname !== '/api/admin/cirium-health') return false;

  const identity = await requireIdentity(req, res);
  if (!identity) return true;
  if (!identity.admin) {
    sendJson(res, 403, { ok: false, message: 'Acesso restrito ao administrador.' });
    return true;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }

  const carrier = String(url.searchParams.get('carrier') || 'LA').trim().toUpperCase();
  const flight = String(url.searchParams.get('flight') || '').trim().toUpperCase();
  const date = String(url.searchParams.get('date') || '').trim();

  const result = flight
    ? await diagnoseCiriumFlight({ carrier, flight, date: date || undefined })
    : await diagnoseCirium();

  sendJson(res, result.ok ? 200 : 503, result);
  return true;
}
