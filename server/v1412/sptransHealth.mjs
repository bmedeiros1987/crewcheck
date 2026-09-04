import { sptransConfig, sptransFindLines } from '../integrations/sptrans.mjs';

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

export async function sptransHealthSnapshot({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  query = 'Aeroporto',
} = {}) {
  const config = sptransConfig(environment);
  if (!config.configured) {
    return {
      ok: false,
      configured: false,
      reachable: false,
      coverage: false,
      provider: 'sptrans-olho-vivo',
      message: 'SPTrans Olho Vivo aguardando configuração.',
    };
  }

  const startedAt = Date.now();
  try {
    const response = await sptransFindLines(query, { environment, fetchImpl });
    const lines = Array.isArray(response?.data) ? response.data : [];
    return {
      ok: true,
      configured: true,
      reachable: true,
      coverage: lines.length > 0,
      provider: 'sptrans-olho-vivo',
      query,
      counts: { lines: lines.length },
      latencyMs: Date.now() - startedAt,
      fetchedAt: response?.fetchedAt || new Date().toISOString(),
      message: lines.length > 0
        ? 'SPTrans Olho Vivo respondeu com dados operacionais.'
        : 'SPTrans Olho Vivo respondeu, mas sem linhas para a sonda controlada.',
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      reachable: false,
      coverage: false,
      provider: 'sptrans-olho-vivo',
      latencyMs: Date.now() - startedAt,
      code: String(error?.code || 'SPTRANS_HEALTH_ERROR').slice(0, 80),
      message: 'SPTrans Olho Vivo configurado, mas indisponível para a sonda agora.',
    };
  }
}

export async function handleSptransHealthRoute(req, res, url) {
  if (url.pathname !== '/api/mobility/sptrans/health') return false;
  const snapshot = await sptransHealthSnapshot();
  sendJson(res, 200, snapshot);
  return true;
}
