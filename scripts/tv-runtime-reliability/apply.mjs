import { readFileSync, writeFileSync } from 'node:fs';
function change(path, apply) { const old = readFileSync(path, 'utf8'); const next = apply(old); if (next !== old) writeFileSync(path, next); }
function insertOnce(text, marker, anchor, replacement) {
  if (text.includes(marker)) return text;
  if (text.split(anchor).length !== 2) throw Error('TV runtime anchor is not unique: ' + anchor.slice(0, 80));
  return text.replace(anchor, replacement);
}
change('server/platform.mjs', text => insertOnce(text, '// [tv-scoped-pool-platform]', 'async function pool() {', `// [tv-scoped-pool-platform]
const tvPlatformPool = createPilotPoolLifecycle({
  createNative: async options => { const module = await import('mysql2/promise'); return (module.default || module).createPool(options); },
  initialize: async native => {
    const db = mysqlAdapter(native);
    await db.query('SELECT 1');
    const report = await platformSchemaReport(db);
    if (!report.coreReady) throw Object.assign(new Error('Core schema unavailable'), {code:'DATABASE_MIGRATION_REQUIRED'});
    state.schemaReport = report; state.databaseFailure = null;
    return db;
  },
  onFailure: error => {
    const allowed = new Set(['ER_CON_COUNT_ERROR','ER_USER_LIMIT_REACHED','ER_TOO_MANY_USER_CONNECTIONS','ETIMEDOUT','ECONNREFUSED','DATABASE_MIGRATION_REQUIRED','PROTOCOL_CONNECTION_LOST']);
    const code = allowed.has(error?.code) ? error.code : 'DATABASE_UNAVAILABLE';
    state.databaseFailure = {code, message:'Banco temporariamente indisponível.'};
    console.warn('[tv:pool] ' + JSON.stringify({component:'platform',code}));
  },
});
async function pool() {
  if (isScopedTvPilot()) return tvPlatformPool.get(databaseConnectionString(), mysqlPoolOptions(databaseConnectionString()));`).replace("import { createTvHttpBridge } from './tv/http.mjs';", "import { createTvHttpBridge } from './tv/http.mjs';\nimport { createPilotPoolLifecycle, isScopedTvPilot } from './tv/scoped-pool.mjs';"));
change('server/platform.mjs', text => text.replace(/(import \{ createPilotPoolLifecycle, isScopedTvPilot \} from '\.\/tv\/scoped-pool.mjs';\n)+/g, "import { createPilotPoolLifecycle, isScopedTvPilot } from './tv/scoped-pool.mjs';\n"));
change('server/v139/common.mjs', text => {
  if (text.includes('// [tv-scoped-pool-auth]')) return text;
  const anchor = 'export async function dbPool() {';
  if (!text.includes(anchor)) throw Error('TV auth pool anchor missing');
  return "import { createPilotPoolLifecycle, isScopedTvPilot } from '../tv/scoped-pool.mjs';\n" + text.replace(anchor, `// [tv-scoped-pool-auth]
const tvAuthPool = createPilotPoolLifecycle({
  createNative: async options => { const module = await import('mysql2/promise'); return (module.default || module).createPool(options); },
  initialize: async native => { await native.query('SELECT 1'); return native; },
  onFailure: error => {
    const allowed = new Set(['ER_CON_COUNT_ERROR','ER_USER_LIMIT_REACHED','ER_TOO_MANY_USER_CONNECTIONS','ETIMEDOUT','ECONNREFUSED','PROTOCOL_CONNECTION_LOST']);
    console.warn('[tv:pool] ' + JSON.stringify({component:'auth',code:allowed.has(error?.code)?error.code:'DATABASE_UNAVAILABLE'}));
  },
});
export async function dbPool() {
  if (isScopedTvPilot()) {
    const connectionString = env('DATABASE_URL', env('CREWCHECK_DATABASE_URL', env('MYSQL_URL')));
    if (!String(connectionString).toLowerCase().startsWith('mysql://')) return null;
    return tvAuthPool.get(connectionString, mysqlOptions(connectionString));
  }`);
});
change('client/src/App.tsx', text => {
  if (text.includes("from './lib/tvPairReturn'")) return text;
  if (!text.includes("setLocation('/login')")) throw Error('Protected login target anchor missing');
  return "import { tvPairLoginLocation } from './lib/tvPairReturn';\n" + text.replaceAll("setLocation('/login')", "setLocation(tvPairLoginLocation(window.location.pathname, window.location.search))");
});
change('client/src/pages/AuthPage.tsx', text => {
  if (text.includes("from '../lib/tvPairReturn'")) return text;
  const anchor = "toast.success('Bem-vindo ao CrewCheck.');\n        setLocation('/');";
  if (!text.includes(anchor)) throw Error('Successful auth return anchor missing');
  return "import { tvPairReturnLocation } from '../lib/tvPairReturn';\n" + text.replace(anchor, "toast.success('Bem-vindo ao CrewCheck.');\n        setLocation(tvPairReturnLocation(window.location.search));");
});
console.log('[tv:prepare] Pinned preview pool lifecycle and safe TV login return applied.');
