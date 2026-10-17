import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(process.env.MENU_PLAYWRIGHT_PACKAGE || import.meta.url);
const { chromium } = require('playwright');
const output = process.env.SPLASH_MASK_OUTPUT_DIR || '/tmp/crewcheck-splash-mask';
const resource = 'android-wrapper/app/src/main/res';
const theme = fs.readFileSync(`${resource}/values-v31/styles.xml`, 'utf8');
const wrapper = fs.readFileSync(`${resource}/drawable/crewcheck_splash_icon.xml`, 'utf8');
assert.match(theme, /name="android:windowSplashScreenAnimatedIcon">@drawable\/crewcheck_splash_icon</);
assert.match(wrapper, /android:src="@drawable\/crewcheck_logo_neon"/);
assert.match(wrapper, /android:gravity="fill"/);
const inset = Number(wrapper.match(/android:inset="([\d.]+)%"/)?.[1]) / 100;
assert(Number.isFinite(inset) && inset > 0 && inset < .5);
// The official safe circle is 160/240 or 192/288. The ENTIRE square, not
// merely its width, must fit: sqrt(2)*(1-2*inset) <= 2/3.
assert(Math.SQRT2 * (1 - 2 * inset) < 2 / 3, 'Square corners exceed the safe circle');
const png = fs.readFileSync(`${resource}/drawable-nodpi/crewcheck_logo_neon.png`);
const approved = fs.readFileSync('client/public/assets/brand/crewcheck-app-icon-2026.png');
assert(png.equals(approved), 'Canonical source art must remain byte-identical');
const sha256 = crypto.createHash('sha256').update(png).digest('hex');
const data = `data:image/png;base64,${png.toString('base64')}`;
const panels = [240, 288].flatMap(frame => [0, inset].map((margin, index) => {
  const offset = (360 - frame) / 2, size = frame * (1 - 2 * margin);
  return `<article><h2>${index ? 'Depois · inset ' + inset * 100 + '%' : 'Antes · PNG direto'}</h2><p>${frame} dp · círculo seguro Ø ${frame * 2 / 3} dp${frame === 240 ? ' · com fundo' : ' · sem fundo'}</p><svg width="360" height="330" viewBox="0 0 360 330"><defs><clipPath id="mask-${frame}-${index}"><circle cx="180" cy="165" r="${frame / 3}"/></clipPath></defs><rect x="${offset}" y="${165 - frame / 2}" width="${frame}" height="${frame}" fill="#10182b" stroke="#415069"/><image href="${data}" x="${180 - size / 2}" y="${165 - size / 2}" width="${size}" height="${size}" clip-path="url(#mask-${frame}-${index})"/><circle cx="180" cy="165" r="${frame / 3}" fill="none" stroke="#facc15" stroke-dasharray="5 4"/></svg></article>`;
}));
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:28px;background:#00010e;color:#eef4ff;font:16px system-ui}h1{font-size:26px;margin:0 0 8px}header p{margin:6px 0;color:#cbd5e1}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}article{border:1px solid #334155;border-radius:12px;padding:16px;text-align:center;background:#060b1b}h2{font-size:21px;margin:0}article p{font-size:14px;color:#cbd5e1;margin:8px 0}svg{display:block;margin:auto}footer{margin-top:16px;color:#cbd5e1;font-size:14px}</style><header><h1>CrewCheck · correção do recorte no splash</h1><p>Simulação geométrica da área segura oficial; não é captura de Android/aparelho.</p><p>Amarelo: círculo seguro. Cinza: quadro do drawable. PNG canônico preservado.</p></header><main class="grid">${panels.join('')}</main><footer>Android: 240/160 dp com fundo · 288/192 dp sem fundo. Inset XML de27% deixa46% do quadro para a arte.</footer></html>`;
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'comparison.html'), html);
let browser;
try {
  browser = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 960, height: 1040 }, deviceScaleFactor: 2 });
  await page.route('**/*', route => route.abort());
  await page.setContent(html);
  const metrics = await page.evaluate(async ({ data, inset }) => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const outside = margin => {
      let count = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (!pixels[(y * canvas.width + x) * 4 + 3]) continue;
        const dx = ((x + .5) / canvas.width - .5) * (1 - 2 * margin);
        const dy = ((y + .5) / canvas.height - .5) * (1 - 2 * margin);
        if (Math.hypot(dx, dy) > 1 / 3) count++;
      }
      return count;
    };
    return { width: canvas.width, height: canvas.height, directOutside: outside(0), insufficientInsetOutside: outside(1 / 6), fixedOutside: outside(inset), inset };
  }, { data, inset });
  assert.equal(metrics.width, 512); assert.equal(metrics.height, 512);
  assert(metrics.directOutside > 0, 'The old direct PNG must reproduce clipping');
  assert(metrics.insufficientInsetOutside > 0, 'A width-only 1/6 inset still clips source art');
  assert.equal(metrics.fixedOutside, 0, 'Corrected inset must preserve all painted source samples');
  await page.screenshot({ path: path.join(output, 'splash-mask-comparison.png'), fullPage: true });
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify({ ...metrics, sha256, reference: 'https://developer.android.com/develop/ui/views/launch/splash-screen', scope: 'Synthetic safe-circle geometry, not Android runtime or physical acceptance' }, null, 2) + '\n');
  console.log('PASS splash XML + original PNG SHA + safe-circle geometry; direct and 1/6 inset negative controls fail; corrected source pixels outside mask: 0');
  console.log(JSON.stringify(metrics));
} finally {
  await browser?.close();
}
