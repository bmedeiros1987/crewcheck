import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { APPROVED_BRAND_SHA, BRAND_CACHE_TOKEN } from './approved-brand-assets.mjs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14366-regression] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

const app = read('client/src/App.tsx');
const html = read('client/index.html');
const css = read('client/src/index.css');

if (!app.includes('className="cc1270-loader-brand"')) throw new Error('[v14366-regression] Splash ainda não usa a logo fixa canônica.');
const splash = app.match(/<img\s+className="cc1270-loader-brand"[^>]*src="([^"]+)"/);
const preload = html.match(/<link\s+rel="preload"\s+as="image"\s+href="([^"]+)"/);
for (const [label, value] of [['splash', splash?.[1]], ['preload', preload?.[1]]]) {
  assert(value, `${label}: approved logo URL missing`);
  const url = new URL(value.replaceAll('&amp;', '&'), 'https://crewcheck.invalid');
  assert.equal(url.origin, 'https://crewcheck.invalid', `${label}: local approved asset only`);
  assert.equal(url.pathname, '/icons/crewcheck-icon-v2.png', `${label}: canonical logo path`);
  assert.equal(url.searchParams.get('brand'), BRAND_CACHE_TOKEN, `${label}: approved cache identity`);
}
assert.equal(splash[1].replaceAll('&amp;', '&'), preload[1].replaceAll('&amp;', '&'), 'splash and preload must request identical bytes');
const png = fs.readFileSync('client/public/icons/crewcheck-icon-v2.png');
assert.equal(crypto.createHash('sha256').update(png).digest('hex'), APPROVED_BRAND_SHA, 'approved logo bytes');
if (/window\.location\.reload\s*\(/.test(html)) throw new Error('[v14366-regression] Reload automático permanece no HTML preparado.');
if (/crewcheck-release-watch-v\d+/.test(html)) throw new Error('[v14366-regression] Release watcher legado permanece no HTML preparado.');
if (/registration\.unregister\s*\(/.test(html)) throw new Error('[v14366-regression] Limpeza destrutiva de service worker permanece no HTML preparado.');
if (!css.includes('CrewCheck v14.3.66 — stable boot brand')) throw new Error('[v14366-regression] Proteção visual da logo fixa ausente.');
if (!css.includes('animation: none !important')) throw new Error('[v14366-regression] Logo ainda pode receber animação no boot.');

console.log('[v14366-regression] OK: boot sem reload automático e logo fixa desde o primeiro frame.');
