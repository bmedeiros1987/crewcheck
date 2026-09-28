import fs from 'node:fs';

const homePath = 'client/src/pages/Home.tsx';
const cssPath = 'client/src/index.css';
const marker = 'data-crewcheck-fast-logout="true"';
const cssMarker = '/* CrewCheck P0 #334 — fast logout */';

function update(path, transform) {
  if (!fs.existsSync(path)) throw new Error(`[p0-fast-logout] Arquivo ausente: ${path}`);
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update(homePath, (source) => {
  if (source.includes(marker)) return source;
  const start = source.indexOf('function MenuDrawer(');
  const end = start >= 0 ? source.indexOf('function Cockpit(', start) : -1;
  if (start < 0 || end < 0) throw new Error('[p0-fast-logout] MenuDrawer não localizado.');
  const block = source.slice(start, end);
  const closeButton = '<button className="cz-menu-close" onClick={close} aria-label="Fechar menu"><X/></button>';
  if (!block.includes(closeButton)) throw new Error('[p0-fast-logout] Botão de fechar do drawer não localizado.');
  const quickActions = `<div className="cz-menu-header-actions"><button className="cz-menu-logout" ${marker} type="button" onClick={() => { close(); actions.logout(); }} aria-label="Sair da conta"><LogOut aria-hidden="true"/><span>Sair</span></button>${closeButton}</div>`;
  const patched = block.replace(closeButton, quickActions);
  return `${source.slice(0, start)}${patched}${source.slice(end)}`;
});

update(cssPath, (source) => {
  if (source.includes(cssMarker)) return source;
  return `${source.trimEnd()}\n\n${cssMarker}\n.cz-menu-header-actions{display:flex;align-items:center;gap:.45rem;flex-shrink:0}.cz-menu-logout{display:inline-flex;align-items:center;justify-content:center;gap:.35rem;min-height:36px;padding:.45rem .65rem;border-radius:.7rem;border:1px solid color-mix(in srgb,#ef4444 34%,transparent);background:color-mix(in srgb,#ef4444 10%,transparent);color:#ef4444;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer}.cz-menu-logout svg{width:15px;height:15px}.cz-menu-logout:hover,.cz-menu-logout:focus-visible{background:color-mix(in srgb,#ef4444 16%,transparent);outline:none}.cz-menu-logout:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,#ef4444 34%,transparent)}@media(max-width:420px){.cz-menu-logout{min-width:36px;padding:.45rem}.cz-menu-logout span{display:none}}\n`;
});

console.log('[p0-fast-logout] P0 #334: ação Sair visível no cabeçalho do drawer, usando o logout canônico existente.');
