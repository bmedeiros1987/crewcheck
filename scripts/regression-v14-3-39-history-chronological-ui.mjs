import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const homePath = path.join(root, 'client/src/pages/Home.tsx');
const databasePath = path.join(root, 'client/src/lib/databaseClient.ts');
const cssPath = path.join(root, 'client/src/index.css');
const applyPath = path.join(root, 'scripts/v14339/apply.mjs');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
const homeBefore = fs.readFileSync(homePath, 'utf8');
const databaseBefore = fs.readFileSync(databasePath, 'utf8');
const cssBefore = fs.readFileSync(cssPath, 'utf8');

assert.ok(chain.includes("await import('../v14339/apply.mjs');"), 'v14.3.39 deve encerrar a preparação canônica');
assert.ok(homeBefore.includes("const DEFAULT_VERSION = '14.3.48';"), 'versão Web/PWA final 14.3.48 ausente');

const databaseViewStart = homeBefore.indexOf('function historyPeriodLabel(');
const databaseViewEnd = homeBefore.indexOf('function CrewToolsView(', databaseViewStart);
assert.ok(databaseViewStart >= 0 && databaseViewEnd > databaseViewStart, 'bloco do histórico v14.3.39 não localizado');
const historyBlock = homeBefore.slice(databaseViewStart, databaseViewEnd);

for (const marker of [
  "return 'Escala de ' + formatted.charAt(0).toUpperCase() + formatted.slice(1);",
  'Importada em ${day} às ${time}',
  'Arquivo original',
  'MÊS DE REFERÊNCIA',
  'Histórico de escalas',
  'do mais recente para o mais antigo',
  'sortRosterHistoryChronologically(saved)',
  'listSavedRosters(72)',
  'cc-history-card-v14339',
]) assert.ok(historyBlock.includes(marker), `contrato visual/cronológico ausente: ${marker}`);

assert.ok(!historyBlock.includes("<h3>{item.sourceFileName"), 'nome bruto do PDF não pode ser o título principal');
assert.ok(!historyBlock.includes("<p>{item.createdAt"), 'ISO bruto não pode ser exibido diretamente');
assert.ok(historyBlock.includes('title={historyOriginalFileName(item)}'), 'nome original deve continuar acessível sem virar o título');
assert.ok(historyBlock.includes('item.isActive && <em>Ativa</em>'), 'escala ativa deve manter badge próprio');

const expectedSort = "Number(b.year || 0) - Number(a.year || 0) || Number(b.month || 0) - Number(a.month || 0) || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))";
assert.ok(databaseBefore.includes(expectedSort), 'histórico deve ordenar por ano, mês e data de importação, todos decrescentes');
const activeFirst = "Number(Boolean(b.isActive)) - Number(Boolean(a.isActive)) || String(b.year || 0)";
assert.ok(!databaseBefore.includes(activeFirst), 'status ativo não pode quebrar a ordem cronológica dos períodos');

const synthetic = [
  { id: 'june', year: 2026, month: 6, createdAt: '2026-06-30T12:00:00.000Z', isActive: false },
  { id: 'aug-old', year: 2026, month: 8, createdAt: '2026-07-20T12:00:00.000Z', isActive: false },
  { id: 'july', year: 2026, month: 7, createdAt: '2026-07-26T21:42:52.601Z', isActive: true },
  { id: 'aug-new', year: 2026, month: 8, createdAt: '2026-07-27T13:00:00.000Z', isActive: false },
];
const sortedIds = [...synthetic].sort((a, b) => Number(b.year || 0) - Number(a.year || 0)
  || Number(b.month || 0) - Number(a.month || 0)
  || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  || Number(Boolean(b.isActive)) - Number(Boolean(a.isActive))).map((item) => item.id);
assert.deepEqual(sortedIds, ['aug-new', 'aug-old', 'july', 'june'], 'ordem cronológica esperada deve ser agosto, julho e junho');

for (const marker of [
  'CrewCheck v14.3.39 — histórico cronológico e legível',
  '.cc-history-card-v14339',
  'grid-template-areas: "period action" "file action" "meta action"',
  '@media (max-width: 620px)',
  'grid-template-areas: "period" "file" "meta" "action"',
  'text-overflow: ellipsis',
]) assert.ok(cssBefore.includes(marker), `proteção responsiva ausente: ${marker}`);

const applySource = fs.readFileSync(applyPath, 'utf8');
for (const protectedPath of ['client/src/lib/pdfParser.ts', 'server/rosterParser.mjs', 'server.mjs', 'canonicalRoster', 'financialRules']) {
  assert.ok(!applySource.includes(`update('${protectedPath}`), `v14.3.39 não pode alterar motor protegido: ${protectedPath}`);
}

const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14348/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'reaplicação final v14.3.48 falhou');
assert.equal(fs.readFileSync(homePath, 'utf8'), homeBefore, 'preparação final deve preservar o histórico no Home');
assert.equal(fs.readFileSync(databasePath, 'utf8'), databaseBefore, 'preparação final deve preservar o cliente do banco');
assert.equal(fs.readFileSync(cssPath, 'utf8'), cssBefore, 'preparação final deve preservar o CSS do histórico');

console.log('v14.3.39 history: friendly period labels, local import time, original filename reference, chronological ordering and responsive cards validated.');
