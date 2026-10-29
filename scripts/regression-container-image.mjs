// Provider-neutral Node 22 image (Dockerfile): static contract, no build, no network, no secret.
// The image itself was built and run locally for the PR evidence; this keeps the file honest.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const docker = fs.readFileSync('Dockerfile', 'utf8'), ignore = fs.readFileSync('.dockerignore', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const instructions = docker.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));

// Same Node as the current service and the engines field, in both stages.
const nodeVersion = fs.readFileSync('render.yaml', 'utf8').match(/key: NODE_VERSION\s+value: ([\d.]+)/)[1];
const froms = instructions.filter(line => line.startsWith('FROM '));
assert.equal(froms.length, 2, 'build stage and runtime stage');
for (const from of froms) assert.match(from, new RegExp(`^FROM node:${nodeVersion.replaceAll('.', '\\.')}-bookworm-slim\\b`));
assert.equal(pkg.engines?.node, `>=${nodeVersion}`);

// Lockfile install, the canonical build, production dependencies only at runtime.
assert(instructions.includes('RUN npm ci --no-audit --no-fund'), 'lockfile install (package-lock.json), never an unlocked install');
assert(instructions.includes('RUN npm run build && npm prune --omit=dev --no-audit --no-fund'));
assert.match(pkg.scripts.build, /^node scripts\/v139\/apply\.mjs && /, 'the build script prepares the canonical sources');
assert(instructions.includes('CMD ["node", "server.mjs"]'));
assert(instructions.includes('USER node') && instructions.indexOf('RUN chown node:node /app') < instructions.indexOf('USER node'), 'non-root, app dir writable for runtime files');
assert.match(docker, /ENV NODE_ENV=production PORT=10000 SOURCE_VERSION=\$SOURCE_VERSION/, '/api/health reports the built commit');

// Nothing private or insecure is baked in: no secret-like build arg/env, no proxy or CA, TLS on.
const argsAndEnv = instructions.filter(line => /^(ARG|ENV) /.test(line)).join('\n');
assert.doesNotMatch(argsAndEnv, /TOKEN|SECRET|PASSWORD|KEY|DATABASE|MYSQL|PROXY|CAFILE|CA_CERTS/i);
assert.doesNotMatch(docker, /NODE_TLS_REJECT_UNAUTHORIZED|strict-ssl|--insecure|\.pem|ca-bundle|https?_proxy/i);
for (const entry of ['.git', 'node_modules', '**/node_modules', 'dist', '.env', '.env.*', '!.env.example'])
  assert(ignore.split('\n').includes(entry), `.dockerignore keeps ${entry} out of the context`);

// npm prune --omit=dev is safe: every package the server imports is a production dependency.
const sources = ['server.mjs', ...execFileSync('git', ['ls-files', 'server', 'shared'], { encoding: 'utf8' }).split('\n').filter(f => /\.mjs$/.test(f))];
const imported = new Set();
for (const file of sources) for (const m of fs.readFileSync(file, 'utf8').matchAll(/(?:^|\n)\s*import\s[^'"]*?['"]([^'"./][^'"]*)['"]|import\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g)) {
  const name = m[1] || m[2];
  if (name.startsWith('node:')) continue;
  imported.add(name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]);
}
assert(imported.size > 0);
assert.deepEqual([...imported].filter(name => !pkg.dependencies?.[name]), [], 'server imports only production dependencies');

console.log(`PASS container image contract: Node ${nodeVersion} in both stages, lockfile install, canonical build, prod deps only (${[...imported].sort().join(', ')}), non-root, nothing private baked in`);
