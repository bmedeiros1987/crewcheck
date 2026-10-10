import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, findPlaceholders, ALLOWED_SERVICE_DOMAINS, DEFAULT_OUTPUTS } from '../src/config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const examplePath = path.join(here, '..', 'laurinha-hub.config.example.json');

test('outputs padrao sao exatamente os media_player informados para o projeto', () => {
  const config = loadConfig({});
  assert.deepEqual(
    config.outputs.filter((output) => output.entityId).map((output) => output.entityId),
    [
      'media_player.todo_lugar',
      'media_player.echo_dot_de_bruno',
      'media_player.2o_echo_dot_de_bruno',
      'media_player.echo_show_15_laurinha',
      'media_player.echo_show_de_bruno',
    ],
  );
  const tv = config.outputs.find((output) => output.id === 'tv');
  assert.equal(tv.entityId, null, 'a TV nao e um media_player do HA');
  assert.equal(tv.supportsLocalMedia, true);
  for (const output of config.outputs) {
    if (output.entityId) {
      assert.equal(output.supportsLocalMedia, false,
        `${output.id} nao pode declarar que toca MP3 local`);
    }
  }
});

test('nenhuma acao de casa vem configurada por padrao', () => {
  const config = loadConfig({});
  assert.deepEqual(config.homeActions, {});
  assert.deepEqual(config.soundScripts, {});
  assert.equal(config.musicAssistant.entityId, null);
  assert.deepEqual(config.tunein, []);
});

test('config de exemplo e JSON valido e nao ativa nada por engano', () => {
  const parsed = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  assert.deepEqual(parsed.tunein, [], 'tunein do exemplo precisa ser inerte');
  const active = Object.keys(parsed.soundScripts).filter((key) => !key.startsWith('_'));
  assert.deepEqual(active, [], 'soundScripts do exemplo precisa ser inerte');
  assert.equal(parsed.musicAssistant.entityId, null);
});

test('copiar o exemplo sem editar e recusado com a lista de chaves a trocar', () => {
  assert.throws(
    () => loadConfig({ LAURINHA_HUB_CONFIG: examplePath }),
    (error) => {
      assert.match(error.message, /placeholders/i);
      assert.match(error.message, /homeActions\.lights/);
      return true;
    },
  );
});

test('findPlaceholders ignora blocos de comentario', () => {
  const found = findPlaceholders({
    _comentario: 'use TROCAR_algo aqui',
    _exemplo: { entityId: 'script.TROCAR_isto' },
    real: { entityId: 'script.TROCAR_aquilo' },
    ok: { entityId: 'script.boa_noite' },
  });
  assert.deepEqual(found.map((item) => item.path), ['real.entityId']);
});

test('entityId de output que nao e media_player e recusado', () => {
  assert.throws(
    () => loadConfig(
      { LAURINHA_HUB_CONFIG: 'x' },
      { readFile: () => ({ outputs: [{ id: 'a', entityId: 'light.sala' }] }) },
    ),
    /media_player/,
  );
});

test('defaultOutput inexistente e recusado no boot, nao em producao', () => {
  assert.throws(
    () => loadConfig(
      { LAURINHA_HUB_CONFIG: 'x' },
      { readFile: () => ({ defaultOutput: 'cozinha' }) },
    ),
    /defaultOutput/,
  );
});

test('outputs com id duplicado sao recusados', () => {
  assert.throws(
    () => loadConfig(
      { LAURINHA_HUB_CONFIG: 'x' },
      {
        readFile: () => ({
          defaultOutput: 'a',
          outputs: [{ id: 'a' }, { id: 'a' }],
        }),
      },
    ),
    /duplicado/,
  );
});

test('a lista de dominios permitidos nao abre porta para mexer no HA', () => {
  for (const proibido of ['homeassistant', 'recorder', 'config', 'hassio', 'shell_command', 'python_script']) {
    assert.equal(ALLOWED_SERVICE_DOMAINS.has(proibido), false,
      `o dominio ${proibido} nao pode estar liberado`);
  }
});

test('timeout e porta tem limites sensatos mesmo com lixo no ambiente', () => {
  const config = loadConfig({ HA_TIMEOUT_MS: 'abc', LAURINHA_HUB_PORT: '999999' });
  assert.equal(config.ha.timeoutMs, 5000);
  assert.equal(config.hub.port, 65535);
  assert.equal(loadConfig({ HA_TIMEOUT_MS: '10' }).ha.timeoutMs, 250);
});

test('DEFAULT_OUTPUTS nao contem nenhum id de script, luz ou cena', () => {
  const serialized = JSON.stringify(DEFAULT_OUTPUTS);
  for (const dominio of ['script.', 'light.', 'scene.', 'climate.', 'alarm_control_panel.']) {
    assert.ok(!serialized.includes(dominio),
      `os outputs padrao nao podem embutir uma entidade ${dominio}`);
  }
});
