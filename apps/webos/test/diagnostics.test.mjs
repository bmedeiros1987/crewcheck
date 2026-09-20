import test from 'node:test';
import assert from 'node:assert/strict';
import {loadModule} from './load.mjs';

const {Diagnostics, createDiagnostics, normalizeCode} = await loadModule('packages/tv-core/src/diagnostics.ts');

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    dump: () => [...data.values()].join('\n'),
  };
}

test('M · o diagnostico guarda codigo, nunca texto livre', () => {
  const storage = memoryStorage();
  const diag = new Diagnostics(storage);
  // Tudo que parece segredo e destruido pela normalizacao.
  diag.record('Bearer eyJhbGciOiJIUzI1NiJ9.payload.assinatura');
  diag.record('http://192.168.0.32:8188/api?token=abcdef123456');
  diag.record('llt_0123456789abcdef0123456789abcdef');

  const dump = storage.dump();
  assert.ok(!dump.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWT sobreviveu no armazenamento');
  assert.ok(!dump.includes('abcdef123456'), 'token de query sobreviveu');
  assert.ok(!/[a-z]/.test(dump.replace(/"[^"]*":/g, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '')),
    'codigo deveria estar todo em maiusculas');
  for (const entry of diag.recent()) {
    assert.ok(entry.code.length <= 32, 'codigo maior que 32 caracteres');
    assert.match(entry.code, /^[A-Z0-9-]+$/, `codigo fora do alfabeto seguro: ${entry.code}`);
  }
});

test('M · normalizeCode mantem os codigos do app intactos', () => {
  for (const code of ['BOOT-OK', 'UI-RENDER', 'HUB-TIMEOUT', 'HUB-HTTP-503', 'JS-ERROR', 'PROMISE-REJECT']) {
    assert.equal(normalizeCode(code), code);
  }
  assert.equal(normalizeCode(''), 'UNKNOWN');
  assert.equal(normalizeCode(null), 'UNKNOWN');
  assert.equal(normalizeCode(undefined), 'UNKNOWN');
});

test('M · armazenamento que lanca nao derruba o diagnostico', () => {
  const hostile = {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('bloqueado'); },
  };
  let diag;
  assert.doesNotThrow(() => { diag = new Diagnostics(hostile); });
  assert.doesNotThrow(() => diag.record('HUB-OFFLINE'));
  assert.equal(diag.lastCode(), 'HUB-OFFLINE', 'o log de memoria precisa continuar funcionando');
});

test('M · createDiagnostics aceita ausencia total de storage', () => {
  for (const candidate of [undefined, null, {}, 'nao e storage']) {
    const diag = createDiagnostics(candidate);
    assert.doesNotThrow(() => diag.record('BOOT-OK'));
    assert.equal(diag.lastCode(), 'BOOT-OK');
  }
});

test('M · o log e limitado, nao cresce sem fim na TV', () => {
  const diag = new Diagnostics(memoryStorage());
  for (let i = 0; i < 100; i += 1) diag.record(`CODE-${i}`);
  assert.ok(diag.recent().length <= 20, 'o anel de diagnostico deveria ter teto');
  assert.equal(diag.lastCode(), 'CODE-99');
});

test('M · entrada corrompida no storage nao quebra o boot', () => {
  const storage = memoryStorage();
  storage.setItem('crewcheck-tv-diag-v1', '{isso nao e json');
  let diag;
  assert.doesNotThrow(() => { diag = new Diagnostics(storage); });
  assert.deepEqual(diag.recent(), []);
});
