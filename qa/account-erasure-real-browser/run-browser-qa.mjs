import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {randomBytes, scryptSync, createHash} from 'node:crypto';
import {mkdirSync, readFileSync, realpathSync, statSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import net from 'node:net';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {mock} from 'node:test';

const scratch = path.dirname(fileURLToPath(import.meta.url));
const repo = realpathSync(path.join(scratch, 'prepared'));
const schema = 'crewcheck_delete_browser_qa';
const entry = process.argv[2] || 'settings';
assert(['settings','public'].includes(entry), 'Run only a verified app entry');
const require = createRequire(path.join(repo,'package.json'));
const ts = require('typescript');
const {build} = require('esbuild');
const distDir = path.join(scratch, 'dist');
assert(statSync(path.join(distDir,'index.html')).isFile(), 'Build the preserved app first');
const source = JSON.parse(readFileSync(path.join(scratch, 'source.json'), 'utf8'));
const owners = {A: 'account-a@example.invalid', B: 'account-b@example.invalid'};
const publicIds = {A:'CC-AAAA-AAAA',B:'CC-BBBB-BBBB'};
const fixtureHost = 'mysql-session-fixture.invalid';
const image = 'sha256:0f1a0ccadda3a1734d1db557e203ec58621d56fa248525016e85fe4f631311ec';
const container = 'cc-delete-response-' + process.pid;
const socketDir = path.join(scratch, 'socket-' + process.pid);
const socketPath = path.join(socketDir, 'mysqld.sock');
const url = file => pathToFileURL(path.join(repo, file)).href;
const nativeDbPath = url('node_modules/mysql2/promise.js');
const {default: nativeMysql} = await import(nativeDbPath);
const docker = args => execFileSync('docker', args, {
  encoding: 'utf8', maxBuffer: 1024 * 1024, stdio:['ignore','pipe','pipe'],
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hashes = () => Object.fromEntries(['server/platform.mjs', 'server/v139/auth.mjs', 'server/v139/common.mjs', 'server/profile-locks.mjs', 'server/mysql-platform-adapter.mjs']
    .map(file => [file, createHash('sha256').update(readFileSync(path.join(repo, file))).digest('hex')]));
const preparedHashesBefore = hashes();
let db, server, started = false, transportCalls = 0, tlsCalls = 0, externalFetches = 0, loopbackOrigin;
let observations = [], inFlight = Promise.resolve(), httpRequests = 0;
const report = {sourceSha: source.sourceSha, rawTree: source.rawTree, preparedHashesBefore,
    sourcePreparation: 'canonical scripts/v139/apply.mjs once in disposable archive',
    fixture: 'Normal CrewCheck UI + Chromium renderer sandbox + real auth/platform handlers + MySQL private socket',
    entry,
    noTokenExtractionOrReplay: true, accountLabels: ['A', 'B']};
const api = {
  '/api/auth/config':'GET', '/api/auth/login':'POST', '/api/auth/me':'GET', '/api/auth/logout':'POST',
  '/api/platform/profile':'GET', '/api/platform/terms/current':'GET', '/api/rosters/active':'GET',
  '/api/platform/account/delete':'POST',
};
function sendJson(res,status,body) {
  res.writeHead(status, {'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify(body));
}

const staticPath = path.join(repo, 'server.mjs');
const staticAst = ts.createSourceFile(staticPath, readFileSync(staticPath,'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const handlers = staticAst.statements.filter(node=>ts.isFunctionDeclaration(node) && node.name?.text==='serveStatic');
assert.equal(handlers.length,1);
const {guardStaticHtml} = await import(url('server/static-html-guard.mjs'));
const staticContext = vm.createContext({guardStaticHtml, fs, path, Buffer, distDir, sendJson});
vm.runInContext(handlers[0].getText(staticAst)+'\nglobalThis.respond=serveStatic;', staticContext);

const draftModule = (await build({
  stdin: {contents:readFileSync(path.join(scratch,'qa-drafts.ts'),'utf8'), resolveDir:repo, loader:'ts'},
  bundle:true, format:'esm', platform:'browser', write:false, logLevel:'silent',
})).outputFiles[0].text;
if (process.argv[3] === '--prepare-only') {
  console.log(JSON.stringify({stage:'prepare-only', sourceSha:source.sourceSha, rawTree:source.rawTree, rendererSandboxRequired:true, draftModuleBytes:Buffer.byteLength(draftModule)}));
  process.exit(0);
}
// This happens before starting MySQL, so a blocked browser never repeats the HTTP-only proof.
try {
  execFileSync('python3',[path.join(scratch,'browser-client.py'),'--preflight'], {stdio:'inherit',timeout:25_000});
} catch {
  console.error('Sandboxed Chromium preflight blocked the integrated browser test.');
  process.exit(1);
}

const originalFetch = globalThis.fetch;
const originalConnect = net.Socket.prototype.connect;
const queryDiagnostics=[];
const traceQuery=(target,scope)=>{
 const query=target.query.bind(target);
 target.query=async(sql,...args)=>{
  const kind=String(sql).trim().match(/^[A-Za-z]+/)?.[0]?.toUpperCase()||'UNKNOWN';
  const table=String(sql).match(/(?:FROM|INTO|UPDATE|JOIN)\s+([A-Za-z0-9_]+)/i)?.[1]||null;
  try {const result=await query(sql,...args);queryDiagnostics.push({scope,kind,table,ok:true});return result;}
  catch(error){queryDiagnostics.push({scope,kind,table,ok:false,code:error.code||error.name,fatal:error.fatal===true});throw error;}
 };
};
globalThis.fetch = () => { externalFetches++; throw Error('External fetch forbidden in local session fixture'); };
try {
  mkdirSync(socketDir, {mode: 0o700});
  docker(['run', '--detach', '--rm', '--pull=never', '--name', container, '--network', 'none', '--user',
    String(process.getuid()) + ':' + String(process.getgid()), '--tmpfs',
    '/var/lib/mysql:rw,nosuid,uid=' + process.getuid() + ',gid=' + process.getgid() + ',size=512m',
    '--mount', 'type=bind,src=' + socketDir + ',dst=/qa', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
    image, '--skip-networking', '--mysqlx=OFF', '--socket=/qa/mysqld.sock',
    '--innodb-buffer-pool-size=64M', '--performance-schema=OFF']);
  started = true;
  const inspected = JSON.parse(docker(['inspect', container]))[0];
  assert.equal(inspected.HostConfig.NetworkMode, 'none');
  assert.equal(Object.keys(inspected.HostConfig.PortBindings || {}).length, 0);
  assert.equal(inspected.Mounts.some(m => m.Type === 'volume'), false);
  let setup;
  for (let attempt = 0; attempt < 120 && !setup; attempt++) {
    try {
      const logs = docker(['logs', container]);
      assert(logs.includes('MySQL init process done. Ready for start up.'));
      assert(statSync(socketPath).isSocket());
      setup = await nativeMysql.createConnection({socketPath, user: 'root', connectTimeout: 500});
    }
    catch { await pause(250); }
  }
  assert(setup, 'private MySQL socket ready');
  try { await setup.query('CREATE DATABASE ' + schema); } finally { await setup.end(); }
  db = nativeMysql.createPool({socketPath, user: 'root', database: schema, connectionLimit: 5, dateStrings: true, decimalNumbers: true});
  const [[identity]] = await db.query('SELECT DATABASE() db,@@skip_networking isolated,VERSION() version');
  assert.equal(identity.db, schema); assert.equal(identity.isolated, 1); assert.match(identity.version, /^8\.4\./);
  report.mysql = {version: identity.version, networkNone: true, skipNetworking: true, publishedPorts: 0};
  for (const file of ['migrations/20260715_003_aiven_mysql_full_platform.sql', 'migrations/20260715_005_v139_recovery_bids_crewlock.sql']) {
    const migration = readFileSync(path.join(repo, file), 'utf8');
    const statements = migration.match(/CREATE TABLE IF NOT EXISTS \w+\s*\([\s\S]*?ENGINE=InnoDB[^;]*;/g);
    assert(statements?.length, 'canonical disposable DDL');
    for (const statement of statements) await db.query(statement);
  }
  const password = randomBytes(24).toString('base64url');
  for (const [label, email] of Object.entries(owners)) {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    await db.query('INSERT INTO crewcheck_platform_profiles(email,public_id,display_name) VALUES(?,?,?)',
      [email, publicIds[label], 'SYNTHETIC SESSION ' + label]);
    await db.query('INSERT INTO crewcheck_platform_accounts(email,password_hash,password_salt,must_change_password) VALUES(?,?,?,0)', [email, hash, salt]);
  }
  for (const [label, email] of Object.entries(owners)) {
    const roster = {year:2032,month:2,crewName:'SYNTHETIC ROSTER ' + label,crewId:'synthetic-' + label,days:[]};
    await db.query('INSERT INTO crewcheck_platform_rosters(id,owner_email,roster_key,roster,compliance,gym,fingerprint) VALUES(?,?,?,?,?,?,?)',
      ['synthetic-' + label, email, '2032-02', JSON.stringify(roster), '{}', '[]', createHash('sha256').update(label).digest('hex')]);
  }
  assert.equal((await db.query('SELECT COUNT(*) n FROM crewcheck_platform_subscriptions'))[0][0].n, 0);
  traceQuery(db,'pool');
  const getConnection=db.getConnection.bind(db);
  db.getConnection=async()=>{const connection=await getConnection();traceQuery(connection,'connection');return connection;};
  process.env.DATABASE_URL = 'mysql://synthetic:unused@' + fixtureHost + ':3306/' + schema;
  delete process.env.CREWCHECK_DATABASE_URL; delete process.env.MYSQL_URL; delete process.env.CREWCHECK_TEST_ACCOUNT_PASSWORD;
  process.env.CREWCHECK_AUTH_SECRET = randomBytes(32).toString('base64url');
  process.env.CREWCHECK_AUTH_REQUIRED = 'true';
  process.env.CREWCHECK_ADMIN_EMAILS = 'no-admin@example.invalid';
  process.env.CREWCHECK_ADMIN_EMAIL = 'no-admin@example.invalid';
  const fixtureTls = (host, port) => {
    assert.equal(host, fixtureHost); assert.equal(port, 3306); tlsCalls++; return {localFixtureMarker: true};
  };
  const localPool = options => {
    assert.equal(options.host, fixtureHost); assert.equal(options.database, schema);
    assert.equal(options.ssl.localFixtureMarker, true); transportCalls++; return db;
  };
  mock.module(url('server/mysql-verified-tls.mjs'), {namedExports: {verifiedMysqlTls: fixtureTls}});
  mock.module(nativeDbPath, {defaultExport: {createPool: localPool}, namedExports: {createPool: localPool}});
  net.Socket.prototype.connect = function (...args) {
    const value = args[0];
    const options = Array.isArray(value) ? value[0] : value;
    assert(options && typeof options === 'object' && options.path === socketPath,
      'Node outbound connection must be the disposable MySQL Unix socket');
    return originalConnect.apply(this, args);
  };
  const {handleAuthRoute} = await import(url('server/v139/auth.mjs'));
  const {handlePlatformRoute} = await import(url('server/platform.mjs'));
  const {mysqlAdapter}=await import(url('server/mysql-platform-adapter.mjs'));
  const {withTransaction}=await import(url('server/profile-locks.mjs'));
  report.preflightTransaction=await withTransaction(mysqlAdapter(db),async client=>{
    const {rows}=await client.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR SHARE',[owners.A]);
    assert.equal(rows.length,1);return {beginReadCommit:true,sharedProfileRead:true};
  });
  const snapshot = async () => {
    const out = {};
    for (const [label, email] of Object.entries(owners)) {
      const [[account]] = await db.query('SELECT COUNT(*) n FROM crewcheck_platform_accounts WHERE email=?', [email]);
      const [profiles] = await db.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=?', [email]);
      const [[rosters]] = await db.query('SELECT COUNT(*) n FROM crewcheck_platform_rosters WHERE owner_email=?', [email]);
      out[label] = {accounts: account.n, profiles: profiles.length, rosters: rosters.n, expectedOldPublicId: profiles[0]?.public_id === publicIds[label]};
    }
    return out;
  };
  server = createServer((req, res) => {
    const target = new URL(req.url, loopbackOrigin);
    if (target.origin !== loopbackOrigin || !['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) {
      return sendJson(res,403,{ok:false});
    }
    if (target.pathname === '/qa-drafts.mjs' && req.method === 'GET') {
      res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
      return res.end(draftModule);
    }
    if (!target.pathname.startsWith('/api/')) {
      if (req.method !== 'GET') return sendJson(res,405,{ok:false});
      return staticContext.respond(req,res,target);
    }
    if (api[target.pathname] !== req.method) return sendJson(res,404,{ok:false});
    inFlight = inFlight.then(async () => {
      httpRequests++;
      let deletionConfirmed;
      if (target.pathname === '/api/platform/account/delete') {
        const end = res.end.bind(res);
        res.end = (chunk, ...args) => {
          const result = JSON.parse(String(chunk));
          deletionConfirmed = result.ok === true && result.deleted === true;
          return end(chunk, ...args);
        };
      }
      const handled = target.pathname.startsWith('/api/auth/')
        ? await handleAuthRoute(req, res, target) : await handlePlatformRoute(req, res, target);
      assert.equal(handled, true);
      observations.push({request: httpRequests, method: req.method, pathname: target.pathname,
        status: res.statusCode, deletionConfirmed, state: await snapshot()});
    }).catch(error => {
      report.handlerError = {name: error.name, code: error.code || 'LOCAL_HANDLER_ERROR'};
      if (!res.headersSent) res.writeHead(500, {'content-type': 'application/json'});
      if (!res.writableEnded) res.end(JSON.stringify({ok: false, code: 'LOCAL_HANDLER_ERROR'}));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  loopbackOrigin = 'http://127.0.0.1:' + server.address().port;
  const clientResult = await new Promise((resolve, reject) => {
    const child = spawn('python3', [path.join(scratch, 'browser-client.py')], {stdio: ['pipe', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.on('data', value => stdout += value);
    child.stderr.on('data', value => stderr += value);
    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) return reject(Object.assign(Error('Chromium did not complete the interface assertions'), {fixtureExit: code, fixtureError: stderr.slice(-800)}));
      resolve(JSON.parse(stdout));
    });
    child.stdin.end(JSON.stringify({origin:loopbackOrigin, owners, password, publicIds, entry, commit:source.sourceSha}));
  });
  await inFlight;
  report.clients = clientResult;
  report.observations = observations;
  const deletion = observations.find(o => o.pathname === '/api/platform/account/delete');
  const finalState = observations.at(-1)?.state;
  report.checks = {...clientResult.checks,
    one_confirmed_deletion: observations.filter(o=>o.pathname==='/api/platform/account/delete' && o.status===200 && o.deletionConfirmed).length===1,
    A_account_profile_roster_removed_in_MySQL: [deletion?.state, finalState].every(state =>
      state?.A.accounts===0 && state.A.profiles===0 && state.A.rosters===0),
    B_account_profile_roster_preserved: Boolean(finalState?.B.accounts===1 && finalState.B.profiles===1 && finalState.B.expectedOldPublicId && finalState.B.rosters===1),
    no_handler_error: !report.handlerError,
    no_external_fetch: externalFetches===0,
    exact_prepared_source_unchanged: JSON.stringify(preparedHashesBefore)===JSON.stringify(hashes())};
  report.result = Object.values(report.checks).every(Boolean) ? 'PASS' : 'FAIL';
  report.failedPostconditions = Object.entries(report.checks).filter(([, ok]) => !ok).map(([name]) => name);
  report.transportCalls = transportCalls; report.tlsCalls = tlsCalls;
} catch (error) {
  report.result = 'ERROR';
  report.error = {name: error.name, code: error.code || error.fixtureExit || 'QA_ERROR', message: error.message,
    ...(error.fixtureError ? {fixtureError: error.fixtureError} : {})};
} finally {
  if (server) { await inFlight; await new Promise(resolve => server.close(resolve)); }
  net.Socket.prototype.connect = originalConnect;
  if (db) await db.end();
  mock.reset(); globalThis.fetch = originalFetch;
  if (started) docker(['rm', '--force', container]);
  report.observations=observations;
  report.queryDiagnostics=queryDiagnostics;
  report.preparedHashesAfter = hashes();
  report.cleanup = {serverClosed: Boolean(server), dbPoolClosed: Boolean(db), containerRemoved: started};
  writeFileSync(path.join(scratch, 'integrated-browser-result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({result: report.result, failedPostconditions: report.failedPostconditions,
    checks: report.checks, error: report.error, report: path.join(scratch, 'integrated-browser-result.json')}));
  if (report.result !== 'PASS') process.exitCode = 1;
}
