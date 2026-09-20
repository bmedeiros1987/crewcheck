// Portao de empacotamento do app webOS.
//
// Cobre o que so da para conferir no artefato construido: sintaxe aceita pelo
// Chromium 53, CSP, fallback de boot, ausencia de segredo e ausencia de midia
// dentro do pacote. O comportamento em si e coberto por test/*.test.mjs.

import {parse} from 'acorn';
import {readFile, readdir, stat} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import path from 'node:path';

const distUrl = new URL('../../dist/webos/', import.meta.url);
const distDir = distUrl.pathname;
const read = (file) => readFile(new URL(file, distUrl), 'utf8');
const checks = [];
const ok = (label) => { checks.push(label); console.log(`  ok  ${label}`); };

// --- 1. sintaxe aceita pelo motor da TV -----------------------------------
for (const file of ['app.js', 'webOSTV.js']) {
  parse(await read(file), {ecmaVersion: 2016});
}
ok('app.js e webOSTV.js parseiam como ES2016 (Chromium 53)');

// --- 2. caminho sem AbortController ---------------------------------------
const compiled = await build({
  entryPoints: [new URL('./compat.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
  bundle: true, write: false, format: 'iife', target: 'chrome53',
});
const sandbox = {setTimeout, clearTimeout, console, fetch: () => new Promise(() => {}), Request, Response, Headers};
sandbox.self = sandbox; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(compiled.outputFiles[0].text, sandbox);
assert.equal(typeof sandbox.AbortSignal.timeout, 'function');
assert.equal(
  await vm.runInContext("fetch('https://example.invalid',{signal:AbortSignal.timeout(10)}).then(()=>false,e=>e.name==='AbortError')", sandbox),
  true,
);
ok('timeout de fetch rejeita com AbortError sem AbortController nativo');

// --- 3. CSS que o Chromium 53 entende -------------------------------------
const css = await read('app.css');
for (const banned of ['backdrop-filter', 'position:sticky', 'position: sticky']) {
  assert.ok(!css.includes(banned), `app.css usa "${banned}", sem suporte no Chromium 53`);
}
// Os overrides do legacy.css precisam estar no bundle: sao eles que convertem
// grid em flex, clamp em px e :focus-visible em :focus.
for (const marker of ['.live{display:flex', '.weekdays{display:flex', '.days{display:flex', 'button:focus,a:focus']) {
  assert.ok(css.replace(/\s+/g, '').includes(marker.replace(/\s+/g, '')),
    `app.css nao traz o override "${marker}" do legacy.css`);
}
// A Home minima e o caminho que sempre renderiza: ela mesma nao pode depender
// de nada moderno.
const bootBlock = css.slice(css.indexOf('.boot'), css.indexOf('.boot-code') + 200);
for (const banned of ['display:grid', 'clamp(', ':focus-visible', 'gap:']) {
  assert.ok(!bootBlock.includes(banned), `o CSS da Home minima usa "${banned}"`);
}
ok('CSS: overrides do legacy.css presentes e Home minima sem recurso moderno');

// --- 4. CSP -----------------------------------------------------------------
const html = await read('index.html');
const cspMatch = /content="([^"]*default-src[^"]*)"/.exec(html);
assert.ok(cspMatch, 'index.html nao declara Content-Security-Policy');
const csp = cspMatch[1];
const hubOrigin = process.env.TV_HUB_ORIGIN || 'http://192.168.0.32:8188';

for (const directive of ['connect-src', 'img-src', 'media-src']) {
  const rule = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(directive));
  assert.ok(rule, `CSP sem diretiva ${directive}`);
  assert.ok(rule.includes(hubOrigin), `CSP ${directive} nao libera o Hub (${hubOrigin})`);
}
for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", '*']) {
  assert.ok(!csp.includes(unsafe), `CSP contem "${unsafe}"`);
}
assert.ok(csp.includes("object-src 'none'"), 'CSP sem object-src none');
// A TV nunca fala direto com o Home Assistant: a origem dele nao pode existir
// nem no CSP nem no bundle.
for (const haMarker of ['192.168.0.56', ':8123', 'homeassistant', 'hass.io']) {
  assert.ok(!csp.includes(haMarker), `CSP cita o Home Assistant ("${haMarker}")`);
  assert.ok(!(await read('app.js')).includes(haMarker), `app.js cita o Home Assistant ("${haMarker}")`);
}
ok('CSP libera so API e Hub, sem curinga, sem inline e sem Home Assistant');

