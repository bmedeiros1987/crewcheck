import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Reuse product-supplied art and auth styling from PR936; no redraw or new mark.
export const APPROVED_BRAND_SHA = '3656d39df50e32094211ef737c0237a26308e7e742bcccc855a87150f47a638c';
export const BRAND_CACHE_TOKEN = `936-${APPROVED_BRAND_SHA.slice(0, 12)}`;
const official = 'client/public/assets/brand/crewcheck-app-icon-2026.png';
const svgAliases = ['crewcheck-mark.svg', 'crewcheck-play-store-source.svg'];
const iconUrl = /\/icons\/crewcheck-icon-v[23]\.png(?:\?[^'"`\s<>)]*)?/g;
const tagUrl = value => {
  const url = new URL(value.replaceAll('&amp;', '&'), 'https://crewcheck.invalid');
  url.searchParams.set('brand', BRAND_CACHE_TOKEN);
  return url.pathname + url.search;
};

export function finalizeApprovedBrandAssets() {
  const png = fs.readFileSync(official);
  const actual = crypto.createHash('sha256').update(png).digest('hex');
  if (actual !== APPROVED_BRAND_SHA) throw Error('Approved PR936 brand bytes missing or changed');
  for (const file of ['icons/crewcheck-icon-v2.png', 'icons/crewcheck-icon-v3.png', 'brand/crewcheck-play-store-icon-512.png']) {
    const target = path.join('client/public', file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, png);
  }
  // These legacy filenames stay usable without regenerating the old vector art.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="CrewCheck"><title>Product-supplied art from PR936</title><image width="512" height="512" href="data:image/png;base64,${png.toString('base64')}"/></svg>`;
  for (const alias of svgAliases) fs.writeFileSync(path.join('client/public/brand', alias), svg);

  const iconUrls = new Set();
  for (const file of ['client/index.html', 'client/src/lib/brand.ts', 'client/src/App.tsx', 'client/src/pages/Home.tsx', 'client/src/pages/AuthPage.tsx', 'client/src/styles/brand-mark-2026.css']) {
    const source = fs.readFileSync(file, 'utf8');
    const tagged = source.replace(iconUrl, value => file.endsWith('.html') ? tagUrl(value).replaceAll('&', '&amp;') : tagUrl(value));
    fs.writeFileSync(file, tagged);
    for (const url of tagged.match(iconUrl) || []) iconUrls.add(url.replaceAll('&amp;', '&'));
  }
  const manifestPath = 'client/public/manifest.json';
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const icon of [...(manifest.icons || []), ...(manifest.shortcuts || []).flatMap(shortcut => shortcut.icons || [])]) {
    if (/^\/icons\/crewcheck-icon-v[23]\.png/.test(icon.src)) {
      icon.src = tagUrl(icon.src);
      iconUrls.add(icon.src);
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  const swPath = 'client/public/sw.js';
  let sw = fs.readFileSync(swPath, 'utf8').replace(iconUrl, tagUrl);
  const shell = sw.match(/const APP_SHELL = (\[[^\]]*\]);/);
  if (!shell) throw Error('Canonical offline shell list missing');
  const shellUrls = [...shell[1].matchAll(/['"]([^'"]+)['"]/g)].map(match => match[1]);
  sw = sw.replace(shell[0], `const APP_SHELL = ${JSON.stringify([...new Set([...shellUrls, ...iconUrls])])};`);
  sw = sw.replace(/(const (?:CACHE_NAME|RUNTIME_CACHE) = ')([^']+)(';)/g,
    (_, before, value, after) => `${before}${value.replace(/-brand936-[a-f0-9]+$/, '')}-brand936-${APPROVED_BRAND_SHA.slice(0, 12)}${after}`);
  fs.writeFileSync(swPath, sw);

  const mainPath = 'client/src/main.tsx';
  let main = fs.readFileSync(mainPath, 'utf8').replaceAll('import "./styles/brand-mark-2026.css";\n', '');
  main = main.replace('import "./styles/ipad-header-recovery.css";', 'import "./styles/brand-mark-2026.css";\nimport "./styles/ipad-header-recovery.css";');
  fs.writeFileSync(mainPath, main);
}
