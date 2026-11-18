// Real Chromium with the shipping CSS (dist) and the real AlertCenter: every supported language at
// 320 px / 200 % in light and dark, plus 1440 px. Checks horizontal overflow, keyboard focus, date
// line contrast and that no label is left in another language; writes screenshots. Synthetic data,
// no external request (the shipping web font is not required here; system fallback is used).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const output = path.resolve('artifacts/alerts-language-dates'); fs.mkdirSync(output, { recursive: true });
await build({ entryPoints: ['scripts/fixtures/alerts-language-app.tsx'], bundle: true, jsx: 'automatic', format: 'iife', outfile: path.join(output, 'app.js'), logLevel: 'silent' });
const built = fs.readFileSync('dist/index.html', 'utf8');
const links = [...built.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["'](\/[^"']+)["'][^>]*>/g)].map(match => `<link rel="stylesheet" href="${match[1]}">`).join('');
assert(links, 'shipping CSS is mandatory');
fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${links}<link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://local').pathname;
  const file = pathname === '/' ? path.join(output, 'index.html') : pathname === '/fixture.js' ? path.join(output, 'app.js') : pathname === '/fixture.css' ? path.join(output, 'app.css') : path.join(process.cwd(), 'dist', pathname);
  if (!file.startsWith(process.cwd()) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = `http://127.0.0.1:${server.address().port}`;
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true }); const results = [];
const expected = {
  pt: { nav: ['FlightDeck', 'Escala', 'Saída', 'Alertas', 'Menu'], review: 'Dias a revisar: do dia 30/11 ao dia 01/12; dia 04/12', foreign: /\b(Days to review|Review|Details|Alerts|Roster|Depart|Open)\b/ },
  en: { nav: ['FlightDeck', 'Roster', 'Depart', 'Alerts', 'Menu'], review: 'Days to review: Nov 30 to Dec 1; Dec 4', foreign: /\b(Dias|Revisar|Detalhes|Alertas|Escala|Saída|Abrir|Datas)\b/ },
  es: { nav: ['FlightDeck', 'Escala', 'Salida', 'Alertas', 'Menu'], review: 'Días a revisar: del 30 nov al 1 dic; día 4 dic', foreign: /\b(Days|Review|Details|Revisar programação|Dias a revisar|Saída|Abrir 30\/11)\b/ },
  fr: { nav: ['FlightDeck', 'Planning', 'Départ', 'Alertes', 'Menu'], review: 'Jours à examiner: du 30 nov. au 1 déc.; le 4 déc.', foreign: /\b(Days|Review|Details|Dias|Revisar|Detalhes|Saída)\b/ },
  it: { nav: ['FlightDeck', 'Turnazione', 'Uscita', 'Avvisi', 'Menu'], review: 'Giorni da verificare: dal 30 nov al 1 dic; il 4 dic', foreign: /\b(Days|Review|Details|Dias|Revisar|Detalhes|Saída)\b/ },
  de: { nav: ['FlightDeck', 'Dienstplan', 'Abfahrt', 'Warnungen', 'Menu'], review: 'Zu prüfende Tage: 30. Nov. bis 1. Dez.; 4. Dez.', foreign: /\b(Days|Review|Dias|Revisar|Detalhes|Saída)\b/ },
};
const matrix = [];
for (const language of Object.keys(expected)) for (const theme of ['light', 'dark']) matrix.push({ language, theme, width: 320, scale: 2 });
for (const language of ['pt', 'en']) matrix.push({ language, theme: 'light', width: 1440, scale: 1 });
try {
  for (const { language, theme, width, scale } of matrix) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'pt-BR', timezoneId: 'Pacific/Auckland', serviceWorkers: 'block' });
    let blocked = 0; const errors = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (blocked++, route.abort()));
    await context.addInitScript(({ language, theme, scale }) => {
      localStorage.setItem('crewcheck_language', language);
      const apply = () => { const root = document.documentElement; root.dataset.crewTheme = theme; root.dataset.crewTextSize = String(scale * 100); root.style.setProperty('--cc-text-scale', String(scale)); };
      if (document.documentElement) apply(); else new MutationObserver((_, observer) => { if (document.documentElement) { observer.disconnect(); apply(); } }).observe(document, { childList: true });
    }, { language, theme, scale });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'networkidle' }); await page.locator('.cc-alert-card').first().waitFor(); await page.waitForTimeout(150);
    const want = expected[language];
    assert.deepEqual(await page.locator('nav span').allTextContents(), want.nav, `${language} nav`);
    const review = (await page.locator('[data-alert-dates="review"]').innerText()).replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
    assert.equal(review, want.review.replace(/ /g, ' '), `${language} review line`);
    assert.equal(await page.locator('[data-alert-dates="possible"]').count(), 1);
    // Visible text outside the marked original analysis is entirely in the selected language.
    const own = await page.evaluate(() => { const out = []; const walk = node => { if (node.nodeType === 3) { const v = node.nodeValue.trim(); if (v) out.push(v); return; } if (node.nodeType !== 1 || node.getAttribute('lang') === 'pt-BR' || ['SCRIPT', 'STYLE'].includes(node.tagName)) return; node.childNodes.forEach(walk); }; walk(document.body); return out.join(' | '); });
    assert.doesNotMatch(own, want.foreign, `${language}: no label from another language`);
    // Open the first alert's details for the screenshot (evidence, original analysis).
    await page.locator('.cc-alert-card details summary').first().click();
    const geometry = await page.evaluate(() => {
      const doc = document.documentElement, line = document.querySelector('[data-alert-dates="review"]'), card = line.closest('.cc-alert-card');
      const rgb = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = ([r, g, b]) => { const c = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
      let bg = 'rgba(0, 0, 0, 0)', node = card; while (node && /rgba\(.*, 0\)$|transparent/.test(bg)) { bg = getComputedStyle(node).backgroundColor; node = node.parentElement; }
      const [a, b] = [luminance(rgb(getComputedStyle(line).color)), luminance(rgb(bg))];
      const rect = line.getBoundingClientRect();
      return { overflow: doc.scrollWidth - doc.clientWidth, contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), lineInside: rect.left >= 0 && rect.right <= doc.clientWidth + 0.5, lang: doc.lang };
    });
    assert(geometry.overflow <= 0, `${language}/${theme}/${width}: no horizontal page overflow (${geometry.overflow})`);
    assert(geometry.lineInside, 'date line within the viewport');
    assert(geometry.contrast >= 4.5, `${language}/${theme}: date line contrast ${geometry.contrast.toFixed(2)}`);
    assert.equal(geometry.lang, language === 'pt' ? 'pt-BR' : language);
    // Keyboard: the evidence button is reachable and shows a visible focus.
    const button = page.locator('.cc-alert-card section[aria-label] button').first(); await button.focus(); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
    const focus = await button.evaluate(element => { const style = getComputedStyle(element); return { active: document.activeElement === element, outline: style.outlineStyle, width: parseFloat(style.outlineWidth), shadow: style.boxShadow }; });
    assert(focus.active && ((focus.outline !== 'none' && focus.width >= 2) || focus.shadow !== 'none'), `visible focus ${JSON.stringify(focus)}`);
    const name = `alerts-${language}-${theme}-${width}-${scale * 100}`;
    // The fixture navigation only stands in for the real bottom bar's labels (checked as text
    // above); it is not the real styled bar, so it stays out of the screenshots.
    await page.locator('nav').evaluate(nav => { nav.style.setProperty('display', 'none', 'important'); });
    await page.locator('.cc-alert-center').screenshot({ path: path.join(output, `${name}.png`) });
    assert.deepEqual(errors, []); assert.equal(blocked, 0, 'no external request');
    results.push({ name, language, theme, width, scale, contrast: Number(geometry.contrast.toFixed(2)), overflow: geometry.overflow });
    await context.close();
  }
} finally { await browser.close(); server.close(); }
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'Real AlertCenter, shipping dist CSS and fixture CSS, synthetic account/roster/alerts, no external request; web font not required (system fallback).', results }, null, 2));
console.log(`PASS alerts language/dates browser matrix ${results.length}: 6 languages at 320 px/200 % light and dark plus 1440 px, no overflow, date line contrast >= 4.5, visible keyboard focus, no label from another language`);
