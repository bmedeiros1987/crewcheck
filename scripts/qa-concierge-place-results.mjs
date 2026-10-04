/**
 * Render the real React component and verify it in a real, local Chromium browser.
 * Uses the repository's esbuild (Vite dependency) and a system Chrome/Chromium.
 * Run after npm ci: node scripts/qa-concierge-place-results.mjs
 * Optional: CHROME_BIN=/path/to/chrome CREWCHECK_UI_EVIDENCE_DIR=/path/to/artifacts
 * No requests are sent to Google Maps or to any application API.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.CREWCHECK_UI_EVIDENCE_DIR || path.join(repo, '.artifacts/concierge-place-results'));
const temporary = await mkdtemp(path.join(os.tmpdir(), 'crewcheck-places-qa-'));
await mkdir(output, { recursive: true });
const chromeBin = process.env.CHROME_BIN || ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(existsSync);
assert.ok(chromeBin, 'Chrome/Chromium is required; set CHROME_BIN to its executable path.');

const sample = {
  title: 'Farmácias próximas',
  reference: 'Perto do Hotel de Exemplo · São Paulo',
  places: [
    { name: 'Farmácia Exemplo Centro', address: 'Rua de Exemplo, 120 · Centro', category: 'Farmácia', openNow: true, distanceKm: 0.35, rating: 4.7, routeUrl: 'https://www.google.com/maps/dir/?api=1&destination=Farmacia+Exemplo' },
    { name: 'Farmácia Exemplo Avenida', address: 'Av. de Exemplo, 860 · Centro', category: 'Farmácia', openNow: false, distanceKm: 1.2, rating: 4.3, routeUrl: 'https://www.google.com/maps/dir/?api=1&destination=Farmacia+Exemplo+Avenida' },
    { name: 'Farmácia Exemplo Bairro', address: 'Alameda de Exemplo, 45 · Centro', category: 'Farmácia', distanceKm: 1.6, routeUrl: 'https://www.google.com/maps/dir/?api=1&destination=Farmacia+Exemplo+Bairro' },
  ],
  moreAvailable: true,
  moreQuery: 'Mais farmácias perto do Hotel de Exemplo',
};

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConciergePlaceResults, isConciergePlaceResults, safeConciergeMapsUrl, formatConciergeDistance } from ${JSON.stringify(path.join(repo, 'client/src/components/concierge/ConciergePlaceResults.tsx'))};
const root = createRoot(document.getElementById('root'));
const sample = ${JSON.stringify(sample)};
window.qa = { sample, calls: 0, isConciergePlaceResults, safeConciergeMapsUrl, formatConciergeDistance };
window.qa.render = (results = sample, busy = false) => root.render(React.createElement(ConciergePlaceResults, {
  results, busy, onMore: () => { window.qa.calls++; }
}));
window.qa.render();
`;

let browser;
let server;
let cdp;
try {
  // The prebuilt override is for isolated local toolchain evidence only. CI uses esbuild.
  if (process.env.CREWCHECK_UI_QA_PREBUILT_DIR) {
    await writeFile(path.join(temporary, 'entry-source.txt'), entry);
  } else {
    const { build } = await import('esbuild');
    await build({
      stdin: { contents: entry, resolveDir: repo, sourcefile: 'concierge-place-results-qa.tsx', loader: 'tsx' },
      outfile: path.join(temporary, 'app.js'),
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      target: 'es2022',
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'warning',
    });
  }

  const assets = process.env.CREWCHECK_UI_QA_PREBUILT_DIR || temporary;
  const html = `<!doctype html><html lang="pt-BR" data-crew-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Concierge · teste visual</title><link rel="stylesheet" href="/app.css"><style>
  body { margin:0; padding:20px 14px; background:#0d1422; color:#abbad0; font-family:Inter,Arial,sans-serif; }
  [data-crew-theme="light"] body { background:#edf2f9; color:#53647c; }
  main { max-width:620px; margin:auto; }
  .qa-label { margin:0 0 14px; font-size:11px; line-height:1.5; letter-spacing:.04em; }
  </style></head><body><main><p class="qa-label">CREWCHECK · DADOS SINTÉTICOS PARA TESTE VISUAL</p><div id="root"></div></main><script type="module" src="/app.js"></script></body></html>`;
  server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
      const relative = pathname.slice(1);
      if (!relative || relative.split('/').includes('..')) { response.writeHead(404).end(); return; }
      const file = path.resolve(assets, relative);
      if (!file.startsWith(path.resolve(assets) + path.sep)) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      response.end(await readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(chromeBin, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${path.join(temporary, 'chrome-profile')}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`Chrome CDP did not start: ${stderr.slice(-2000)}`)), 15000);
    browser.once('error', (error) => { clearTimeout(timeout); reject(error); });
    browser.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const requests = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (!message.id) return;
    const waiting = pending.get(message.id);
    if (!waiting) return;
    pending.delete(message.id);
    clearTimeout(waiting.timeout);
    message.error ? waiting.reject(new Error(JSON.stringify(message.error))) : waiting.resolve(message.result);
  });
  cdp = {
    socket,
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
        pending.set(id, { resolve, reject, timeout });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
  };
  const version = await cdp.send('Browser.getVersion');
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert.ok(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const settle = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const render = async (expression = 'window.qa.sample', busy = false) => { await evaluate(`window.qa.render(${expression}, ${busy})`); await settle(); };
  const layout = () => evaluate(`(() => {
    const root = document.querySelector('.cc-concierge-places');
    const cards = [...document.querySelectorAll('.cc-concierge-places__card')];
    return { count:cards.length, bodyWidth:document.documentElement.clientWidth, scrollWidth:document.documentElement.scrollWidth,
      rootRight:root?.getBoundingClientRect().right, rootLeft:root?.getBoundingClientRect().left,
      clipped:cards.some(card => card.scrollWidth > card.clientWidth),
      tinyLinks:[...document.querySelectorAll('.cc-concierge-places__route')].some(link => link.getBoundingClientRect().height < 44),
      text:root?.innerText, links:[...document.querySelectorAll('.cc-concierge-places__route')].map(link => ({href:link.href,target:link.target,rel:link.rel,label:link.getAttribute('aria-label')})) };
  })()`);
  const checks = [];
  for (const width of [390, 320, 768]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 960, deviceScaleFactor: 1, mobile: false });
    if (width === 390) {
      await send('Page.navigate', { url: origin });
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate("Boolean(window.qa && document.querySelector('.cc-concierge-places'))")) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    for (const theme of ['dark', 'light']) {
      await evaluate(`document.documentElement.dataset.crewTheme = '${theme}'`);
      await render();
      const info = await layout();
      assert.equal(info.count, 3);
      assert.ok(info.scrollWidth <= info.bodyWidth, `Horizontal page overflow at ${width}/${theme}`);
      assert.ok(info.rootRight <= width && info.rootLeft >= 0, `Root outside viewport at ${width}/${theme}`);
      assert.equal(info.clipped, false, `Card overflow at ${width}/${theme}`);
      assert.equal(info.tinyLinks, false);
      for (const text of ['Aberta agora', 'Fechada agora', 'Horário não informado', '350 m em linha reta', '1,2 km em linha reta']) assert.ok(info.text.includes(text), text);
      for (const link of info.links) { assert.equal(link.target, '_blank'); assert.ok(link.rel.includes('noopener') && link.rel.includes('noreferrer')); assert.ok(link.label.includes('abre em nova aba')); }
      assert.equal(info.links.length, 3);
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      await writeFile(path.join(output, `pharmacies-${theme}-${width}.png`), Buffer.from(screenshot.data, 'base64'));
      checks.push(`Three cards, ${theme}, ${width}px: layout, status, distance, category, safe route labels`);
    }
  }

  const helpers = await evaluate(`(() => {
    const qa=window.qa;
    const accepted=['https://www.google.com/maps/dir/?api=1&destination=Exemplo','https://maps.google.com/?q=Exemplo','https://www.google.com.br/maps/search/Exemplo','https://maps.app.goo.gl/Abcd1234'];
    const rejected=['javascript:alert(1)','http://www.google.com/maps/dir/','https://www.google.com.evil.test/maps/','https://www.google.com@evil.test/maps/','https://user:pass@www.google.com/maps/','https://www.google.com:8443/maps/','https://www.google.com/url?q=https://evil.test','https://www.google.com/maps.evil/','//www.google.com/maps/','data:text/html,hello','not a url'];
    return { accepted:accepted.every(url=>!!qa.safeConciergeMapsUrl(url)), rejected:rejected.every(url=>qa.safeConciergeMapsUrl(url)===undefined),
      invalidPayloads:[null,{},[],{...qa.sample,places:null},{...qa.sample,places:[null]},{...qa.sample,places:[{name:4,address:'x',category:'x'}]},{...qa.sample,moreQuery:null}].every(value=>!qa.isConciergePlaceResults(value)),
      validPayload:qa.isConciergePlaceResults(qa.sample),
      invalidDistances:[null,undefined,-1,NaN,Infinity].every(value=>qa.formatConciergeDistance(value)===undefined),
      zeroDistance:qa.formatConciergeDistance(0) };
  })()`);
  assert.equal(helpers.accepted, true); assert.equal(helpers.rejected, true); assert.equal(helpers.invalidPayloads, true); assert.equal(helpers.validPayload, true); assert.equal(helpers.invalidDistances, true); assert.equal(helpers.zeroDistance, '0 m em linha reta');
  checks.push('Strict Google Maps HTTPS allowlist, malformed payload guard, invalid numeric metadata');

  await evaluate("document.querySelector('.cc-concierge-places__more').click()");
  assert.equal(await evaluate('window.qa.calls'), 1);
  await render('window.qa.sample', true);
  assert.equal(await evaluate("document.querySelector('.cc-concierge-places__more').disabled"), true);
  await evaluate("document.querySelector('.cc-concierge-places__more').click()");
  assert.equal(await evaluate('window.qa.calls'), 1);
  assert.equal(await evaluate("document.querySelector('.cc-concierge-places').getAttribute('aria-busy')"), 'true');
  checks.push('More callback fires once per click; parent busy state disables repeated request');

  await render(`({...window.qa.sample,places:[...window.qa.sample.places,...window.qa.sample.places.map(p=>({...p,name:p.name+' 2'}))],moreAvailable:false})`);
  assert.equal((await layout()).count, 6);
  assert.equal(await evaluate("document.querySelector('.cc-concierge-places__more') === null"), true);
  checks.push('Expanded six-card result and no More button when results are exhausted');

  await render(`({...window.qa.sample,title:'Busca específica · farmácias especializadas',places:[{...window.qa.sample.places[0],name:'Farmácia Exemplo Veterinária',category:'Veterinária'},{...window.qa.sample.places[1],name:'Farmácia Exemplo Manipulação',category:'Manipulação'}],moreAvailable:false})`);
  const specializedText = (await layout()).text;
  assert.ok(specializedText.includes('Veterinária') && specializedText.includes('Manipulação'));
  checks.push('Specialized pharmacy labels preserved in an explicit specialized-search fixture');

  await render(`({...window.qa.sample,places:[{name:'<img src=x onerror=alert(1)>',address:'',category:'Farmácia',openNow:undefined,distanceKm:null,rating:NaN,routeUrl:'javascript:alert(1)'}],moreAvailable:false})`);
  const missing = await layout();
  assert.equal(missing.links.length, 0);
  assert.ok(missing.text.includes('Horário não informado') && missing.text.includes('Endereço não informado'));
  assert.equal(await evaluate("document.querySelector('.cc-concierge-places img') === null && document.querySelector('.cc-concierge-places__facts') === null"), true);
  checks.push('Missing metadata remains unknown, unsafe links omitted, result text safely escaped');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 960, deviceScaleFactor: 1, mobile: false });
  await render(`({...window.qa.sample,title:'Hospitais próximos',note:'Confirme a especialidade e a disponibilidade de atendimento antes de ir.',places:window.qa.sample.places.map((p,i)=>({...p,name:'Hospital de Exemplo '+(i+1),category:'Hospital'}))})`);
  assert.equal(await evaluate("document.querySelector('.cc-concierge-places__icon svg').classList.contains('lucide-hospital')"), true);
  const hospitalText = (await layout()).text;
  assert.ok(hospitalText.includes('Confirme a especialidade') && hospitalText.includes('Aberto agora') && hospitalText.includes('Fechado agora'));
  const hospitalShot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(path.join(output, 'hospitals-light-390.png'), Buffer.from(hospitalShot.data, 'base64'));
  checks.push('Hospital title/icon and supplied medical-availability caution preserved');

  await render('({...window.qa.sample,places:[],moreAvailable:false})');
  assert.ok((await layout()).text.includes('Não encontrei opções adequadas nesta busca.'));
  await render('null');
  assert.equal(await evaluate("document.querySelector('.cc-concierge-places') === null"), true);
  assert.deepEqual(errors, [], 'No runtime exceptions');
  assert.equal(requests.some((url) => !url.startsWith(origin) && !url.startsWith('data:')), false, 'No external browser requests');
  checks.push('Empty and malformed payloads render safely; no runtime errors or external requests');
  const report = { passed: true, browser: version.product, syntheticData: true, actualComponent: 'client/src/components/concierge/ConciergePlaceResults.tsx', checks };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  console.log(`UI evidence: ${output}`);
} finally {
  if (cdp) cdp.socket.close();
  if (browser) {
    browser.kill('SIGTERM');
    await new Promise((resolve) => { if (browser.exitCode !== null) resolve(); else { browser.once('exit', resolve); setTimeout(resolve, 3000).unref(); } });
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
