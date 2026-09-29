import assert from 'node:assert/strict';
import fs from 'node:fs';
const engineSource = fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8');
assert.match(engineSource, /export function isActionableComplianceAlert\(/, 'helper canônico precisa ser exportado pelo Compliance Engine');
assert.match(engineSource, /alert\.actionable === false/, 'actionable=false deve ser não acionável');
assert.match(engineSource, /alert\.classification === 'dados_insuficientes'/, 'dados insuficientes devem ser informativos');
assert.match(engineSource, /alert\.severity === 'error' \|\| alert\.severity === 'warning'/, 'somente error/warning podem ser acionáveis');

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(home, /isActionableComplianceAlert/);
assert.match(home, /!isActionableComplianceAlert\(alert\)/, 'Home/Pulse deve excluir itens não acionáveis');

const email = fs.readFileSync('client/src/lib/emailClient.ts', 'utf8');
assert.match(email, /!isActionableComplianceAlert\(alert\)/, 'e-mail não deve contar lacuna informativa');

const sharing = fs.readFileSync('client/src/lib/sharing.ts', 'utf8');
assert.match(sharing, /compliance\.alerts\.filter\(isActionableComplianceAlert\)/);
assert.match(sharing, /ANÁLISE INCOMPLETA · HISTÓRICO NECESSÁRIO/);

const pdf = fs.readFileSync('client/src/lib/pdfExport.ts', 'utf8');
assert.match(pdf, /compliance\.alerts\.filter\(isActionableComplianceAlert\)/);

const database = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
assert.match(database, /filter\(isActionableComplianceAlert\)\.length/);

const materializer = fs.readFileSync('scripts/v14338/apply.mjs', 'utf8');
assert.match(materializer, /alert\?\.actionable !== false/);
assert.match(materializer, /alert\?\.classification !== 'dados_insuficientes'/);

for (const path of [
  'client/src/components/v1392/ManualRegulationView.tsx',
  'client/src/components/v1432/ManualRegulationView.tsx',
]) {
  const source = fs.readFileSync(path, 'utf8');
  assert.match(source, /item\.actionable !== false/);
  assert.match(source, /item\.classification !== 'dados_insuficientes'/);
}

const platform = fs.readFileSync('server/platform.mjs', 'utf8');
assert.match(platform, /item\?\.actionable === false \|\| item\?\.classification === 'dados_insuficientes'/);

for (const source of [home, email, sharing, pdf, database, platform]) {
  assert.doesNotMatch(source, /ROLLING_28D_DATA_GAP[\s\S]{0,100}(?:title|description)\s*===/);
}

console.log('PASS: non-actionable compliance gaps stay informational across user-facing consumers');
