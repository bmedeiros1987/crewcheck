import fs from 'node:fs';

const file = 'client/src/components/platform/PlatformCenter.tsx';
if (fs.existsSync(file)) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before
    .replace(/Programação autorizada pelo titular\.?/gi, 'Programação compartilhada pelo titular, traduzida em linguagem simples.')
    .replace(/Dias e programação autorizados/gi, 'Dias e programação compartilhados em linguagem simples')
    .replace(/programação autorizada/gi, 'programação compartilhada')
    .replace(/\bEXTRA\b/g, 'Passageiro')
    .replace(/\bPS\b/g, 'Passageiro');
  if (!after.includes('traduzida em linguagem simples') && !after.includes('programação compartilhados em linguagem simples')) {
    after = after.replace(
      "['roster', 'Escala', 'Dias e programação autorizados']",
      "['roster', 'Escala', 'Dias e programação compartilhados em linguagem simples']",
    );
  }
  if (!after.includes('linguagem simples')) throw new Error('[v14314-platform] Não foi possível humanizar a escala do visitante.');
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
}

console.log('[v14314-platform] Escala do visitante humanizada em linguagem simples.');
