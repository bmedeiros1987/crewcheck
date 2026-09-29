import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
if (!fs.existsSync(path)) throw new Error(`[p1-menu-5s] arquivo ausente: ${path}`);
let source = fs.readFileSync(path, 'utf8');

const importLine = "import { MenuDrawer5S } from '@/components/v1391/MenuDrawer5S';";
if (!source.includes(importLine)) {
  const typeAnchor = '\ntype ZeroView =';
  if (!source.includes(typeAnchor)) throw new Error('[p1-menu-5s] limite estrutural dos imports não localizado');
  source = source.replace(typeAnchor, `\n${importLine}\n${typeAnchor.slice(1)}`);
}

if (!source.includes('return <MenuDrawer5S')) {
  const start = source.indexOf('function MenuDrawer(');
  const end = source.indexOf('\nfunction ', start + 'function MenuDrawer('.length);
  if (start < 0 || end < 0) throw new Error('[p1-menu-5s] limite exato do MenuDrawer canônico não localizado');
  const replacement = `function MenuDrawer({ open, close, view, setView, actions: _actions }: { open: boolean; close: () => void; view: ZeroView; setView: (v: ZeroView) => void; actions: QuickActions }) {
  return <MenuDrawer5S open={open} close={close} view={view} setView={(next) => setView(next as ZeroView)} admin={isAdmin()}/>;
}
`;
  source = source.slice(0, start) + replacement + source.slice(end);
}

fs.writeFileSync(path, source, 'utf8');
console.log('[p1-menu-5s] favoritos por conta, busca e índice completo materializados.');
