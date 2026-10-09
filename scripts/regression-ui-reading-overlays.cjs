const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http'), vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const { buildSync } = createRequire(process.env.MENU_ESBUILD_PACKAGE || __filename)('esbuild');
const output = path.resolve(process.env.UI_READING_EVIDENCE_DIR || 'artifacts/ui-reading-overlays');
fs.mkdirSync(output, { recursive: true });
const dist = path.resolve('dist');
const serverSource = fs.readFileSync('server.mjs', 'utf8');
const serverAst = ts.createSourceFile('server.mjs', serverSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const responder = serverAst.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'serveStatic');
assert.equal(responder.length, 1);
const staticScope = vm.createContext({ fs, path, Buffer, distDir: dist, sendJson: (res, code, body) => { res.writeHead(code); res.end(JSON.stringify(body)); } });
vm.runInContext(responder[0].getText(serverAst) + '\nglobalThis.respond = serveStatic;', staticScope);
const server = http.createServer((req, res) => staticScope.respond(req, res, new URL(req.url, 'http://localhost')));

// Reuse the existing synthetic roster seed; never read production data or user profiles.
const financeSource = fs.readFileSync('scripts/regression-financial-ui-browser.cjs', 'utf8');
const financeAst = ts.createSourceFile('finance.cjs', financeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fixtures = financeAst.statements.filter(n => ts.isFunctionDeclaration(n) && ['roster', 'seed', 'measureMoney'].includes(n.name?.text)
  || ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(financeAst) === 'day'));
