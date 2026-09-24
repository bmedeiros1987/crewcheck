import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const home = read('client/src/pages/Home.tsx');
const roster = read('client/src/components/v1391/RosterLaunchView.tsx');
const regulation1392 = read('client/src/components/v1392/ManualRegulationView.tsx');
const regulation1432 = read('client/src/components/v1432/ManualRegulationView.tsx');
const bridge = read('client/src/components/regulation/RegulationNavigationContext.tsx');
const css = read('client/src/components/v1392/v1392.css');
const navigation = read('client/src/lib/navigationContext.ts');

// Escala -> Regulamentação: one explicit action, carrying only explicit navigation refs.
assert.match(roster, /onClick=\{\(\) => openRegulationForEvent\(event\)\}/, 'Escala deve ter CTA contextual de regulamentação');
assert.match(roster, /Ver regulamentação/, 'CTA precisa ser inequívoco para o usuário');
assert.match(roster, /sourceView: 'roster'/, 'origem contextual deve ser Escala');
assert.match(roster, /targetView: 'regulation'/, 'destino contextual deve ser Regulamentação');
assert.match(roster, /dateEpochMs: date\.getTime\(\)/, 'data selecionada deve viajar explicitamente');
assert.match(roster, /programId: event\.id/, 'programação deve usar id já existente, sem inferência');
assert.match(roster, /returnView: 'roster'/, 'contexto deve declarar retorno para Escala');
assert.match(roster, /policy: 'persistent-until-return'/, 'contexto deve sobreviver durante a consulta regulatória');

// Regulamentação -> Escala: clear persistent context, deposit one-shot roster focus, then navigate.
assert.match(bridge, /peekPendingNavigationContext\('regulation'\)/, 'ponte deve ler somente contexto destinado à Regulamentação');
assert.match(bridge, /context\.sourceView === 'roster'/, 'retorno só aparece quando a origem é Escala');
assert.match(bridge, /context\.returnView === 'roster'/, 'retorno só aparece quando foi explicitamente solicitado');
assert.match(bridge, /clearPendingNavigationContext\(\);[\s\S]*setPendingRosterFocus\(new Date\(epoch\)\)/, 'retorno deve trocar contexto persistente por foco one-shot da Escala');
assert.match(bridge, /CustomEvent\('crewcheck:set-view', \{ detail: 'roster' \}\)/, 'retorno deve navegar à Escala em uma ação');
assert.match(bridge, /restaura o mesmo dia da escala/, 'UI deve explicar o retorno contextual');

// Direct/global navigation must clear stale context instead of fabricating a roster return.
assert.match(home, /const \[view, setViewState\] = useState<ZeroView>/, 'Home deve interpor guarda de navegação global');
assert.match(home, /const pendingNavigation = peekPendingNavigationContext\(\);/, 'guarda deve consultar contexto pendente');
assert.match(home, /pendingNavigation\.targetView !== nextView\) clearPendingNavigationContext\(\)/, 'destino global diferente deve limpar contexto antigo');
assert.match(home, /setViewState\(nextView\)/, 'guarda deve preservar a navegação normal');

// Both regulation implementations must render the same contextual bridge; prepared builds use v1432.
assert.match(regulation1392, /<RegulationNavigationContext\/>/, 'Regulamentação base deve suportar retorno contextual');
assert.match(regulation1432, /<RegulationNavigationContext\/>/, 'Regulamentação preparada deve suportar retorno contextual');

// Privacy/architecture: navigation relay is memory-only; bridge owns no operational/regulatory truth.
assert.doesNotMatch(bridge, /localStorage|sessionStorage|indexedDB|fetch\(|authFetch|Health|Samsung/i, 'ponte contextual não pode persistir ou buscar dados');
assert.doesNotMatch(bridge, /pdfParser|canonicalRoster|complianceEngine|RBAC|Tabela B\.1|dutyLimit|flightLimit/i, 'ponte não pode duplicar parser ou motor regulatório');
assert.doesNotMatch(navigation.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /localStorage|sessionStorage/, 'Navigation Context deve continuar somente em memória');

// UX must work in dark/light and collapse cleanly on mobile.
assert.match(css, /cc-reg-context-return/, 'retorno contextual precisa de estilo próprio');
assert.match(css, /html\[data-crew-theme="light"\] \.cc-reg-context-return/, 'retorno contextual precisa de Light mode');
assert.match(css, /@media\(max-width:620px\)[\s\S]*cc-reg-context-return/, 'retorno contextual precisa adaptar no mobile');

console.log('[p1-565] PASS — Escala ↔ Regulamentação preserva contexto/retorno sem duplicar regra regulatória.');
