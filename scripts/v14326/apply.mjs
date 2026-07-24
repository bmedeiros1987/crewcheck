import fs from 'node:fs';

const cssPath = 'client/src/index.css';
if (!fs.existsSync(cssPath)) throw new Error('[v14.3.26] client/src/index.css ausente.');

const marker = '/* CrewCheck v14.3.26 — auditoria mobile anti-sobreposição */';
const source = fs.readFileSync(cssPath, 'utf8');
if (!source.includes(marker)) {
  const css = `

${marker}
/* Proteção global contra estouro horizontal e conteúdo espremido. */
html, body, #root { max-width: 100%; overflow-x: hidden; }
*, *::before, *::after { box-sizing: border-box; }
:is(.cc-page,.cc-shell,.cc-control-shell,.cz-page,.cz-toolbox,.cz-stack-list,.cz-roster-card,.cz-roster-main,.cz-roster-copy) { min-width: 0; max-width: 100%; }
:is(.cz-roster-copy,.cz-roster-copy h3,.cz-roster-copy p,.cz-roster-copy small) { overflow-wrap: anywhere; word-break: normal; }

/* Despertadores no servidor: card legível em telas estreitas. */
.cz-toolbox .cz-stack-list { display: grid; gap: 14px; }
.cz-toolbox .cz-roster-card { overflow: hidden; padding: 16px; }
.cz-toolbox .cz-roster-main {
  display: grid;
  grid-template-columns: 76px minmax(0,1fr) auto;
  align-items: center;
  gap: 14px;
}
.cz-toolbox .cz-roster-icon { width: 64px; height: 64px; flex: 0 0 64px; }
.cz-toolbox .cz-roster-copy { display: grid; gap: 5px; align-content: center; }
.cz-toolbox .cz-roster-copy h3 { margin: 0; font-size: clamp(1.3rem, 5vw, 2rem); line-height: 1.08; }
.cz-toolbox .cz-roster-copy p,
.cz-toolbox .cz-roster-copy small { margin: 0; line-height: 1.35; }
.cz-toolbox .cz-roster-main > button {
  width: auto;
  min-width: 112px;
  min-height: 52px;
  padding: 10px 14px;
  white-space: nowrap;
  align-self: center;
}

/* A navegação inferior não pode cobrir o último card. */
.cc-page, .cc-shell, .cc-control-shell, main { padding-bottom: max(116px, calc(92px + env(safe-area-inset-bottom))) !important; }
.cc-bottom-nav { bottom: max(8px, env(safe-area-inset-bottom)); }

@media (max-width: 560px) {
  .cz-toolbox { padding-inline: 14px; }
  .cz-toolbox .cz-roster-card { padding: 14px; border-radius: 22px; }
  .cz-toolbox .cz-roster-main {
    grid-template-columns: 62px minmax(0,1fr);
    align-items: start;
    gap: 12px;
  }
  .cz-toolbox .cz-roster-icon { width: 56px; height: 56px; }
  .cz-toolbox .cz-roster-copy h3 { font-size: clamp(1.25rem, 7vw, 1.75rem); }
  .cz-toolbox .cz-roster-main > button {
    grid-column: 1 / -1;
    width: 100%;
    min-width: 0;
    justify-content: center;
    margin-top: 4px;
  }
}

@media (max-width: 380px) {
  .cz-toolbox .cz-roster-main { grid-template-columns: 1fr; }
  .cz-toolbox .cz-roster-icon { width: 52px; height: 52px; }
  .cz-toolbox .cz-roster-copy h3 { font-size: 1.35rem; }
}
`;
  fs.writeFileSync(cssPath, source.trimEnd() + css + '\n', 'utf8');
}

console.log('[v14.3.26] Auditoria mobile aplicada: cards do despertador, textos, ações e navegação inferior.');
