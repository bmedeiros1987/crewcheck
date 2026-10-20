import { loadVerifiedWellhubPartners } from '../v14407/wellhub.mjs';
import { wellhubUnitActions } from '../../shared/wellhub-unit-actions.mjs';
// No current catalog unit has reviewed public coordinates. Populate only with
// independently reviewed unit-specific evidence; never geocode user location.
const reviewedPublicDestinations = new Map();
export async function handleWellhubUnitRoute(req, res, url) {
  const respond = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.method !== 'GET') return respond(405, { ok: false, message: 'Método não permitido.' });
  const id = url.pathname.slice('/api/wellhub/unit/'.length);
  const partner = /^[a-z0-9][a-z0-9-]{0,99}$/.test(id) ? loadVerifiedWellhubPartners().find(p => p.id === id) : null;
  if (!partner) return respond(404, { ok: false, message: 'Unidade não disponível neste cadastro.' });
  return respond(200, { ok: true, actions: wellhubUnitActions(partner, {
    clientId: String(process.env.UBER_CLIENT_ID || '').trim(), destination: reviewedPublicDestinations.get(id) || null,
  }) });
}
