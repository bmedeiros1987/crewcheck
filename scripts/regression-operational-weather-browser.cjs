const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), http = require('node:http'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { createRequire } = require('node:module'), ts = require('typescript');
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || __filename)('playwright');
const out = path.resolve(process.env.WEATHER_FLIGHT_EVIDENCE_DIR || 'artifacts/weather-flight');
fs.mkdirSync(out, { recursive: true });
const serverSource = fs.readFileSync('server.mjs', 'utf8'), serverAst = ts.createSourceFile('server.mjs', serverSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const handler = serverAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'serveStatic');
const ctx = vm.createContext({ fs, path, Buffer, distDir: path.resolve('dist'), sendJson: (r, s, b) => { r.writeHead(s); r.end(JSON.stringify(b)); } });
vm.runInContext(handler.getText(serverAst) + ';globalThis.respond=serveStatic', ctx);
const server = http.createServer((q, r) => ctx.respond(q, r, new URL(q.url, 'http://localhost')));
const finance = fs.readFileSync('scripts/regression-financial-ui-browser.cjs', 'utf8'), tree = ts.createSourceFile('finance.cjs', finance, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const seed = tree.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'seed');
const fixture = vm.createContext({});
vm.runInContext(seed.getText(tree) + ';globalThis.seed=seed', fixture);
const roster = { crewName: 'SYNTHETIC WEATHER QA', crewId: '900001', base: 'BSB', rank: 'CC', airline: 'LA', month: 10, year: 2032, rawText: 'SYNTHETIC ONLY', days: [{ date: '20/10/2032', dayOfWeek: 'SYN', type: 'FLIGHT', pairingCode: 'QA', dutyReport: '11:00', dutyDebrief: '14:00', dutyReportSource: 'published', dutyDebriefSource: 'published', legs: [{ flightNumber: 'QA4527', origin: 'BSB', destination: 'CGH', departureTime: '12:00', arrivalTime: '13:30', presentationTime: '11:00', duration: 1.5, workType: 'OP', aircraftType: 'SYNTHETIC' }], dutyHours: 3, flyingHours: 1.5, isNextDay: false, hotel: null, base: 'BSB', rawText: 'SYNTHETIC ONLY' }] };
function packet(now, stale = false) { const observed = stale ? '2032-10-19T12:00:00Z' : now; const d = new Date(observed), group = [d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()].map(v => String(v).padStart(2, '0')).join(''); return { ok: true, stations: Object.fromEntries([['BSB', 'SBBR'], ['CGH', 'SBSP']].map(([airport, icao]) => [airport, { airport, icao, ok: true, metar: `METAR ${icao} ${group}Z 09015KT 3000 TSRA BKN008`, taf: `TAF ${icao} ${group}Z 2012/2112 3000 TSRA`, metarDecoded: ['Synthetic observation'], tafDecoded: ['Synthetic validity only'], source: { metar: 'Synthetic official fixture', taf: 'Synthetic forecast fixture' }, provider: { metar: 'redemet', taf: 'redemet' }, official: { metar: true, taf: true }, available: { metar: true, taf: true }, observedAt: { metar: observed }, cache: { metar: 'hit' }, monitoring: { severity: 2, hazards: [{ code: 'synthetic', label: 'SYNTHETIC WEATHER ONLY' }] } }])) }; }
(async () => {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`, browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
    const results = [];
    try {
        for (const timezoneId of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland'])
            for (const spec of [{ name: 'distant', now: '2032-10-12T15:00:00Z', calls: 0, notice: false, manual: true }, { name: 'origin-window', now: '2032-10-20T12:00:00Z', calls: 1, notice: true }, { name: 'expired-observation', now: '2032-10-20T12:00:00Z', calls: 1, notice: false, stale: true }, { name: 'expired-flight', now: '2032-10-20T17:16:00Z', calls: 0, notice: false },
                ...[
                    ['overnight-departure-tight','23:00(+1)','02:00','2032-10-21T01:00:00Z','BSB'],
                    ['overnight-departure-spaced','23:00 (+1)','02:00','2032-10-21T01:00:00Z','BSB'],
                    ['overnight-arrival-tight','23:00','02:00(+1)','2032-10-21T01:00:00Z','BSB'],
                    ['overnight-arrival-spaced','23:00','02:00 (+1)','2032-10-21T01:00:00Z','BSB'],
                    ['overnight-destination-tight','23:00(+1)','02:00(+1)','2032-10-21T03:00:00Z','CGH'],
                    ['overnight-destination-spaced','23:00 (+1)','02:00 (+1)','2032-10-21T03:00:00Z','CGH']
                ].map(([name,departure,arrival,now,airport])=>({name,departure,arrival,now,airport,calls:1,notice:true}))]) {
                const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId, serviceWorkers: 'block' });
                let weatherCalls = 0, blocked = 0;
                const queries = [];
                await context.route('**/*', r => { const u = new URL(r.request().url()); if (u.origin !== origin) {
                    blocked++;
                    return r.abort();
                } if (u.pathname === '/api/aviation-weather') {
                    weatherCalls++;
                    queries.push(u.search);
                    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(packet(spec.now, spec.stale)) });
                } if (u.pathname.startsWith('/api/'))
                    return r.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false,"items":[],"data":[],"enabled":false}' }); return r.request().method() === 'GET' ? r.continue() : r.abort(); });
                const fixtureRoster=JSON.parse(JSON.stringify(roster));
                if(spec.departure){Object.assign(fixtureRoster.days[0],{dutyReport:'22:00',dutyDebrief:'03:00',dutyHours:5,flyingHours:3});Object.assign(fixtureRoster.days[0].legs[0],{departureTime:spec.departure,arrivalTime:spec.arrival,presentationTime:'22:00',duration:3});}
                await context.addInitScript(fixture.seed, { theme: 'light', kind: fixtureRoster, amount: 0 });
                await context.addInitScript(now => { const Native = Date, clock = Date.parse(now); globalThis.Date = class extends Native {
                    constructor(...a) { super(...(a.length ? a : [clock])); }
                    static now() { return clock; }
                }; localStorage.setItem('crewcheck_language', 'pt'); localStorage.setItem('crewcheck:notification-preferences:v1:financial-ui-qa', JSON.stringify({ ownerId: 'financial-ui-qa', revision: 1, preferences: { settings: { crewcheck_pulse_enabled: true, crewcheck_device_notifications_enabled: false } } })); Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: () => { } }, configurable: true }); window.__qaWeatherTitles = []; window.__qaNotificationCalls = 0; globalThis.Notification = class { static permission = 'denied'; constructor() { window.__qaNotificationCalls++; } static requestPermission() { window.__qaNotificationCalls++; return Promise.resolve('denied'); } }; new MutationObserver(() => { for (const e of document.querySelectorAll('.cc-pulse-compact-trigger strong'))
                    if (/Meteorologia/.test(e.textContent))
                        window.__qaWeatherTitles.push(e.textContent); }).observe(document, { childList: true, subtree: true }); }, spec.now);
                const page = await context.newPage();
                await page.goto(origin + '/app');
                await page.locator('.cz-app').waitFor();
                await page.waitForTimeout(900);
                assert.equal(weatherCalls, spec.calls, `${timezoneId}/${spec.name}: automatic requests`);
                if(spec.airport)assert.ok(queries[0].includes('airports='+spec.airport+'&'), 'actual overnight role targets the correct airport on the next UTC day');
                const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('crewcheck_weather_pulse_signature_')));
                assert.equal(keys.length, spec.notice ? 1 : 0, `${spec.name}: only eligible fresh observations reach publication`);
                // A higher-priority synthetic roster warning may precede weather in the real FIFO.
                // Dismiss only unrelated fixture notices through the existing UI, then require the actual weather title.
                let unrelatedDismissed = 0;
                if (spec.notice) for (let i = 0; i < 8 && !(await page.evaluate(() => window.__qaWeatherTitles.length)); i++) {
                    const details = page.locator('.cc-pulse-compact-details');
                    if (!await details.count()) break;
                    await details.click();
                    await page.locator('.cc-pulse-dismiss').click();
                    unrelatedDismissed++;
                    await page.waitForTimeout(220);
                }
                const titles = await page.evaluate(() => window.__qaWeatherTitles);
                assert.equal(titles.length > 0, spec.notice, `${spec.name}: actual Pulse title visibility`);
                if (spec.manual) {
                    await page.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'weather' })));
                    await page.locator('.cc-weather-station').first().waitFor();
                    assert.match(await page.locator('.cc-weather-flight-window').innerText(), /não confirmam o tempo para a data do voo/);
                    assert.equal(weatherCalls, 1, 'manual current reports remain accessible');
                }
                assert.equal(await page.evaluate(() => window.__qaNotificationCalls), 0, 'No real or simulated device notification requested');
                results.push({ timezoneId, name: spec.name, automaticRequests: spec.calls, totalRequests: weatherCalls, queries, weatherSignatureCount: keys.length, unrelatedSyntheticNoticesDismissed: unrelatedDismissed, pulseWeatherObserved: titles.length > 0, manualFutureReadAvailable: !!spec.manual, blockedExternalRequests: blocked, realProviderCalls: 0, realNotifications: 0 });
                await context.close();
                console.log('PASS compiled operational weather', timezoneId, spec.name);
            }
        const head = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
        const bundles = {};
        function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory())
                walk(p);
            else
                bundles[p] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
        } }
        walk('dist');
        assert(Object.keys(bundles).filter(p => p.endsWith('.js')).some(p => fs.readFileSync(p, 'utf8').includes(head)), 'compiled bundles embed exact tested HEAD');
        fs.writeFileSync(path.join(out, 'compiled-report.json'), JSON.stringify({ head, bundles, results, scope: 'Actual compiled Home/Pulse and manual WeatherView; synthetic roster/clock/API only; all third-party traffic blocked; no physical device' }, null, 2));
    }
    finally {
        await browser.close();
        server.close();
    }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
