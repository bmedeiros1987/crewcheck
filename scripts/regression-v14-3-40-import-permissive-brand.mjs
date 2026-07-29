import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const chain = read('scripts/v139/apply.mjs');
const clientParser = read('client/src/lib/pdfParser.ts');
const serverParser = read('server/rosterParser.mjs');
const home = read('client/src/pages/Home.tsx');
const brand = read('client/src/lib/brand.ts');
const manifest = read('client/public/manifest.json');
const android = read('android-wrapper/app/build.gradle');
const release = read('client/public/release.json');

assert.ok(chain.includes("await import('../v14340/apply.mjs');"), 'v14.3.40 deve encerrar a preparação canônica');
assert.ok(clientParser.includes('function rescueFlightsFromVisualRows('), 'cliente precisa resgatar linhas visuais rotacionadas');
assert.ok(clientParser.includes('importação seguirá e o fallback visual do servidor será acionado'), 'integridade deve virar diagnóstico, não bloqueio');
assert.ok(!clientParser.includes('A importação foi bloqueada para não salvar uma escala incompleta'), 'cliente não pode bloquear CrewRosterReport reconhecível');
assert.ok(serverParser.includes('function buildServerVisualRows('), 'servidor precisa escolher orientação visual');
assert.ok(serverParser.includes('function rescueServerFlightsFromVisualPages('), 'servidor precisa resgatar voos diretamente das páginas');
assert.ok(serverParser.includes('scoreServerRows(rotated) > scoreServerRows(normal)'), 'orientação deve ser escolhida por qualidade');
assert.ok(!serverParser.includes('importação parcial bloqueada'), 'servidor não pode recusar o PDF por diagnóstico de qualidade');
assert.ok(home.includes("const DEFAULT_VERSION = '14.3.48';"), 'versão Web/PWA final 14.3.48 ausente');
assert.ok(home.includes('A escala será importada mesmo assim'), 'guardião deve avisar e continuar');
assert.ok(home.includes('/icons/crewcheck-icon-v3.png?v=14340'), 'cabeçalho deve usar a marca canônica v3');
assert.ok(brand.includes('/icons/crewcheck-icon-v3.png'), 'PDF e compartilhamento devem usar a marca v3');
assert.ok(manifest.includes('/icons/crewcheck-icon-v3.png?v=14340'), 'PWA deve usar a marca v3');
assert.ok(android.includes('crewcheck-icon-v3.png'), 'Android deve copiar a marca v3');
assert.ok(release.includes('14.3.48'), 'release final 14.3.48 ausente');

const icon = path.join(root, 'client/public/icons/crewcheck-icon-v3.png');
assert.ok(fs.existsSync(icon) && fs.statSync(icon).size > 1024, 'ícone canônico v3 deve ser gerado');
const svg = read('client/public/brand/crewcheck-mark.svg');
for (const color of ['#9A4DFF', '#EC2C86', '#27C3E8']) assert.ok(svg.includes(color), `cor da marca ausente: ${color}`);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-v14340-'));
try {
  const modulePath = path.join(tempDir, 'rosterParser-test.mjs');
  const exported = serverParser.replace(
    'export { parsePdfOnServer };',
    'export { parsePdfOnServer, buildServerVisualRows, rescueServerFlightsFromVisualPages };',
  );
  assert.notEqual(exported, serverParser, 'hooks do parser não puderam ser exportados para regressão');
  fs.writeFileSync(modulePath, exported, 'utf8');
  const parser = await import(`${pathToFileURL(modulePath).href}?v=${Date.now()}`);
  const items = [];
  const row = (x, tokens) => tokens.forEach((str, index) => items.push({ str, x, y: 1000 - index * 38, page: 1 }));
  row(20, ['Roster Report', '01-Aug-2026', 'to', '01-Sep-2026', 'BRUNO', '|', '04453812', '|', 'JJCC320', 'BSB', 'CCM']);
  row(80, ['01-Aug-2026', 'Sat']);
  row(90, ['LA3512', 'OP', 'BSB', '14:50', 'IMP', '16:45', '320']);
  row(100, ['GRU', '16:45(+1)']);
  row(110, ['12:55(+1)', 'LA3377', 'OP', 'REC', '13:25(+1)', '320']);
  const pages = [{ pageNo: 1, items }];
  const visualRows = parser.buildServerVisualRows(pages);
  assert.ok(visualRows.some((item) => item.text.includes('LA3512 OP BSB 14:50 IMP 16:45')), 'linha rotacionada principal não reconstruída');
  const rescued = parser.rescueServerFlightsFromVisualPages([], pages, 8, 2026, 'BSB');
  const legs = rescued.flatMap((day) => day.legs || []);
  assert.ok(legs.some((leg) => leg.flightNumber === 'LA3512' && leg.origin === 'BSB' && leg.destination === 'IMP'), 'LA3512 BSB→IMP não resgatado');
  assert.ok(legs.some((leg) => leg.flightNumber === 'LA3377' && leg.origin === 'REC' && leg.destination === 'GRU'), 'LA3377 REC→GRU não resgatado no layout dividido');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('v14.3.40 importação permissiva, Jasper rotacionado e marca canônica OK');
