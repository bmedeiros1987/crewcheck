import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decodePngRgba } from './lib/png-rgba.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const applyPath = path.join(root, 'scripts/v14342/apply.mjs');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
const homePath = path.join(root, 'client/src/pages/Home.tsx');
const brandPath = path.join(root, 'client/src/lib/brand.ts');
const manifestPath = path.join(root, 'client/public/manifest.json');
const gradlePath = path.join(root, 'android-wrapper/app/build.gradle');
const releasePath = path.join(root, 'client/public/release.json');
const outputs = [
  'client/public/icons/crewcheck-brand-512.png',
  'client/public/icons/crewcheck-play-store-512.png',
  'client/public/brand/crewcheck-menu-approved-512.png',
].map((relative) => path.join(root, relative));

assert.ok(chain.includes("await import('../v14342/apply.mjs');"), 'v14.3.42 deve encerrar a preparação canônica');
for (const output of outputs) assert.ok(fs.existsSync(output), `ativo canônico ausente: ${path.relative(root, output)}`);
const bytes = outputs.map((output) => fs.readFileSync(output));
assert.ok(bytes[0].equals(bytes[1]) && bytes[0].equals(bytes[2]), 'menu, Play Store e fonte canônica devem usar bytes idênticos');
for (const [index, output] of outputs.entries()) {
  const decoded = decodePngRgba(bytes[index]);
  assert.equal(decoded.width, 512, `${path.basename(output)} deve ter largura 512`);
  assert.equal(decoded.height, 512, `${path.basename(output)} deve ter altura 512`);
}
const digest = crypto.createHash('sha256').update(bytes[0]).digest('hex');
const metadataPath = path.join(root, 'client/public/brand/crewcheck-brand-metadata.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
assert.equal(metadata.policy, 'exact-menu-identity');
assert.match(metadata.source, /crewcheck-icon-v[23]\.png$/);
assert.equal(metadata.canonicalDimensions, '512x512');
assert.equal(metadata.sha256, digest, 'metadado deve registrar o hash real do ativo');
assert.equal(metadata.outputs.length, 3);

const home = fs.readFileSync(homePath, 'utf8');
const brand = fs.readFileSync(brandPath, 'utf8');
const manifest = fs.readFileSync(manifestPath, 'utf8');
const gradle = fs.readFileSync(gradlePath, 'utf8');
const release = fs.readFileSync(releasePath, 'utf8');
const sourceSvg = fs.readFileSync(path.join(root, 'client/public/brand/crewcheck-play-store-source.svg'), 'utf8');
assert.ok(home.includes("const DEFAULT_VERSION = '14.3.42';"));
assert.ok(home.includes('/icons/crewcheck-brand-512.png?v=14342'), 'cabeçalho/menu devem usar o ativo exato 512');
assert.ok(!home.includes('/icons/crewcheck-icon-v3.png?v='), 'Home não pode continuar na logo intermediária');
assert.ok(brand.includes("iconPath: '/icons/crewcheck-brand-512.png'"), 'PDF, e-mail e compartilhamento devem usar a marca canônica');
assert.ok(manifest.includes('/icons/crewcheck-brand-512.png?v=14342'), 'PWA deve usar a mesma marca');
assert.ok(gradle.includes("inputs.file(file('../../client/public/icons/crewcheck-brand-512.png'))"), 'Android deve receber a mesma marca');
assert.ok(gradle.includes("from file('../../client/public/icons/crewcheck-brand-512.png')"), 'Android deve copiar a mesma marca');
assert.ok(sourceSvg.includes('data:image/png;base64,'), 'fonte SVG deve incorporar a imagem aprovada, sem redesenhar o símbolo');
assert.ok(!sourceSvg.includes('<path d='), 'fonte da Play Store não pode conter um avião alternativo redesenhado');
assert.ok(release.includes('14.3.42'));

const generatorSource = fs.readFileSync(path.join(root, 'scripts/generate-canonical-brand-assets.mjs'), 'utf8');
assert.ok(generatorSource.includes("'client/public/icons/crewcheck-icon-v3.png'"), 'gerador deve priorizar exatamente a logo usada no menu');
assert.ok(generatorSource.includes("'client/public/icons/crewcheck-icon-v2.png'"), 'gerador pode usar a fonte anterior somente como fallback idêntico');
assert.ok(!/gradientCss|canonicalSvg|<path d=/i.test(generatorSource), 'gerador não pode redesenhar a marca');

const before = new Map([
  [homePath, fs.readFileSync(homePath)],
  [brandPath, fs.readFileSync(brandPath)],
  [manifestPath, fs.readFileSync(manifestPath)],
  [gradlePath, fs.readFileSync(gradlePath)],
  [releasePath, fs.readFileSync(releasePath)],
  ...outputs.map((output) => [output, fs.readFileSync(output)]),
]);
const second = spawnSync(process.execPath, [applyPath], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.42 falhou');
for (const [file, expected] of before) assert.ok(fs.readFileSync(file).equals(expected), `v14.3.42 deve ser idempotente em ${path.relative(root, file)}`);

console.log(`v14.3.42 exact menu brand: 512×512, identical outputs, PWA, Android, exports, Play Store and idempotency validated; SHA-256 ${digest}.`);
