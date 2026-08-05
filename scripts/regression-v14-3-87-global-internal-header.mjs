import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/styles/internal-global-header.css', 'utf8');

assert.match(home, /className="cz-global-header" data-global-internal-header="true"/, 'contêiner principal deve renderizar um cabeçalho global');
assert.match(home, /<Brand back=\{view !== 'cockpit'\}/, 'cabeçalho global deve preservar o contrato legado da marca');
assert.match(home, /cz-global-header-spacer/, 'conteúdo não pode ficar escondido sob o cabeçalho fixo');
assert.match(css, /\.cz-global-header \{[\s\S]*position: fixed !important/, 'cabeçalho deve permanecer no topo durante a rolagem');
assert.match(css, /\.cz-app > \.cz-brand-row \{/, 'cabeçalhos legados diretos devem ser ocultados sem afetar o contêiner global');
assert.match(css, /env\(safe-area-inset-top/, 'iPhone e PWA devem respeitar a área segura');
assert.match(css, /prefers-reduced-motion: reduce/, 'movimento reduzido deve ser respeitado');

console.log('[v14.3.87] OK — cabeçalho CrewCheck único e persistente em todos os sistemas internos.');
