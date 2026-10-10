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

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { ok: false, message: 'Método não permitido.' });
    return true;
  }

  // Absent parameters mean "default"; present-but-empty or blank ones are explicit
  // invalid input and are rejected before any upstream query.
  const params = url.searchParams;
  const carrier = params.has('carrier') ? String(params.get('carrier')).trim().toUpperCase() : 'LA';
  const flightGiven = params.has('flight');
  const flight = flightGiven ? String(params.get('flight')).trim().toUpperCase() : '';
  const dateGiven = params.has('date');
  const date = dateGiven ? String(params.get('date')).trim() : '';

  if (!/^[A-Z0-9]{2,3}$/.test(carrier)) {
    sendJson(res, 400, { ok: false, message: 'Companhia inválida.' });
    return true;
  }
  if (flightGiven && !/^[0-9]{1,4}[A-Z]?$/.test(flight)) {
    sendJson(res, 400, { ok: false, message: 'Voo inválido.' });
    return true;
  }
  if (dateGiven && !isValidDate(date)) {
    sendJson(res, 400, { ok: false, message: 'Data inválida. Use AAAA-MM-DD.' });
    return true;
  }

  const result = flightGiven
    ? await diagnoseCiriumFlight({ carrier, flight, date: dateGiven ? date : undefined })
    : await diagnoseCirium();

  sendJson(res, result.ok ? 200 : 503, result);
  return true;
}
