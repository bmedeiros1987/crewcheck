import assert from 'node:assert/strict';
import fs from 'node:fs';

// Light bottom navigation (#476 follow-up). The slice may only restyle the rendered,
// portaled .cz-bottom-nav in the light theme: surface intensity, border, depth, label
// contrast and the active state. Icon tones (Atlas 1C), timeline, dark theme and
// structure stay out of scope. Declarations are tokenized per block, independent of
// line breaks, so compact rules cannot slip past the audit.
const cssPath = 'client/src/styles/light-bottom-nav-signature.css';
assert.ok(fs.existsSync(cssPath), 'Light nav: folha ausente');
const css = fs.readFileSync(cssPath, 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');
const atlas = fs.readFileSync('client/src/styles/atlas-1c-semantic-navigation.css', 'utf8');

const importLine = 'import "./styles/light-bottom-nav-signature.css";';
assert.ok(main.includes(importLine), 'Light nav: CSS não importado');
assert.ok(main.indexOf(importLine) > main.indexOf('atlas-1c-semantic-navigation.css'), 'Light nav: precisa vir depois do Atlas 1C');

export function parseRules(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let depth = 0, start = 0, selector = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      assert.equal(depth, 0, 'Light nav: blocos aninhados (@media etc.) não são permitidos');
      selector = text.slice(start, i).trim(); depth = 1; start = i + 1;
    } else if (text[i] === '}') {
      assert.equal(depth, 1, 'Light nav: chave desbalanceada');
      const declarations = text.slice(start, i).split(';').map(d => d.trim()).filter(Boolean).map(d => {
        const colon = d.indexOf(':');
        return { property: d.slice(0, colon).trim().toLowerCase(), value: d.slice(colon + 1).trim() };
      });
      rules.push({ selectors: selector.split(',').map(s => s.trim()), declarations });
      depth = 0; start = i + 1;
    }
  }
  assert.equal(depth, 0, 'Light nav: bloco sem fechamento');
  assert.equal(text.slice(start).trim(), '', 'Light nav: conteúdo solto fora de regra');
  return rules;
}

const scope = `html[data-crew-theme='light'] body > nav.cz-bottom-nav[aria-label="Navegação principal"]`;
const allowed = new Set(['background', 'border-color', 'box-shadow', 'color', 'font-weight']);
function audit(source) {
  const problems = [];
  for (const rule of parseRules(source)) {
    for (const selector of rule.selectors) {
      if (!selector.startsWith(scope)) problems.push(`seletor fora do rodapé claro: ${selector}`);
      if (/svg|dark/i.test(selector)) problems.push(`seletor toca ícone ou tema escuro: ${selector}`);
    }
    for (const { property, value } of rule.declarations) {
      if (!allowed.has(property)) problems.push(`propriedade fora do escopo visual: ${property}`);
      if (!/!important$/.test(value)) problems.push(`${property} sem !important não vence a cascata preparada`);
      if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(value)) problems.push(`cor literal em ${property}`);
      if (/gradient/i.test(value)) problems.push(`gradiente em ${property}`);
    }
  }
  return problems;
}

assert.deepEqual(audit(css), [], 'Light nav: violações de escopo');
assert.match(css, /button\.active[\s\S]*var\(--cz-pink\)[\s\S]*var\(--cz-blue\)/, 'Light nav: ativo sem assinatura rosa/azul');
assert.match(css, /button:not\(\.active\) > span/, 'Light nav: rótulo inativo sem contraste reforçado');

// Contraprovas: o auditor precisa rejeitar regras compactas e escopos vazados.
assert.ok(audit(`${scope} > button span { color: var(--x) !important; position: fixed !important }`).some(p => p.includes('position')), 'Contraprova: propriedade estrutural após outra declaração');
assert.ok(audit(`${scope} > button > svg { color: var(--x) !important }`).some(p => p.includes('ícone')), 'Contraprova: cor de ícone');
assert.ok(audit(`.cz-bottom-nav { color: var(--x) !important }`).some(p => p.includes('fora do rodapé')), 'Contraprova: seletor sem tema claro');
assert.ok(audit(`${scope} { background: #fff !important }`).some(p => p.includes('literal')), 'Contraprova: cor literal');

// Atlas 1C keeps the semantic icon tone per destination.
for (const icon of ['lucide-home', 'lucide-calendar-days', 'lucide-navigation', 'lucide-bell', 'lucide-menu']) assert.ok(atlas.includes(icon), `Atlas 1C: tom do ícone ${icon} ausente`);
assert.match(atlas, /\.cz-bottom-nav > button > svg \{[^}]*color: var\(--cc-atlas-tone\) !important/, 'Atlas 1C: ícones do rodapé perderam o tom semântico');

console.log('[light-bottom-nav] rodapé claro reforçado só em superfície, borda, profundidade, rótulos e ativo; ícones e tema escuro preservados.');
