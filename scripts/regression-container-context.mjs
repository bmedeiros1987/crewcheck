// Build context and image never carry local private artifacts. Uses Docker's own .dockerignore
// matching on a copy of the tracked files plus SYNTHETIC canaries (never real values) planted
// where local runtime files, credentials and caches live.
//
//   node scripts/regression-container-context.mjs          # context probe (FROM scratch, no pull)
//   node scripts/regression-container-context.mjs --full   # also the real image: every layer
//
// SANDBOX_CA_FILE (local sandboxes behind a TLS proxy only): the full build gets that CA through a
// BuildKit secret mount, which is never part of the context or of any layer. CI does not set it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import zlib from 'node:zlib';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Built at run time so the marker never appears in any tracked file (this script is in the context).
const MARK = ['SYNTHETIC', 'CANARY', 'NOT', 'A', 'SECRET', process.pid, Date.now()].join('-');
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30, ...opts });
const canaries = ['.env', '.env.production', 'client/.env.local', 'server/.env', 'scripts/deep/nested/.env.staging', '.npmrc', 'scripts/.npmrc', '.yarnrc.yml',
  '.crewcheck-google-oauth-store.json', '.crewcheck-telegram-links.json', '.crewcheck-telegram-rosters.json', '.crewcheck-runtime-patch.json',
  'server/.crewcheck-telegram-links.json', 'scripts/.crewcheck-anything.json', '.local-ca.pem', 'proxy-ca.pem', 'server/certs/private.pem', 'client/public/leak.pem',
  'server/tls.key', 'id_rsa', 'scripts/id_ed25519', 'android-wrapper/release.keystore', 'scripts/upload.jks', 'client/cert.p12', 'server/cert.pfx',
  'artifacts/report.json', 'scripts/artifacts/x.json', 'node_modules/leak/index.js', 'client/node_modules/leak.js', 'dist/index.html', 'scripts/dist/leak.js',
  'npm-debug.log', 'server/debug.log', 'test-results/x.json', 'docs/.env', 'docs/.crewcheck-runtime-patch.json', '.github/local.yml', 'android-wrapper/local.properties',
  'android-wrapper/app/google-services.json', 'android-wrapper/app/build/outputs/leak.apk', 'android-wrapper/.gradle/leak.bin', 'android-wrapper/keystore.properties.jks'];
const required = ['package.json', 'package-lock.json', 'server.mjs', 'vite.config.ts', 'client/index.html', 'scripts/v139/apply.mjs', 'server/mysql-verified-tls.mjs',
  'server/certs/crewcheck-aiven-project-ca.pem', 'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', 'android-wrapper/gradle.properties', 'docs/google-oauth-verification-kit-2026.md', '.env.example'];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-context-'));
