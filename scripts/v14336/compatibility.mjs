import fs from 'node:fs';

const path = 'client/src/pages/Home.tsx';
if (!fs.existsSync(path)) throw new Error('[v14336-compat] Home.tsx ausente.');
const source = fs.readFileSync(path, 'utf8');
if (!source.includes('<MessageCircle/>') || source.includes('  MessageCircle,')) {
  console.log('[v14336-compat] Ícone de preferências já compatível.');
} else {
  const anchor = '  MapPin,\n  Plus,';
  if (!source.includes(anchor)) throw new Error('[v14336-compat] Âncora de import do ícone ausente.');
  fs.writeFileSync(path, source.replace(anchor, '  MapPin,\n  MessageCircle,\n  Plus,'), 'utf8');
  console.log('[v14336-compat] MessageCircle importado no painel do Concierge.');
}
