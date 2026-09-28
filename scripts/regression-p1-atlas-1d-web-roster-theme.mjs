import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8').replaceAll('\r\n', '\n');

const roster = read('client/src/components/v1391/RosterLaunchView.tsx');
const rosterCss = read('client/src/components/v1397/roster-premium.css');
const flyDeckCss = read('scripts/v14353/flydeck-premium.css');
const flyDeckApply = read('scripts/v14353/apply.mjs');
const webDesktopShell = read('client/src/styles/web-desktop-shell.css');
const chain = read('scripts/v139/apply.mjs');

assert.match(roster, /function publishedClock\(value\?: string \| null\)/, 'Escala Web deve normalizar horários publicados');
assert.match(roster, /event\.day\?\.dutyReport \|\| event\.day\?\.startTime \|\| event\.departure/, 'início deve priorizar os campos publicados sem tocar no parser');
assert.match(roster, /event\.day\?\.dutyDebrief \|\| event\.day\?\.endTime \|\| event\.arrival/, 'fim deve priorizar os campos publicados sem tocar no parser');
assert.match(roster, /aria-label="Horários publicados da programação"/, 'grade de horários deve ter nome acessível');
assert.match(roster, /<small>Início<\/small><b>\{programWindow\.start \|\| 'A confirmar'\}<\/b>/, 'início deve aparecer explicitamente ou assumir estado não inventado');
assert.match(roster, /<small>Fim<\/small><b>\{programWindow\.end \|\| 'A confirmar'\}<\/b>/, 'fim deve aparecer explicitamente ou assumir estado não inventado');
assert.doesNotMatch(roster, /publishedClock\(event\.canonical/, 'horários inferidos do canônico não devem ser apresentados como publicados');

assert.match(rosterCss, /\.cc-roster-program-time-grid-v1397\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, 'horários devem manter leitura lado a lado quando houver espaço');
assert.match(rosterCss, /var\(--program-accent\)/, 'horários devem herdar a semântica cromática da programação');
assert.match(rosterCss, /var\(--ccr-panel-soft\)/, 'superfície de horário deve usar token temático da Escala');

assert.doesNotMatch(flyDeckCss, /\[data-theme=['"]light['"]\]/, 'FlyDeck não pode observar o atributo de tema legado');
assert.match(flyDeckCss, /html\[data-crew-theme='light'\] \.cc-flydeck-premium-v14353/, 'tokens Light do FlyDeck devem observar o contrato atual do runtime');
assert.match(flyDeckCss, /html\[data-crew-theme='light'\] \.cc-flydeck-briefing/, 'superfície Light do briefing deve acompanhar o shell');
assert.match(flyDeckCss, /html\[data-crew-theme='light'\] \.cc-flydeck-facts/, 'fatos do briefing devem acompanhar o tema Light');
assert.match(webDesktopShell, /background: var\(--cc-surface-premium-strong, #ffffff\) !important;/, 'override Web final deve manter o briefing na superfície Light');
assert.doesNotMatch(webDesktopShell, /linear-gradient\(145deg, #0f1b30, #071426\)/, 'override Web não pode recriar uma ilha Dark no tema Light');

assert.match(flyDeckApply, /flydeck-premium\.css/, 'fonte fixada do FlyDeck deve continuar sendo a origem do CSS preparado');
assert.match(chain, /await import\('\.\.\/v14353\/apply\.mjs'\);/, 'correção deve atravessar a cadeia canônica de preparação');

process.env.CREWCHECK_V14353_SKIP_APPLY = '1';
const { installFlyDeckPremiumCssV14353 } = await import('./v14353/apply.mjs');
const preparedCss = installFlyDeckPremiumCssV14353(read('client/src/index.css'));
assert.match(preparedCss, /html\[data-crew-theme='light'\] \.cc-flydeck-briefing/, 'estado preparado deve materializar o seletor Light correto');
assert.doesNotMatch(preparedCss, /\[data-theme=['"]light['"]\] \.cc-flydeck/, 'estado preparado não pode reintroduzir o seletor legado');

console.log('Atlas 1D: horários publicados e coerência Light/Dark validados no cliente e na fonte preparada.');
