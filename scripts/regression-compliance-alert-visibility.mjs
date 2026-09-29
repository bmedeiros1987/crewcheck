import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const semanticsSource = fs.readFileSync(new URL('../client/src/lib/complianceAlertSemantics.ts', import.meta.url), 'utf8');
const visibilitySource = fs.readFileSync(new URL('../client/src/lib/complianceAlertVisibility.ts', import.meta.url), 'utf8')
  .replace(/^import \{ isActionableComplianceAlert \} from '\.\/complianceAlertSemantics';\s*/m, '');
const javascript = stripTypeScriptTypes(`${semanticsSource}\n${visibilitySource}`, { mode: 'strip' });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
const visibility = await import(moduleUrl);

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

const actionable = {
  severity: 'warning',
  title: 'Mensagem humana livre',
  description: 'Exige revisão.',
  classification: 'atencao',
  code: 'SOME_ACTIONABLE_WARNING',
};

const dataGap = {
  severity: 'warning',
  title: 'Este texto pode mudar sem quebrar a UI',
  description: 'Cobertura histórica incompleta.',
  classification: 'dados_insuficientes',
  code: 'ROLLING_28D_DATA_GAP',
  actionable: false,
  coverage: { windowDays: 28, missingDates: ['2026-08-30', '2026-08-31'] },
};

const confirmed = {
  severity: 'error',
  title: 'Irregularidade confirmada',
  description: 'Exemplo de ocorrência confirmada.',
  classification: 'confirmada',
  code: 'CONFIRMED_EXAMPLE',
};

assert.deepEqual(
  visibility.filterActionableComplianceAlerts([actionable, dataGap, confirmed]).map((alert) => alert.code),
  ['SOME_ACTIONABLE_WARNING', 'CONFIRMED_EXAMPLE'],
  'dados insuficientes não podem entrar na lista acionável',
);
assert.deepEqual(
  visibility.informationalComplianceAlerts([actionable, dataGap, confirmed]).map((alert) => alert.code),
  ['ROLLING_28D_DATA_GAP'],
  'data gap deve permanecer disponível como informação',
);

const storage = memoryStorage();
const accountId = 'crew-123';
const revisionA = 'roster-a';
const revisionB = 'roster-b';

assert.equal(
  visibility.dismissComplianceAlertUntilRosterUpdate(storage, accountId, revisionA, dataGap, new Date('2026-09-29T12:00:00Z')),
  true,
  'warning informativo pode ser ocultado até a próxima revisão',
);
assert.equal(
  visibility.visibleInformationalComplianceAlerts([dataGap], storage, accountId, revisionA).length,
  0,
  'dispensa deve valer apenas na revisão atual',
);
assert.equal(
  visibility.visibleInformationalComplianceAlerts([dataGap], storage, accountId, revisionB).length,
  1,
  'nova revisão deve reapresentar a análise informativa',
);
assert.equal(
  visibility.dismissComplianceAlertUntilRosterUpdate(storage, accountId, revisionA, confirmed),
  false,
  'erro confirmado nunca pode ser dispensado por esse controle',
);
assert.equal(
  visibility.dismissComplianceAlertUntilRosterUpdate(storage, null, revisionA, actionable),
  false,
  'sessão anônima não deve persistir dispensa',
);

assert.equal(
  visibility.isInformationalComplianceAlert({ ...dataGap, title: 'Título completamente diferente' }),
  true,
  'semântica deve depender do contrato, nunca do texto exibido',
);

console.log('compliance alert visibility contract: PASS');
