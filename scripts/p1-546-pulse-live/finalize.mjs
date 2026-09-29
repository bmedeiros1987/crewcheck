import fs from 'node:fs';

const HOME = 'client/src/pages/Home.tsx';
const MARKER = 'P1_546_PULSE_ATTENTION_ONLY_FINALIZER';

if (!fs.existsSync(HOME)) throw new Error('[p1-546-live] Home.tsx ausente no finalizador.');
let source = fs.readFileSync(HOME, 'utf8');

function removePulseBlockByIdPrefix(prefix) {
  const pattern = new RegExp(
    String.raw`\n\s*publishCrewCheckNotice\(\{\n\s*id: \`${prefix}[\s\S]*?\n\s*\}\);\n`,
    'g',
  );
  source = source.replace(pattern, '\n');
}

// O shell preparado precisa ativar explicitamente o Brand com Pulse.
// A marca oficial continua sendo o fallback definido por v14.3.40.
source = source.replace(
  "<Brand back={view !== 'cockpit'} onMenu={view === 'cockpit' ? () => setDrawer(true) : undefined}/>",
  "<Brand pulse back={view !== 'cockpit'} onMenu={view === 'cockpit' ? () => setDrawer(true) : undefined}/>",
);

// Não manter uma segunda superfície abaixo do header.
source = source.replace(/\n\s*<CrewCheckPulse\/>\n/g, '\n');

// O Pulse é attention-only. Confirmações rotineiras permanecem nos toasts/
// superfícies locais e não disputam o header.
for (const prefix of [
  'next:',
  'active-roster:',
  'roster-import:',
  'presentation:',
  'presentation-reset:',
]) removePulseBlockByIdPrefix(prefix);

// Se uma versão anterior do finalizador deixou o marker antigo, remova apenas o
// comentário; o bloco active-roster já foi retirado pelo prefixo acima.
source = source.replace(/\s*\/\/ P1_546_PULSE_ACTIVE_ROSTER_FINALIZER:[^\n]*\n/g, '\n');

// Categorias semânticas são apresentação do Pulse, nunca regra operacional.
source = source.replace(
  "      tone: 'atencao',\n      priority: 'alta',\n      title: `${count} ponto${count === 1 ? '' : 's'} para revisar`,",
  "      category: 'compliance',\n      tone: 'atencao',\n      priority: 'alta',\n      title: `${count} ponto${count === 1 ? '' : 's'} para revisar`,",
);
source = source.replace(
  "          tone: 'atencao',\n          priority: 'alta',\n          title: 'Escala atualizada',",
  "          category: 'roster',\n          tone: 'atencao',\n          priority: 'alta',\n          title: 'Escala atualizada',",
);
source = source.replace(
  "          tone: 'erro',\n          priority: 'alta',\n          title: 'Escala sem programação futura',",
  "          category: 'roster',\n          tone: 'erro',\n          priority: 'alta',\n          title: 'Escala sem programação futura',",
);

// A branch fonte já pode conter a categoria. O finalizador precisa ser idempotente.
source = source.replace(/(\n\s*category: '([^']+)',)\n\s*category: '\2',/g, '$1');

if (!source.includes(MARKER)) {
  const anchor = "export default function Home() {";
  if (!source.includes(anchor)) throw new Error('[p1-546-live] Home final não localizado para marker.');
  source = source.replace(anchor, `// ${MARKER}: header compacto reservado a alertas importantes.\n${anchor}`);
}

if (!source.includes('<Brand pulse back=')) {
  throw new Error('[p1-546-live] finalizador não conseguiu ativar Brand/Pulse compacto.');
}
if (source.includes('<CrewCheckPulse/>')) {
  throw new Error('[p1-546-live] segunda superfície Pulse reapareceu após preparação.');
}

fs.writeFileSync(HOME, source, 'utf8');
console.log('[p1-546-live] Pulse final: header compacto attention-only; marca normal quando não há alerta.');
