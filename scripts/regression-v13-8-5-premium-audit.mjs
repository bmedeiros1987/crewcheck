import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('client/src/pages/Home.tsx');
const css = read('client/src/index.css');
const platformCss = read('client/src/platform-v13-8.css');
const financialRules = read('client/src/lib/financialRules.ts');
const financialLearning = read('client/src/lib/financialStatementLearning.ts');
const auth = read('client/src/lib/authClient.ts');
const platformServer = read('server/platform.mjs');
const server = read('server.mjs');

const versionMatch = home.match(/const DEFAULT_VERSION = '(\d+)\.(\d+)\.(\d+)'/);
assert.ok(versionMatch, 'Versão padrão da interface ausente');
const [, major, minor, patch] = versionMatch.map(Number);
assert.ok(
  major > 13 || (major === 13 && (minor > 8 || (minor === 8 && patch >= 5))),
  'A auditoria premium exige CrewCheck 13.8.5 ou superior',
);
assert.doesNotMatch(home, /view === 'salary' && <><FinancialStatementImporter/);
assert.doesNotMatch(home, /view === 'perdiem' && <><FinancialStatementImporter/);
assert.match(home, /function AdminFinancialCalibration/);
assert.equal((home.match(/<FinancialStatementImporter mode=/g) || []).length, 2);
assert.match(home, /function nightHoursInsideWindow/);
assert.match(home, /function financialFlightRule/);
assert.match(home, /dayRateApplied = payRule\.extra \? cfg\.nightKmMetric : cfg\.dayKmMetric/);
assert.match(home, /nightRateApplied = cfg\.nightKmMetric/);
assert.doesNotMatch(home, /nightProduction = nightKm \* cfg\.nightKmMetric \* 2/);
assert.match(home, /sem dobra/);
assert.match(home, /RAO:\{code:'RAO'/);
assert.match(home, /function dedupeProjectedLegs/);
assert.match(home, /crewcheck:gym-auto-checkin/);
assert.match(home, /locationMode === 'current'/);
assert.doesNotMatch(home, /cz-routine-strip.*partnerChains/);
assert.match(home, /function DatabaseConnectionCard/);
assert.match(home, /Nenhum histórico salvo/);

assert.match(financialRules, /mainMeal: 109\.44/);
assert.match(financialRules, /dayKm: 0\.058547/);
assert.match(financialRules, /nightKm: 0\.117094/);
assert.match(financialRules, /reserveHour: 49\.765/);
assert.match(financialLearning, /raw\.includes\(','\)/);
assert.match(financialLearning, /FINANCIAL_RATES_STORAGE_KEY/);

assert.match(auth, /function publicApiErrorMessage/);
assert.doesNotMatch(auth, /Código: \$\{payload\.code\}/);
assert.match(platformServer, /function databaseConnectionString/);
assert.match(platformServer, /MYSQL_URL/);
assert.match(platformServer, /mysql2\/promise/);
assert.doesNotMatch(platformServer, /POSTGRES_URL|SUPABASE_DB_URL|await import\(['"]pg['"]\)/);
assert.match(platformServer, /platformSchemaReady/);
assert.match(server, /places\.location/);
assert.match(server, /locationBias/);
assert.match(server, /distanceMeters/);

assert.match(css, /CrewCheck v13\.8\.5/);
assert.match(css, /\.cz-layover-weather-badge/);
assert.match(css, /\.cz-admin-calibration-grid/);
assert.match(css, /\[data-crew-theme="dark"\].*\.cz-toolbox/s);
assert.match(platformCss, /CrewCheck v13\.8\.5/);
assert.match(platformCss, /\.cp-primary/);

console.log('CrewCheck 13.8.5 premium audit, finance, gyms and database regression OK');
