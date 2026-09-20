/**
 * Montagem do Hub: rotas, autenticacao e streaming de midia.
 *
 * `createApp` devolve um handler puro de requisicao, sem abrir porta. Assim o
 * servidor real e os testes usam exatamente o mesmo codigo.
 */

import fs from 'node:fs';
import { createHaClient } from './haClient.mjs';
import { createLibrary } from './library.mjs';
import { createSoundService } from './sound.mjs';
import { createHomeService } from './home.mjs';
import { ERRORS, HubError } from './errors.mjs';
import { applyCors, readJsonBody, requireBridgeKey, sendError, sendJson } from './httpUtil.mjs';
import { createLogger } from './redact.mjs';

export function createApp({ config, fetchImpl = globalThis.fetch, logger = createLogger(), fsImpl = fs, now = Date.now }) {
  const ha = createHaClient({ config, fetchImpl, logger, now });
  const library = createLibrary({
    config,
    readFileSync: fsImpl.readFileSync,
    existsSync: fsImpl.existsSync,
    now,
  });
  const sound = createSoundService({ config, ha, library, logger, now });
  const home = createHomeService({ config, ha, sound, logger });

  /** GET /health - publico, nunca devolve segredo: so booleanos. */
  async function health() {
    const stats = library.stats();
    const payload = {
      ok: true,
      service: 'laurinha-hub',
      version: '5.0.0',
      haConfigured: config.ha.configured,
      bridgeKeyConfigured: Boolean(config.hub.bridgeKey),
      publicBaseUrlConfigured: Boolean(config.hub.publicBaseUrl),
      library: {
        source: stats.source,
        trackCount: stats.trackCount,
        photoCount: stats.photoCount,
        error: stats.error,
      },
      homeActionsConfigured: home.listActions().filter((entry) => entry.configured).map((entry) => entry.id),
      outputs: config.outputs.map((output) => output.id),
      ha: { reachable: null, latencyMs: null, error: null },
    };

    if (config.ha.configured) {
      const probe = await ha.safe(() => ha.ping());
      payload.ha.reachable = probe.ok;
      payload.ha.latencyMs = probe.ok ? probe.value.latencyMs : null;
      payload.ha.error = probe.ok ? null : probe.error.toJSON();
      if (!probe.ok) payload.ok = false;
    }
    return payload;
  }

  function streamMedia(kind, id, req, res) {
    const { filePath, contentType } = library.resolveMediaFile(kind, id);
    const stat = fsImpl.statSync(filePath);
    const range = req.headers.range;

    // Range e o que permite a TV avancar dentro da musica sem baixar tudo.
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : stat.size - 1;
        if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
          const safeEnd = Math.min(end, stat.size - 1);
          res.writeHead(206, {
            'Content-Type': contentType,
            'Content-Length': safeEnd - start + 1,
            'Content-Range': `bytes ${start}-${safeEnd}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
          });
          fsImpl.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
          return;
        }
      }
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    });
    fsImpl.createReadStream(filePath).pipe(res);
  }

  async function route(req, res, url) {
    const { pathname, searchParams } = url;
    const method = req.method || 'GET';
    const isWrite = method === 'POST';

    if (pathname === '/health' && method === 'GET') {
      const payload = await health();
      sendJson(res, payload.ok ? 200 : 503, payload);
      return;
    }

    // Midia local servida para a TV. Leitura, protegida como leitura.
    const mediaMatch = /^\/api\/media\/(track|photo)\/([^/]+)$/.exec(pathname);
    if (mediaMatch && method === 'GET') {
      requireBridgeKey(req, config, { write: false });
      streamMedia(mediaMatch[1], decodeURIComponent(mediaMatch[2]), req, res);
      return;
    }

    if (!pathname.startsWith('/api/')) {
      sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Rota inexistente.' } });
      return;
    }

    requireBridgeKey(req, config, { write: isWrite });
    const body = await readJsonBody(req);

    switch (`${method} ${pathname}`) {
      // ---- Som ----------------------------------------------------------
      case 'GET /api/sound/state':
        sendJson(res, 200, await sound.state());
        return;

      case 'POST /api/sound/play':
        sendJson(res, 200, { ok: true, ...(await sound.play(body)) });
        return;

      case 'POST /api/sound/pause':
        sendJson(res, 200, { ok: true, ...(await sound.pause()) });
        return;

      case 'POST /api/sound/stop':
        sendJson(res, 200, { ok: true, ...(await sound.stop()) });
        return;

      case 'POST /api/sound/next':
        sendJson(res, 200, { ok: true, ...(await sound.skip('next')) });
        return;

      case 'POST /api/sound/previous':
        sendJson(res, 200, { ok: true, ...(await sound.skip('previous')) });
        return;

      case 'POST /api/sound/volume':
        sendJson(res, 200, { ok: true, ...(await sound.setVolume(body)) });
        return;

      case 'POST /api/sound/output':
        if (!body.output) {
          throw ERRORS.badRequest('Escolha uma saida.', 'Envie { "output": "<id>" }.');
        }
        sendJson(res, 200, { ok: true, ...(await sound.setOutput(String(body.output))) });
        return;

      case 'GET /api/sound/library':
        sendJson(res, 200, await sound.libraryView({
          query: searchParams.get('q') || '',
          limit: searchParams.get('limit'),
          offset: searchParams.get('offset'),
        }));
        return;

      case 'GET /api/sound/queue':
        sendJson(res, 200, await sound.queue());
        return;

      // ---- Casa ---------------------------------------------------------
      case 'GET /api/home/state':
        sendJson(res, 200, await home.state());
        return;

      case 'POST /api/home/action': {
        if (!body.action) {
          throw ERRORS.badRequest('Escolha uma acao.', 'Envie { "action": "party" }.');
        }
        const params = body.params && typeof body.params === 'object' ? body.params : {};
        sendJson(res, 200, await home.run(String(body.action), params));
        return;
      }

      // ---- Biblioteca ----------------------------------------------------
      case 'POST /api/library/reload':
        library.reload();
        sendJson(res, 200, { ok: true, library: library.stats() });
        return;

      default:
        sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'Rota inexistente.' } });
    }
  }

  async function handler(req, res) {
    let url;
    try {
      url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    } catch {
      sendError(res, ERRORS.badRequest('URL invalida.'));
      return;
    }

    if (!applyCors(req, res, config)) {
      sendJson(res, 403, {
        ok: false,
        error: {
          code: 'origin_not_allowed',
          message: 'Esta origem nao pode falar com o Hub.',
          hint: 'Inclua a origem em LAURINHA_TV_ORIGINS.',
        },
      });
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      await route(req, res, url);
    } catch (error) {
      if (!(error instanceof HubError)) {
        logger.error('[hub] erro nao tratado:', error);
      }
      if (!res.headersSent) sendError(res, error);
      else res.end();
    }
  }

  return { handler, ha, library, sound, home, health };
}
