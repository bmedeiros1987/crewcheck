import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const home = read('client/src/pages/Home.tsx');
const bridge = read('client/src/components/navigation/StayNavigationContext.tsx');
const css = read('client/src/components/navigation/stay-context.css');
const navigation = read('client/src/lib/navigationContext.ts');

// Pernoite publishes one explicit stay identity into the shared in-memory Navigation Context.
assert.match(home, /function openStaySurface\(event: ZeroLeg, targetView: 'wakeup' \| 'concierge'\)/, 'Pernoite deve usar uma única ponte contextual');
for (const marker of [
  "sourceView: 'hotels'",
  'dateEpochMs: event.date.getTime()',
  'stayId: event.id',
  "airportCode: String(event.destination || event.origin || '').trim() || undefined",
  "returnView: 'hotels'",
  "returnLabel: 'Voltar ao Pernoite'",
  "policy: 'persistent-until-return'",
]) assert.ok(home.includes(marker), `contexto de pernoite ausente: ${marker}`);

assert.match(home, /openStaySurface\(event, 'wakeup'\)/, 'card de pernoite deve abrir Despertador com contexto');
assert.match(home, /openStaySurface\(event, 'concierge'\)/, 'card de pernoite deve abrir Concierge com contexto');
assert.match(home, /<StayNavigationContext targetView="wakeup"\/>/, 'Despertador deve oferecer retorno contextual');
assert.match(home, /<StayNavigationContext targetView="concierge"\/>/, 'Concierge deve oferecer retorno contextual');

// The destination bridge is navigation/display only: it does not recalculate APZ, alarms,
// roster truth or health facts and direct/menu entry renders nothing.
assert.match(bridge, /context\.sourceView === 'hotels'/, 'ponte só deve aceitar origem Pernoite');
assert.match(bridge, /context\.returnView === 'hotels'/, 'retorno deve ser explicitamente Pernoite');
assert.match(bridge, /context\.stayId/, 'retorno contextual exige identidade explícita do pernoite');
assert.match(bridge, /clearPendingNavigationContext\(\);[\s\S]*detail: 'hotels'/, 'retorno deve limpar o contexto antes de voltar');
assert.match(bridge, /if \(!stayContext\(context, targetView\)\) return null;/, 'entrada global não pode inventar contexto de pernoite');

const bridgeRuntime = bridge.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assert.doesNotMatch(bridgeRuntime, /localStorage|sessionStorage|indexedDB|fetch\(|authFetch|Health|Samsung/i, 'ponte não pode persistir, buscar ou acessar saúde');
assert.doesNotMatch(bridgeRuntime, /pdfParser|canonicalRoster|complianceEngine|RBAC|\bACT\b|dutyLimit|journeyLimit|presentationOf|alarm\/schedule/i, 'ponte não pode duplicar parser, compliance, APZ ou motor de alarmes');
const navigationRuntime = navigation.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
assert.doesNotMatch(navigationRuntime, /localStorage|sessionStorage/, 'Navigation Context deve continuar somente em memória');

// Privacy: the context carries the stay id/date/airport, not room, hotel payload, tokens or raw roster.
const contextCall = home.match(/setPendingNavigationContext\(\{[\s\S]*?policy: 'persistent-until-return',[\s\S]*?\}\);/)?.[0] || '';
assert.ok(contextCall, 'depósito de Navigation Context do pernoite não localizado');
assert.doesNotMatch(contextCall, /room|hotelName|address|token|email|cpf|rawText|roster:/i, 'contexto de navegação não deve transportar dado sensível ou payload canônico');

// Light/Dark/mobile/accessibility parity.
assert.match(css, /cc-stay-context-return/, 'faixa contextual precisa de estilo próprio');
assert.match(css, /html\[data-crew-theme="light"\] \.cc-stay-context-return/, 'faixa precisa de Light mode');
assert.match(css, /@media \(max-width: 620px\)/, 'faixa precisa adaptar no mobile');
assert.match(bridge, /aria-label="Contexto aberto pelo Pernoite"/, 'faixa deve ter descrição acessível');

console.log('[p1-566-stay] PASS — Pernoite ↔ Despertador/Concierge preserva contexto explícito, privacidade e retorno.');
