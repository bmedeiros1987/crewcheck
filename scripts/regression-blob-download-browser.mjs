import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const bundle = await build({ entryPoints: ['client/src/lib/blobDownload.ts'], bundle: true, write: false, format: 'iife', globalName: 'downloads', platform: 'browser' });
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><meta name="viewport" content="width=device-width"><button id="pdf">PDF sintético</button><button id="ics">Calendário sintético</button><script>' + bundle.outputFiles[0].text + `
  const data = {pdf: '%PDF-1.4\\nSYNTHETIC ONLY\\n%%EOF', ics: 'BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nEND:VCALENDAR'};
  for (const type of ['pdf', 'ics']) document.getElementById(type).onclick = async () => {
    // Real export/decryption handlers await work before requesting the download.
    await new Promise(resolve => setTimeout(resolve, 100));
    downloads.requestBlobDownload(new Blob([data[type]], {type:type==='pdf'?'application/pdf':'text/calendar'}), 'SYNTHETIC.'+type);
  };
  </script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, headless: true });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-synthetic-download-'));
try {
  for (const width of [320, 430, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
    const page = await context.newPage(); await page.goto('http://127.0.0.1:' + server.address().port);
    for (const type of ['pdf', 'ics', 'pdf']) {
      const wait = page.waitForEvent('download'); await page.locator('#'+type).click();
      const download = await wait; assert.equal(download.suggestedFilename(), 'SYNTHETIC.'+type);
      const target = path.join(dir, width+'-'+type); await download.saveAs(target);
      assert.equal(await download.failure(), null);
      assert.equal(fs.readFileSync(target, 'utf8'), type === 'pdf' ? '%PDF-1.4\nSYNTHETIC ONLY\n%%EOF' : 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR');
    }
    await context.close();
  }
  console.log('PASS Chromium real download events/bytes: PDF/ICS/repeat after async generation at 320/430/768/1280; browser only, no physical APK/PWA claim');
} finally { await browser.close(); server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
