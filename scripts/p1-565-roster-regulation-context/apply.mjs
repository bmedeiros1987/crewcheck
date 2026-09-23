import fs from 'node:fs';

const MARKER = 'p1-565-roster-regulation-context';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[${MARKER}] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function required(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[${MARKER}] Âncora ausente: ${label}`);
  return source.replace(before, after);
}

update('client/src/pages/Home.tsx', (source) => {
  let next = source;
  next = required(
    next,
    "import { consumePendingRosterFocus, setPendingRosterFocus } from '@/lib/rosterFocus';",
    "import { consumePendingRosterFocus, setPendingRosterFocus } from '@/lib/rosterFocus';\nimport { clearPendingNavigationContext, peekPendingNavigationContext } from '@/lib/navigationContext';",
    'import Navigation Context',
  );

  if (!next.includes('const [view, setViewState] = useState<ZeroView>')) {
    const line = next.split('\n').find((value) => value.includes('const [view, setView] = useState<ZeroView>'));
    if (!line) throw new Error(`[${MARKER}] Estado view/setView não localizado.`);
    const replacement = line.replace('[view, setView]', '[view, setViewState]');
    next = next.replace(line, `${replacement}\n  function setView(nextView: ZeroView) {\n    const pendingNavigation = peekPendingNavigationContext();\n    if (!pendingNavigation || pendingNavigation.targetView !== nextView) clearPendingNavigationContext();\n    setViewState(nextView);\n  }`);
  }

  return next;
});

update('client/src/components/v1391/RosterLaunchView.tsx', (source) => {
  let next = source;
  next = required(
    next,
    "import '@/components/v1397/roster-premium.css';",
    "import { setPendingNavigationContext } from '@/lib/navigationContext';\nimport '@/components/v1397/roster-premium.css';",
    'import Navigation Context no roster',
  );

  if (!next.includes('function openRegulationForEvent(event: RosterEvent)')) {
    const anchor = '  return <div className="cc-roster-premium-v1397">';
    if (!next.includes(anchor)) throw new Error(`[${MARKER}] Retorno principal do roster não localizado.`);
    const helper = `  function openRegulationForEvent(event: RosterEvent) {\n    const date = dateOf(event);\n    setPendingNavigationContext({\n      sourceView: 'roster',\n      targetView: 'regulation',\n      dateEpochMs: date.getTime(),\n      programId: event.id,\n      returnView: 'roster',\n      returnLabel: 'Voltar para Escala',\n      policy: 'persistent-until-return',\n    });\n    setView('regulation');\n  }\n\n`;
    next = next.replace(anchor, `${helper}${anchor}`);
  }

  if (!next.includes('onClick={() => openRegulationForEvent(event)}')) {
    const anchor = "                  {(eventPerDiems.length > 0 || earning) && <button type=\"button\" onClick={() => setView(earning ? 'salary' : 'perdiem')}><Banknote/> Ver memória de cálculo</button>}";
    if (!next.includes(anchor)) throw new Error(`[${MARKER}] Ações do card da escala não localizadas.`);
    const regulation = "                  {['operating', 'extra', 'reserve', 'standby', 'training', 'duty'].includes(mode) && <button type=\"button\" onClick={() => openRegulationForEvent(event)}><ShieldCheck/> Ver regulamentação</button>}\n";
    next = next.replace(anchor, `${regulation}${anchor}`);
  }

  return next;
});

for (const path of [
  'client/src/components/v1392/ManualRegulationView.tsx',
  'client/src/components/v1432/ManualRegulationView.tsx',
]) {
  update(path, (source) => {
    let next = source;
    const cssImport = path.includes('/v1432/') ? "import '../v1392/v1392.css';" : "import './v1392.css';";
    next = required(
      next,
      cssImport,
      `${cssImport}\nimport RegulationNavigationContext from '@/components/regulation/RegulationNavigationContext';`,
      `import contextual em ${path}`,
    );
    if (!next.includes('<RegulationNavigationContext/>')) {
      const anchor = '  return <>\n    <section className="cz-panel-head cz-regulation-heading';
      if (!next.includes(anchor)) throw new Error(`[${MARKER}] Cabeçalho de regulamentação não localizado em ${path}.`);
      next = next.replace(anchor, '  return <>\n    <RegulationNavigationContext/>\n    <section className="cz-panel-head cz-regulation-heading');
    }
    return next;
  });
}

update('client/src/components/v1392/v1392.css', (source) => {
  if (source.includes('/* CrewCheck #565 contextual regulation return */')) return source;
  return `${source.trimEnd()}\n\n/* CrewCheck #565 contextual regulation return */\n.cc-reg-context-return{display:flex;align-items:center;gap:16px;margin:0 0 14px;padding:14px 16px;border:1px solid rgba(103,232,249,.22);border-radius:18px;background:linear-gradient(135deg,rgba(8,47,78,.86),rgba(30,31,76,.72));box-shadow:0 12px 30px rgba(0,0,0,.12)}\n.cc-reg-context-return>button{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:10px 14px;border:1px solid rgba(103,232,249,.28);border-radius:13px;background:rgba(19,78,112,.52);color:#eefaff;font:inherit;font-weight:850;white-space:nowrap;cursor:pointer}\n.cc-reg-context-return>button span{font-size:20px;line-height:1}\n.cc-reg-context-return>div{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}\n.cc-reg-context-return small{color:#67e8f9;font-size:10px;font-weight:900;letter-spacing:.11em}\n.cc-reg-context-return strong{color:#f8fbff;font-size:14px}\n.cc-reg-context-return div>span{color:#aabfd2;font-size:12px;line-height:1.4}\nhtml[data-crew-theme=\"light\"] .cc-reg-context-return{border-color:rgba(8,127,172,.22);background:linear-gradient(135deg,rgba(235,248,255,.98),rgba(243,239,255,.98));box-shadow:0 10px 26px rgba(31,78,111,.1)}\nhtml[data-crew-theme=\"light\"] .cc-reg-context-return>button{border-color:rgba(8,127,172,.25);background:#fff;color:#0b3855}\nhtml[data-crew-theme=\"light\"] .cc-reg-context-return small{color:#087fac}\nhtml[data-crew-theme=\"light\"] .cc-reg-context-return strong{color:#08243e}\nhtml[data-crew-theme=\"light\"] .cc-reg-context-return div>span{color:#4e687d}\n@media(max-width:620px){.cc-reg-context-return{align-items:stretch;flex-direction:column}.cc-reg-context-return>button{width:100%}}\n`;
});

console.log(`[${MARKER}] Escala ↔ Regulamentação contextual e retorno por data aplicados.`);