// --- 5. fallback de boot ----------------------------------------------------
assert.ok(html.includes('id="root"'), 'index.html sem #root');
assert.ok(/<div id="root">\s*<main class="boot/.test(html),
  'index.html nao traz a Home minima estatica dentro de #root');
assert.ok(html.includes('boot-brand'), 'fallback de boot sem marca');
ok('index.html renderiza Home minima estatica antes do JavaScript rodar');

// --- 6. nenhum segredo no pacote -------------------------------------------
const js = await read('app.js');
for (const pattern of [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,           // JWT
  /HA_TOKEN/i,
  /LAURINHA_BRIDGE_KEY/i,
  /Bearer\s+[A-Za-z0-9._~+/-]{16,}/,
  /llt_[A-Za-z0-9]{20,}/,                                   // token longo do HA
]) {
  assert.ok(!pattern.test(js), `app.js contem algo que parece segredo: ${pattern}`);
}
ok('bundle sem token, sem bridge key e sem credencial embutida');

// --- 7. pacote sem midia da biblioteca --------------------------------------
const entries = await readdir(distDir);
const allowed = new Set(['app.js', 'app.css', 'index.html', 'appinfo.json', 'icon.png', 'largeIcon.png', 'webOSTV.js']);
for (const entry of entries) {
  assert.ok(allowed.has(entry), `arquivo inesperado no pacote: ${entry}`);
}
for (const entry of entries) {
  assert.ok(!/\.(mp3|m4a|aac|ogg|wav|flac|mp4|mkv|jpe?g|webp|gif)$/i.test(entry),
    `midia da biblioteca dentro do pacote: ${entry}`);
}
ok('pacote so com app + 2 icones: nenhum MP3 e nenhuma foto da biblioteca');

// --- 8. tamanho -------------------------------------------------------------
let total = 0;
const sizes = [];
for (const entry of entries) {
  const info = await stat(path.join(distDir, entry));
  total += info.size;
  sizes.push([entry, info.size]);
}
sizes.sort((a, b) => b[1] - a[1]);
console.log('\n  tamanho do pacote:');
for (const [name, size] of sizes) console.log(`    ${String(Math.round(size / 1024)).padStart(5)} KB  ${name}`);
console.log(`    ${String(Math.round(total / 1024)).padStart(5)} KB  TOTAL`);
assert.ok(total < 1024 * 1024, `pacote acima de 1 MB (${total} bytes)`);

// --- 9. o IPK de verdade, quando ja foi gerado ------------------------------
const ipkDir = new URL('../../dist/webos-package/', import.meta.url).pathname;
let ipkName = null;
try {
  ipkName = (await readdir(ipkDir)).find((file) => file.endsWith('.ipk')) || null;
} catch { /* ainda nao empacotado */ }

if (ipkName) {
  const {execFileSync} = await import('node:child_process');
  const listing = execFileSync('sh', ['-c',
    `cd "${ipkDir}" && ar p "${ipkName}" data.tar.gz | tar tz`,
  ], {encoding: 'utf8'});
  const files = listing.split('\n').map((line) => line.trim()).filter((line) => line && !line.endsWith('/'));

  for (const file of files) {
    assert.ok(!/\.(mp3|m4a|aac|ogg|wav|flac|mp4|mkv|jpe?g|webp|gif)$/i.test(file),
      `midia da biblioteca dentro do IPK: ${file}`);
  }
  const appFiles = files
    .filter((file) => file.includes('/applications/'))
    .map((file) => file.split('/').pop());
  for (const file of appFiles) {
    assert.ok(allowed.has(file), `arquivo inesperado no IPK: ${file}`);
  }
  const ipkSize = (await stat(path.join(ipkDir, ipkName))).size;
  console.log(`\n  IPK: ${ipkName} — ${Math.round(ipkSize / 1024)} KB, ${appFiles.length} arquivos de app`);
  assert.ok(ipkSize < 1024 * 1024, `IPK acima de 1 MB (${ipkSize} bytes)`);
  ok('IPK sem MP3 e sem fotos da biblioteca');
} else {
  console.log('\n  (IPK ainda nao gerado; rode npm run package para incluir na verificacao)');
}

console.log(`\nPASS: ${checks.length} verificacoes de empacotamento`);
