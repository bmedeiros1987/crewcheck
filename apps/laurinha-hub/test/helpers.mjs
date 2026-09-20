/**
 * Apoio dos testes: config sintetica, Home Assistant falso e um servidor
 * real em porta efemera. Usar http de verdade (em vez de chamar o handler
 * direto) e o que permite testar CORS, status, Range e streaming como a TV
 * realmente ve.
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { createApp } from '../src/app.mjs';
import { clearSecrets } from '../src/redact.mjs';

export const FAKE_TOKEN = 'ha_tok_' + 'S3CR3T'.repeat(6);
export const BRIDGE_KEY = 'bridge_' + 'K3Y'.repeat(8);

/** Cria uma biblioteca de verdade no disco (1 MP3 + 1 foto) com manifesto. */
export function makeLibraryFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'laurinha-lib-'));
  const musicDir = path.join(root, 'MINHAS_MUSICAS');
  const photoDir = path.join(root, 'FOTOS_LAURINHA');
  const hubDir = path.join(root, 'hub');
  fs.mkdirSync(musicDir);
  fs.mkdirSync(photoDir);
  fs.mkdirSync(hubDir);

  const mp3Path = path.join(musicDir, 'Ninar.mp3');
  const photoPath = path.join(photoDir, 'Praia.png');
  // Conteudo pequeno mas com bytes reais, para exercitar Range de verdade.
  fs.writeFileSync(mp3Path, Buffer.concat([Buffer.from('ID3\u0003\0\0\0'), Buffer.alloc(512, 7)]));
  fs.writeFileSync(photoPath, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(128, 3)]));

  const manifestPath = path.join(hubDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    schema: 'laurinha.hub.manifest/1',
    generatedAt: '2026-09-20T00:00:00Z',
    root,
    embedMedia: false,
    music: {
      trackCount: 1,
      tracks: [{ id: 0, title: 'Ninar', path: mp3Path, relativePath: 'MINHAS_MUSICAS/Ninar.mp3' }],
      playlists: [{ name: 'Dormir', tracks: [0] }],
    },
    photos: {
      photoCount: 1,
      photos: [{ id: 0, title: 'Praia', path: photoPath, relativePath: 'FOTOS_LAURINHA/Praia.png' }],
      albums: [{ name: 'Verao', cover: 0, intervalSeconds: 12, photos: [0] }],
    },
    frameMode: { secondsPerPhoto: 12, fade: true, random: false, caption: true },
  }));

  return { root, manifestPath, mp3Path, photoPath, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

/**
 * Home Assistant falso.
 * `states` mapeia entity_id -> objeto de estado.
 * `onService` registra cada chamada de servico.
 * `behavior` permite simular timeout, 401, 500.
 */
export function makeFakeHa({ states = {}, behavior = 'ok', serviceStatus = 200 } = {}) {
  const calls = [];
  const seenAuth = [];

  const fetchImpl = async (url, options = {}) => {
    seenAuth.push(options.headers?.Authorization || null);

    if (behavior === 'timeout') {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    }
    if (behavior === 'offline') throw new Error('connect ECONNREFUSED 192.168.0.56:8123');
    if (behavior === 'unauthorized') {
      return new Response('', { status: 401 });
    }

    const parsed = new URL(url);
    const { pathname } = parsed;

    if (pathname === '/api/') {
      return new Response(JSON.stringify({ message: 'API running.' }), { status: 200 });
    }

    if (pathname === '/api/states') {
      return new Response(JSON.stringify(Object.values(states)), { status: 200 });
    }

    const stateMatch = /^\/api\/states\/(.+)$/.exec(pathname);
    if (stateMatch) {
      const entityId = decodeURIComponent(stateMatch[1]);
      const entity = states[entityId];
      if (!entity) return new Response('Not found', { status: 404 });
      return new Response(JSON.stringify(entity), { status: 200 });
    }

    const serviceMatch = /^\/api\/services\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (serviceMatch) {
      calls.push({
        domain: decodeURIComponent(serviceMatch[1]),
        service: decodeURIComponent(serviceMatch[2]),
        data: options.body ? JSON.parse(options.body) : {},
      });
      if (serviceStatus !== 200) return new Response('boom', { status: serviceStatus });
      return new Response(JSON.stringify([]), { status: 200 });
    }

    return new Response('Not found', { status: 404 });
  };

  return { fetchImpl, calls, seenAuth };
}

export function mediaPlayerState(entityId, overrides = {}) {
  return {
    entity_id: entityId,
    state: 'playing',
    attributes: {
      friendly_name: entityId,
      media_title: 'Cantiga da Vovo',
      media_artist: 'Laurinha',
      volume_level: 0.4,
      is_volume_muted: false,
      ...overrides.attributes,
    },
    ...overrides,
  };
}

/** Sobe o Hub em porta efemera e devolve helpers de requisicao. */
export async function startHub({ env = {}, fakeHa = makeFakeHa(), fileConfig = null, logger } = {}) {
  clearSecrets();

  const baseEnv = {
    HA_BASE_URL: 'http://192.168.0.56:8123',
    HA_TOKEN: FAKE_TOKEN,
    LAURINHA_BRIDGE_KEY: BRIDGE_KEY,
    LAURINHA_PUBLIC_BASE_URL: 'http://192.168.0.32:8188',
    HA_TIMEOUT_MS: '400',
    HA_RETRIES: '0',
    ...env,
  };

  let configFilePath = null;
  if (fileConfig) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'laurinha-cfg-'));
    configFilePath = path.join(dir, 'hub.config.json');
    fs.writeFileSync(configFilePath, JSON.stringify(fileConfig));
    baseEnv.LAURINHA_HUB_CONFIG = configFilePath;
  }

  const config = loadConfig(baseEnv);
  const captured = { warn: [], error: [], info: [] };
  const testLogger = logger || {
    info: (...args) => captured.info.push(args.join(' ')),
    warn: (...args) => captured.warn.push(args.join(' ')),
    error: (...args) => captured.error.push(args.join(' ')),
  };

  const app = createApp({ config, fetchImpl: fakeHa.fetchImpl, logger: testLogger });
  const server = http.createServer(app.handler);
  // O fetch do Node mantem keep-alive; sem isso o server.close() do teardown
  // fica esperando o socket expirar e cada arquivo de teste leva segundos.
  server.keepAliveTimeout = 1;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const call = async (method, pathname, { body, headers = {}, key = BRIDGE_KEY, origin } = {}) => {
    const finalHeaders = { ...headers };
    if (key) finalHeaders['X-Laurinha-Key'] = key;
    if (origin !== undefined) finalHeaders.Origin = origin;
    if (body !== undefined) finalHeaders['Content-Type'] = 'application/json';

    const response = await fetch(`${base}${pathname}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch { /* resposta binaria */ }
    return { status: response.status, headers: response.headers, json, text };
  };

  return {
    base,
    config,
    app,
    calls: fakeHa.calls,
    seenAuth: fakeHa.seenAuth,
    captured,
    call,
    get: (pathname, options) => call('GET', pathname, options),
    post: (pathname, body, options) => call('POST', pathname, { body: body ?? {}, ...options }),
    raw: (pathname, options = {}) => fetch(`${base}${pathname}`, {
      headers: { 'X-Laurinha-Key': BRIDGE_KEY, ...(options.headers || {}) },
    }),
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      if (configFilePath) fs.rmSync(path.dirname(configFilePath), { recursive: true, force: true });
    },
  };
}
