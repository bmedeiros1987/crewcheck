const { createRequire } = require('node:module');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const phase = process.argv[2] || 'after', out = path.resolve(process.env.PUBLICATION_EVIDENCE_DIR || 'artifacts/publication-import-flow');
fs.mkdirSync(out, { recursive: true });
let origin;
const dist = path.resolve('dist');
const server = http.createServer((req, res) => { const pathname = new URL(req.url, 'http://localhost').pathname; const file = pathname.startsWith('/assets/') ? path.join(dist, pathname) : path.join(dist, 'index.html'); if (!file.startsWith(dist + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404).end();
    return;
} res.setHeader('Content-Type', (/\.m?js$/.test(file)) ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html'); res.end(fs.readFileSync(file)); });
// Real PDF bytes; PDF.js and the production import confirmation remain unmodified.
function syntheticPDF(name, codes, partial = false) {
    const lines = ['SYNTHETIC QA ROSTER', 'Tripulante: TESTE SINTETICO BP: 900001 Base: BSB 01/10/2026'];
    for (let day = 1; day <= 31; day++) {
        if (partial && day !== 10)
            continue;
        if (day === 10) {
            lines.push('10-Oct-2026 VOO');
            codes.forEach((code, i) => lines.push(`${code} BSB ${String(8 + i * 3).padStart(2, '0')}:00 GRU ${String(9 + i * 3).padStart(2, '0')}:00 OP`));
        }
        else
            lines.push(`${String(day).padStart(2, '0')}-Oct-2026 DO`);
    }
    const content = lines.map((line, i) => `BT /F1 10 Tf 35 ${800 - i * 19} Td (${line}) Tj ET`).join('\n');
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const start = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
    fs.writeFileSync(path.join(out, name + '.pdf'), pdf);
}
syntheticPDF('first', ['LA1234', 'LA1235']);
syntheticPDF('added', ['LA1234', 'LA1235', 'LA1236']);
syntheticPDF('removed', ['LA1234']);
syntheticPDF('partial', ['LA1234'], true);
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + server.address().port;
    const b = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] });
    const results = [];
    try {
        const c = await b.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
        const requests = [];
        let remotePayload = null, activeRequests = 0;
        const parsedRosters = {};
        await c.route('**/*', r => { const u = new URL(r.request().url()); if (u.origin !== origin)
            return r.abort(); if (u.pathname.startsWith('/api/')) {
            requests.push(u.pathname);
            if (u.pathname === '/api/rosters/active' && remotePayload) {
                activeRequests++;
                return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(remotePayload) });
            }
            return r.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"items":[],"data":[],"enabled":false}' });
        } return r.continue(); });
        await c.addInitScript(() => { if (!localStorage.getItem('crewcheck_auth_user'))
            localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'publication-QA-A', name: 'TESTE SINTETICO', role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-not-valid-outside-local-QA'); localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1'); localStorage.setItem('crewcheck_demo_mode_seen', '1'); sessionStorage.setItem('crewcheck_demo_active', '1'); sessionStorage.setItem('crewcheck_initial_view', 'import'); });
        const p = await c.newPage();
        p.setDefaultTimeout(15000);
        const errors = [];
        p.on('pageerror', e => errors.push(e.message));
        await p.goto(origin + '/app');
        const read = () => p.evaluate(() => { const u = JSON.parse(localStorage.getItem('crewcheck_auth_user')); return JSON.parse(localStorage.getItem('crewcheck:publication-review:v1:' + u.id) || 'null'); });
        const ui = async () => { await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'roster' }))); await p.getByRole('combobox', { name: 'Formato da escala', exact: true }).selectOption('aims'); await p.locator('.cc-publication-history').waitFor(); const disclosure = p.locator('.cc-publication-history details'); if (await disclosure.count() && !(await disclosure.evaluate(e => e.open)))
            await disclosure.locator('summary').click(); return p.locator('.cc-publication-history').innerText(); };
        const imported = async (name) => { await p.locator('input[accept="application/pdf,.pdf"]').setInputFiles(out + '/' + name + '.pdf'); await p.getByRole('button', { name: 'Ativar escala', exact: true }).click().catch(async error => { console.error((await p.locator('body').innerText()).slice(-2000)); throw error; }); await p.waitForFunction(() => !document.querySelector('.cc-import-confirm-overlay')); await p.waitForFunction(() => document.querySelector('input[accept="application/pdf,.pdf"]')?.value === ''); const s = await read(); console.log('Imported',name,'version',s?.version); parsedRosters[name] = await p.evaluate(() => JSON.parse(sessionStorage.getItem('crewcheck_roster')).roster); const text = await ui(); results.push({ name, version: s.version, coverage: s.publication.completeDates, flights: s.publication.items.filter(x => x.kind === 'FLIGHT').map(x => x.code), history: s.history, unconfirmed: s.unconfirmed, unknown: s.unknown, ui: text }); return s; };
        let s = await imported('first');
        assert.equal(s.version, 1);
        assert.equal(s.history.length, 0);
        assert.equal(s.publication.items.filter(x => x.kind === 'FLIGHT').length, 2);
        assert.deepEqual(s.publication.completeDates, []);
        const initial = JSON.stringify(s);
        s = await imported('first');
        assert.equal(JSON.stringify(s), initial);
        s = await imported('added');
        assert.equal(s.version, 2);
        assert.equal(s.history.length, 0);
        assert.equal(s.unknown, true);
        assert.equal(s.publication.items.filter(x => x.kind === 'FLIGHT').length, 3);
        if (phase === 'after') {
            assert.equal(s.unconfirmed.filter(x => x.kind === 'newly-observed' && x.item.code === 'LA1236').length, 1);
            assert.match(results.at(-1).ui, /LA1236/);
            assert.match(results.at(-1).ui, /inclusão não confirmada/);
        }
        s = await imported('removed');
        assert.equal(s.history.length, 0);
        if (phase === 'after') {
            assert.equal(s.unconfirmed.filter(x => x.kind === 'not-observed' && x.item.kind === 'FLIGHT').length, 2);
            assert.match(results.at(-1).ui, /remoção não confirmada/);
        }
        s = await imported('partial');
        assert.equal(s.history.length, 0);
        assert.ok(s.baseline.items.some(x => x.date === '2026-10-31'));
        assert.deepEqual(s.publication.completeDates, []);
        if (phase === 'after')
            assert.ok(s.unconfirmed.some(x => x.item.date === '2026-10-31'));
        const stable = JSON.stringify(s);
        await p.getByRole('combobox', { name: 'Formato da escala', exact: true }).selectOption('cards');
        await ui();
        assert.equal(JSON.stringify(await read()), stable);
        await p.reload();
        await ui();
        assert.equal(JSON.stringify(await read()), stable);
        results.push({ name: 'selection-reload', unchanged: true });
        const a = await read();
        await p.evaluate(() => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'publication-QA-B', name: 'OUTRA CONTA', role: 'user' })); window.dispatchEvent(new StorageEvent('storage', { key: 'crewcheck_auth_user' })); });
        assert.equal(await read(), null);
        if (await p.locator('.cc-publication-history').count())
            assert.doesNotMatch(await p.locator('.cc-publication-history').innerText(), /LA1236/);
        s = await imported('partial');
        assert.equal(s.version, 1);
        assert.equal(s.history.length, 0);
        const savedA = await p.evaluate(() => JSON.parse(localStorage.getItem('crewcheck:publication-review:v1:publication-QA-A')));
        assert.deepEqual(savedA, a);
        results.push({ name: 'multiple-accounts', isolated: true });
        // Exercise authenticated active-roster refresh with a body produced by the real PDF import.
        remotePayload = { ok: true, roster: { id: 'synthetic-remote-publication', month: 10, year: 2026, isActive: true }, data: { roster: structuredClone(parsedRosters.first), compliance: null, gym: [] } };
        console.log('Starting authenticated refresh',s.version);
        const previousVersion = s.version;
        await p.evaluate(() => window.dispatchEvent(new Event('focus')));
        await p.waitForFunction(v => JSON.parse(localStorage.getItem('crewcheck:publication-review:v1:publication-QA-B'))?.version > v, previousVersion);
        s = await read();
        assert.equal(s.history.length, 0);
        assert.deepEqual(s.publication.completeDates, []);
        assert.ok(activeRequests > 0);
        if (phase === 'after')
            assert.ok(s.unconfirmed.length > 0);
        results.push({ name: 'authenticated-refresh-full-without-attestation', version: s.version, unknown: s.unknown });
        remotePayload.data.roster.days.find(d => d.legs.length).legs[0].departureTime = '08:10';
        console.log('Starting changed authenticated refresh',s.version);
        const beforeChanged = s.version;
        for (let attempt=0; attempt<30 && (await read()).version===beforeChanged; attempt++) {
            await p.evaluate(() => window.dispatchEvent(new Event('focus')));
            await p.waitForTimeout(100);
        }
        assert.ok((await read()).version > beforeChanged, 'Changed authenticated response must reach producer');
        s = await read();
        assert.ok(s.history.some(x => x.kind === 'changed' && x.after.code === 'LA1234'));
        assert.ok(!s.history.some(x => x.kind === 'removed' || x.kind === 'added'));
        const changedText = await ui();
        assert.match(changedText, /Não vista/);
        results.push({ name: 'new-version-known-flight-change', history: s.history, unknown: s.unknown, ui: changedText });
        const unchangedVersion = s.version;
        const priorRequests = activeRequests;
        await p.evaluate(() => window.dispatchEvent(new Event('focus')));
        await p.waitForFunction(() => true);
        for (let i = 0; i < 40 && activeRequests === priorRequests; i++)
            await p.waitForTimeout(50);
        assert.ok(activeRequests > priorRequests);
        await p.waitForTimeout(100);
        assert.equal((await read()).version, unchangedVersion);
        results.push({ name: 'identical-authenticated-refresh', unchanged: true });
        assert.ok(!requests.includes('/api/parse-pdf'), 'PDF must be parsed locally, not fallback');
        assert.deepEqual(errors, []);
        await p.screenshot({ path: out + '/' + phase + '-final.png' });
        fs.writeFileSync(out + '/' + phase + '-import-flow.json', JSON.stringify({ phase, results, realAPIRequests: 0, interceptedAPIRequests: requests, errors }, null, 2));
        console.log('PASS real PDF import → confirmation → canonical events → runtime → storage → AIMS/history; ' + phase);
    }
    finally {
        await b.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(e => { console.error(e); process.exit(1); });
