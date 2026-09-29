import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const code = ts.transpileModule(fs.readFileSync('client/src/lib/homeLayoutPreference.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const home = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const semanticsCode = ts.transpileModule(fs.readFileSync('client/src/lib/complianceAlertSemantics.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const visibilitySource = fs.readFileSync('client/src/lib/complianceAlertVisibility.ts', 'utf8')
  .replace("import { isActionableComplianceAlert } from './complianceAlertSemantics';", '');
const visibilityCode = semanticsCode + '\n' + ts.transpileModule(visibilitySource, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
const visibility = await import(`data:text/javascript;base64,${Buffer.from(visibilityCode).toString('base64')}`);
const preparedHome = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(preparedHome, /!isActionableComplianceAlert\(alert\)/, 'Home preparado deve honrar diretamente o helper semântico compartilhado');
if (preparedHome.includes('const parsed = parsedRouteMinutes(')) {
  assert.match(preparedHome, /function parsedRouteMinutes\(/, 'materialização da Home não pode remover o parser de duração da rota');
}

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };

assert.equal(home.readHomeLayout(storage, 'A').mode, 'standard');
assert.equal(home.saveHomeLayout(storage, 'A', { version: 1, mode: 'personalized', order: ['smart','next','summary','finance','limits'], visible: ['smart','next'] }), true);
assert.deepEqual(home.visibleHomeSlots(home.readHomeLayout(storage, 'A'), home.HOME_SLOT_ORDER), ['smart','next','summary','limits']);
assert.equal(home.readHomeLayout(storage, 'B').mode, 'standard', 'account B must not inherit account A');
assert.equal(home.saveHomeLayout(storage, null, home.DEFAULT_HOME_LAYOUT), false, 'anonymous preference must not persist');
values.set(home.homeLayoutKey('A'), JSON.stringify({ version: 1, mode: 'mixed', order: ['finance'], visible: [] }));
const normalized = home.readHomeLayout(storage, 'A');
assert.deepEqual(normalized.order, ['finance','summary','next','limits','smart']);
assert.ok(normalized.visible.includes('summary') && normalized.visible.includes('next') && normalized.visible.includes('limits'), 'critical slots remain visible');
assert.equal(home.resetHomeLayout(storage, 'A'), true);
assert.equal(home.readHomeLayout(storage, 'A').mode, 'standard');

values.clear();
const incomplete28 = {
  severity: 'warning',
  title: 'Texto humano pode mudar sem alterar a semântica',
  description: 'Histórico insuficiente para completar a janela.',
  legalReference: 'ACT',
  classification: 'dados_insuficientes',
  code: 'ROLLING_28D_DATA_GAP',
  actionable: false,
  coverage: { windowDays: 28, missingDates: ['2026-08-30'] },
};
const warning = {
  severity: 'warning',
  title: 'Repouso requer revisão',
  description: 'Confira a programação publicada.',
  legalReference: 'ACT',
};
const critical = {
  severity: 'error',
  title: 'Limite confirmado excedido',
  description: 'Ocorrência confirmada.',
  legalReference: 'RBAC 117',
};
const rawAlerts = [incomplete28, warning, critical, { ...warning }];
assert.deepEqual(
  visibility.filterActionableComplianceAlerts(rawAlerts).map((alert) => alert.title),
  [warning.title, critical.title],
  'avaliação incompleta de 28 dias é informação, não alerta ativo/Pulse',
);
assert.deepEqual(
  visibility.informationalComplianceAlerts(rawAlerts).map((alert) => alert.title),
  [incomplete28.title],
);
assert.equal(visibility.activeComplianceAlerts(rawAlerts, storage, 'account-A', 'roster-1').length, 2);
assert.equal(
  visibility.dismissComplianceAlertUntilRosterUpdate(storage, 'account-A', 'roster-1', warning, new Date('2026-09-29T12:00:00Z')),
  true,
);
assert.deepEqual(
  visibility.activeComplianceAlerts(rawAlerts, storage, 'account-A', 'roster-1').map((alert) => alert.title),
  [critical.title],
  'aviso ignorado não reaparece na mesma revisão',
);
assert.equal(
  visibility.dismissComplianceAlertUntilRosterUpdate(storage, 'account-A', 'roster-1', critical),
  false,
  'erro confirmado não pode ser dispensado',
);
assert.equal(
  visibility.activeComplianceAlerts(rawAlerts, storage, 'account-A', 'roster-2').length,
  2,
  'nova atualização da escala reativa o aviso',
);
assert.equal(
  visibility.activeComplianceAlerts(rawAlerts, storage, 'account-B', 'roster-1').length,
  2,
  'conta diferente não herda dispensa',
);
assert.equal(
  visibility.dismissComplianceAlertUntilRosterUpdate(storage, null, 'roster-1', warning),
  false,
  'conta anônima não persiste dispensa',
);
assert.deepEqual(visibility.readComplianceAlertDismissals(storage, null, 'roster-1'), []);
assert.notEqual(
  visibility.complianceAlertFingerprint(warning),
  visibility.complianceAlertFingerprint({ ...warning, description: 'Nova revisão publicada.' }),
  'mudança material precisa gerar nova ocorrência',
);

const shell = fs.readFileSync('client/src/components/v1391/HomeLayoutShell.tsx', 'utf8');
assert.match(shell, /PRÉVIA E PREFERÊNCIAS/);
assert.match(shell, /Padrão CrewCheck/);
assert.match(shell, /Personalizada/);
assert.match(shell, /Mista/);
assert.match(shell, /Restaurar padrão/);
assert.match(shell, /Salvar/);
assert.match(shell, /Cancelar/);
assert.match(shell, /aria-pressed=\{enabled\}/);
assert.match(shell, /Essencial · sempre visível/);
assert.doesNotMatch(shell, /financeEngine|parsePDF|compareRosters/, 'Home editor must not duplicate domain engines');

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(source, /<HomeLayoutShell slots=\{slots\}/);
for (const id of ['summary','finance','next','limits','smart']) assert.match(source, new RegExp(`id: '${id}'`));
assert.match(source, /alertCount/);
assert.match(source, /Ignorar até a próxima atualização/);
assert.match(source, /Análises incompletas/);
assert.match(source, /visibleInformationalComplianceAlerts/);
assert.doesNotMatch(source, /INCOMPLETE_28_DAY_TITLE/, 'UI não pode depender de constante textual para semântica regulatória');
assert.match(source, /warning && <button/);
assert.match(source, /message as \(\{ category\?: string \} \| null\)/, 'alert visibility must compile before and after Pulse category contract');
assert.match(source, /function Alerts\(\{ compliance \}: \{ compliance: ComplianceResult \| null \}\)/);
assert.doesNotMatch(source, /<Alerts[^>]*roster=\{bundle\.roster\}/, 'Alerts deve preservar a chamada canônica sem prop redundante de roster');
assert.doesNotMatch(source, /reason: 'user_schedule_change'/, 'dispensa antiga global não pode sobreviver');
const finalizer = fs.readFileSync('scripts/p1-home-layout/apply.mjs', 'utf8');
assert.match(finalizer, /Alert visibility is finalized here/);
assert.match(finalizer, /materialização de alertas incompleta/);

const css = fs.readFileSync('client/src/components/v1391/home-layout.css', 'utf8');
assert.match(css, /min-height:44px/);
assert.match(css, /prefers-reduced-motion:reduce/);
console.log('PASS: Home modes plus account/revision-scoped alert visibility, 28-day explanation and critical-alert guard');
