import { requireIdentity, sendJson } from '../v139/common.mjs';
import { diagnoseAiswebNotam } from '../aisweb-diagnostic.mjs';

export async function handleAiswebHealthRoute(req, res, url) {
  if (url.pathname !== '/api/admin/aisweb-health') return false;

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

  const icao = String(url.searchParams.get('icao') || 'SBBR').trim().toUpperCase();
  const result = await diagnoseAiswebNotam({ icao });
  sendJson(res, result.ok ? 200 : 503, result);
  return true;
}
