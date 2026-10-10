import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real catalog and both consumers' search implementations.
function parse(file) {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function evaluate(source, context = {}) {
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return vm.runInNewContext(javascript, { ...context, exports: {} });
}
const catalogAst = parse('client/src/data/crewHotels.ts');
const declaration = catalogAst.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(item => item.name.getText(catalogAst) === 'CREW_HOTEL_CATALOG'));
const catalog = evaluate(`${declaration.getText(catalogAst)}; CREW_HOTEL_CATALOG;`);
const name = 'Ibis Styles Fortaleza Giga Mall';
const expected = { name, airport: 'FOR', alternateAirport: '', city: 'Fortaleza', region: 'Ceará', country: 'BR' };
assert.equal(catalog.filter(hotel => /giga/i.test(hotel.name)).length, 1, 'Exactly one Giga Mall entry');
assert.deepEqual(JSON.parse(JSON.stringify(catalog.find(hotel => hotel.name === name))), expected, 'Only confirmed catalog fields');
const previous = catalog.filter(hotel => hotel.name === 'Ibis Fortaleza Centro de Eventos');
assert.equal(previous.length, 1, 'Existing Fortaleza unit remains unique');
assert.deepEqual(JSON.parse(JSON.stringify(previous[0])), { ...expected, name: 'Ibis Fortaleza Centro de Eventos' }, 'Existing unit remains unchanged');
assert.equal(catalog.filter(hotel => hotel.airport === 'FOR').length, 2, 'FOR contains both distinct units');
assert.ok(!fs.readFileSync('client/src/lib/crewcheckHotelsGyms.ts', 'utf8').includes(name), 'No new company-list assertion');

const homeAst = parse('client/src/pages/Home.tsx');
const helpers = homeAst.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['normalizedSearch', 'searchCrewHotels'].includes(node.name?.text));
assert.equal(helpers.length, 2);
const search = evaluate(`${helpers.map(node => node.getText(homeAst)).join('\n')}; searchCrewHotels;`, { CREW_HOTEL_CATALOG: catalog });
const presentationAst = parse('client/src/components/v1391/PresentationStayManagerView.tsx');
let presentationSearch;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(presentationAst) === 'catalogResults') {
    assert.ok(ts.isCallExpression(node.initializer));
    presentationSearch = node.initializer.arguments[0].getText(presentationAst);
  }
  ts.forEachChild(node, visit);
}
visit(presentationAst);
assert.ok(presentationSearch, 'Actual presentation search callback found');
for (const query of ['Giga', name, 'FOR']) {
  assert.equal(search(query).filter(hotel => hotel.name === name).length, 1, `Home search: ${query}`);
  const results = evaluate(`(${presentationSearch})();`, { query, targetAirport: 'ZZZ', CREW_HOTEL_CATALOG: catalog });
  assert.equal(results.filter(hotel => hotel.name === name).length, 1, `Presentation search without airport bias: ${query}`);
}
assert.ok(search('', 'FOR').some(hotel => hotel.name === name), 'Home airport suggestions');
const airportResults = evaluate(`(${presentationSearch})();`, { query: '', targetAirport: 'FOR', CREW_HOTEL_CATALOG: catalog });
assert.ok(airportResults.slice(0, 2).every(hotel => hotel.airport === 'FOR'), 'Presentation prioritizes both FOR units');
console.log('PASS: unique Giga Mall, unchanged Centro de Eventos, minimal metadata, real Home/Presentation searches and FOR suggestions');
