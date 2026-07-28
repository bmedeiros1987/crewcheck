import fs from 'node:fs';

const serverPath = 'server.mjs';
const staleReturn = "  if (!isConciergeContextFreshV14338(previous)) return previous;";
const safeReturn = "  if (!isConciergeContextFreshV14338(previous)) return null;";

if (!fs.existsSync(serverPath)) throw new Error('[v14341-compat] server.mjs ausente.');
const source = fs.readFileSync(serverPath, 'utf8');

if (source.includes(safeReturn)) {
  console.log('[v14341-compat] Contexto expirado já é descartado de forma segura.');
} else {
  if (!source.includes(staleReturn)) throw new Error('[v14341-compat] Âncora de expiração do contexto não localizada.');
  fs.writeFileSync(serverPath, source.replace(staleReturn, safeReturn), 'utf8');
  console.log('[v14341-compat] Contexto expirado descartado antes de localizar voo, data ou programação antiga.');
}
