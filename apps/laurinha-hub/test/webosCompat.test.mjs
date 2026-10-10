import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.join(here, '..', 'client', 'laurinhaHubClient.js');
const source = fs.readFileSync(clientPath, 'utf8');

/** Remove comentarios para nao acusar recurso citado em texto explicativo. */
function stripComments(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const code = stripComments(source);

/**
 * webOS 4.x roda Chromium 53. Cada item abaixo chegou depois disso e
 * quebraria o app na TV - erro que so aparece no aparelho, nunca aqui.
 */
const FORBIDDEN = [
  { name: 'async/await (Chrome 55)', pattern: /\basync\s+function\b|\bawait\s+/ },
  { name: 'modulos ES (Chrome 61)', pattern: /^\s*(import|export)\s/m },
  { name: 'Object.entries/values (Chrome 54)', pattern: /Object\.(entries|values)\s*\(/ },
  { name: 'String.padStart/padEnd (Chrome 57)', pattern: /\.pad(Start|End)\s*\(/ },
  { name: 'spread/rest (Chrome 60 em objeto)', pattern: /\.\.\./ },
  { name: 'exponenciacao **', pattern: /\*\*/ },
  { name: 'Array.prototype.flat (Chrome 69)', pattern: /\.flat\s*\(|\.flatMap\s*\(/ },
  { name: 'Object.fromEntries (Chrome 73)', pattern: /Object\.fromEntries/ },
  { name: 'optional chaining (Chrome 80)', pattern: /\?\./ },
  { name: 'nullish coalescing (Chrome 80)', pattern: /\?\?/ },
  { name: 'globalThis (Chrome 71)', pattern: /\bglobalThis\b/ },
];

test('cliente da TV nao usa nada posterior ao Chromium 53 (webOS 4.x)', () => {
  for (const { name, pattern } of FORBIDDEN) {
    assert.ok(!pattern.test(code), `o cliente usa ${name}, que quebra na webOS 4.x`);
  }
});

test('cliente e script classico e publica o global LaurinhaHub', () => {
  const timers = [];
  const sandbox = {
    window: {},
    XMLHttpRequest: function () {},
    Promise,
    setTimeout: (fn, ms) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
    console,
  };
  sandbox.window.setTimeout = sandbox.setTimeout;
  sandbox.window.clearTimeout = sandbox.clearTimeout;

  vm.createContext(sandbox);
  // Rodar como script classico: se houvesse import/export, isso lancaria.
  vm.runInContext(source, sandbox);

  const hub = sandbox.window.LaurinhaHub;
  assert.ok(hub, 'o cliente deveria publicar window.LaurinhaHub');
  for (const method of [
    'configure', 'health', 'soundState', 'play', 'pause', 'stop', 'next',
    'previous', 'volume', 'setOutput', 'library', 'queue',
    'homeState', 'homeAction', 'lights', 'sound', 'party', 'goodNight',
    'climate', 'alarm', 'pollSoundState', 'toViewModel',
  ]) {
    assert.equal(typeof hub[method], 'function', `LaurinhaHub.${method} deveria existir`);
  }
});

test('o cliente nunca menciona token de Home Assistant', () => {
  // A TV so conhece a bridge key do Hub. Nenhum caminho do cliente deve
  // sequer ter nome de campo para token de HA.
  assert.ok(!/HA_TOKEN|ha_token|homeassistant.*token/i.test(source),
    'o cliente da TV nao pode ter nocao de token do Home Assistant');
  assert.ok(/X-Laurinha-Key/.test(source), 'o cliente deve mandar a bridge key');
});

test('toViewModel entrega titulo, estado, volume, player e erro amigavel', () => {
  const sandbox = { window: {}, XMLHttpRequest: function () {}, Promise, setTimeout, clearTimeout, console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  const { toViewModel } = sandbox.window.LaurinhaHub;

  const view = toViewModel({
    ok: true,
    state: 'playing',
    title: 'Ninar',
    artist: 'Laurinha',
    volumePercent: 35,
    output: { id: 'tv', label: 'TV' },
    outputs: [{ id: 'tv', label: 'TV' }],
    playback: { track: { title: 'Ninar', url: 'http://192.168.0.32:8188/api/media/track/t0' } },
    error: null,
  });

  assert.equal(view.title, 'Ninar');
  assert.equal(view.artist, 'Laurinha');
  assert.equal(view.state, 'playing');
  assert.equal(view.playing, true);
  assert.equal(view.volumePercent, 35);
  assert.equal(view.outputLabel, 'TV');
  assert.equal(view.localUrl, 'http://192.168.0.32:8188/api/media/track/t0');
  assert.equal(view.errorMessage, null);
  assert.equal(view.degraded, false);

  const degraded = toViewModel({
    ok: false,
    state: 'unknown',
    output: { id: 'todo_lugar', label: 'Todo lugar' },
    error: { code: 'ha_timeout', message: 'A casa demorou para responder.' },
  });
  assert.equal(degraded.degraded, true);
  assert.equal(degraded.errorMessage, 'A casa demorou para responder.');
  assert.equal(degraded.playing, false);
});
