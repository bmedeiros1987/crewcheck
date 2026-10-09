import assert from 'node:assert/strict';
import fs from 'node:fs';

// Marca oficial 2026 + acabamento do FlightDeck claro. O ícone entregue pelo produto
// precisa alimentar crewcheck-icon-v2/v3 (cabeçalho, splash, favicon, PWA, Android) e
// o polimento claro não pode alcançar dark mode, timeline operacional ou o rodapé.
const official = 'client/public/assets/brand/crewcheck-app-icon-2026.png';
assert.ok(fs.existsSync(official), 'Marca 2026: ícone oficial ausente');
const png = fs.readFileSync(official);
assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Marca 2026: ícone não é PNG');
assert.equal(png.readUInt32BE(16), 512, 'Marca 2026: largura deve ser 512');
assert.equal(png.readUInt32BE(20), 512, 'Marca 2026: altura deve ser 512');
assert.equal(png[25], 6, 'Marca 2026: ícone precisa de canal alfa (cantos transparentes)');

const generator = fs.readFileSync('scripts/v13910/generate-brand-icon.mjs', 'utf8');
assert.ok(generator.includes("assets/brand/crewcheck-app-icon-2026.png") && generator.includes('copyFileSync(OFFICIAL_ICON, OUTPUT)'), 'Marca 2026: gerador não usa o ícone oficial');

// Depois do prepare, os dois nomes canônicos precisam ser exatamente o ícone oficial.
for (const prepared of ['client/public/icons/crewcheck-icon-v2.png', 'client/public/icons/crewcheck-icon-v3.png']) {
  if (fs.existsSync(prepared) && process.env.BRAND_PREPARED === 'true') assert.ok(fs.readFileSync(prepared).equals(png), `Marca 2026: ${prepared} diverge do ícone oficial`);
}

const main = fs.readFileSync('client/src/main.tsx', 'utf8');
const nav = main.indexOf('import "./styles/light-bottom-nav-signature.css";');
const polish = main.indexOf('import "./styles/light-flightdeck-polish.css";');
const brand = main.indexOf('import "./styles/brand-mark-2026.css";');
assert.ok(nav >= 0 && polish > nav && brand > polish, 'Marca 2026: folhas não importadas depois do rodapé claro');

const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '');
const selectors = (source) => [...strip(source).matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());

const light = fs.readFileSync('client/src/styles/light-flightdeck-polish.css', 'utf8');
for (const selector of selectors(light)) {
  assert.ok(selector.startsWith('html[data-crew-theme="light"]'), `FlightDeck claro: seletor fora do tema claro: ${selector}`);
  assert.ok(/\.cc-(home-layout-heading|flydeck-briefing|flydeck-phase|flydeck-roster-link)\b/.test(selector), `FlightDeck claro: seletor fora do topo do briefing: ${selector}`);
  assert.ok(!/timeline|line-of-day|bottom-nav|cz-nav|dark/.test(selector), `FlightDeck claro: seletor proibido: ${selector}`);
}
assert.ok(!/(^|[^-])color\s*:/.test(strip(light)), 'FlightDeck claro: não altera cores de texto/ícones');

const auth = fs.readFileSync('client/src/styles/brand-mark-2026.css', 'utf8');
for (const selector of selectors(auth)) assert.ok(selector.includes('.cz-auth-brand > span'), `Marca 2026: seletor fora do selo da entrada: ${selector}`);
assert.ok(auth.includes("/icons/crewcheck-icon-v3.png"), 'Marca 2026: entrada não usa o ícone canônico');

console.log('[brand-2026] ícone oficial 512 com alfa no pipeline canônico; FlightDeck claro restrito ao topo do briefing; dark, timeline e rodapé intocados.');
