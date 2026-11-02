import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { APPROVED_BRAND_SHA, BRAND_CACHE_TOKEN, finalizeApprovedBrandAssets } from './approved-brand-assets.mjs';

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const png = fs.readFileSync('client/public/assets/brand/crewcheck-app-icon-2026.png');
assert.equal(sha('client/public/assets/brand/crewcheck-app-icon-2026.png'), APPROVED_BRAND_SHA);
assert.equal(png.readUInt32BE(16), 512);
assert.equal(png.readUInt32BE(20), 512);
assert.equal(png[25], 6, 'Approved RGBA PNG is preserved');
assert(png.length <= 1024 * 1024);
for (const file of ['client/public/icons/crewcheck-icon-v2.png', 'client/public/icons/crewcheck-icon-v3.png', 'client/public/brand/crewcheck-play-store-icon-512.png', 'android-wrapper/app/src/main/res/drawable-nodpi/crewcheck_logo_neon.png']) {
  assert.equal(sha(file), APPROVED_BRAND_SHA, file);
}
for (const file of ['client/public/brand/crewcheck-mark.svg', 'client/public/brand/crewcheck-play-store-source.svg']) {
  const embedded = fs.readFileSync(file, 'utf8').match(/data:image\/png;base64,([^"]+)/)?.[1];
  assert(embedded, 'Legacy alias must embed approved pixels, not the old procedural vector');
  assert(Buffer.from(embedded, 'base64').equals(png));
}
const manifest = JSON.parse(fs.readFileSync('client/public/manifest.json', 'utf8'));
for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap(item => item.icons || [])]) assert(icon.src.includes(`brand=${BRAND_CACHE_TOKEN}`));
for (const file of ['client/index.html', 'client/src/lib/brand.ts', 'client/src/App.tsx', 'client/src/pages/Home.tsx', 'client/src/styles/brand-mark-2026.css']) {
  const urls = fs.readFileSync(file, 'utf8').match(/\/icons\/crewcheck-icon-v[23]\.png(?:\?[^'"`\s<>)]*)?/g);
  assert(urls?.length, file);
  assert(urls.every(url => url.includes(`brand=${BRAND_CACHE_TOKEN}`)), `${file}: old unversioned URL`);
}
const sw = fs.readFileSync('client/public/sw.js', 'utf8');
const shell = JSON.parse(sw.match(/const APP_SHELL = (\[[^\]]*\]);/)[1]);
for (const file of ['client/index.html', 'client/src/lib/brand.ts', 'client/src/App.tsx', 'client/src/pages/Home.tsx', 'client/src/styles/brand-mark-2026.css']) {
  for (const url of fs.readFileSync(file, 'utf8').match(/\/icons\/crewcheck-icon-v[23]\.png(?:\?[^'"`\s<>)]*)?/g) || []) {
    assert(shell.includes(url.replaceAll('&amp;', '&')), `${file}: approved logo alias not precached for first offline boot`);
  }
}
for (const name of ['CACHE_NAME', 'RUNTIME_CACHE']) assert.match(sw, new RegExp(`const ${name} = '[^']+-brand936-${APPROVED_BRAND_SHA.slice(0, 12)}'`));
assert.match(sw, /SHARED_PDF_CACHE = 'crewcheck-pwa-shared-pdf-v1'/, 'Shared PDFs retain their independent cache');
assert.match(fs.readFileSync('android-wrapper/app/src/main/res/drawable/ic_launcher.xml', 'utf8'), /android:src="@drawable\/crewcheck_icon_site"/);
// Every Android brand input must be the approved art itself: either a finalized alias
// (icons/crewcheck-icon-v2|v3, checked above) or the official 2026 source the Wear app and
// watch face read directly since #1282. Check the bytes of each file Gradle copies, not a name.
const brandInputs = new Set(['client/public/icons/crewcheck-icon-v2.png', 'client/public/icons/crewcheck-icon-v3.png', 'client/public/assets/brand/crewcheck-app-icon-2026.png']);
for (const module of ['app', 'wear', 'watchface']) {
  const gradle = fs.readFileSync(`android-wrapper/${module}/build.gradle`, 'utf8');
  const inputs = [...gradle.matchAll(/file\('\.\.\/\.\.\/(client\/public\/[^']+\.png)'\)/g)].map(m => m[1]);
  assert(inputs.length >= 2, `${module}: brand input and copy source declared`);
  for (const input of inputs) {
    assert(brandInputs.has(input), `${module}: ${input} is not an approved brand input`);
    assert.equal(sha(input), APPROVED_BRAND_SHA, `${module}: ${input} bytes`);
  }
  assert.match(gradle, /preBuild.dependsOn generateCrew/);
}
const watched = ['client/public/brand/crewcheck-mark.svg', 'client/public/brand/crewcheck-play-store-source.svg', 'client/public/manifest.json', 'client/public/sw.js', 'client/index.html', 'client/src/main.tsx', 'client/src/pages/Home.tsx', 'client/src/lib/brand.ts', 'client/src/styles/brand-mark-2026.css'];
const before = watched.map(sha);
finalizeApprovedBrandAssets();
assert.deepEqual(watched.map(sha), before, 'Approved-brand finalization is byte-idempotent');
console.log('PASS PR936 original PNG, web/PWA cache aliases, SVG pixels, Android resource inputs, store-source technical format and idempotence');
