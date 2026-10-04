import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('.audio-qa/package.json'));
const { chromium } = require('playwright');
const url = 'https://crewcheck.onrender.com/assets/sounds/a320-interphone-cc0.mp3';
const expectedSha = 'ae418dc21f3aa73ee49888601db666051a2f549fbc8394b1daef280d6761c2e6';
const output = path.resolve('artifacts/deployed-audio');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const mediaResponses = [];
page.on('response', response => {
  if (response.url() === url) mediaResponses.push({ status: response.status(), contentType: response.headers()['content-type'] });
});
try {
  const response = await context.request.get(url);
  assert.equal(response.status(), 200);
  const bytes = await response.body();
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expectedSha);
  assert.equal(bytes.length, 107690);
  const healthResponse = await context.request.get('https://crewcheck.onrender.com/api/health');
  assert.equal(healthResponse.status(), 200);
  const health = await healthResponse.json();
  assert.equal(health.ok, true);
  assert.equal(health.release, '5ea80bdec55ab95c592139869dc9c08cfa0efb17');
  // Use a public JSON page to establish the deployed origin without mounting the app.
  // The asset correctly has Cross-Origin-Resource-Policy: same-origin.
  await page.goto('https://crewcheck.onrender.com/assets/sounds/ATTRIBUTION.json');
  // No app/account UI, stored preference, notification permission or notification is used.
  // A muted isolated player loads the exact public URL under its real response MIME.
  await page.setContent(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><h1>Verificação isolada do áudio público</h1><p>Som silenciado nesta verificação. Nenhuma conta ou configuração de usuário.</p><audio id="sound" controls muted preload="none" src="${url}"></audio><button id="play">Reproduzir teste silenciado</button><button id="stop">Parar teste</button><script>document.getElementById('play').onclick=()=>document.getElementById('sound').play().catch(error=>window.__playError=String(error));document.getElementById('stop').onclick=()=>document.getElementById('sound').pause();</script></html>`);
  await page.getByRole('button', { name: 'Reproduzir teste silenciado' }).click();
  await page.waitForFunction(() => { const audio = document.getElementById('sound'); return audio.currentTime > 0.3 && audio.readyState >= 2; }, { timeout: 30_000 });
  const media = await page.evaluate(() => {
    const a = document.getElementById('sound');
    return { currentTime: a.currentTime, duration: a.duration, readyState: a.readyState, paused: a.paused, muted: a.muted, errorCode: a.error?.code ?? null, playError: window.__playError ?? null };
  });
  assert.equal(media.errorCode, null); assert.equal(media.playError, null); assert.equal(media.muted, true);
  assert(media.duration > 4 && media.duration < 5); assert.equal(media.paused, false);
  assert(mediaResponses.some(r => r.status === 200 || r.status === 206));
  await page.getByRole('button', { name: 'Parar teste' }).click();
  assert(await page.evaluate(() => document.getElementById('sound').paused));
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(output, 'muted-public-audio-check.png') });
  const result = { ok: true, checkedAt: new Date().toISOString(), sourceUrl: url, resourceContentType: response.headers()['content-type'], sha256: expectedSha, bytes: bytes.length, release: health.release, media, mediaResponses, account: 'none', changesToProduction: 'none' };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), pageErrors: errors, mediaResponses }, null, 2));
  throw error;
} finally { await browser.close(); }
