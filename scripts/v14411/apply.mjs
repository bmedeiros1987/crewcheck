import fs from 'node:fs';

const HOME = 'client/src/pages/Home.tsx';
const VERSION = '14.4.11';

if (!fs.existsSync(HOME)) throw new Error(`[v${VERSION}] Home.tsx não encontrado.`);

let source = fs.readFileSync(HOME, 'utf8');
let changed = false;

function replaceRequired(before, after, label) {
  if (source.includes(after)) return;
  if (!source.includes(before)) throw new Error(`[v${VERSION}] âncora não encontrada: ${label}`);
  source = source.replace(before, after);
  changed = true;
}

if (!source.includes("@/components/voyage/VoyageIntegrated")) {
  const anchor = "import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';";
  replaceRequired(anchor, `${anchor}\nimport VoyageIntegrated from '@/components/voyage/VoyageIntegrated';`, 'import VoyageIntegrated');
}

if (!/\|\s*'voyage'\b/.test(source)) {
  const anchor = "  | 'radar' | 'weather' | 'perdiem'";
  replaceRequired(anchor, "  | 'voyage' | 'radar' | 'weather' | 'perdiem'", 'ZeroView voyage');
}

if (!source.includes("['voyage','Voyage','Beyond the trip · integrado ao CrewCheck',Globe2]")) {
  const navMatch = source.match(/const\s+nav\s*:\s*Array<\[ZeroView,\s*string,\s*string,\s*any\]>\s*=\s*\[/);
  if (!navMatch || navMatch.index === undefined) throw new Error(`[v${VERSION}] âncora não encontrada: nav array Voyage`);
  const insertAt = navMatch.index + navMatch[0].length;
  const insertion = "\n    ['voyage','Voyage','Beyond the trip · integrado ao CrewCheck',Globe2],";
  source = `${source.slice(0, insertAt)}${insertion}${source.slice(insertAt)}`;
  changed = true;
}

if (!source.includes("view === 'voyage' && <VoyageIntegrated")) {
  const conciergeMarker = "{view === 'concierge' && <TelegramConciergeView";
  const markerIndex = source.indexOf(conciergeMarker);
  if (markerIndex < 0) throw new Error(`[v${VERSION}] âncora não encontrada: render Voyage`);
  const lineStart = source.lastIndexOf('\n', markerIndex) + 1;
  const indentation = source.slice(lineStart, markerIndex);
  const insertion = `${indentation}{view === 'voyage' && <VoyageIntegrated roster={bundle.roster} source={bundle.source} onBack={() => setView('cockpit')}/>}\n`;
  source = `${source.slice(0, lineStart)}${insertion}${source.slice(lineStart)}`;
  changed = true;
}

if (!source.includes(`const CREWCHECK_VOYAGE_INTEGRATION_VERSION = '${VERSION}';`)) {
  const anchor = "const CREWCHECK_UI_CORE_NOTE =";
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error(`[v${VERSION}] âncora de versão não encontrada.`);
  const lineEnd = source.indexOf('\n', index);
  source = `${source.slice(0, lineEnd + 1)}const CREWCHECK_VOYAGE_INTEGRATION_VERSION = '${VERSION}';\n${source.slice(lineEnd + 1)}`;
  changed = true;
}

if (changed) {
  fs.writeFileSync(HOME, source, 'utf8');
  console.log(`[crewcheck:v${VERSION}] Voyage integrado instalado; CrewCheck Explorer substituído pelo Voyage.`);
} else {
  console.log(`[crewcheck:v${VERSION}] Voyage integrado já aplicado.`);
}
