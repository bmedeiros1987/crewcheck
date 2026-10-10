/**
 * Utilitarios HTTP do Hub: CORS, corpo JSON e resposta padronizada.
 */

import { ERRORS, HubError, toHubError } from './errors.mjs';
import { redact } from './redact.mjs';

const MAX_BODY_BYTES = 256 * 1024;

/**
 * CORS pensado para a TV.
 *
 * Um app webOS empacotado nao roda em http://: ele manda `Origin: null` ou
 * `file://`. Por isso a lista de origens permitidas nao basta - sem tratar
 * esses dois casos a TV simplesmente nao consegue chamar o Hub.
 */
export function resolveAllowedOrigin(origin, config) {
  if (!origin) return '*';
  if (origin === 'null' || origin.startsWith('file://')) {
    return config.cors.allowPackagedApp ? origin : null;
  }
  if (!config.cors.origins.length) return origin;
  return config.cors.origins.includes(origin) ? origin : null;
}

export function applyCors(req, res, config) {
  const origin = req.headers.origin;
  const allowed = resolveAllowedOrigin(origin, config);
  if (allowed === null) return false;

  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Laurinha-Key');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(redact(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

export function sendError(res, error) {
  const hubError = error instanceof HubError ? error : toHubError(error);
  sendJson(res, hubError.status, { ok: false, error: hubError.toJSON() });
}

export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      resolve({});
      return;
    }
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(ERRORS.badRequest('Requisicao grande demais.', `Limite de ${MAX_BODY_BYTES} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', () => reject(ERRORS.badRequest('Falha ao ler a requisicao.')));
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {});
      } catch {
        reject(ERRORS.badRequest('Corpo da requisicao nao e JSON valido.'));
      }
    });
  });
}

/**
 * Comparacao de chave em tempo constante, para nao vazar o tamanho/prefixo
 * da bridge key por diferenca de tempo de resposta.
 */
export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export function requireBridgeKey(req, config, { write }) {
  if (!config.hub.bridgeKey) {
    // Sem chave configurada o Hub so aceita leitura, e avisa no /health.
    if (write) {
      throw new HubError(
        'hub_not_configured',
        'O Hub ainda nao tem chave de acesso configurada.',
        { status: 503, hint: 'Defina LAURINHA_BRIDGE_KEY no ambiente do Hub.' },
      );
    }
    return;
  }
  if (!write && !config.hub.requireKeyForReads) return;

  const provided = req.headers['x-laurinha-key'];
  if (!safeEqual(provided, config.hub.bridgeKey)) throw ERRORS.unauthorized();
}