const tag = `crewcheck-context-probe-${process.pid}`;
const cleanup = [];
try {
  // Tracked files only (what a provider checkout has), then the canaries.
  for (const file of sh('git', ['ls-files', '-z']).split('\0').filter(Boolean)) {
    if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) continue;
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.copyFileSync(file, path.join(root, file));
  }
  for (const file of canaries) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), `${MARK} ${file}\n`);
  }

  // 1. Context: exactly what Docker sends, listed from a FROM scratch image.
  sh('docker', ['build', '-q', '-t', tag, '-f', '-', root], { input: 'FROM scratch\nCOPY . /ctx\n' }); cleanup.push(['image', 'rm', '-f', tag]);
  const container = sh('docker', ['create', tag, '/none']).trim(); cleanup.unshift(['rm', '-f', container]);
  const tar = path.join(root, '..', `${tag}.tar`); cleanup.push(['__file', tar]);
  fs.writeFileSync(tar, execFileSync('docker', ['export', container], { maxBuffer: 1 << 30 }));
  const listed = new Set(sh('tar', ['-tf', tar]).split('\n').filter(Boolean).map(name => name.replace(/^ctx\//, '').replace(/\/$/, '')));
  assert.deepEqual(canaries.filter(file => listed.has(file)), [], 'no canary in the build context');
  assert.equal(fs.readFileSync(tar).includes(MARK), false, 'no canary bytes in the build context');
  assert.deepEqual(required.filter(file => !listed.has(file)), [], 'build inputs present, including the public pinned CA');
  assert(![...listed].some(name => /^(\.github|tests|ops|\.git)(\/|$)/.test(name)), 'only allowlisted top-level entries');
  console.log(`PASS build context: ${listed.size} entries, ${canaries.length} synthetic canaries excluded, public pinned CA included`);

  // 2. Full image: the real Dockerfile; every layer of the final image is scanned.
  if (process.argv.includes('--full')) {
    const image = `${tag}-full`, args = ['build', '-q', '-t', image];
    let dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const ca = process.env.SANDBOX_CA_FILE;
    if (ca) {
      dockerfile = dockerfile.replace('RUN npm ci --no-audit --no-fund', 'ARG HTTPS_PROXY\nARG HTTP_PROXY\nRUN --mount=type=secret,id=sandbox_ca,target=/run/secrets/sandbox_ca NPM_CONFIG_CAFILE=/run/secrets/sandbox_ca npm ci --no-audit --no-fund')
        .replace('RUN npm run build && npm prune', 'RUN --mount=type=secret,id=sandbox_ca,target=/run/secrets/sandbox_ca NODE_EXTRA_CA_CERTS=/run/secrets/sandbox_ca npm run build && npm prune');
      args.push('--network', 'host', '--secret', `id=sandbox_ca,src=${ca}`, '--build-arg', `HTTPS_PROXY=${process.env.HTTPS_PROXY || ''}`, '--build-arg', `HTTP_PROXY=${process.env.HTTP_PROXY || process.env.HTTPS_PROXY || ''}`);
    }
    args.push('--build-arg', 'SOURCE_VERSION=0000000000000000000000000000000000000000', '-f', '-', root);
    sh('docker', args, { input: dockerfile, stdio: ['pipe', 'pipe', 'inherit'] }); cleanup.push(['image', 'rm', '-f', image]);
    const saved = path.join(root, '..', `${image}.tar`); cleanup.push(['__file', saved]);
    fs.writeFileSync(saved, execFileSync('docker', ['save', image], { maxBuffer: 4 << 30 }));
    // Layers as the image manifest lists them; each must be readable (gzip or plain tar), never skipped.
    const manifest = JSON.parse(execFileSync('tar', ['-xOf', saved, 'manifest.json'], { encoding: 'utf8' }));
    const layers = manifest[0].Layers;
    assert(layers.length > 0, 'image has layers');
    let files = 0, appFiles = 0;
    for (const layer of layers) {
      let bytes = execFileSync('tar', ['-xOf', saved, layer], { maxBuffer: 4 << 30 });
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = zlib.gunzipSync(bytes);
      const entries = execFileSync('tar', ['-t'], { input: bytes, maxBuffer: 1 << 30, encoding: 'utf8' }).split('\n').filter(Boolean);
      files += entries.length; appFiles += entries.filter(name => /^(\.\/)?app\//.test(name)).length;
      assert.equal(bytes.includes(MARK), false, `no canary bytes in layer ${layer}`);
      // Names under /app (our content; the versioned .env.example template, names only, is expected).
      // The official base image ships npm's own builtin .npmrc.
      for (const entry of entries.filter(name => /^(\.\/)?app\//.test(name) && !/^(\.\/)?app\/\.env\.example$/.test(name))) assert.doesNotMatch(entry, /(^|\/)(\.env(\.[^/]+)?|\.npmrc|\.crewcheck-(google|telegram|runtime)[^/]*|id_rsa|id_ed25519|local\.properties|google-services\.json|[^/]+\.(key|p12|pfx|jks|keystore))$/, `no private-looking file in the image: ${entry}`);
    }
    assert(files > 1000, `layers were actually read (${files} entries)`);
    assert(appFiles > 1000, `the app layer was read (${appFiles} entries under /app)`);
    const inImage = execFileSync('docker', ['run', '--rm', '--entrypoint', 'sh', image, '-c',
      'ls /app/server/certs/crewcheck-aiven-project-ca.pem /app/dist/index.html >/dev/null && echo present; ls /run/secrets 2>/dev/null | wc -l; env | grep -ciE "proxy|ca_cert|cafile" || true'], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(inImage, ['present', '0', '0'], 'pinned public CA and build present; no secret mount, proxy or private CA left');
    console.log(`PASS image: ${layers.length} layers, ${files} entries scanned (${appFiles} under /app), no canary, no private-looking file, no proxy or private CA`);
  }
} finally {
  for (const args of cleanup) { if (args[0] === '__file') fs.rmSync(args[1], { force: true }); else try { execFileSync('docker', args, { stdio: 'ignore' }); } catch {} }
  fs.rmSync(root, { recursive: true, force: true });
}
