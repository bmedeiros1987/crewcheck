// Real Chromium, shipping CSS (dist) and the real AlertCenter fed by the real parser + compliance
// engine on synthetic AIMS text, split like the Home caller. Run after full prepare + web build.
// An unresolved standby/reserve window (STANDBY_/RESERVE_WINDOW_UNRESOLVED) must appear as a
// pending item ("dados insuficientes", collapsed details, the roster's own date), never as an
// actionable/confirmed irregularity; a published station window raises nothing. Portuguese and
// English: in English the item keeps the engine's Portuguese analysis marked lang="pt-BR" (the
// existing fallback); no automatic translation is claimed. Screenshots in artifacts/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const output = path.resolve('artifacts/unresolved-activity-window-alerts'); fs.mkdirSync(output, { recursive: true });
await build({ entryPoints: ['scripts/fixtures/unresolved-activity-window-alerts-app.tsx'], bundle: true, jsx: 'automatic', format: 'iife', outfile: path.join(output, 'app.js'), logLevel: 'silent',
  alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') } });
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
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const UNRESOLVED = { STANDBY_WINDOW_UNRESOLVED: '17/08/2026', RESERVE_WINDOW_UNRESOLVED: '20/08/2026' };
const PT_LABELS = /\b(Dias|Revisar|Detalhes|Alertas|Escala|Saída|Abrir|Datas|Data)\b/;
const results = [];
try {
  for (const { language, width, theme } of [{ language: 'pt', width: 320, theme: 'light' }, { language: 'en', width: 320, theme: 'light' }, { language: 'pt', width: 320, theme: 'dark' }, { language: 'pt', width: 1440, theme: 'light' }]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: language === 'en' ? 'en-US' : 'pt-BR', timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' });
    let blocked = 0; const errors = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : (blocked++, route.abort()));
    // Theme applied like the existing alerts harness (regression-alerts-language-dates-browser).
    await context.addInitScript(({ lang, theme }) => {
      localStorage.setItem('crewcheck_language', lang);
      const apply = () => { document.documentElement.dataset.crewTheme = theme; };
      if (document.documentElement) apply(); else new MutationObserver((_, observer) => { if (document.documentElement) { observer.disconnect(); apply(); } }).observe(document, { childList: true });
    }, { lang: language, theme });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'networkidle' }); await page.locator('.cc-alert-center').waitFor(); await page.waitForTimeout(200);

    // Engine output and caller split.
    const split = await page.evaluate(() => ({ engine: window.__engineAlerts.map(a => [a.code || a.title, a.classification, a.actionable, a.date]), alerts: window.__alerts.map(a => a.code || a.title), pending: window.__pending.map(a => [a.code, a.date]) }));
    for (const [code, date] of Object.entries(UNRESOLVED)) {
      assert.ok(split.engine.some(([c, cls, act, d]) => c === code && cls === 'dados_insuficientes' && act === false && d === date), `${code} from the engine on ${date}`);
      assert.ok(split.pending.some(([c, d]) => c === code && d === date), `${code} is a pending item`);
      assert.ok(!split.alerts.includes(code), `${code} is never an actionable alert`);
    }
    assert.ok(!split.engine.some(([c]) => /^(Sobreaviso|Reserva) (acima|abaixo)/.test(c)), 'no standby/reserve limit irregularity from an unresolved window');
    assert.equal(split.engine.filter(([c, , , d]) => c === 'STANDBY_WINDOW_UNRESOLVED' && d === '22/08/2026').length, 0, 'the published station window (22/08) raises no pending item');

    // Rendered: pending section, collapsed details, real date, not among confirmed cards.
    const status = page.locator('.cc-alert-center section[role="status"]');
    await status.waitFor();
    const items = status.locator('details');
    const unresolvedItems = [];
    for (let index = 0; index < await items.count(); index += 1) {
      const text = (await items.nth(index).textContent()) || '';
      if (/horários sem estação não permitem atribuir início e fim/.test(text)) unresolvedItems.push(items.nth(index));
    }
    assert.equal(unresolvedItems.length, 2, `${language}: two unresolved-window pending items`);
    for (const item of unresolvedItems) assert.equal(await item.evaluate(node => node.open), false, `${language}: details collapsed by default`);
    const cardsText = (await page.locator('.cc-alert-card').allTextContents()).join(' ');
    assert.doesNotMatch(cardsText, /sem janela comprovada|Sobreaviso acima|Reserva acima/, `${language}: not shown as a confirmed/actionable card`);
    const summaries = await Promise.all(unresolvedItems.map(item => item.locator('summary').textContent()));
    if (language === 'pt') assert.deepEqual(summaries.map(text => text.trim()).sort(), ['Reserva sem janela comprovada', 'Sobreaviso sem janela comprovada'], 'PT summaries are the engine titles');
    else for (const text of summaries) assert.doesNotMatch(text, /sem janela|Sobreaviso|Reserva/, 'EN summary uses the interface label, not an untranslated title');
    await page.locator('.cc-alert-center').screenshot({ path: path.join(output, `unresolved-${language}-${theme}-${width}-collapsed.png`) });

    // Expanded: the date of the roster, the engine's analysis kept in Portuguese and marked pt-BR.
    for (const item of unresolvedItems) await item.locator('summary').click();
    await page.waitForTimeout(150);
    const expanded = await Promise.all(unresolvedItems.map(item => item.evaluate(node => ({
      open: node.open,
      text: node.textContent,
      ptBlocks: [...node.querySelectorAll('[lang="pt-BR"]')].map(block => block.textContent),
    }))));
    for (const item of expanded) {
      assert.ok(item.open, 'details expand on click');
      assert.ok(item.ptBlocks.some(text => /horários sem estação não permitem atribuir início e fim (do sobreaviso|da reserva)\./.test(text)), 'engine analysis kept and marked lang="pt-BR"');
      assert.ok(item.ptBlocks.some(text => /não irregularidade confirmada nem 0 h/.test(text)), 'details say: not a confirmed irregularity, not 0 h');
    }
    assert.ok(expanded.some(item => /17\/08|17 Aug|Aug 17/.test(item.text)) && expanded.some(item => /20\/08|20 Aug|Aug 20/.test(item.text)), `${language}: the roster dates are shown`);
    if (language === 'en') {
      const own = await page.evaluate(() => { const out = []; const walk = node => { if (node.nodeType === 3) { const v = node.nodeValue.trim(); if (v) out.push(v); return; } if (node.nodeType !== 1 || node.getAttribute('lang') === 'pt-BR' || ['SCRIPT', 'STYLE'].includes(node.tagName)) return; node.childNodes.forEach(walk); }; walk(document.querySelector('.cc-alert-center')); return out.join(' | '); });
      assert.doesNotMatch(own, PT_LABELS, 'EN: interface labels outside the marked original analysis are English');
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 0, `${language}/${width}: no horizontal overflow (${overflow})`);
    await page.locator('.cc-alert-center').screenshot({ path: path.join(output, `unresolved-${language}-${theme}-${width}-expanded.png`) });
    assert.deepEqual(errors, []); assert.equal(blocked, 0, 'no external request');
    results.push({ language, theme, width, pending: split.pending, actionable: split.alerts });
    await context.close();
  }
} finally { await browser.close(); server.close(); }
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ scope: 'Real AlertCenter + real parser/engine, synthetic AIMS text, shipping dist CSS, no external request.', results }, null, 2));
console.log(`PASS unresolved activity window alerts (real AlertCenter, prepared engine): STANDBY/RESERVE_WINDOW_UNRESOLVED shown as pending (dados insuficientes), collapsed details, roster dates 17/08 and 20/08, never an actionable/confirmed card; published window raises nothing; EN keeps the original analysis marked pt-BR; ${results.length} views, no overflow, screenshots in artifacts/unresolved-activity-window-alerts.`);
