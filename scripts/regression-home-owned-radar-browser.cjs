const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { chromium } = createRequire(path.resolve(process.env.MENU_PLAYWRIGHT_PACKAGE || 'package.json'))('playwright');
const {spawnSync}=require('node:child_process');
if(process.argv[2]!=='--worker'){
 const results=[];for(const [zone,mutation]of [...['UTC','America/Sao_Paulo','Pacific/Auckland'].map(z=>[z,'']),...['gate','date','provider'].map(m=>['UTC',m])]){
  const evidence=path.resolve(process.env.OWNED_RADAR_EVIDENCE_DIR||'artifacts/home-owned-radar',zone.replaceAll('/','_')+(mutation?'-mutant-'+mutation:''));
  const child=spawnSync(process.execPath,[__filename,'--worker'],{cwd:process.cwd(),encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024,env:{...process.env,OWNED_RADAR_ZONE:zone,OWNED_RADAR_MUTATION:mutation,CONTINUITY_EVIDENCE_DIR:evidence}});
  const text=(child.stdout||'')+(child.stderr||'');fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'run.log'),text);
  const passed=mutation?child.status!==0&&/ORACLE_(GATE|OCCURRENCE|PROVIDER)/.test(text):child.status===0;
  results.push({zone,mutation:mutation||null,exit:child.status,signal:child.signal,passed});
  assert(passed,JSON.stringify(results.at(-1))+'\n'+text);console.log('PASS owned Radar '+zone+' '+(mutation?'mutant rejected:'+mutation:'positive'));
 }
 const report=path.resolve(process.env.OWNED_RADAR_EVIDENCE_DIR||'artifacts/home-owned-radar','results.json');fs.writeFileSync(report,JSON.stringify(results,null,2)+'\n');process.exit(0);
}
const target = process.argv[2] || 'candidate', out = path.resolve(process.env.CONTINUITY_EVIDENCE_DIR || 'artifacts/home-owned-radar');
fs.mkdirSync(out, { recursive: true });
function pdf(month, flights) { const tag = month === 10 ? 'Oct' : 'Nov', last = month === 10 ? 31 : 30; const lines = ['SYNTHETIC CONTINUITY QA', `Tripulante: TESTE SINTETICO BP: 900001 Base: BSB 01/${month}/2026`, 'TESTE SINTETICO | 900001 | A320 | BSB | CCM']; for (let d = 1; d <= last; d++) {
    lines.push(`${String(d).padStart(2, '0')}-${tag}-2026 ${flights[d] ? 'VOO' : 'DO'}`);
    if (flights[d])
        lines.push(`${flights[d]} ${month === 11 ? 'GRU 08:00 BSB' : 'BSB 08:00 GRU'} 09:00 OP`);
} const content = lines.map((s, i) => `BT /F1 10 Tf 35 ${800 - i * 19} Td (${s}) Tj ET`).join('\n'); const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`]; let text = '%PDF-1.4\n', offsets = [0]; objects.forEach((s, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${s}\nendobj\n`; }); const start = Buffer.byteLength(text); text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`; const file = out + '/' + month + '.pdf'; fs.writeFileSync(file, text); return file; }
const fixture = { 10: pdf(10, { 30: 'LA8130', 31: 'LA4774' }), 11: pdf(11, { 1: 'LA8201', 2: 'LA8202', 3: 'LA8203' }) };
(async () => {
    const root = path.resolve('dist'), server = http.createServer((req, res) => { const p = new URL(req.url, 'http://local').pathname; const f = p.startsWith('/assets/') ? path.join(root, p) : root + '/index.html'; if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) {
        res.writeHead(404).end();
        return;
    } res.setHeader('content-type', /\.m?js$/.test(f) ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); res.end(fs.readFileSync(f)); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch({ headless: true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{}),args:['--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
    const store = new Map(), requests = [], snapshots = [];
    let active = null, holdNextHistory = false, heldHistory = null;
    const {createBackend}=await import('./fixtures/owned-radar-http.mjs');
    const backend=createBackend(()=>[...store.values()].map(s=>({id:s.summary.id,owner_email:'continuity@example.invalid',roster_key:s.summary.year+'-'+String(s.summary.month).padStart(2,'0'),roster:s.data.roster,active:s.summary.isActive,updated_at:s.summary.createdAt})),process.env.OWNED_RADAR_MUTATION||'');
    try {
        const c = await browser.newContext({ viewport: { width: 1100, height: 900 }, timezoneId: process.env.OWNED_RADAR_ZONE||'UTC', serviceWorkers: 'block' });
        await c.route('**/*', async r => {
            const req = r.request(), u = new URL(req.url());
            if (u.origin !== origin)
                return r.abort();
            if (!u.pathname.startsWith('/api/'))
                return r.continue();
            requests.push({ path: u.pathname, method: req.method(), account: req.headers().authorization === 'Bearer synthetic-local-only' ? 'A' : req.headers().authorization === 'Bearer synthetic-other' ? 'B' : 'none' });
            if(u.pathname==='/api/radar-flight'){const result=await backend.call(u,req.headers().authorization);return r.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result.payload)});}
            const authenticatedB = req.headers().authorization === 'Bearer synthetic-other';
            if (authenticatedB && u.pathname === '/api/auth/me')
                return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,user:{id:'continuity-other',email:'other@example.invalid',role:'user'}})});
            if (authenticatedB && u.pathname.startsWith('/api/rosters')) {
                const body = u.pathname === '/api/rosters' ? {ok:true,rosters:[]} : u.pathname === '/api/rosters/active' ? {ok:true,roster:null} : {ok:false,code:'SYNTHETIC_NOT_FOUND'};
                return r.fulfill({status:body.ok?200:404,contentType:'application/json',body:JSON.stringify(body)});
            }
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
            if (u.pathname === '/api/rosters' && req.method() === 'GET' && holdNextHistory) {
                holdNextHistory = false;
                const payload = structuredClone({ok:true,rosters:[...store.values()].map(s=>({...s.summary,isActive:false}))});
                return new Promise(resolve => { heldHistory = {release: () => reply(payload).then(resolve, resolve)}; });
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
        await c.addInitScript(() => { window.__gatePulseSeen=false;window.__gateNotifications=[];new MutationObserver(()=>{if(document.querySelector('[data-category="gate"]'))window.__gatePulseSeen=true;}).observe(document,{childList:true,subtree:true});window.Notification=class{static permission='granted';static requestPermission=async()=> 'granted';constructor(title,options){if(/portão|gate/i.test(title+' '+(options?.body||'')))window.__gateNotifications.push(String(title).slice(0,100));}}; if (!localStorage.getItem('crewcheck_auth_user')) {
            localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'continuity-qa', email: 'continuity@example.invalid', name: 'SYNTHETIC QA', role: 'user' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-local-only'); }
            localStorage.setItem('crewcheck:first-access-tour:v1434:disabled', '1'); localStorage.setItem('crewcheck_demo_mode_seen', '1'); sessionStorage.setItem('crewcheck_initial_view', 'import'); });
        const p = await c.newPage();
        p.setDefaultTimeout(20000);
        await p.clock.setFixedTime(new Date('2026-10-26T12:00:00Z'));
        await p.goto(origin + '/app?view=roster');
        await p.locator('.cz-app').waitFor();
        async function snapshot(phase) { await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'roster' }))); const details = p.locator('details.cc-roster-view-options'); await details.waitFor(); if (!await details.evaluate(e => e.open))
            await details.locator(':scope > summary').click(); await p.getByRole('combobox', { name: 'Formato da escala', exact: true }).selectOption('aims'); const s = await p.evaluate(() => { const a = JSON.parse(sessionStorage.getItem('crewcheck_roster') || 'null'), h = JSON.parse(localStorage.getItem('crewcheck_local_history_v11_continuity-qa') || '[]'); return { activeMonth: a?.roster?.month, activeDays: a?.roster?.days?.filter(d => d.legs?.length).map(d => ({ date: d.date, codes: d.legs.map(l => l.flightNumber) })), history: h.map(x => ({ month: x.roster?.month, crewId: x.roster?.crewId, dates: x.roster?.days?.filter(d => d.legs?.length).map(d => d.date) })) }; }); s.phase = phase; s.document = await p.locator('.cc-aims-document').innerText(); s.options = await p.getByLabel('Abrir programação publicada', { exact: true }).locator('option').allTextContents(); s.remote = [...store.values()].map(x => ({ month: x.summary.month, active: x.summary.isActive, crewId: x.summary.crewId })); s.visibleOct30 = s.document.includes('LA8130'); s.visibleOct31 = s.document.includes('LA4774'); snapshots.push(s); console.log(JSON.stringify({ phase, activeMonth: s.activeMonth, visibleOct30: s.visibleOct30, visibleOct31: s.visibleOct31, history: s.history.map(x => x.month), remote: s.remote.map(x => x.month) }));  }
        for (const month of [10, 11]) {
            await p.locator('input[hidden][accept="application/pdf,.pdf"]').setInputFiles(fixture[month]);
            try {
                await p.getByRole('button', { name: 'Ativar escala', exact: true }).click();
            }
            catch (error) {
                fs.writeFileSync(out + '/import-diagnostic.txt', (await p.locator('body').innerText()));

                throw error;
            }
            await p.waitForFunction(() => !document.querySelector('.cc-import-confirm-overlay'));
            await p.waitForFunction(() => document.querySelector('input[accept="application/pdf,.pdf"]')?.value === '');
            await snapshot('after-' + month);
        }
        const consumers = {};
        // Restart while November is STILL active: October must not depend on a
        // later October reimport. The init script must preserve the actual owner/token.
        await p.clock.setFixedTime(new Date('2026-10-31T09:00:00Z'));
        await p.reload(); await p.locator('.cz-app').waitFor();
        await p.waitForTimeout(1500);
        assert.equal(active, 'synthetic-2026-11');
        assert.equal(await p.evaluate(() => JSON.parse(sessionStorage.getItem('crewcheck_roster')).roster.month), 11);
        consumers.restartWithNovemberActive = {month:11,remoteActive:active,verifiedBeforeOctoberReimport:true};
        await p.evaluate(() => window.dispatchEvent(new CustomEvent('crewcheck:set-view', { detail: 'cockpit' })));
        await p.waitForTimeout(1500);
        consumers.home = await p.locator('body').innerText();
        await p.getByRole('button', { name: 'sábado, 31 de outubro de 2026', exact: true }).click();
        consumers.homeOct31 = await p.locator('.cc-home-roster-list').innerText();
        assert.match(consumers.homeOct31, /LA4774/, 'HOME must retain October 31 after November activation');
        consumers.homeGate=await p.locator('.cc-next-gate').evaluate(el=>({flight:el.querySelector('.cc-next-gate-identity strong')?.textContent,route:el.querySelector('.cc-next-gate-route')?.textContent,gate:el.querySelector('.cc-next-gate-gate b')?.textContent,source:el.querySelector('.cc-next-gate-reported')?.textContent,operational:el.textContent.includes('Portão · fonte operacional')}));
        await p.locator('.cc-next-gate-summary').click();
        await p.getByRole('button', {name:'Abrir Radar e informar dados',exact:true}).click();
        await p.waitForTimeout(1000);
        consumers.historicalRadar = await p.locator('body').innerText();
        assert.match(consumers.historicalRadar,/LA4774/,'Radar must resolve the chosen historical flight');
        assert.doesNotMatch(consumers.historicalRadar,/LA8201/,'Radar must never substitute the active-month flight');

        const accepted=backend.evidence.filter(x=>x.flight==='LA4774'&&x.result.payload.ok);
        assert(accepted.length,'ORACLE_OCCURRENCE: backend must admit retained October flight');
        assert(accepted.every(x=>x.queryKinds.includes('owned-history')&&x.providerCalls===1),'ORACLE_AUTHORITY: real owned SQL history/admission required');
        for(const {result:{status,payload}} of accepted){
          assert.equal(status,200,'ORACLE_HTTP');assert.equal(payload.flight,'LA4774','ORACLE_FLIGHT');
          assert.equal(payload.origin,'BSB','ORACLE_ORIGIN');assert.equal(payload.destination,'GRU','ORACLE_DESTINATION');
          assert.equal(payload.scheduledDepartureUtc,'2026-10-31T11:00:00.000Z','ORACLE_OCCURRENCE');
          assert.equal(payload.gate,'18','ORACLE_GATE');assert.equal(payload.provider,'custom','ORACLE_PROVIDER');
          assert.equal(payload.sourceReceivedAt,Date.parse('2026-10-31T09:00:00Z'),'ORACLE_RECEIPT');
          assert.equal(payload.gateUpdate,null,'ORACLE_NO_OPERATIONAL_PROOF');
          assert.equal(payload.operationalEvidenceGaps.gate,'source-observation-missing','ORACLE_PROOF_GAP');
          assert.equal(payload.exportedToConcierge,false,'ORACLE_NO_SNAPSHOT_WRITE');
        }
        assert.equal(consumers.homeGate.flight,'LA4774','ORACLE_HOME_FLIGHT');
        assert.match(consumers.homeGate.route,/^BSB\s*→\s*GRU$/,'ORACLE_HOME_ROUTE');
        assert.equal(consumers.homeGate.gate,'18','ORACLE_HOME_GATE');
        assert.equal(consumers.homeGate.source,'Portão informado por Fonte própria · a confirmar','ORACLE_HOME_REPORTED');
        assert.equal(consumers.homeGate.operational,false,'ORACLE_HOME_NOT_OPERATIONAL');
        const article=p.locator('.cz-radar-screen > article').first();
        assert.equal(await article.locator(':scope > h2').innerText(),'LA4774','ORACLE_DOM_FLIGHT');
        assert.equal(await article.locator(':scope > p').innerText(),'BSB → GRU','ORACLE_DOM_ROUTE');
        assert.equal(await article.locator(':scope > strong').innerText(),'Portão: 18 · A confirmar','ORACLE_DOM_GATE');
        assert.equal(await article.locator(':scope > span').first().innerText(),'Escala 31/10/2026 (BRT) · Origem 31/10/2026 (America/Sao_Paulo)','ORACLE_DOM_DATE');
        assert.equal(await article.getByText('Status: Não confirmado',{exact:true}).count(),1,'ORACLE_DOM_STATUS');
        assert.equal(await article.getByText('Sem confirmação operacional',{exact:true}).count(),1,'ORACLE_DOM_UNCONFIRMED');
        assert.doesNotMatch(await article.innerText(),/Fonte operacional com evidência válida|Portão · fonte operacional/,'ORACLE_NO_OPERATIONAL_PROMOTION');
        assert.equal(await p.locator('[data-category="gate"]').count(),0,'ORACLE_NO_GATE_PULSE_DOM');
        consumers.alerts=await p.evaluate(()=>({pulseSeen:window.__gatePulseSeen,notifications:window.__gateNotifications}));
        assert.deepEqual(consumers.alerts,{pulseSeen:false,notifications:[]},'ORACLE_NO_GATE_ALERTS');
        fs.writeFileSync(out+'/oracle.json',JSON.stringify({zone:process.env.OWNED_RADAR_ZONE||'UTC',mutation:process.env.OWNED_RADAR_MUTATION||null,homeGate:consumers.homeGate,alerts:consumers.alerts,accepted},null,2));
        fs.writeFileSync(out+'/backend.json',JSON.stringify(backend.evidence,null,2));
        fs.writeFileSync(out+'/result.json',JSON.stringify({target,active,activeMonth:11,syntheticFlight:'LA4774',syntheticDate:'2026-10-31',radarText:consumers.historicalRadar,requests,note:'Synthetic PDF labels/route/times only; no claim about actual LA4774 or real source gate. Actual handler/race/owned loader/canonical matcher, synthetic JWT/DB/provider transport; no live flight evidence.'},null,2));
        console.log('PASS synthetic LA4774 Oct31 historical Radar context with Nov still active');
        await c.close();
    } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{fs.writeFileSync(out+'/error.txt',e.stack);console.error(e.stack);process.exitCode=1;});
