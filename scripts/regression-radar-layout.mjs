// Structural checks complement, but never replace, the real-browser geometry gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { publishedGateDate } from '../shared/gate-query-day.mjs';
import { followedFlight, followedFlightKey, readFollowedFlights, changeFollowedFlights } from '../shared/followedFlights.mjs';

const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const start = source.indexOf('function FollowFlightPanel('), end = source.indexOf('function RadarView(', start);
assert(start > 0 && end > start, 'Run canonical preparation before the Radar layout gate');
const data = new Map(), storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
let owner = 'synthetic-a', token = 'synthetic-token', valid = false;
const exports = {}, icon = () => null;
const jsx = (type, props, ...children) => ({ type, props: props || {}, children });
const code = ts.transpileModule(source.slice(start, end) + '\nexports.panel=FollowFlightPanel;', { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
vm.runInNewContext(code, {
  exports, React: { createElement: jsx }, Plus: icon, X: icon, ShieldCheck: icon,
  publishedGateDate, followedFlight, followedFlightKey, readFollowedFlights, changeFollowedFlights,
  localStorage: storage, useState: () => [0, () => {}], useEffect() {},
  manualGateAccountKey: () => owner, getStoredUser: () => ({ id: owner }), getToken: () => token,
  readRadarSnapshot: () => valid ? { source: 'Synthetic fixture source with a long provenance label', updatedAt: 1981965600000 } : null,
  radarGateInfo: () => valid ? { gate: 'B12', gateSource: 'radar', status: 'Embarque sintético com descrição longa', statusSource: 'radar' } : {},
  toast: { error() {} }, Date, Intl,
});
const text = node => node == null ? '' : Array.isArray(node) ? node.map(text).join(' ') : typeof node === 'object' ? text(node.children) : String(node);
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(child => find(child, predicate)) : node && typeof node === 'object' ? [...(predicate(node) ? [node] : []), ...find(node.children, predicate)] : [];
const cls = name => node => node.props.className === name;
const first = followedFlight({ eventId: 'synthetic-first', flight: 'ZZ123', origin: 'SSA', destination: 'GRU', scheduledDepartureUtc: '2032-10-21T13:00:00Z', date: '2032-10-21' });
const second = followedFlight({ eventId: 'synthetic-second', flight: 'ZZ456', origin: 'GRU', destination: 'SSA', scheduledDepartureUtc: '2032-10-22T22:30:00Z', date: '2032-10-22' });
assert(first && second);
const render = candidate => exports.panel({ candidate });
let tree = render(first);
assert.match(text(tree), /Nenhum voo selecionado/);
find(tree, cls('cc-followed-add'))[0].props.onClick();
assert.equal(readFollowedFlights(storage, owner).length, 1);
changeFollowedFlights(storage, owner, second, true);
tree = render(first);
assert.equal(find(tree, cls('cc-followed-add')).length, 0, 'Already selected occurrence has no duplicate add action');

function validateRow(row) {
  const identity = find(row, cls('cc-followed-identity'))[0], meta = find(row, cls('cc-followed-meta'))[0];
  assert(identity && meta && identity !== meta, 'Identity and provenance/actions are separate layout groups');
  const date = find(identity, node => node.type === 'time')[0];
  assert(date?.props.dateTime && date.props.className === 'cc-followed-date', 'Date has its own semantic element');
  assert.match(text(date), /UTC$/);
  const stop = find(meta, cls('cc-followed-stop'))[0];
  assert(stop?.props['aria-label']?.startsWith('Parar acompanhamento de '), 'Short action keeps a descriptive accessible name');
  assert.equal(find(meta, node => node.type === 'small').length, 1, 'No-data/provenance stays separate from the action');
  assert.equal(find(identity, cls('cc-followed-stop')).length, 0);
}
const rows = find(tree, cls('cc-followed-row'));
assert.equal(rows.length, 2);
rows.forEach(validateRow);
assert.equal(find(rows, node => node.type === 'small').filter(node => text(node).includes('Sem dados operacionais válidos no cache')).length, 2);
assert(!text(tree).includes('Synthetic fixture source'));
const broken = { ...rows[0], children: [] };
assert.throws(() => validateRow(broken), /separate layout groups/, 'Structural counterproof rejects legacy ungrouped content');
valid = true; tree = render(first); find(tree, cls('cc-followed-row')).forEach(validateRow);
assert.match(text(tree), /Synthetic fixture source/); assert.match(text(tree), /B12/);
const staleStop = find(tree, cls('cc-followed-stop'))[0];
owner = 'synthetic-b'; token = 'synthetic-token-b'; staleStop.props.onClick();
assert.equal(readFollowedFlights(storage, 'synthetic-a').length, 2, 'Presentation does not weaken stale-owner fence');
assert.equal(readFollowedFlights(storage, owner).length, 0);
token = ''; assert.equal(render(first), null, 'Unauthenticated follow list remains hidden');

const css = fs.readFileSync('client/src/styles/radar-layout.css', 'utf8');
assert(!/cz-bottom-nav|cc-bottom-nav/.test(css), 'Global footer ownership remains unchanged');
assert.match(css, /min-height:\s*44px/); assert.match(css, /:focus-visible/);
assert.match(css, /outline:\s*3px solid/);
assert.match(css, /cc-followed-identity[\s\S]*?display:\s*grid/);
assert.match(css, /cc-followed-meta[\s\S]*?flex-wrap:\s*wrap/);
assert.match(css, /cc-followed-date[\s\S]*?var\(--cc-text-scale,\s*1\)/);
assert.match(css, /padding-bottom:\s*calc\(max\(var\(--cc-fixed-footer-height/);
const ast = ts.createSourceFile('Home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const radar = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'RadarView').getText(ast);
assert.match(radar, /className="cc-radar-sources"/);
assert.match(radar, /pontuação interna não comprova exatidão/);
assert.match(radar, /Sem confirmação operacional/);
assert.match(radar, /dados conflitantes não confirmados e valores manuais preservados/);
assert.match(radar, /aria-label="Atualizar Radar e card"/);
assert.match(radar, /onClick=\{openWeatherFromRadar\}/, 'Prepared contextual weather handoff remains connected');
assert(!radar.includes('Atualizar e exportar ao card'));
console.log('PASS Radar structural UI: two followed rows, distinct date/provenance/stop groups, no-data retained, selection and stale-owner fence, keyboard/touch/scaling CSS and unchanged weather handoff; geometry requires browser gate');
