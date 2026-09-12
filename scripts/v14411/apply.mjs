import fs from 'node:fs';

const VIEW = 'client/src/components/v1434/CrewCheckLifeView.tsx';
const FEM = 'client/src/components/v14411/CrewLifeFemPanel.tsx';

function must(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14411] arquivo obrigatório ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

let fem = must(FEM);
if (!fem.includes("import './crewlife-fem.css';")) {
  fem = fem.replace("import { useMemo, useState } from 'react';", "import { useMemo, useState } from 'react';\nimport './crewlife-fem.css';");
  write(FEM, fem);
}

let view = must(VIEW);
const femImport = "import CrewLifeFemPanel from '@/components/v14411/CrewLifeFemPanel';";
const contextImport = "import { buildCrewLifeContext } from '@/lib/crewLifeContext';";
if (!view.includes(femImport)) {
  const anchor = "import { toast } from 'sonner';";
  if (!view.includes(anchor)) throw new Error('[v14411] âncora de import do CrewCheck Life não encontrada');
  view = view.replace(anchor, `${anchor}\n${femImport}`);
}
if (!view.includes(contextImport)) view = view.replace(femImport, `${femImport}\n${contextImport}`);

if (!view.includes('const crewLifeContext = useMemo(() => buildCrewLifeContext')) {
  const anchor = '  const recommendation = useMemo(() => {';
  if (!view.includes(anchor)) throw new Error('[v14411] âncora do contexto CrewLife não encontrada');
  const context = `  const crewLifeContext = useMemo(() => buildCrewLifeContext({\n    nextProgram,\n    sleepHours: metrics.sleepHours,\n    activityMinutes: metrics.activityMinutes,\n  }), [metrics.activityMinutes, metrics.sleepHours, nextProgram]);\n\n`;
  view = view.replace(anchor, `${context}${anchor}`);
}

if (!view.includes('<CrewLifeFemPanel')) {
  const anchor = '    <section className="cc-life-block cc-life-data-controls">';
  if (!view.includes(anchor)) throw new Error('[v14411] âncora de controles de dados não encontrada');
  const panel = `    <CrewLifeFemPanel context={crewLifeContext} />\n\n`;
  view = view.replace(anchor, `${panel}${anchor}`);
}

if (!view.includes(femImport) || !view.includes(contextImport) || !view.includes('<CrewLifeFemPanel')) {
  throw new Error('[v14411] CrewLife Fem não foi integrado ao CrewCheck Life');
}
write(VIEW, view);

console.log('[v14411] CrewLife Fem integrado: opt-in, local-first e aprendizado pessoal.');
