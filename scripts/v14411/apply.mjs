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

function menuDrawerBounds() {
  const start = source.indexOf('function MenuDrawer(');
  const end = start >= 0 ? source.indexOf('function Cockpit(', start) : -1;
  if (start < 0 || end < 0) throw new Error(`[v${VERSION}] MenuDrawer não localizado.`);
  return { start, end, block: source.slice(start, end) };
}

if (!source.includes("@/components/voyage/VoyageIntegrated")) {
  const anchor = "import CrewCheckPulse from '@/components/pulse/CrewCheckPulse';";
  replaceRequired(anchor, `${anchor}\nimport VoyageIntegrated from '@/components/voyage/VoyageIntegrated';`, 'import VoyageIntegrated');
}

if (!/\|\s*'voyage'\b/.test(source)) {
  const anchor = "  | 'radar' | 'weather' | 'perdiem'";
  replaceRequired(anchor, "  | 'voyage' | 'radar' | 'weather' | 'perdiem'", 'ZeroView voyage');
}

const voyageMenuItem = "['voyage','Voyage','Beyond the trip · integrado ao CrewCheck',Globe2]";
if (!source.includes(voyageMenuItem)) {
  const { start, end, block } = menuDrawerBounds();
  let nextBlock = block;
  const pushGroup = `  groups.push({ title: 'Viagens pessoais', items: [\n    ${voyageMenuItem},\n  ] });\n`;

  const jumpMatch = nextBlock.match(/^\s*const\s+jump\s*=.*$/m);
  if (/\bconst\s+groups\b/.test(nextBlock) && jumpMatch && jumpMatch.index !== undefined) {
    const lineStart = nextBlock.lastIndexOf('\n', jumpMatch.index) + 1;
    nextBlock = `${nextBlock.slice(0, lineStart)}${pushGroup}${nextBlock.slice(lineStart)}`;
  } else {
    const adminPush = nextBlock.match(/^\s*if\s*\(\s*admin\s*\)\s*groups\.push\(/m);
    if (/\bconst\s+groups\b/.test(nextBlock) && adminPush && adminPush.index !== undefined) {
      const lineStart = nextBlock.lastIndexOf('\n', adminPush.index) + 1;
      nextBlock = `${nextBlock.slice(0, lineStart)}${pushGroup}${nextBlock.slice(lineStart)}`;
    } else {
      const navMatch = nextBlock.match(/const\s+nav\s*[^=]*=\s*\[/);
      if (!navMatch || navMatch.index === undefined) {
        const diagnostic = nextBlock.slice(0, 1200).replace(/\s+/g, ' ');
        throw new Error(`[v${VERSION}] estrutura de menu não reconhecida: ${diagnostic}`);
      }
      const insertAt = navMatch.index + navMatch[0].length;
      nextBlock = `${nextBlock.slice(0, insertAt)}\n    ${voyageMenuItem},${nextBlock.slice(insertAt)}`;
    }
  }

  source = `${source.slice(0, start)}${nextBlock}${source.slice(end)}`;
  changed = true;
}

{
  const { start, end, block } = menuDrawerBounds();
  if (block.includes('const menuViews:') && !block.match(/const menuViews:[\s\S]*?'voyage'/)) {
    const nextBlock = block.replace(/(const\s+menuViews[^=]*=\s*\[)/, "$1'voyage',");
    if (nextBlock === block) throw new Error(`[v${VERSION}] menuViews localizado mas não atualizável.`);
    source = `${source.slice(0, start)}${nextBlock}${source.slice(end)}`;
    changed = true;
  }
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
