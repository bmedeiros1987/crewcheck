// Offline checks only: no app initialization, credentials, sockets or SQL.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, X509Certificate } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import { verifiedMysqlTls } from '../../server/mysql-verified-tls.mjs';

const host = 'mysql-1c3b1be8-vitoriaregia1.a.aivencloud.com';
const port = 22966;
const assetUrl = new URL('../../server/certs/crewcheck-aiven-project-ca.pem', import.meta.url);
const bytes = await readFile(assetUrl);
assert.equal(bytes.length, 1541);
assert.equal(bytes.at(-1), 10);
assert.equal(createHash('sha256').update(bytes).digest('hex'), '188afc99d79b9c310157993fc6a9b19946cee2dab08f4c60ad7ac5dbd00cbc38');
const certificate = new X509Certificate(bytes);
assert.equal(createHash('sha256').update(certificate.raw).digest('hex'), '6557c74f72b8d8216afa68df498ceb17c582544806c06f1630d470160d26a6be');
assert.equal(certificate.ca, true);
assert.equal(certificate.verify(certificate.publicKey), true);
const refusal = error => error?.code === 'MYSQL_TLS_TRUST_UNVERIFIED' &&
  error.message === 'MYSQL_TLS_TRUST_UNVERIFIED';
for (const mode of ['', 'REQUIRED', 'VERIFY_CA', 'VERIFY_IDENTITY']) {
  const ssl = verifiedMysqlTls(host, port, mode);
  assert.deepEqual(ssl, { ca: bytes, rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' });
  assert.notEqual(ssl, verifiedMysqlTls(host, port, mode));
  createSecureContext(ssl);
}
for (const args of [['wrong.invalid', port], ['127.0.0.1', port], ['localhost', port], [host, 3306], [host, port, 'off'], [host, port, 'DISABLED'], [host, port, 'false'], [host, port, 'unreviewed']]) {
  assert.throws(() => verifiedMysqlTls(...args), refusal);
}
const dir = await mkdtemp(join(tmpdir(), 'crewcheck-public-ca-negative-'));
try {
  const helper = await readFile(new URL('../../server/mysql-verified-tls.mjs', import.meta.url));
  for (const [name, value] of [['missing', null], ['changed', Buffer.concat([bytes, Buffer.from('\n')])], ['tampered', Buffer.from(bytes.toString().replace('MIIERD', 'MIIERX'))], ['private-key', Buffer.from('-----BEGIN PRIVATE KEY-----\nfictional\n-----END PRIVATE KEY-----\n')]]) {
    const scenario = join(dir, name); await mkdir(join(scenario, 'certs'), { recursive: true });
    await writeFile(join(scenario, 'profile.mjs'), helper);
    if (value) await writeFile(join(scenario, 'certs', 'crewcheck-aiven-project-ca.pem'), value);
    const profile = await import(pathToFileURL(join(scenario, 'profile.mjs')).href);
    assert.throws(() => profile.verifiedMysqlTls(host, port), refusal);
  }
  const now = Date.now;
  try {
    Date.now = () => Date.parse('2036-05-17T00:00:00Z');
    assert.throws(() => verifiedMysqlTls(host, port), refusal);
    Date.now = () => Date.parse('2026-05-18T00:00:00Z');
    assert.throws(() => verifiedMysqlTls(host, port), refusal);
  } finally { Date.now = now; }
} finally { await rm(dir, { recursive: true, force: true }); }

// Evaluate only the nine real configuration expressions with fictional bindings.
// Do not import app modules: some initializers execute DDL on first use.
const factories = [
  ['server.mjs', /const pool = createPool\((\{[\s\S]*?\n\s*\})\);/],
  ['server/platform.mjs', /function mysqlPoolOptions\([^)]*\)[\s\S]*?return (\{[\s\S]*?\n\s*\});/],
  ['server/v139/common.mjs', /function mysqlOptions\([^)]*\)[\s\S]*?return (\{[\s\S]*?\n\s*\});/],
  ['server/v14342/maps-budget.mjs', /function mysqlOptions\([^)]*\)[\s\S]*?return (\{[\s\S]*?\n\s*\});/],
  ['server/v1405/google-calendar-oauth.mjs', /const pool = createPool\((\{[\s\S]*?\n\s*\})\);/],
  ...['13-9-0', '13-9-1', '13-9-5', '14-0-2'].map(version => [`scripts/apply-v${version}-migration.mjs`, /mysql\.createConnection\((\{[\s\S]*?\n\s*\})\);/]),
];
const parsed = new URL(`mysql://fictional:fictional@${host}:${port}/fictionaldb`);
const env = () => 'REQUIRED';
for (const [file, pattern] of factories) {
  const source = await readFile(new URL('../../' + file, import.meta.url), 'utf8');
  const match = pattern.exec(source); assert(match, `Factory configuration not found: ${file}`);
  const config = new Function('parsed', 'env', 'envAny', 'process', 'verifiedMysqlTls', `return (${match[1]});`)(parsed, env, env, { env: { MYSQL_SSL_MODE: 'REQUIRED' } }, verifiedMysqlTls);
  assert.equal(config.host, host); assert.equal(config.port, port);
  assert.equal(config.user, 'fictional'); assert.equal(config.password, 'fictional');
  assert.deepEqual(config.ssl, { ca: bytes, rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' });
  assert(!/rejectUnauthorized\s*:\s*false/.test(source), `Weak SSL option restored: ${file}`);
}
console.log('PASS pinned public CA/profile negatives and all9 real TLS factory options; no network, app initialization or SQL');
