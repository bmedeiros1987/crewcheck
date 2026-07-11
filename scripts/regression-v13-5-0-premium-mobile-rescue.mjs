import fs from 'node:fs';
const css = fs.readFileSync('client/src/index.css', 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); }

assert(css.includes('Premium mobile rescue'), 'CSS rescue premium mobile ausente');
assert(css.includes('overflow-y: auto') && css.includes('-webkit-overflow-scrolling: touch'), 'Menu precisa ter scroll real no mobile');
assert(css.includes('overscroll-behavior: contain'), 'Menu precisa conter overscroll');
assert(css.includes('word-break: normal'), 'Cards precisam impedir texto vertical/quebrado');
assert(css.includes('text-overflow: clip'), 'Texto importante não deve virar reticências por padrão');
assert(css.includes('grid-template-columns: 1fr !important'), 'Mobile precisa colapsar grids problemáticos para uma coluna');
assert(css.includes('calc(168px + env(safe-area-inset-bottom))'), 'App precisa de espaço inferior para bottom nav');
assert(css.includes('calc(180px + env(safe-area-inset-bottom))'), 'Menu precisa de espaço inferior para bottom nav');

console.log('CrewCheck premium mobile rescue regression OK');
