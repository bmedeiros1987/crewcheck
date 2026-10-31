const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.MENU_PLAYWRIGHT_PACKAGE || 'package.json'))('playwright');
const target = process.argv[2] || 'candidate', out = path.resolve(process.env.CONTINUITY_EVIDENCE_DIR || 'artifacts/home-crossmonth-continuity');
fs.mkdirSync(out, { recursive: true });
function pdf(month, flights) { const tag = month === 10 ? 'Oct' : 'Nov', last = month === 10 ? 31 : 30; const lines = ['SYNTHETIC CONTINUITY QA', `Tripulante: TESTE SINTETICO BP: 900001 Base: BSB 01/${month}/2026`, 'TESTE SINTETICO | 900001 | A320 | BSB | CCM']; for (let d = 1; d <= last; d++) {
    lines.push(`${String(d).padStart(2, '0')}-${tag}-2026 ${flights[d] ? 'VOO' : 'DO'}`);
    if (flights[d])
        lines.push(`${flights[d]} BSB 08:00 GRU 09:00 OP`);
} const content = lines.map((s, i) => `BT /F1 10 Tf 35 ${800 - i * 19} Td (${s}) Tj ET`).join('\n'); const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`]; let text = '%PDF-1.4\n', offsets = [0]; objects.forEach((s, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${s}\nendobj\n`; }); const start = Buffer.byteLength(text); text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`; const file = out + '/' + month + '.pdf'; fs.writeFileSync(file, text); return file; }
const fixture = { 10: pdf(10, { 30: 'LA8130', 31: 'LA8131' }), 11: pdf(11, { 1: 'LA8201', 2: 'LA8202', 3: 'LA8203' }) };
(async () => {
    const root = path.resolve('dist'), server = http.createServer((req, res) => { const p = new URL(req.url, 'http://local').pathname; const f = p.startsWith('/assets/') ? path.join(root, p) : root + '/index.html'; if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) {
        res.writeHead(404).end();
        return;
    } res.setHeader('content-type', /\.m?js$/.test(f) ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(f)); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch({ headless: true });
    const store = new Map(), requests = [], snapshots = [];
    let active = null;
    try {
        const c = await browser.newContext({ viewport: { width: 1100, height: 900 }, timezoneId: 'UTC', serviceWorkers: 'block' });
        await c.route('**/*', r => {
            const req = r.request(), u = new URL(req.url());
            if (u.origin !== origin)
                return r.abort();
            if (!u.pathname.startsWith('/api/'))
                return r.continue();
            requests.push({ path: u.pathname, method: req.method() });
            if (u.pathname.startsWith('/api/rosters') && req.headers().authorization !== 'Bearer synthetic-local-only')
                return r.fulfill({ status: 401, contentType: 'application/json', body: '{"ok":false}' });
            const reply = body => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
            if (u.pathname === '/api/rosters' && req.method() === 'POST') {
                const body = req.postDataJSON(), roster = body.roster;
                assert.equal(roster.crewId, '900001');
                const id = 'synthetic-' + roster.year + '-' + roster.month;
                for (const item of store.values())
                    item.summary.isActive = false;
                const summary = { id, crewId: roster.crewId, crewName: roster.crewName, month: roster.month, year: roster.year, isActive: true, sourceFileName: body.sourceFileName, createdAt: '2026-10-26T12:00:01Z' };
                store.set(id, { summary, data: { ...body, roster } });
                active = id;
                return reply({ ok: true, roster: summary });
            }
            if (u.pathname === '/api/rosters' && req.method() === 'GET')
                return reply({ ok: true, rosters: [...store.values()].map(s => s.summary) });
            if (u.pathname === '/api/rosters/active' && active)
                return reply({ ok: true, roster: store.get(active).summary, data: store.get(active).data });
            if (u.pathname.startsWith('/api/rosters/') && store.has(u.pathname.split('/').pop())) {
                const s = store.get(u.pathname.split('/').pop());
                return reply({ ok: true, roster: s.summary, data: s.data });
            }
            return r.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"code":"SYNTHETIC_UNRELATED_API_UNAVAILABLE"}' });
        });
        await c.addInitScript(() => { if (!localStorage.getItem('crewcheck_auth_user'))
            localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'continuity-qa', email: 'continuity@example.invalid', name: 'SYNTHETIC QA', role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-local-only'); localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1'); localStorage.setItem('crewcheck_demo_mode_seen', '1'); sessionStorage.setItem('crewcheck_initial_view', 'import'); });
        const p = await c.newPage();
        p.setDefaultTimeout(20000);
        await p.clock.setFixedTime(new Date('2026-10-26T12:00:00Z'));
        await p.goto(origin + '/app?view=roster');
        await p.locator('.cz-app').waitFor();
        async function snapshot(phase) { await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'roster' }))); const details = p.locator('details.cc-roster-view-options'); await details.waitFor(); if (!await details.evaluate(e => e.open))
            await details.locator(':scope > summary').click(); await p.getByRole('combobox', { name: 'Formato da escala', exact: true }).selectOption('aims'); const s = await p.evaluate(() => { const a = JSON.parse(sessionStorage.getItem('crewcheck_roster') || 'null'), h = JSON.parse(localStorage.getItem('crewcheck_local_history_v11_continuity-qa') || '[]'); return { activeMonth: a?.roster?.month, activeDays: a?.roster?.days?.filter(d => d.legs?.length).map(d => ({ date: d.date, codes: d.legs.map(l => l.flightNumber) })), history: h.map(x => ({ month: x.roster?.month, crewId: x.roster?.crewId, dates: x.roster?.days?.filter(d => d.legs?.length).map(d => d.date) })) }; }); s.phase = phase; s.document = await p.locator('.cc-aims-document').innerText(); s.options = await p.getByLabel('Abrir programação publicada', { exact: true }).locator('option').allTextContents(); s.remote = [...store.values()].map(x => ({ month: x.summary.month, active: x.summary.isActive, crewId: x.summary.crewId })); s.visibleOct30 = s.document.includes('LA8130'); s.visibleOct31 = s.document.includes('LA8131'); snapshots.push(s); console.log(JSON.stringify({ phase, activeMonth: s.activeMonth, visibleOct30: s.visibleOct30, visibleOct31: s.visibleOct31, history: s.history.map(x => x.month), remote: s.remote.map(x => x.month) })); await p.screenshot({ path: out + '/' + phase + '.png', fullPage: true }); }
        for (const month of [10, 11]) {
            await p.locator('input[hidden][accept="application/pdf,.pdf"]').setInputFiles(fixture[month]);
            try {
                await p.getByRole('button', { name: 'Ativar escala', exact: true }).click();
            }
            catch (error) {
                fs.writeFileSync(out + '/import-diagnostic.txt', (await p.locator('body').innerText()));
                await p.screenshot({ path: out + '/import-error.png', fullPage: true });
                throw error;
            }
            await p.waitForFunction(() => !document.querySelector('.cc-import-confirm-overlay'));
            await p.waitForFunction(() => document.querySelector('input[accept="application/pdf,.pdf"]')?.value === '');
            await snapshot('after-' + month);
        }
        const consumers = {};
        await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' })));
        await p.waitForTimeout(1500);
        consumers.home = await p.locator('body').innerText();
        await p.getByRole('button', { name: 'sexta-feira, 30 de outubro de 2026', exact: true }).click();
        consumers.homeOct30 = await p.locator('.cc-home-roster-list').innerText();
        await p.getByRole('button', { name: 'sábado, 31 de outubro de 2026', exact: true }).click();
        consumers.homeOct31 = await p.locator('.cc-home-roster-list').innerText();
        assert.match(consumers.homeOct30, /LA8130/, 'HOME must retain October 30 after November activation');
        assert.match(consumers.homeOct31, /LA8131/, 'HOME must retain October 31 after November activation');
        consumers.regulatory = await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('crewcheck_regulatory_history_snapshot_')).map(k => [k, JSON.parse(localStorage.getItem(k))])));
        const regulatory = Object.values(consumers.regulatory).find(v => v.previousRosterId === 'synthetic-2026-10');
        assert.ok(regulatory, 'real regulatory consumer must load authenticated October carry-in');
        assert.equal(regulatory.compliance.metrics.maxFlightHoursRolling28Days, 5);
        assert.equal(regulatory.compliance.metrics.totalFlightHours, 3);
        await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'perdiem' })));
        await p.waitForTimeout(1500);
        consumers.financeInitial = await p.locator('body').innerText();
        await p.getByRole('button', { name: 'Statement', exact: true }).click();
        if (await p.getByLabel('Filtro financeiro', { exact: true }).count()) {
            await p.getByLabel('Filtro financeiro', { exact: true }).selectOption('custom');
            await p.getByLabel('Início financeiro', { exact: true }).fill('2026-10-28');
            await p.getByLabel('Fim financeiro', { exact: true }).fill('2026-11-03');
            await p.waitForTimeout(2000);
            consumers.financeCrossmonth = await p.locator('body').innerText();
            consumers.financeDom = await p.locator('.cc-financial-range').evaluateAll(es => es.map(e => ({ ready: e.getAttribute('data-financial-content-ready'), text: e.innerText })));
            assert.equal(consumers.financeDom[0]?.ready, 'true');
            assert.doesNotMatch(consumers.financeDom[0]?.text || '', /Sem escala|Revisões ambíguas/, 'both periods must be available; no tariff assertion');
        }
        else
            throw new Error('financial controls unavailable');
        await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'salary' })));
        await p.getByRole('button', { name: 'Statement', exact: true }).click();
        await p.getByLabel('Filtro financeiro', { exact: true }).selectOption('custom');
        await p.getByLabel('Início financeiro', { exact: true }).fill('2026-10-28');
        await p.getByLabel('Fim financeiro', { exact: true }).fill('2026-11-03');
        await p.waitForTimeout(2000);
        consumers.salaryCrossmonth = await p.locator('body').innerText();
        for (const flight of ['LA8130', 'LA8131', 'LA8201', 'LA8202', 'LA8203'])
            assert.ok(consumers.salaryCrossmonth.includes(flight), `salary rows must retain ${flight} in the requested range`);
        // Reimport only October with an identifiable correction; November must survive.
        await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' })));
        await p.clock.setFixedTime(new Date('2026-10-26T12:00:10Z'));
        const corrected = pdf(10, { 30: 'LA8139', 31: 'LA8131' });
        await p.locator('input[hidden][accept="application/pdf,.pdf"]').setInputFiles(corrected);
        await p.getByRole('button', { name: 'Ativar escala', exact: true }).click();
        await p.waitForFunction(() => !document.querySelector('.cc-import-confirm-overlay'));
        await p.waitForTimeout(1000);
        assert.equal(store.size, 2, 'reimport must not delete the adjacent competence');
        assert.ok(JSON.stringify(store.get('synthetic-2026-11')).includes('LA8201'));
        consumers.retainedLocalVersions = await p.evaluate(() => JSON.parse(localStorage.getItem('crewcheck_local_history_v11_continuity-qa') || '[]'));
        fs.writeFileSync(out + '/version-retention.json', JSON.stringify(await p.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => /history|publication/.test(k)).map(k => [k, JSON.parse(localStorage.getItem(k))]))), null, 2));
        // The inventory stores the latest roster per competence; publication review
        // separately retains observed facts and versions. Neither is a PDF archive.
        consumers.publicationReview = await p.evaluate(() => JSON.parse(localStorage.getItem('crewcheck:publication-review:v1:continuity-qa')));
        assert.equal(consumers.publicationReview.version, 3);
        assert.ok(consumers.publicationReview.baseline.items.some(item => item.code === 'LA8130'), 'previously observed flight must remain in the owner review baseline');
        assert.ok(consumers.publicationReview.publication.items.some(item => item.code === 'LA8139'), 'new version must contain the correction');
        assert.ok(JSON.stringify(consumers.retainedLocalVersions).includes('LA8139'), 'corrected October publication must be retained');
        await p.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
        await p.reload();
        await p.locator('.cz-app').waitFor();
        await p.waitForTimeout(1500);
        await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' })));
        assert.match(await p.locator('.cc-home-roster-list').innerText(), /LA8131/, 'October 31 remains the relevant day at the month boundary');
        await p.getByRole('button', { name: 'Sete dias anteriores', exact: true }).click();
        await p.getByRole('button', { name: 'sexta-feira, 30 de outubro de 2026', exact: true }).click();
        await p.waitForTimeout(1000);
        consumers.afterReload = await p.locator('.cc-home-roster-list').innerText();
        assert.match(consumers.afterReload, /LA8139/);
        assert.doesNotMatch(consumers.afterReload, /LA8130/, 'replaced flight must not duplicate');
        await p.getByRole('button', { name: 'Próximos sete dias', exact: true }).click();
        await p.getByRole('button', { name: 'domingo, 1 de novembro de 2026', exact: true }).click();
        consumers.novemberPreserved = await p.locator('.cc-home-roster-list').innerText();
        assert.match(consumers.novemberPreserved, /LA8201/);
        // Owner B has no rosters; the synthetic API must not return A's data to B.
        await p.evaluate(() => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'continuity-other', email: 'other@example.invalid', role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-other'); window.dispatchEvent(new StorageEvent('storage', { key: 'crewcheck_auth_user' })); });
        await p.waitForTimeout(1500);
        consumers.otherOwner = await p.locator('body').innerText();
        assert.doesNotMatch(consumers.otherOwner, /LA8139|LA8131|LA8201/);
        const denied = await p.evaluate(async () => { const r = await fetch('/api/rosters?manager=1', { headers: { authorization: 'Bearer synthetic-other' } }); return { status: r.status, body: await r.text() }; });
        assert.equal(denied.status, 401);
        assert.doesNotMatch(denied.body, /LA813|LA820|synthetic-2026/);
        assert.equal(requests.filter(x => x.method === 'DELETE').length, 0, 'consumer lookups must not delete history');
        fs.writeFileSync(out + '/consumers.json', JSON.stringify(consumers, null, 2));
        fs.writeFileSync(out + '/results.json', JSON.stringify({ target, clocks: ['2026-10-26T12:00:00Z', '2026-10-26T12:00:10Z', '2026-10-31T12:00:00Z'], transport: 'synthetic roster endpoints available, unrelated APIs503; no real DB', snapshots, requests, deletes: requests.filter(x => x.method === 'DELETE') }, null, 2));
        await c.close();
    }
    finally {
        await browser.close();
        await new Promise(r => server.close(r));
    }
})().catch(e => { fs.writeFileSync(out + '/error.txt', e.stack); console.error(e.stack); process.exitCode = 1; });
