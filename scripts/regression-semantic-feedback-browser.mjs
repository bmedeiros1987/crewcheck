// Existing Button/Card, real theme/text preference, synthetic fixture and blocked egress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const out = path.resolve('artifacts/semantic-feedback');
fs.mkdirSync(out, { recursive: true });
const entry = `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {Button} from '@/components/ui/button';import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card';import {ChevronDown,Check,TriangleAlert,HelpCircle,ArrowRight} from 'lucide-react';import {setCrewCheckThemePreference} from '@/lib/themeRuntime';import {initializeCrewTextSize} from '@/lib/textSizePreference';import TextSizeSetting from '@/components/TextSizeSetting';
initializeCrewTextSize();window.theme=setCrewCheckThemePreference;function App(){const [open,setOpen]=useState(false),[count,setCount]=useState(0);return <main className='cz-app' data-version='synthetic-feedback-pilot' style={{maxWidth:900,margin:'auto',padding:20}}><h1>Piloto visual</h1><p>Dados sintéticos · nenhuma integração operacional</p><TextSizeSetting/><section id='pilot' style={{display:'grid',gap:16,padding:8,background:'var(--cc-feedback-surface)',borderRadius:20}}><div id='controls' style={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:16}}><Button id='action' feedback='action' onClick={()=>setCount(v=>v+1)}>Continuar <ArrowRight aria-hidden='true'/></Button><Button id='neutral' feedback='neutral'>Consultar</Button><Button id='success' feedback='success'><Check aria-hidden='true'/> Dados salvos</Button><Button id='danger' feedback='danger'><TriangleAlert aria-hidden='true'/> Revisar conflito</Button><Button id='pending' feedback='pending'><HelpCircle aria-hidden='true'/> Ver pendências</Button><Button id='disabled' feedback='action' disabled>Indisponível</Button><Button id='link' feedback='neutral' asChild><a href='#comparison'>Ver comparação</a></Button></div><Card id='card' data-crew-feedback='pending'><CardHeader><CardTitle>Pendência de confirmação</CardTitle><CardDescription>Uma informação salva ainda precisa de revisão. Cor não confirma nenhum dado.</CardDescription></CardHeader><CardContent><Button id='disclosure' feedback='neutral' aria-expanded={open} aria-controls='pilot-details' onClick={()=>setOpen(v=>!v)}>Ver detalhes <ChevronDown data-feedback-chevron aria-hidden='true'/></Button><p id='pilot-details' hidden={!open}>Fonte sintética salva; confirme antes de usar. Nenhum estado operacional foi alterado.</p></CardContent></Card><p id='count'>Ações locais: {count}</p></section><section id='comparison' style={{padding:8}}><h2>Controles sem opt-in</h2><Button id='legacy'>Continuar</Button><Card id='legacy-card'><CardContent>Card existente sem alteração visual.</CardContent></Card></section></main>;}createRoot(document.getElementById('root')).render(<App/>);`;
await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, jsx: 'automatic', format: 'iife', outfile: path.join(out, 'app.js'), define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, logLevel: 'error' });
const dist = path.resolve('dist'), links = [...fs.readFileSync(path.join(dist, 'index.html'), 'utf8').matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/g)].map(x => x[0]).filter(x => !x.includes('https://')).join('');
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>${links}<link id='pilot-css' rel='stylesheet' href='/app.css'></head><body><div id='root'></div><script src='/app.js'></script></body></html>`);
const server = http.createServer((req, res) => { const u = new URL(req.url, 'http://localhost').pathname, base = u.startsWith('/assets/') ? dist : out, file = path.resolve(base, '.' + (u === '/' ? '/index.html' : u)); if (!file.startsWith(base + path.sep) || !fs.existsSync(file))
    return res.writeHead(404).end(); res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(file)); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port, { chromium } = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url)('playwright');
function luminance(color) { const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return values[0] * .2126 + values[1] * .7152 + values[2] * .0722; }
function contrast(a, b) { const values = [luminance(a), luminance(b)].sort((a, b) => b - a); return (values[0] + .05) / (values[1] + .05); }
async function settle(page) { await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(r)); for (const a of document.getAnimations())
    if (Number.isFinite(a.effect?.getComputedTiming().endTime))
        a.finish(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }); }
async function style(locator) { return locator.evaluate(el => { const c = getComputedStyle(el), b = el.getBoundingClientRect(); return { color: c.color, background: c.backgroundColor, border: c.borderTopColor, outline: c.outlineColor, outlineWidth: parseFloat(c.outlineWidth), duration: c.transitionDuration, properties: c.transitionProperty, transform: c.transform, font: parseFloat(c.fontSize), width: b.width, height: b.height, opacity: c.opacity }; }); }
async function legacy(page) { return page.locator('#legacy,#legacy-card').evaluateAll(nodes => nodes.map(el => { const c = getComputedStyle(el), b = el.getBoundingClientRect(); return { className: el.className, color: c.color, background: c.background, border: c.border, transition: c.transition, transform: c.transform, font: c.fontSize, width: b.width, height: b.height }; })); }
let browser;
const results = [], errors = [];
try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    for (const width of (process.env.FEEDBACK_TEST_WIDTHS?.split(',').map(Number) || [320, 390, 1440]))
        for (const theme of (process.env.FEEDBACK_TEST_THEMES?.split(',') || ['light', 'dark']))
            for (const size of (process.env.FEEDBACK_TEST_SIZES?.split(',').map(Number) || [100, 200]))
                for (const reducedMotion of (process.env.FEEDBACK_TEST_MOTION?.split(',') || ['no-preference', 'reduce'])) {
                    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion, serviceWorkers: 'block' });
                    let external = 0;
                    await context.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : (external++, r.abort()));
                    await context.addInitScript(() => { localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-pilot', name: 'Synthetic' })); localStorage.setItem('crewcheck_auth_token', 'synthetic-offline'); });
                    const page = await context.newPage();
                    page.on('pageerror', e => errors.push(e.message));
                    await page.goto(origin);
                    await page.locator('#action').waitFor();
                    await page.evaluate(theme => window.theme(theme), theme);
                    await page.locator('#cc-text-size').selectOption(String(size));
                    await page.waitForFunction(size => document.documentElement.dataset.crewTextSize === String(size), size);
                    await settle(page);
                    const before = await legacy(page);
                    await page.evaluate(() => { window.pilotRules = []; const walk = rules => { for (const rule of rules) {
                        if (rule.selectorText?.includes('data-crew-feedback')) {
                            window.pilotRules.push([rule.style, rule.style.cssText]);
                            rule.style.cssText = '';
                        }
                        else if (rule.cssRules)
                            walk(rule.cssRules);
                    } }; for (const sheet of document.styleSheets)
                        try {
                            walk(sheet.cssRules);
                        }
                        catch { } });
                    await settle(page);
                    assert.deepEqual(await legacy(page), before, 'Opt-in CSS cannot change legacy controls');
                    await page.evaluate(() => window.pilotRules.forEach(([style, text]) => style.cssText = text));
                    await settle(page);
                    assert.equal(await page.locator('#legacy').getAttribute('data-crew-feedback'), null);
                    assert.equal(await page.locator('#legacy-card').getAttribute('data-crew-feedback'), null);
                    const adjacent = await page.locator('#pilot').evaluate(el => getComputedStyle(el).backgroundColor);
                    const samples = [];
                    for (const id of ['action', 'neutral', 'success', 'danger', 'pending', 'disabled', 'link']) {
                        const control = page.locator('#' + id), s = await style(control);
                        assert.ok(s.height >= 44 && s.width <= width, JSON.stringify({ id, s }));
                        assert.ok(contrast(s.color, s.background) >= 4.5, JSON.stringify({ id, theme, size, s, contrast: contrast(s.color, s.background) }));
                        assert.ok(Math.max(contrast(s.border, adjacent), contrast(s.background, adjacent)) >= 3, JSON.stringify({ id, s, adjacent }));
                        assert.ok(s.font >= 14 * size / 100 - .1);
                        assert.equal(s.opacity, '1');
                        assert.equal(s.duration, reducedMotion === 'reduce' ? '0s' : '0.15s, 0.15s, 0.15s, 0.15s');
                        samples.push({ id, normal: s, contrast: contrast(s.color, s.background), boundaryContrast: Math.max(contrast(s.border, adjacent), contrast(s.background, adjacent)) });
                        if (id !== 'disabled') {
                            await control.hover();
                            await settle(page);
                            const hover = await style(control);
                            assert.ok(contrast(hover.color, hover.background) >= 4.5);
                            await control.focus();
                            await page.keyboard.press('Tab');
                            await page.keyboard.press('Shift+Tab');
                            assert.ok(await control.evaluate(el => el === document.activeElement));
                            const focused = await style(control);
                            assert.ok(focused.outlineWidth >= 3);
                            assert.ok(contrast(focused.outline, adjacent) >= 3, JSON.stringify({ id, focused, adjacent }));
                            samples.at(-1).focus = focused;
                        }
                    }
                    const normalColor = id => samples.find(s => s.id === id).normal.border;
                    assert.notEqual(normalColor('success'), normalColor('neutral'), 'Success has its own green boundary');
                    assert.notEqual(normalColor('danger'), normalColor('neutral'), 'Danger has its own red boundary');
                    const positive = normalColor('success').match(/\d+/g).map(Number), danger = normalColor('danger').match(/\d+/g).map(Number);
                    assert.ok(positive[1] > positive[0] && positive[1] > positive[2]);
                    assert.ok(danger[0] > danger[1] && danger[0] > danger[2]);
                    const action = page.locator('#action');
                    await action.focus();
                    await page.keyboard.press('Enter');
                    assert.match(await page.locator('#count').innerText(), /1/);
                    await page.keyboard.press('Space');
                    assert.match(await page.locator('#count').innerText(), /2/);
                    assert.equal(await page.locator('#disabled').isDisabled(), true);
                    await page.locator('#link').focus();
                    assert.equal(await page.locator('#link').evaluate(el => el.tagName), 'A');
                    await page.keyboard.press('Enter');
                    assert.equal(new URL(page.url()).hash, '#comparison');
                    await page.evaluate(() => { window.pilotShifts = []; window.pilotLongTasks = []; try {
                        new PerformanceObserver(list => window.pilotShifts.push(...list.getEntries().map(e => e.value))).observe({ type: 'layout-shift', buffered: false });
                        new PerformanceObserver(list => window.pilotLongTasks.push(...list.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: false });
                    }
                    catch { } });
                    await settle(page);
                    await page.mouse.move(0, 0);
                    await action.hover();
                    await settle(page);
                    await page.mouse.down();
                    await page.waitForFunction(() => document.getElementById('action').matches(':active'));
                    const motionDuring = await action.evaluate(el => { getComputedStyle(el).transform; return el.getAnimations().map(a => ({property:a.transitionProperty || '', duration:a.effect?.getComputedTiming().duration, iterations:a.effect?.getComputedTiming().iterations})); });
                    await settle(page);
                    await page.waitForTimeout(180);
                    const pressed = await style(action);
                    assert.equal(pressed.transform, reducedMotion === 'reduce' ? 'none' : 'matrix(1, 0, 0, 1, 0, 1)',JSON.stringify({width,theme,size,reducedMotion,active:await action.evaluate(el=>el.matches(':active')),pressed}));
                    await page.mouse.up();
                    await settle(page);
                    const perf = await page.evaluate(() => ({ shifts: window.pilotShifts, longTasks: window.pilotLongTasks, infinite: document.getAnimations().filter(a => !Number.isFinite(a.effect?.getComputedTiming().endTime)).length }));
                    assert.equal(perf.infinite, 0);
                    assert.ok(perf.shifts.every(v => v <= .001), JSON.stringify(perf));
                    const disclosure = page.locator('#disclosure');
                    await disclosure.focus();
                    await page.keyboard.press('Enter');
                    assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
                    assert.equal(await page.locator('#pilot-details').isVisible(), true);
                    await settle(page);
                    const rotation = await disclosure.locator('[data-feedback-chevron]').evaluate(el => getComputedStyle(el).transform);
                    assert.equal(rotation, reducedMotion === 'reduce' ? 'none' : 'matrix(-1, 0, 0, -1, 0, 0)');
                    await page.keyboard.press('Space');
                    assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
                    await page.evaluate(() => document.activeElement?.blur());
                    await settle(page);
                    const geometry = await page.locator('#pilot').evaluate(el => { const box = el.getBoundingClientRect(), violations = [], walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n; while (n = walk.nextNode())
                        for (let i = 0; i < n.textContent.length; i++) {
                            if (/\s/.test(n.textContent[i]) || n.parentElement.closest('[hidden]'))
                                continue;
                            const r = document.createRange();
                            r.setStart(n, i);
                            r.setEnd(n, i + 1);
                            for (const b of r.getClientRects())
                                if (b.left < box.left - 1 || b.right > box.right + 1 || b.top < box.top - 1 || b.bottom > box.bottom + 1)
                                    violations.push(n.textContent[i]);
                        } return { violations, overflow: document.documentElement.scrollWidth > innerWidth + 1 }; });
                    assert.deepEqual(geometry.violations, []);
                    assert.equal(geometry.overflow, false);
                    assert.equal(external, 0);
                    await page.locator('#pilot').screenshot({ path: path.join(out, `${width}-${theme}-${size}-${reducedMotion}.png`) });
                    results.push({ width, theme, size, reducedMotion, samples, pressed, motionDuring, perf, geometry, synthetic: true });
                    await context.close();
                }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ scope: 'Real shared primitives with compiled production CSS and actual text-size preference; isolated opt-in fixture, no Home/Concierge integration or physical device claims', results, errors }, null, 2));
    console.log('PASS ' + results.length + ' contexts: semantic states, contrast, legacy isolation,100/200%, keyboard/asChild/disabled, reduced-motion, no clipping, no continuous animations and measured layout shifts');
}
finally {
    await browser?.close();
    await new Promise(r => server.close(r));
}
