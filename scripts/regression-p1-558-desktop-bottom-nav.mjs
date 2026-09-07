import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * #558 (ATLAS 1C) — fatia 1: a navegação inferior existe, centralizada e sem cobrir
 * conteúdo, no desktop Web.
 *
 * Contexto de contrato: até main@30d25b4 o produto escondia deliberadamente a barra no
 * desktop, e havia gate afirmando isso. A decisão de produto mudou; este gate trava o
 * contrato novo e proíbe o retorno do antigo.
 *
 * A ocultação vinha de DOIS pontos, não de um — medido no bundle preparado:
 *   1. client/src/styles/web-desktop-shell.css     @media (pointer:fine) and (min-width:901px)
 *   2. client/src/styles/v14357-ui-clarity.css     @media (min-width:901px)   <- GERADO pela cadeia
 * O segundo não existe na árvore base: sua fonte é scripts/v14357/ui-clarity.css. Editar
 * o arquivo gerado seria desfeito por `node scripts/v139/apply.mjs`, então é a fonte que
 * este gate afirma.
 */

const shell = fs.readFileSync('client/src/styles/web-desktop-shell.css', 'utf8');
const claritySource = fs.readFileSync('scripts/v14357/ui-clarity.css', 'utf8');
const homologation = fs.readFileSync('client/src/components/v1432/homologation.css', 'utf8');

const NAV_RESERVE = 'calc(var(--cc-nav-height) + 34px + env(safe-area-inset-bottom, 0px))';

// 1. Ponto de ocultação do shell desktop: agora mostra.
assert.match(
  shell,
  /\.cz-bottom-nav\s*\{[\s\S]*?display: grid !important;[\s\S]*?visibility: visible !important;[\s\S]*?pointer-events: auto !important;/,
  'shell desktop deve tornar a navegação inferior visível',
);
assert.doesNotMatch(
  shell,
  /\.cz-bottom-nav\s*\{[\s\S]*?display: none !important;/,
  'shell desktop não pode voltar a esconder a navegação inferior',
);

// 2. Ponto de ocultação gerado pela cadeia: afirmado na FONTE do aplicador.
assert.match(
  claritySource,
  /@media \(min-width: 901px\)\s*\{[\s\S]*?\.cz-bottom-nav\s*\{[\s\S]*?display: grid !important;/,
  'a fonte da camada de clareza deve manter a navegação inferior visível no desktop',
);
assert.doesNotMatch(
  claritySource,
  /@media \(min-width: 901px\)\s*\{[\s\S]*?\.cz-bottom-nav\s*\{[\s\S]*?display: none/,
  'a fonte da camada de clareza não pode voltar a esconder a navegação inferior',
);

// 3. Reserva de espaço: a barra não pode cobrir conteúdo em nenhum dos dois pontos.
assert.ok(
  shell.includes(`padding-bottom: ${NAV_RESERVE} !important;`)
  && shell.includes(`scroll-padding-bottom: ${NAV_RESERVE} !important;`),
  'shell desktop deve reservar a altura real da barra, não um valor fixo',
);
assert.ok(
  claritySource.includes(`padding-bottom: ${NAV_RESERVE} !important;`),
  'a camada de clareza deve reservar a altura real da barra',
);
assert.doesNotMatch(
  shell,
  /padding-bottom: 34px !important;/,
  'o respiro fixo de 34px deixaria o conteúdo por baixo da barra agora visível',
);

// 4. Centralização de 901px em diante. O ramo full-bleed de homologation.css só valia
//    até 1180px; entre 901 e 1180 (1024px é uma das larguras exigidas pela issue) a barra
//    encostava nas bordas. O ramo centralizado passa a cobrir também o ponteiro fino.
assert.match(
  homologation,
  /@media \(min-width:1181px\), \(pointer: fine\) and \(min-width:901px\) \{\s*body > \.cz-bottom-nav \{/,
  'o ramo centralizado da navegação deve alcançar o desktop a partir de 901px',
);
const centered = homologation.slice(
  homologation.indexOf('@media (min-width:1181px), (pointer: fine) and (min-width:901px)'),
);
assert.match(
  centered.slice(0, centered.indexOf('}\n}') + 3),
  /left: 50% !important;[\s\S]*?transform: translate3d\(-50%,0,0\) !important;/,
  'o ramo centralizado deve manter a barra no eixo central',
);

// 5. A inversão vale para o desktop; o mobile não pode ser afetado por ela.
assert.doesNotMatch(
  homologation,
  /@media \(max-width:1180px\)\s*\{[\s\S]*?body > \.cz-bottom-nav \{[\s\S]*?display: none/,
  'o ramo mobile/tablet não pode passar a esconder a navegação inferior',
);

console.log('[p1-558] OK — navegação inferior visível, centralizada e com espaço reservado no desktop Web.');
