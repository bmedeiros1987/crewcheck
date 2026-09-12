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
if (!view.includes(femImport)) {
  const anchor = "import { toast } from 'sonner';";
  if (!view.includes(anchor)) throw new Error('[v14411] âncora de import do CrewCheck Life não encontrada');
  view = view.replace(anchor, `${anchor}\n${femImport}`);
}

if (!view.includes('<CrewLifeFemPanel')) {
  const anchor = '    <section className="cc-life-block cc-life-data-controls">';
  if (!view.includes(anchor)) throw new Error('[v14411] âncora de controles de dados não encontrada');
  const panel = `    <CrewLifeFemPanel\n      nextPresentation={nextProgram?.presentation || nextProgram?.departure}\n      sleepHours={metrics.sleepHours}\n      activityMinutes={metrics.activityMinutes}\n    />\n\n`;
  view = view.replace(anchor, `${panel}${anchor}`);
}

if (!view.includes(femImport) || !view.includes('<CrewLifeFemPanel')) {
  throw new Error('[v14411] CrewLife Fem não foi integrado ao CrewCheck Life');
}
write(VIEW, view);

console.log('[v14411] CrewLife Fem integrado: opt-in, local-first e aprendizado pessoal.');