assert.equal(fixtures.length, 4);
const fixtureScope = vm.createContext({});
vm.runInContext(fixtures.map(n => n.getText(financeAst)).join('\n') + '\nglobalThis.qaRoster=roster; globalThis.qaSeed=seed; globalThis.qaMoney=measureMoney;', fixtureScope);
const homeSource = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const homeAst = ts.createSourceFile('Home.tsx', homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const confirmation = homeAst.statements.filter(n => ts.isFunctionDeclaration(n) && n.name?.text === 'requestCrewCheckImportConfirmation');
assert.equal(confirmation.length, 1);
const modalBundle = buildSync({ stdin: { contents: `import { acquireOverlayLifecycle } from './client/src/lib/overlayLifecycle';\n${confirmation[0].getText(homeAst)}\nwindow.openQAImport=requestCrewCheckImportConfirmation; window.acquireQAOverlay=acquireOverlayLifecycle;`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', format: 'iife', write: false }).outputFiles[0].text;
const results = [];
const widths = (process.env.UI_READING_WIDTHS || '320,360,390,1440').split(',').map(Number);
assert.ok(widths.every(width => [320, 360, 390, 1440].includes(width)));
const settle = page => page.evaluate(async () => {
  for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) try { animation.finish(); } catch {}
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});
async function recovered(page) {
  await page.waitForFunction(() => !document.body.classList.contains('crewcheck-menu-open') && !history.state?.crewcheckOverlay && document.body.style.overflow !== 'hidden');
  await settle(page);
  const result = await page.evaluate(() => {
    const nav = document.querySelector('body > nav.cz-bottom-nav');
    window.scrollTo({ top: 0, behavior: 'instant' });
    const before = window.scrollY;
    window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' });
    const after = window.scrollY;
    return { unlocked: !['hidden', 'clip'].includes(getComputedStyle(document.body).overflowY), scrolled: after > before || document.scrollingElement.scrollHeight <= innerHeight,
      navVisible: nav && getComputedStyle(nav).display !== 'none', historyRestoration: history.scrollRestoration };
  });
  assert.ok(result.unlocked && result.scrolled && result.navVisible && result.historyRestoration === 'auto', 'Body scroll or approved navigation not restored: ' + JSON.stringify(result));
}
async function visibleTextBounds(page, selector) {
  return page.locator(selector).evaluateAll(elements => {
    const failures = [];
    for (const element of elements) {
      const box = element.getBoundingClientRect();
      if (!element.getClientRects().length || !box.width || !box.height) continue;
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while (node = walker.nextNode()) {
        if (node.parentElement.closest('svg, option, [aria-hidden="true"]') || !node.parentElement.getClientRects().length) continue;
        for (let i = 0; i < node.textContent.length; i++) {
          if (/\s/.test(node.textContent[i])) continue;
          const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
          for (const rect of range.getClientRects()) if (rect.width && rect.height && (rect.left < box.left - 2 || rect.right > box.right + 2 || rect.top < box.top - 2 || rect.bottom > box.bottom + 2)) {
            const style = getComputedStyle(node.parentElement);
            failures.push({ text: element.textContent.slice(0, 100), char: node.textContent[i], whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap,
              rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, box: { left: box.left, right: box.right, top: box.top, bottom: box.bottom } }); break;
          }
        }
      }
    }
    return failures.slice(0, 20);
  });
}
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    for (const width of widths) for (const theme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, hasTouch: width < 500, isMobile: width < 500, serviceWorkers: 'block', timezoneId: 'America/Sao_Paulo' });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"items":[],"data":[],"enabled":false}' });
        return route.continue();
      });
      await context.addInitScript(fixtureScope.qaSeed, { theme, kind: fixtureScope.qaRoster('domestic'), amount: 100 });
      await context.addInitScript(() => localStorage.setItem('crewcheck:home-layout:v1:financial-ui-qa', JSON.stringify({ version: 1, mode: 'personalized', order: ['summary', 'finance', 'next', 'limits', 'smart'], visible: ['summary', 'next', 'limits'] })));
      const page = await context.newPage();
      await page.goto(origin + '/app'); await page.locator('.cz-app').waitFor();
      for (const size of [100, 150, 200]) {
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' })));
        await page.locator('.cc-operational-alert-link').waitFor();
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'settings' })));
        await page.locator('#cc-text-size').selectOption(String(size));
        await page.waitForFunction(size => document.documentElement.dataset.crewTextSize === String(size), size);
        await settle(page);
        assert.deepEqual(await visibleTextBounds(page, '.cz-global-header'), [], 'Navigation header text stays inside the fixed header');
        const actualFont = await page.locator('#cc-text-size-help').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        const rootFont = await page.locator('html').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        if (size > 100) assert.ok(actualFont >= rootFont * size / 100 - .1, `Actual text must enlarge, not just a root marker: font=${actualFont}, root=${rootFont}, size=${size}`);
        assert.deepEqual(await visibleTextBounds(page, '.cc-text-size-setting, .cz-settings .cz-setting'), [], 'Settings text escapes its container');
        await page.screenshot({ path: path.join(output, `${width}-${theme}-${size}-settings.png`), fullPage: true });
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' })));
        const alertLink = page.locator('.cc-operational-alert-link'); await alertLink.waitFor(); await settle(page);
        const alertBounds = await alertLink.boundingBox();
        const alertStyle = await alertLink.evaluate(el => ({ display: getComputedStyle(el).display, columns: getComputedStyle(el).gridTemplateColumns, titleFont: getComputedStyle(el.querySelector('strong')).fontSize, statusFont: getComputedStyle(el.querySelector('span')).fontSize, width: el.getBoundingClientRect().width }));
        await page.screenshot({ path: path.join(output, `${width}-${theme}-${size}-home.png`) });
        assert.ok(alertBounds.height >= 44 && (size > 100 || alertBounds.height <= 100), 'Operational alert link is compact with an accessible target: ' + JSON.stringify({ width, theme, size, bounds: alertBounds, style: alertStyle }));
        assert.deepEqual(await visibleTextBounds(page, '.cc-operational-alert-link'), [], 'Operational alert text fits at enlarged size');
        await alertLink.click(); await page.locator('.cz-alert-detail').waitFor();
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'settings' })));
        await page.reload(); await page.locator('.cz-app').waitFor();
        await page.waitForFunction(size => document.documentElement.dataset.crewTextSize === String(size), size);
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'settings' })));
        await page.locator('#cc-text-size').waitFor();
        const menuMethods = width < 500 ? ['escape', 'close', 'back'] : ['escape', 'close', 'backdrop', 'back'];
        for (const method of menuMethods) {
          await page.evaluate(() => window.scrollTo({ top: 160, behavior: 'instant' }));
          const before = await page.evaluate(() => window.scrollY);
          const opener = page.locator('body > nav.cz-bottom-nav > button').last();
          await opener.click();
          await page.locator('.cz-menu-overlay').waitFor(); await settle(page);
          assert.equal(await page.locator('body').evaluate(el => el.style.overflow), 'hidden');
          await page.locator('.cz-menu-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
          await settle(page);
          assert.deepEqual(await visibleTextBounds(page, '.cc-menu-favorite-chip, .cc-menu-destination'), [], 'Menu text escapes its buttons');
          if (method === 'escape') await page.keyboard.press('Escape');
          if (method === 'close') await page.locator('.cz-menu-close').click();
          if (method === 'backdrop') {
            const hit = await page.locator('.cz-menu-backdrop').evaluate(el => {
              const r = el.getBoundingClientRect(), style = getComputedStyle(el), appStyle = getComputedStyle(document.querySelector('.cz-app'));
              return { hit: document.elementFromPoint(8, innerHeight / 2) === el, box: { x: r.x, y: r.y, width: r.width, height: r.height }, target: document.elementFromPoint(8, innerHeight / 2)?.className, pointer: style.pointerEvents, transform: appStyle.transform, contain: appStyle.contain };
            });
            assert.ok(hit.hit, 'Outside-menu surface receives real pointer input: ' + JSON.stringify(hit));
            await page.mouse.click(8, await page.evaluate(() => innerHeight / 2));
          }
          if (method === 'back') await page.goBack();
          await page.locator('.cz-menu-overlay').waitFor({ state: 'detached' });
          await page.waitForFunction(() => !history.state?.crewcheckOverlay && document.body.style.overflow !== 'hidden'); await settle(page);
          const after = await page.evaluate(() => window.scrollY);
          assert.ok(Math.abs(after - before) <= 1, `Menu restores the original content position: ${width}/${theme}/${size}/${method}, before=${before}, after=${after}`);
          assert.ok(await opener.evaluate(el => el === document.activeElement), 'Menu restores focus to the approved navigation opener');
          await recovered(page);
        }
        await page.addScriptTag({ content: modalBundle });
        for (const method of ['escape', 'cancel', 'backdrop', 'back']) {
          await page.evaluate(() => { window.qaImportResult = null; void window.openQAImport({ summaryText: 'SYNTHETIC: confirmação de layout com texto longo, sem dados reais.\nNenhuma escala será ativada neste teste.' }).then(value => { window.qaImportResult = value; }); });
          const modal = page.locator('.cc-import-confirm-dialog'); await modal.waitFor();
          await page.keyboard.press('Tab');
          assert.ok(await modal.evaluate(el => el.contains(document.activeElement)), 'Keyboard focus stays in import confirmation');
          await modal.evaluate(el => { el.scrollTop = el.scrollHeight; });
          assert.deepEqual(await visibleTextBounds(page, '.cc-import-confirm-actions button'), [], 'Modal actions escape their containers');
          if (method === 'escape') await page.keyboard.press('Escape');
          if (method === 'cancel') await page.locator('.cc-import-confirm-cancel').click();
          if (method === 'backdrop') await page.locator('.cc-import-confirm-overlay').click({ position: { x: 1, y: 1 } });
          if (method === 'back') await page.goBack();
          await modal.waitFor({ state: 'detached' });
          await page.waitForFunction(() => window.qaImportResult === false);
          await recovered(page);
        }
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'perdiem' })));
        await page.locator('.cc-per-diem-content').waitFor();
        await page.locator('.cc-per-diem-items > summary').click(); await settle(page);
        const money = await fixtureScope.qaMoney(page);
        assert.deepEqual(money.violations, [], 'Financial amounts stay inside their containers');
        assert.deepEqual(money.intersections, [], 'Financial labels and amounts do not overlap');
        assert.deepEqual(money.splitAmounts, [], 'Keep complete currency amounts and cents together');
        await page.screenshot({ path: path.join(output, `${width}-${theme}-${size}-finance.png`) });
        if (size === 200) {
          // Deterministic inset emulation exercises real footer measurement; this is not a physical-device claim.
          await page.locator('body > nav.cz-bottom-nav').evaluate(el => el.style.setProperty('bottom', '34px', 'important'));
          await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await settle(page);
          await page.evaluate(() => window.scrollTo({ top: document.scrollingElement.scrollHeight, behavior: 'instant' })); await settle(page);
          const clearance = await page.evaluate(() => ({
            last: [...document.querySelectorAll('.cc-per-diem-items .cz-finance-row')].at(-1)?.getBoundingClientRect().bottom,
            nav: document.querySelector('body > nav.cz-bottom-nav').getBoundingClientRect().top,
          }));
          assert.ok(clearance.last && clearance.last <= clearance.nav - 4, 'Last item remains above enlarged navigation with a 34px bottom inset: ' + JSON.stringify(clearance));
          await page.screenshot({ path: path.join(output, `${width}-${theme}-safe-bottom-34.png`) });
          await page.locator('body > nav.cz-bottom-nav').evaluate(el => el.style.removeProperty('bottom'));
          await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await settle(page);
        }
        results.push({ width, theme, size, actualFont, rootFont, alertHeight: alertBounds.height, menuDismissals: menuMethods.length, fullscreenMenu: width < 500, importDismissals: 4 });
        console.log(`PASS ${width}-${theme}-${size}: actual text, preference persistence, menu and import dismissal/scroll recovery`);
      }
      await page.evaluate(() => {
        window.qaFirstImport = null;
        void window.openQAImport({ summaryText: 'SYNTHETIC first pending import' }).then(value => { window.qaFirstImport = value; });
      });
      await page.locator('.cc-import-confirm-dialog').waitFor();
      assert.equal(await page.evaluate(() => window.openQAImport({ summaryText: 'SYNTHETIC duplicate import' })), false, 'A second request cannot orphan the active modal and its body lock');
      assert.equal(await page.locator('.cc-import-confirm-dialog').count(), 1);
      await page.locator('.cc-import-confirm-cancel').click();
      await page.waitForFunction(() => window.qaFirstImport === false);
      await recovered(page);
      const nestedMenuOpener = page.locator('body > nav.cz-bottom-nav > button').last();
      await nestedMenuOpener.click(); await page.locator('.cz-menu-overlay').waitFor();
      await page.evaluate(() => { window.qaNestedImport = null; void window.openQAImport({ summaryText: 'SYNTHETIC nested confirmation' }).then(value => { window.qaNestedImport = value; }); });
      await page.locator('.cc-import-confirm-dialog').waitFor();
      await page.keyboard.press('Tab');
      assert.ok(await page.locator('.cc-import-confirm-dialog').evaluate(el => el.contains(document.activeElement)), 'Nested modal keeps its own keyboard focus');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.qaNestedImport === false);
      await page.locator('.cc-import-confirm-dialog').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.cz-menu-overlay').count(), 1, 'Escape dismisses only the top modal');
      assert.equal(await page.locator('body').evaluate(el => el.style.overflow), 'hidden', 'Parent menu still owns its lock');
      await page.keyboard.press('Escape'); await page.locator('.cz-menu-overlay').waitFor({ state: 'detached' });
      await recovered(page);
      await page.evaluate(() => {
        window.qaReleaseParent = window.acquireQAOverlay(() => {});
        window.qaParentToken = history.state.crewcheckOverlay;
        window.qaReleaseChild = window.acquireQAOverlay(() => {});
        window.qaReleaseChild();
      });
      await page.waitForFunction(() => history.state?.crewcheckOverlay === window.qaParentToken);
      assert.equal(await page.locator('body').evaluate(el => el.style.overflow), 'hidden', 'Closing child overlay keeps the parent lock');
      await page.evaluate(() => window.qaReleaseParent());
      await recovered(page);
      await page.evaluate(() => {
        const originalPush = history.pushState;
        // Exercise the documented fallback where the browser refuses overlay history entries.
        history.pushState = () => { throw new Error('Synthetic history unavailable'); };
        const first = window.acquireQAOverlay(() => {});
        first();
        window.qaRapidRelease = window.acquireQAOverlay(() => {});
        history.pushState = originalPush;
      });
      assert.equal(await page.evaluate(() => history.scrollRestoration), 'manual', 'Rapid reopening retains overlay-owned restoration');
      await page.evaluate(() => window.qaRapidRelease());
      await recovered(page);
      // Preferences must not leak across authenticated accounts, including logout.
      await page.evaluate(() => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'other-synthetic-account', name: 'OTHER', role: 'user' })); window.dispatchEvent(new Event('crewcheck:auth-changed')); });
      await page.waitForFunction(() => document.documentElement.dataset.crewTextSize === '100');
      await context.close();
    }
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ commit: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scope: 'Actual built app for settings/menu; actual prepared import confirmation component with shipped CSS; synthetic accounts; all API/external traffic intercepted', results }, null, 2));
    await browser.close(); await new Promise(resolve => server.close(resolve));
  }
  assert.equal(results.length, widths.length * 6);
})().catch(error => { console.error(error); process.exitCode = 1; });
