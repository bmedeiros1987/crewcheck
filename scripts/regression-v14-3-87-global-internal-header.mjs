import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/styles/internal-global-header.css', 'utf8');

assert.match(home, /className="cz-global-header" data-global-internal-header="true"/, 'contêiner principal deve renderizar um cabeçalho global');
assert.match(home, /<Brand back=\{view !== 'cockpit'\}/, 'cabeçalho global deve preservar o contrato legado da marca');
assert.match(home, /cz-global-header-spacer/, 'conteúdo não pode ficar escondido sob o cabeçalho fixo');
assert.match(css, /\.cz-global-header \{[\s\S]*position: fixed !important/, 'cabeçalho deve permanecer no topo durante a rolagem');
assert.match(css, /\.cz-app > \.cz-brand-row \{/, 'cabeçalhos legados diretos devem ser ocultados sem afetar o contêiner global');
assert.match(css, /\.cz-app:has\(\.cz-menu-overlay\) > \.cz-global-header \{[\s\S]*visibility: hidden !important/, 'cabeçalho deve desaparecer enquanto o drawer estiver aberto');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.cz-global-header > \.cz-brand-row \{[\s\S]*padding: 5px 8px !important/, 'cabeçalho mobile deve permanecer compacto');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.cz-global-header \.cz-menu-btn \{[\s\S]*width: 44px !important[\s\S]*height: 44px !important/, 'botão Menu/Voltar deve preservar alvo de toque mínimo de 44px');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.cz-global-header \.cz-brand-lockup small \{[\s\S]*display: none !important/, 'subtítulo decorativo não deve consumir altura no mobile');
assert.match(css, /\.cz-global-header-spacer \{[\s\S]*height: calc\(62px \+ env\(safe-area-inset-top, 0px\)\)/, 'espaçador mobile deve acompanhar a redução do cabeçalho');
assert.doesNotMatch(css, /@media \(max-width: 720px\)[\s\S]*\.cz-bottom-nav\s*\{[\s\S]*display:\s*none/, 'compactação do cabeçalho não pode remover a navegação inferior mobile');
assert.match(css, /env\(safe-area-inset-top/, 'iPhone e PWA devem respeitar a área segura');
assert.match(css, /prefers-reduced-motion: reduce/, 'movimento reduzido deve ser respeitado');

console.log('[v14.3.87] OK — cabeçalho CrewCheck único, compacto no mobile e oculto durante o menu.');
