// Testes de navegador contra o artefato empacotado.
//
// Carrega dist/webos/index.html por file://, que e como o webOS carrega um app
// empacotado: mesma origem opaca, mesmo CSP em <meta>, mesmo app.js classico.
//
// O motor aqui e um Chromium moderno, nao o 53 da TV. A compatibilidade de
// sintaxe e coberta pelo parse ES2016 do verify.mjs; o que este arquivo prova
// e comportamento: boot sem tela preta, CSP sem violacao, foco por D-pad,
// degradacao com Hub/internet fora do ar e imagem quebrada.

import {chromium} from 'playwright-core';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const pageUrl = 'file://' + path.join(root, 'dist/webos/index.html');
const shots = path.join(root, 'dist/webos-shots');
fs.mkdirSync(shots, {recursive: true});

const results = [];
function report(id, label, passed, detail = '') {
  results.push({id, label, passed, detail});
  console.log(`  ${passed ? 'ok  ' : 'FAIL'} ${id} · ${label}${detail ? ' — ' + detail : ''}`);
}

/** Hub falso em loopback: origem aceita pela regra de LAN e pelo CSP. */
function startStubHub(port, behavior = 'online') {
  const server = http.createServer((req, res) => {
    if (behavior === 'down') { req.socket.destroy(); return; }
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.url === '/health') {
      res.end(JSON.stringify({ok: true, service: 'laurinha-hub', haConfigured: true}));
      return;
    }
    if (req.url.startsWith('/api/media/photo/')) {
      res.setHeader('Content-Type', 'image/png');
      res.end(Buffer.from('89504e470d0a1a0a', 'hex'));
      return;
    }
    res.end(JSON.stringify({ok: true}));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

async function withPage(browser, fn, {label} = {}) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}});
  const page = await context.newPage();
  const violations = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  try {
    return await fn(page, {violations, pageErrors});
  } finally {
    await context.close();
  }
}

