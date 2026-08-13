import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const serverSource = fs.readFileSync('server.mjs', 'utf8').replace(/\r\n/g, '\n');

const startMarker = 'function tomtomIncidentIsActive(properties = {}, now = Date.now()) {';
const start = serverSource.indexOf(startMarker);
assert.notEqual(start, -1, 'tomtomIncidentIsActive não encontrada em server.mjs');
const end = serverSource.indexOf('\n}\n', start);
assert.notEqual(end, -1, 'fim de tomtomIncidentIsActive não localizado');
const fnSource = serverSource.slice(start, end + 2);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-tomtom-active-'));
const tempFile = path.join(tempDir, 'tomtom-incident-active.mjs');
try {
  fs.writeFileSync(tempFile, `export ${fnSource}\n`, 'utf8');
  const { tomtomIncidentIsActive } = await import(pathToFileURL(tempFile).href);

  const now = Date.parse('2026-08-13T12:00:00Z');

  // Ativa: timeValidity=present, endTime no futuro.
  assert.equal(
    tomtomIncidentIsActive({ timeValidity: 'present', endTime: '2026-08-13T13:00:00Z' }, now),
    true,
    'ocorrência com timeValidity=present e endTime futuro deve permanecer ativa',
  );

  // Transição ativa -> encerrada: mesmo objeto, só o endTime já passou.
  assert.equal(
    tomtomIncidentIsActive({ timeValidity: 'present', endTime: '2026-08-13T11:59:59Z' }, now),
    false,
    'ocorrência com endTime no passado deve ser filtrada mesmo que timeValidity ainda diga present',
  );

  // timeValidity explicitamente diferente de present (ex.: future) nunca deve alertar como ativa agora.
  assert.equal(
    tomtomIncidentIsActive({ timeValidity: 'future', endTime: '2026-08-14T13:00:00Z' }, now),
    false,
    'ocorrência com timeValidity=future não é uma ocorrência ativa agora',
  );

  // Campos ausentes (provider não informou validade/fim): permanece ativa, sem inventar estado.
  assert.equal(
    tomtomIncidentIsActive({}, now),
    true,
    'ausência de timeValidity/endTime não deve suprimir uma ocorrência real',
  );

  // Sem endTime mas timeValidity=present: continua ativa.
  assert.equal(
    tomtomIncidentIsActive({ timeValidity: 'present' }, now),
    true,
    'timeValidity=present sem endTime explícito continua ativa',
  );

  assert.ok(
    serverSource.includes('if (!tomtomIncidentIsActive(properties)) return [];'),
    'tomtomIncidentDetails deve descartar ocorrências não ativas antes de montar o payload',
  );
  assert.ok(
    serverSource.includes("timeValidity: String(properties.timeValidity || ''),"),
    'timeValidity deve ser preservada na ocorrência normalizada para rastreabilidade',
  );

  console.log('TomTom incident terminal-occurrence filter regression: ok');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
