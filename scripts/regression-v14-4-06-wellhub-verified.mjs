import fs from 'node:fs';

await import('./v139/apply.mjs');

function assert(condition, message) {
  if (!condition) throw new Error(`[v14.4.06] ${message}`);
}

const catalog = fs.readFileSync('client/src/lib/wellhubVerifiedCatalog.ts', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const server = fs.readFileSync('server.mjs', 'utf8');

for (const chain of ['Academia Gaviões', 'SkyFit', 'Panobianco', 'Bodytech']) {
  assert(catalog.includes(`chain: '${chain}'`), `rede verificada ausente: ${chain}`);
}

assert(catalog.includes("minimumPlan: 'basic'"), 'catalogo sem plano Basic');
assert(catalog.includes("minimumPlan: 'basic-plus'"), 'catalogo sem plano Basic+');
assert(catalog.includes("minimumPlan: 'silver-plus'"), 'catalogo sem plano Silver+');
assert(catalog.includes("minimumPlan: 'gold-plus'"), 'catalogo sem plano Gold+');
assert(!catalog.includes('google.com/maps'), 'catalogo Wellhub nao pode usar Maps como fonte');

const sourceUrls = [...catalog.matchAll(/sourceUrl: '([^']+)'/g)].map((match) => match[1]);
assert(sourceUrls.length >= 15, 'snapshot inicial deve conter pelo menos 15 unidades verificadas');
assert(sourceUrls.every((url) => url.startsWith('https://wellhub.com/pt-br/search/partners/')), 'toda unidade precisa apontar para pagina oficial individual do Wellhub');
assert(new Set(sourceUrls).size === sourceUrls.length, 'fontes oficiais duplicadas no catalogo');

assert(home.includes("from '@/lib/wellhubVerifiedCatalog'"), 'Home nao importa catalogo verificado');
assert(home.includes('searchVerifiedWellhubPartners({'), 'Home nao filtra pelo catalogo verificado');
assert(home.includes('Seu plano Wellhub'), 'seletor de plano Wellhub ausente');
assert(home.includes('FONTE OFICIAL WELLHUB'), 'fonte oficial nao aparece na unidade selecionada');
assert(home.includes("!(category === 'gym' && plan === 'wellhub')"), 'busca generica de Maps continua exposta no modo Wellhub');
assert(!home.includes("partnerChains.join(' ') + ' academia parceira Wellhub'"), 'heuristica de parceria por nome de rede continua ativa');

assert(server.includes('busca genérica por mapas foi desativada para não inferir parceria'), 'Concierge ainda pode inferir Wellhub por busca generica');
assert(!server.includes("`${partnerChains} academia parceira aberta agora`"), 'Concierge ainda monta busca Wellhub por nomes de rede');

console.log('[v14.4.06] PASS — Wellhub: plano e parceria somente por snapshot oficial verificado.');
