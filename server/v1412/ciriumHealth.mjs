import { requireIdentity, sendJson } from '../v139/common.mjs';
import { diagnoseCirium, diagnoseCiriumFlight } from '../cirium-diagnostic.mjs';

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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

  if (!/^[A-Z0-9]{2,3}$/.test(carrier)) {
    sendJson(res, 400, { ok: false, message: 'Companhia inválida.' });
    return true;
  }
  if (flight && !/^[0-9A-Z]{1,5}$/.test(flight)) {
    sendJson(res, 400, { ok: false, message: 'Voo inválido.' });
    return true;
  }
  if (date && !isValidDate(date)) {
    sendJson(res, 400, { ok: false, message: 'Data inválida. Use AAAA-MM-DD.' });
    return true;
  }

  const result = flight
    ? await diagnoseCiriumFlight({ carrier, flight, date: date || undefined })
    : await diagnoseCirium();

  sendJson(res, result.ok ? 200 : 503, result);
  return true;
}
