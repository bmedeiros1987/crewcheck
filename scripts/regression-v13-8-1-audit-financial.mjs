import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [home, compliance, financialRules, styles, packageJson] = await Promise.all([
  read('client/src/pages/Home.tsx'),
  read('client/src/lib/complianceEngine.ts'),
  read('client/src/lib/financialRules.ts'),
  read('client/src/index.css'),
  read('package.json'),
]);

assert.match(packageJson, /"version":\s*"13\.8\.1"/);
assert.match(home, /resolveActFinancialRules/);
assert.match(home, /resolvePerDiemRule/);
assert.match(home, /pendingCurrencies/);
assert.match(home, /currencySummary/);
assert.match(home, /ceiaEligible/);
assert.match(home, /breakfastIncluded/);
assert.doesNotMatch(home, /Reserva operacional sem outra janela detectada/);
assert.match(home, /KM diurno\/noturno, reserva e sobreaviso/);
assert.match(home, /workTypeLabel/);
assert.match(home, /flightWorkClass/);
assert.doesNotMatch(home, /moneyBRL\(finance\.perdiem\.monthly\)/);

assert.match(financialRules, /ACT_FINANCIAL_RULES_VERSION/);
assert.match(financialRules, /mainMeal:\s*105\.04/);
assert.match(financialRules, /mainMeal:\s*25\.70/);
assert.match(financialRules, /mainMeal:\s*22\.05/);
assert.match(financialRules, /mainMeal:\s*25\.15/);
assert.match(financialRules, /dayKm:\s*0\.057349/);
assert.match(financialRules, /nightKm:\s*0\.114698/);
assert.match(financialRules, /reserveHour:\s*48\.75/);
assert.match(financialRules, /standbyHour:\s*16\.25/);
assert.match(financialRules, /dayKm:\s*0\.211605/);
assert.match(financialRules, /nightKm:\s*0\.423250/);
assert.match(financialRules, /requiresManualFunction/);
assert.match(financialRules, /nenhum valor foi presumido/i);

assert.match(compliance, /totalGroundHours/);
assert.match(compliance, /maxGroundIntervalMinutes/);
assert.match(compliance, /groundLimitExceedances/);
assert.match(compliance, /Tempo em solo entre etapas acima do limite ACT/);
assert.match(compliance, /Ele não foi somado à jornada regulatória/);
assert.doesNotMatch(compliance, /const hiddenPatterns = \[\s*\/tempo em solo entre etapas/i);

assert.match(styles, /\.cz-flight-card\.work-op/);
assert.match(styles, /\.cz-flight-card\.work-ps/);
assert.match(styles, /#18a874/);
assert.match(styles, /#e59a20/);

console.log('CrewCheck v13.8.1 ACT and financial audit regression OK');