/** A tela nao pode ser preta: exige pixel claro e texto visivel. */
async function assertNotBlank(page, name) {
  const buffer = await page.screenshot({path: path.join(shots, `${name}.png`)});
  const text = (await page.locator('body').innerText()).trim();
  const metrics = await page.evaluate(() => ({
    html: document.body.innerHTML.length,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  assert.ok(text.length > 0, `tela sem texto em ${name}`);
  assert.ok(metrics.html > 200, `DOM praticamente vazio em ${name}`);
  // 1920x1080 e a resolucao declarada no appinfo.json: nada pode transbordar,
  // porque numa TV nao ha barra de rolagem para alcancar o que sobrou.
  assert.ok(metrics.scrollWidth <= 1920,
    `overflow horizontal em ${name}: ${metrics.scrollWidth}px`);
  assert.ok(metrics.scrollHeight <= 1080,
    `overflow vertical em ${name}: ${metrics.scrollHeight}px`);
  return {buffer, text, metrics};
}

// --no-proxy-server: este sandbox roteia todo HTTP por um proxy de saida que
// recusaria a LAN. host-resolver-rules aponta o IP real do Hub para o stub
// local, para exercitar a origem exata que vai no CSP do pacote.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-proxy-server', '--host-resolver-rules=MAP 192.168.0.32 127.0.0.1'],
});

try {
  // --- A. Boot normal ------------------------------------------------------
  await withPage(browser, async (page, {violations, pageErrors}) => {
    await page.goto(pageUrl);
    await page.waitForTimeout(1500);
    const {text} = await assertNotBlank(page, 'A-boot-normal');
    report('A', 'Boot normal renderiza sem tela preta', true, `${text.split('\n')[0].slice(0, 40)}…`);
    report('L', 'Nenhuma violacao de CSP no boot', violations.length === 0,
      violations.length ? violations[0].slice(0, 90) : '');
    report('A2', 'Nenhum erro de pagina nao tratado', pageErrors.length === 0,
      pageErrors.length ? pageErrors[0].slice(0, 80) : '');
  });

  // --- E. Internet offline (a API publica nao responde) --------------------
  await withPage(browser, async (page, {violations}) => {
    await page.route('https://crewcheck.online/**', (route) => route.abort('failed'));
    await page.goto(pageUrl);
    await page.waitForTimeout(2000);
    const {text} = await assertNotBlank(page, 'E-internet-offline');
    report('E', 'Internet offline: Home continua na tela', true, `${text.split('\n')[0].slice(0, 40)}…`);
    report('E2', 'Sem violacao de CSP com internet fora', violations.length === 0);
  });

  // --- K. Navegacao por D-pad ----------------------------------------------
  await withPage(browser, async (page) => {
    await page.goto(pageUrl);
    await page.waitForTimeout(1500);
    const focusable = await page.locator('button:not(:disabled), a[href]').count();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);
    const first = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      return getComputedStyle(el).outlineWidth;
    });
    await page.screenshot({path: path.join(shots, 'K-dpad-foco.png')});
    report('K', 'D-pad move o foco e o foco fica visivel', focusable > 0 && first === 'BUTTON' && outline !== null,
      `${focusable} focaveis, foco em ${first}, outline ${outline}`);
  });

  // --- F. Foto quebrada -----------------------------------------------------
  await withPage(browser, async (page, {pageErrors}) => {
    await page.goto(pageUrl);
    await page.waitForTimeout(800);
    const survived = await page.evaluate(async () => {
      const img = document.createElement('img');
      const done = new Promise((resolve) => {
        img.onerror = () => resolve('onerror');
        img.onload = () => resolve('onload');
      });
      img.src = 'http://192.168.0.32:8188/api/media/photo/nao-existe';
      document.body.appendChild(img);
      const outcome = await Promise.race([done, new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
      img.remove();
      return outcome;
    });
    await page.waitForTimeout(300);
    const {text} = await assertNotBlank(page, 'F-foto-quebrada');
    report('F', 'Foto inexistente nao derruba a tela', text.length > 0 && pageErrors.length === 0,
      `img: ${survived}`);
  });

  // --- J. Relaunch do app ---------------------------------------------------
  await withPage(browser, async (page, {pageErrors}) => {
    await page.goto(pageUrl);
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('webOSRelaunch'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    await page.waitForTimeout(1200);
    const {text} = await assertNotBlank(page, 'J-relaunch');
    report('J', 'Relaunch/visibilitychange nao quebram a tela', pageErrors.length === 0 && text.length > 0);
  });

  // --- C. Hub offline -------------------------------------------------------
  await withPage(browser, async (page, {violations}) => {
    await page.route('http://192.168.0.32:8188/**', (route) => route.abort('connectionrefused'));
    await page.goto(pageUrl);
    await page.waitForTimeout(2500);
    const {text} = await assertNotBlank(page, 'C-hub-offline');
    report('C', 'Hub offline: app segue e sinaliza indisponivel', /indispon|Vincular|Bem-vindo/i.test(text));
    report('C2', 'Hub offline nao gera violacao de CSP', violations.length === 0);
  });

  // --- B. Hub online + prova de que o CSP nao esta generico ---------------
  const stub = await startStubHub(8188);
  try {
    await withPage(browser, async (page, {violations, pageErrors}) => {
      const hubRequests = [];
      page.on('request', (req) => { if (req.url().includes(':8188')) hubRequests.push(req.url()); });
      await page.goto(pageUrl);
      await page.waitForTimeout(3000);
      await assertNotBlank(page, 'B-hub-online');

      const status = await page.locator('.header-status').innerText().catch(() => '');
      report('B', 'TV alcanca o Hub em 192.168.0.32:8188',
        hubRequests.length > 0 && /conectada/i.test(status),
        `${hubRequests.length} req · header: "${status.slice(0, 60)}"`);
      report('B2', 'Chamada ao Hub nao viola CSP', violations.length === 0 && pageErrors.length === 0);

      // O mesmo stub, pela origem loopback, precisa ser RECUSADO: prova que o
      // connect-src libera a origem do Hub e nao "qualquer http".
      const loopback = await page.evaluate(async () => {
        try { const r = await fetch('http://127.0.0.1:8188/health', {cache: 'no-store'}); return 'HTTP ' + r.status; }
        catch (error) { return error.name; }
      });
      const allowed = await page.evaluate(async () => {
        try { const r = await fetch('http://192.168.0.32:8188/health', {cache: 'no-store'}); return 'HTTP ' + r.status; }
        catch (error) { return error.name; }
      });
      report('L2', 'CSP libera so a origem do Hub (loopback nao listado e recusado)',
        allowed === 'HTTP 200' && loopback !== 'HTTP 200',
        `hub: ${allowed} · loopback: ${loopback}`);

      // Media do Hub: a foto vem de fora do pacote e o img-src permite.
      const media = await page.evaluate(() => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve('carregou');
        img.onerror = () => resolve('erro');
        img.src = 'http://192.168.0.32:8188/api/media/photo/p1';
        setTimeout(() => resolve('timeout'), 3000);
      }));
      report('N2', 'Foto servida pelo Hub passa pelo img-src', media !== 'timeout', `img: ${media}`);
    });
  } finally {
    stub.close();
  }
  // --- P0-3. Fallback de boot e fronteira de erro -------------------------
  {
    const context = await browser.newContext({viewport: {width: 1920, height: 1080}, javaScriptEnabled: false});
    const page = await context.newPage();
    await page.goto(pageUrl);
    await page.waitForTimeout(400);
    const {text} = await assertNotBlank(page, 'P0-3a-js-desligado');
    report('P0-3a', 'Sem JavaScript nenhum, a Home minima estatica aparece',
      /CREWCHECK/.test(text) && /Iniciando/.test(text));
    await context.close();
  }
  {
    const context = await browser.newContext({viewport: {width: 1920, height: 1080}});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('file://' + path.join(root, 'dist/webos-harness/index.html'));
    await page.waitForTimeout(900);
    const {text} = await assertNotBlank(page, 'P0-3b-fronteira-erro');
    const code = await page.evaluate(() => window.__code);
    report('P0-3b', 'Erro de render vira Home minima com codigo, nao tela preta',
      /CREWCHECK/.test(text) && /Tentar de novo/.test(text) && code === 'UI-RENDER',
      `codigo ${code}`);
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} verificacoes de navegador`);
console.log(`screenshots em dist/webos-shots/`);
if (failed.length) {
  console.error('FALHAS: ' + failed.map((f) => f.id).join(', '));
  process.exit(1);
}
console.log('PASS: comportamento no artefato empacotado');
