const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const source = fs.readFileSync('client/src/components/platform/PlatformCenter.tsx', 'utf8');
const ast = ts.createSourceFile('PlatformCenter.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const panel = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'ConnectionsPanel');
assert.ok(panel, 'Exercise the actual ConnectionsPanel');
const code = ts.transpileModule(panel.getText(ast), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
let comparison;
let cursor;
const context = {
  require, exports: {},
  useState(initial) { const index = cursor++; return [index === 2 ? comparison : typeof initial === 'function' ? initial() : initial, () => {}]; },
  useEffect() {},
  URLSearchParams,
  window: { location: { search: '' } },
  Users: () => null, UserPlus: () => null,
};
vm.createContext(context);
vm.runInContext(code + '\nthis.Panel = ConnectionsPanel;', context);
function render(colleague) {
  comparison = { colleague, summary: { daysCompared: 1, bothFree: 0, sameHotel: 0 }, rows: [] };
  cursor = 0;
  const html = renderToStaticMarkup(React.createElement(context.Panel));
  const header = html.match(/class="cp-compare"><header>(.*?)<\/header>/)?.[1];
  assert.ok(header);
  return header;
}
assert.match(render({ displayName: 'Pessoa A', email: 'private-a@example.invalid' }), /<span>Pessoa A<\/span>/);
const b = render({ displayName: 'Pessoa B', email: 'private-b@example.invalid' });
assert.match(b, /<span>Pessoa B<\/span>/);
assert.doesNotMatch(b, /Pessoa A|private-|@/);
assert.match(render({ displayName: 'Pessoa B Renomeada' }), /Pessoa B Renomeada/);
for (const value of [undefined, null, '', '   ' ]) {
  const html = render({ displayName: value, email: 'private@example.invalid', publicId: 'CC-SECRET', username: 'login-secret' });
  assert.match(html, /<span>Colega<\/span>/);
  assert.doesNotMatch(html, /private|SECRET|login-secret/);
}
assert.match(render(null), /<span>Colega<\/span>/);
assert.match(render({ displayName: '  Joana D’Ávila  ' }), /<span>Joana D’Ávila<\/span>/);
assert.match(render({ displayName: '<img src=x onerror=alert(1)>' }), /&lt;img/);
assert.doesNotMatch(render({ displayName: '<img src=x onerror=alert(1)>' }), /<img/);
console.log('PASS comparison label: payload A/B, rename, neutral fallback and text escaping (synthetic render; no auth/API changes).');
