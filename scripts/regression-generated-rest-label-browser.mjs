import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const out = path.resolve('artifacts/generated-rest-labels');
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-rest-label-'));
await build({ stdin: { contents: `export {generatedRestLabelFixtures} from './scripts/fixtures/generated-rest-labels';export {rosterActivityLabel} from './client/src/components/v1391/rosterActivityLabel';export {classifyScheduleActivity} from './client/src/lib/scheduleActivityClassification';export {rosterCardPresentation} from './client/src/lib/rosterPresentation';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', outfile: path.join(temp, 'model.mjs'), logLevel: 'silent' });
const { generatedRestLabelFixtures, rosterActivityLabel, classifyScheduleActivity, rosterCardPresentation } = await import(pathToFileURL(path.join(temp, 'model.mjs')));
const records = generatedRestLabelFixtures();
assert.equal(records.length, 8);
assert.deepEqual([...new Set(records.filter(r => r.expected === 'Descanso').map(r => r.pairing))].sort(), ['DESCANSO BASE', 'DESCANSO BASE 1/2', 'DESCANSO BASE 2/2', 'DESCANSO BASE ENTRE JORNADAS']);
if (!process.argv.includes('--browser-only')) {
    for (const r of records) {
        const before = JSON.stringify(r.event);
        assert.equal(rosterActivityLabel(r.pairing), r.expected, r.pairing);
        assert.equal(r.category, r.expected === 'Descanso' ? 'REPOUSO' : 'PERNOITE');
        assert.equal(classifyScheduleActivity(r.event), r.category);
        const card=rosterCardPresentation(r.event);
        assert.equal(card.title,r.expected==='Descanso'?'Descanso na base':'Pernoite · São Paulo');
        assert.equal(card.presentation,'');assert.equal(card.context,r.event.origin);
        assert.equal(card.start,r.event.day.dutyReport==='00:00'?'—':r.event.day.dutyReport,'inferred split midnight is not a published start');
        assert.equal(card.end,r.event.day.dutyDebrief==='23:59'?'—':r.event.day.dutyDebrief,'inferred split day-end is not a proven finish');
        assert.equal(card.datesUnconfirmed,true,'source day rollover without canonical boundary remains uncertain');
        assert.equal(JSON.stringify(r.event), before);
    }
    for (const unknown of ['DESCANSO BASE ABC', 'DESCANSO BASE 0/2', 'DESCANSO BASE 3/2', 'DESCANSO BASE 01/2', 'DESCANSO BASE 1/1', 'PERNOITE X', 'DO', 'ASB', 'QA1234'])
        assert.equal(rosterActivityLabel(unknown), unknown);
    console.log('PASS real completeContinuityDays bare/numbered/same-day outputs, source and classification unchanged, unknown codes preserved');
}
if (process.argv.includes('--model-only'))
    process.exit(0);
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {AimsDocumentView} from '@/components/v1391/AimsDocumentView';import {generatedRestLabelFixtures} from './scripts/fixtures/generated-rest-labels';import {setCrewCheckThemePreference} from '@/lib/themeRuntime';window.theme=setCrewCheckThemePreference;const records=generatedRestLabelFixtures();const events=records.map(r=>r.event);events.push({...events[0],id:'unknown',day:{...events[0].day,pairingCode:'DESCANSO BASE ABC'}});window.records=records;window.inputs=events;window.inputBefore=JSON.stringify(events);createRoot(document.getElementById('root')).render(<main className='cz-app' data-version='synthetic-generated-rest'><div className='cc-roster-premium-v1397'><AimsDocumentView month='2032-10' events={events} describe={event=>({mode:event.kind==='stay'?'stay':'rest',label:event.kind==='stay'?'Pernoite':'Descanso'})}/></div></main>);`;
await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, jsx: 'automatic', format: 'iife', outfile: path.join(out, 'app.js'), define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'silent' });
const dist = path.resolve('dist');
const links = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(m => m[0]).filter(s => !s.includes('https://')).join('');
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://localhost').pathname; if (u === '/') {
    res.setHeader('content-type', 'text/html');
    return res.end(`<html><head><meta name='viewport' content='width=device-width,initial-scale=1'>${links}<link rel='stylesheet' href='/app.css'></head><body><div id='root'></div><script src='/app.js'></script></body></html>`);
} const base = u.startsWith('/assets/') ? dist : out, file = path.resolve(base, '.' + u); if (!file.startsWith(base + path.sep) || !fs.existsSync(file))
    return res.writeHead(404).end(); res.setHeader('content-type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(fs.readFileSync(file)); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;
const { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
let browser;
const results = [];
try {
    browser = await chromium.launch({ headless: true });
    for (const theme of ['dark', 'light'])
        for (const scale of [100, 200]) {
            const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
            await context.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.goto(origin);
            await page.locator('.cc-doc-token button').first().waitFor();
            await page.evaluate(({ theme, scale }) => { window.theme(theme); document.documentElement.style.setProperty('--cc-text-scale', String(scale / 100)); }, { theme, scale });
            for (const r of records) {
                const button = page.locator(`.cc-doc-token button[data-roster-event-id="${r.event.id}"]`);
                const display=r.expected==='Descanso'?'Descanso na base':'Pernoite · São Paulo';
                assert.ok((await button.getAttribute('aria-label')).includes(': '+display+', dia'));
                assert.equal(await button.locator('strong').innerText(),display);
                assert.doesNotMatch(await button.innerText(),/APZ|BSB → BSB|GRU → GRU/);
                const text = await page.locator('select[aria-label="Abrir programação publicada"] option').nth(records.indexOf(r) + 1).innerText();
                assert.ok(text.endsWith(' · ' + display), text);
                await page.locator('select[aria-label="Abrir programação publicada"]').selectOption(String(records.indexOf(r)));
                await page.waitForFunction(() => document.querySelector('.cc-doc-detail') === document.activeElement);
                assert.equal(await page.locator(`.cc-doc-detail [data-roster-event-id="${r.event.id}"] button strong`).innerText(), display);
                const fields=await page.locator(`.cc-doc-detail [data-roster-event-id="${r.event.id}"] .cc-aims-published-fields`).evaluate(el=>Object.fromEntries([...el.children].map(div=>[div.querySelector('dt').textContent,div.querySelector('dd').textContent])));
                assert.equal(fields['Partida / início'],r.event.day.dutyReport==='00:00'?'—':r.event.day.dutyReport);
                assert.equal(fields['Chegada / fim'],r.event.day.dutyDebrief==='23:59'?'—':r.event.day.dutyDebrief);
                assert.equal(fields.Local,r.event.origin);assert.equal(fields.Apresentação,undefined);
                if (r.pairing === 'DESCANSO BASE 1/2')
                    await page.locator('.cc-doc-detail').screenshot({ path: path.join(out, `numbered-rest-${theme}-${scale}.png`) });
                await page.keyboard.press('Escape');
            }
            // The authoritative continuity code still wins over an unknown wrapper pairing.
            assert.equal(await page.locator('.cc-doc-token button[data-roster-event-id="unknown"] strong').innerText(), 'Descanso na base');
            assert.equal(await page.evaluate(()=>window.inputs.find(event=>event.id==='unknown').day.pairingCode),'DESCANSO BASE ABC');
            assert.equal(await page.evaluate(()=>JSON.stringify(window.inputs)),await page.evaluate(()=>window.inputBefore),'source records stay byte-for-byte unchanged');
            assert.deepEqual(errors, []);
            results.push({ theme, scale, records: records.map(r => ({ pairing: r.pairing, label: r.expected, category: r.category })), synthetic: true });
            await context.close();
        }
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ results }, null, 2));
    console.log('PASS actual AIMS document, picker, accessible names and AimsRosterTable details for8generated rests in4theme/font contexts');
}
finally {
    await browser?.close();
    await new Promise(r => server.close(r));
}
