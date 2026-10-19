// Real prepared app and built CSS in Chromium. Local synthetic account/API only;
// all external requests blocked. Text size uses the existing saved preference.
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http'), assert = require('assert/strict'), { createRequire } = require('module');
const root = path.resolve(process.env.FUNCTIONAL_CSS_ROOT || process.cwd()), req = createRequire(root + '/package.json'), ts = req('typescript'), { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const out = path.resolve(process.env.FUNCTIONAL_CSS_OUTPUT || 'artifacts/functional-css');
fs.mkdirSync(out, { recursive: true });
const source = fs.readFileSync(root + '/server.mjs', 'utf8'), ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'serveStatic');
const ctx = vm.createContext({guardStaticHtml: require('../server/static-html-guard.mjs').guardStaticHtml, fs, path, Buffer, distDir: root + '/dist', sendJson: (r, s, b) => { r.writeHead(s); r.end(JSON.stringify(b)); } });
vm.runInContext(fn.getText(ast) + ';globalThis.respond=serveStatic', ctx);
const server = http.createServer((q, r) => ctx.respond(q, r, new URL(q.url, 'http://localhost')));
const finance = fs.readFileSync(root + '/scripts/regression-financial-ui-browser.cjs', 'utf8'), a = ts.createSourceFile('finance.cjs', finance, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const seed = a.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'seed');
const f = vm.createContext({});
vm.runInContext(seed.getText(a) + ';globalThis.seedFixture=seed', f);
const roster = { year: 2032, month: 10, base: 'BSB', rank: 'CC', airline: 'LA', crewName: 'SYNTHETIC', days: [{ date: '11/10/2032', year: 2032, month: 10, type: 'VOO', pairingCode: 'QA', base: 'BSB', dutyReport: '23:00', dutyDebrief: '02:30', dutyReportSource: 'published', dutyDebriefSource: 'published', legs: [{ flightNumber: 'QA3377', origin: 'GRU', destination: 'REC', departureTime: '23:50', arrivalTime: '02:00', duration: 2 + 10 / 60, presentationTime: '23:00', workType: 'OP', aircraftType: 'SYNTHETIC' }], rawText: 'SYNTHETIC ONLY' }] };
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; for (const a of document.getAnimations())
    if (Number.isFinite(a.effect?.getComputedTiming().endTime))
        try {
            a.finish();
        }
        catch { } await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }); }
