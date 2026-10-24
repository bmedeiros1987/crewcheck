const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm'), ts = require('typescript');
const source = fs.readFileSync('server.mjs', 'utf8');
const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const serve = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'serveStatic');
assert.equal(serve.length, 1);
const context = vm.createContext({ guardStaticHtml: require('../server/static-html-guard.mjs').guardStaticHtml, fs, path, Buffer, distDir: path.resolve('dist'), sendJson(res, status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); } });
vm.runInContext(serve[0].getText(ast) + '\nglobalThis.respond=serveStatic;', context);
const server = http.createServer((req, res) => context.respond(req, res, new URL(req.url, 'http://localhost')));
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    let linkStarts = 0;
    await ctx.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/whatsapp/link/start') linkStarts++;
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"items":[],"data":[],"enabled":false}' });
      return route.continue();
    });
    await ctx.addInitScript(() => {
      localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-link-A', name: 'SYNTHETIC', role: 'user' }));
      localStorage.setItem('crewcheck_auth_token', 'synthetic-never-real-token');
      localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1');
      sessionStorage.setItem('crewcheck:first-access-tour:v1434:session-seen', '1');
      localStorage.setItem('crewcheck_demo_mode_seen', '1');
      localStorage.setItem('crewcheck_intro_seen_v1278', '1');
    });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/app?view=notifications');
    await page.locator('.cc-notification-center').waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('crewcheck:auth-changed')));
    await page.locator('.cc-notification-center').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('view'), 'notifications');
    await page.getByText('Vínculos de canais', { exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Vincular WhatsApp', exact: true }).isVisible(), true);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' })));
    await page.locator('.cc-notification-center').waitFor({ state: 'detached' });
    await page.getByLabel('Menu', { exact: true }).click();
    await page.getByRole('button', { name: 'Notificações', exact: true }).click();
    await page.locator('.cc-notification-center').waitFor();
    await page.evaluate(() => window.dispatchEvent(new Event('crewcheck:auth-changed')));
    await page.locator('.cc-notification-center').waitFor();
    assert.equal(new URL(page.url()).searchParams.get('view'), 'notifications');
    await page.evaluate(() => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-link-B', name: 'SYNTHETIC B', role: 'user' })); window.dispatchEvent(new Event('crewcheck:auth-changed')); });
    await page.locator('.cc-notification-center').waitFor({ state: 'detached' });
    assert.equal(new URL(page.url()).searchParams.get('view'), 'cockpit');
    assert.equal(linkStarts, 0, 'navigation must never create a challenge automatically');
    assert.deepEqual(errors, []);
    await ctx.close();
    console.log('PASS actual built app: Notifications deep link/menu, same-owner refresh, account switch and visible explicit WhatsApp action; zero link starts/provider calls.');
  } finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); server.closeAllConnections(); server.close(); process.exitCode = 1; });
