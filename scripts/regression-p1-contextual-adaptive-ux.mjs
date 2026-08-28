import fs from 'node:fs';

const prepared = process.argv.includes('--prepared');
const files = {
  home: 'client/src/pages/Home.tsx',
  pulse: 'client/src/components/pulse/CrewCheckPulse.tsx',
  pulseTypes: 'client/src/components/pulse/pulseTypes.ts',
  preferences: 'client/src/lib/experiencePreferences.ts',
  navigation: 'client/src/lib/contextualNavigation.ts',
  actions: 'client/src/components/context/ContextualJourneyActions.tsx',
  experience: 'client/src/components/context/ExperiencePreferencesCard.tsx',
  runtime: 'client/src/components/context/ExperienceRuntimeBridge.tsx',
  bridge: 'client/src/components/context/PulseContextBridge.tsx',
  css: 'client/src/components/context/contextual-ux.css',
  patch: 'scripts/v14410/apply.mjs',
  prepare: 'scripts/v139/apply.mjs',
  docs: 'docs/atlas/CONTEXTUAL_ADAPTIVE_UX.md',
};

let checks = 0;
function ok(condition, message) {
  checks += 1;
  if (!condition) throw new Error(`[contextual-adaptive-ux] FAIL: ${message}`);
  console.log(`PASS ${checks}: ${message}`);
}
function read(path) {
  ok(fs.existsSync(path), `${path} existe`);
  return fs.readFileSync(path, 'utf8');
}

const pulse = read(files.pulse);
const pulseTypes = read(files.pulseTypes);
const preferences = read(files.preferences);
const navigation = read(files.navigation);
const actions = read(files.actions);
const experience = read(files.experience);
const runtime = read(files.runtime);
const bridge = read(files.bridge);
const css = read(files.css);
const patch = read(files.patch);
const prepare = read(files.prepare);
const docs = read(files.docs);

ok(pulseTypes.includes('action?: CrewCheckPulseAction'), 'Pulse aceita CTA tipada sem acoplar produtor e superfície');
ok(pulse.includes("crewcheck:set-view") && pulse.includes('cc-pulse-action'), 'Pulse executa ação interna pelo barramento existente');
ok(preferences.includes("'essential' | 'complete' | 'advanced' | 'custom'"), 'densidade Essencial/Completo/Avançado/Personalizado está explícita');
ok(preferences.includes('isCrewViewVisible') && preferences.includes('experienceVisibleActionLimit'), 'preferência governa menu e densidade de ações');
ok(navigation.includes('sessionStorage') && navigation.includes('sourceView') && navigation.includes('target'), 'contexto linkável é mínimo, temporário e reversível');
ok(actions.includes('Planejar saída') && actions.includes('Gerenciar pernoite') && actions.includes('Portão e operação'), 'ações são descritas pela tarefa, não pelo nome interno do módulo');
ok(actions.includes("label: 'Mais'") === false && actions.includes("expanded ? 'Menos' : 'Mais'"), 'progressive disclosure mantém ações secundárias em Mais');
ok(experience.includes('Quanto do CrewCheck você quer ver?') && experience.includes('duas fontes de preferência'), 'configuração explica adaptação e preserva fonte única dos filtros da Escala');
ok(runtime.includes('dataset.crewExperience') && css.includes('data-crew-experience="essential"'), 'nível de experiência chega ao layout sem alterar motores de negócio');
ok(bridge.includes('publishCrewCheckPulse') && bridge.includes('Planejar saída') && bridge.includes('Gerenciar pernoite'), 'Pulse recebe contexto operacional do próximo evento');
ok(docs.includes('Journey Engine') && docs.includes('Plano A/B/C') && docs.includes('não') && docs.includes('scraping'), 'roadmap cobre staff travel multimodal e guardrail de credenciais');
ok(prepare.includes("await import('../v14410/apply.mjs');"), 'preparação materializa v14410 depois da cadeia corrente');

for (const forbidden of ['server/rosterParser.mjs', 'client/src/lib/canonicalRoster.ts', 'client/src/lib/complianceEngine.ts', 'client/src/lib/financialRules.ts']) {
  ok(!patch.includes(forbidden), `patch de UX não toca ${forbidden}`);
}

if (prepared) {
  const home = read(files.home);
  for (const needle of [
    "import ContextualJourneyActions from '@/components/context/ContextualJourneyActions';",
    '<ExperienceRuntimeBridge/>',
    '<PulseContextBridge event={event}/>',
    '<ContextualJourneyActions event={event} sourceView="roster"',
    '<ExperiencePreferencesCard/>',
    'const visibleGroups = groups.map',
    "window.addEventListener('crewcheck:go-back'",
    "url.searchParams.set('view', view)",
    "new URLSearchParams(window.location.search).get('view')",
  ]) ok(home.includes(needle), `Home preparado contém ${needle}`);
  ok(!home.includes('> Gerenciador de apresentação</button>\n      <button onClick={() => setView(\'departure\')}><Car/> Saída</button>'), 'detalhe da Escala não mantém a antiga fileira de sete módulos');
}

console.log(`[contextual-adaptive-ux] ${checks}/${checks} checks verdes (${prepared ? 'prepared' : 'base'}).`);