(async () => {
    const crypto=require('crypto'),{execFileSync}=require('child_process');
    const artifactPaths=['client/src/pages/Home.tsx','client/src/components/nextflight/ManualGateEditor.tsx',...fs.readdirSync(root+'/dist/assets').filter(n=>n.endsWith('.css')).map(n=>'dist/assets/'+n)];
    const artifacts=Object.fromEntries(artifactPaths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(root+'/'+p)).digest('hex')]));
    fs.writeFileSync(out+'/'+(process.env.FUNCTIONAL_CSS_PHASE||'after')+'-artifacts.json',JSON.stringify({head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),artifacts},null,2));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium' }), results = [];
    const phase = process.env.FUNCTIONAL_CSS_PHASE || 'after';
    try {
        for (const width of [320, 360, 390])
            for (const theme of ['light', 'dark'])
                for (const size of [100, 150, 200]) {
                    const c = await browser.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' });
                    await c.addInitScript(f.seedFixture, { theme, kind: roster, amount: 0 });
                    await c.addInitScript(size => { sessionStorage.setItem('crewcheck_initial_view', 'import'); localStorage.setItem('crewcheck:text-size:v1:financial-ui-qa', String(size)); const D = Date; globalThis.Date = class extends D {
                        constructor(...a) { super(...(a.length ? a : ['2032-10-11T20:00:00Z'])); }
                        static now() { return D.parse('2032-10-11T20:00:00Z'); }
                    }; }, size);
                    await c.route('**/*', r => { const u = new URL(r.request().url()); if (u.origin !== origin)
                        return r.abort(); if (u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/telegram/'))
                        return r.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }); if (u.pathname.startsWith('/api/'))
                        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, linked: true, hasRoster: true, reply: 'RESPOSTA SINTÉTICA. ' + ('O voo e a apresentação devem ser confirmados na programação operacional. '.repeat(18)) + ' FIM DA RESPOSTA.', preferences: { mode: 'formal', voiceProfile: 'default' } }) }); return r.request().method() === 'GET' ? r.continue() : r.abort(); });
                    const page = await c.newPage();
                    await page.goto(origin + '/app');
                    await page.locator('.cz-app').waitFor();
                    await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'import' })));
                    await page.getByRole('button', { name: 'Importar pelo Telegram', exact: true }).click();
                    await page.locator('.cc-concierge-preferences').waitFor().catch(async (e) => { await page.screenshot({ path: out + '/error.png' }); console.log((await page.locator('body').innerText()).slice(-2000)); throw e; });
                    await page.locator('textarea.cz-update-textarea').fill('Pergunta sintética');
                    await page.getByRole('button', { name: 'Consultar', exact: true }).click();
                    const answer = page.locator('.cz-roster-copy').filter({ hasText: 'FIM DA RESPOSTA.' });
                    await answer.waitFor();
                    await settle(page);
                    const name = `${phase}-${width}-${theme}-${size}`, failures = [];
                    assert.equal(await page.locator('html').getAttribute('data-crew-theme'), theme);
                    assert.equal(await page.locator('html').getAttribute('data-crew-text-size'), String(size));
                    async function record(label, fn) { try {
                        await fn();
                    }
                    catch (e) {
                        failures.push(label + ': ' + e.message);
                    } }
                    await record('complete response/privacy', async () => { const issues = await page.locator('.cz-roster-copy').evaluateAll(es => { const bad = []; for (const e of es) {
                        for (const p of e.querySelectorAll('h3,p,small')) {
                            const st = getComputedStyle(p);
                            if (st.webkitLineClamp !== 'none' && st.webkitLineClamp !== 'unset' && st.webkitLineClamp !== '0')
                                bad.push('clamp ' + st.webkitLineClamp);
                            if (p.scrollHeight > p.clientHeight + 2)
                                bad.push('height clipped');
                        }
                        const b = e.getBoundingClientRect();
                        for (const p of e.querySelectorAll('p'))
                            if (p.getBoundingClientRect().bottom > b.bottom + 2)
                                bad.push('text escapes parent');
                    } const privacy = Array.from(document.querySelectorAll('.cz-roster-card')).find(e => e.textContent.includes('Privacidade operacional')); const strip = privacy?.querySelector('.cz-routine-strip'), main = privacy?.querySelector('.cz-roster-main'); if (strip && main && strip.getBoundingClientRect().top < main.getBoundingClientRect().bottom)
                        bad.push('privacy overlap'); return bad; }); assert.deepEqual(issues, []); });
                    const formal = page.getByRole('button', { name: 'Formal (profissional)', exact: true });
                    await formal.click();
                    await page.waitForFunction(()=>document.querySelector('.cc-concierge-preferences button')?.classList.contains('primary'));
                    await formal.hover();
                    await formal.focus();
                    await page.keyboard.press('Tab');
                    await page.keyboard.press('Shift+Tab');
                    await settle(page);
                    async function buttonBounds(locator) { return locator.evaluate(e => { const b = e.getBoundingClientRect(), fail = []; if (b.height < 44 || b.width < 44)
                        fail.push('target under44'); for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
                        const s = getComputedStyle(p), r = p.getBoundingClientRect();
                        if (/hidden|clip/.test(s.overflowX) && (b.left - 3 < r.left || b.right + 3 > r.right))
                            fail.push('horizontal focus clipped ' + p.className);
                        if (/hidden|clip/.test(s.overflowY) && (b.top - 3 < r.top || b.bottom + 3 > r.bottom))
                            fail.push('vertical focus clipped ' + p.className);
                    } if (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2)
                        fail.push('button text clipped'); return fail; }); }
                    await record('Formal hover/focus', async () => assert.deepEqual(await buttonBounds(formal), []));
                    await page.screenshot({ path: out + '/' + name + '-formal.png' });
                    await answer.scrollIntoViewIfNeeded();
                    await page.screenshot({ path: out + '/' + name + '-answer.png' });
                    await page.locator('.cz-roster-copy').filter({hasText:'Privacidade operacional'}).scrollIntoViewIfNeeded();
                    await settle(page);
                    await page.screenshot({path:out+'/'+name+'-privacy.png'});
                    await page.evaluate(() => window.scrollTo(0,document.documentElement.scrollHeight));
                    await settle(page);
                    await record('privacy footer reachability',async()=>assert(await page.evaluate(()=>{
                        const card=Array.from(document.querySelectorAll('.cz-roster-card')).find(e=>e.textContent.includes('Privacidade operacional'));
                        return card.getBoundingClientRect().bottom<=document.querySelector('body>nav.cz-bottom-nav').getBoundingClientRect().top-4;
                    })));
                    await page.screenshot({path:out+'/'+name+'-privacy-end.png'});
                    await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'radar' })));
                    const gate = page.locator('.cc-manual-gate');
                    await gate.waitFor();
                    await gate.getByLabel('Portão de embarque', { exact: true }).fill('24');
                    await gate.getByRole('button', { name: 'Salvar portão', exact: true }).click();
                    await gate.getByRole('button', { name: 'Remover', exact: true }).waitFor();
                    assert.match(await gate.locator('[role=status]').innerText(), /salvo/);
                    const save = gate.getByRole('button', { name: 'Salvar portão', exact: true });
                    await save.hover();
                    await save.focus();
                    await page.keyboard.press('Tab');
                    await page.keyboard.press('Shift+Tab');
                    await settle(page);
                    await record('Save hover/focus', async () => assert.deepEqual(await buttonBounds(save), []));
                    await page.screenshot({ path: out + '/' + name + '-gate.png' });
                    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
                    await settle(page);
                    await record('footer reachability', async () => { const m = await page.evaluate(() => { const b = document.querySelector('.cc-manual-gate button[type=button]').getBoundingClientRect(), s = document.querySelector('.cc-manual-gate-status').getBoundingClientRect(), n = document.querySelector('body>nav.cz-bottom-nav').getBoundingClientRect(); return { button: b.bottom, status: s.bottom, footer: n.top }; }); assert(m.button <= m.footer - 4 && m.status <= m.footer - 4, JSON.stringify(m)); });
                    await page.screenshot({ path: out + '/' + name + '-gate-end.png' });
                    await gate.getByRole('button', { name: 'Remover', exact: true }).click();
                    assert.match(await gate.locator('[role=status]').innerText(), /removido/);
                    await record('no horizontal overflow', async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)));
                    results.push({ width, theme, size, failures, synthetic: true });
                    console.log(name, JSON.stringify(failures));
                    await c.close();
                }
        fs.writeFileSync(out + '/' + phase + '-results.json', JSON.stringify(results, null, 2));
        if (phase === 'after')
            assert(results.every(r => !r.failures.length), 'layout failures');
    }
    finally {
        await browser.close();
        await new Promise(r => server.close(r));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
