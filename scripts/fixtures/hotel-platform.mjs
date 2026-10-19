import vm from 'node:vm';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { hotelReadiness, runHotelTransaction, reconcileHotelRoster } from '../../server/hotel-stay-repository.mjs';
import { hotelProjection } from '../../server/hotel-stay-model.mjs';
import { hotelDatabase } from './hotel-database.mjs';
const source = readFileSync(new URL('../../server/platform.mjs', import.meta.url), 'utf8');
const ast = ts.createSourceFile('platform.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const literal = name => {
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  if (!declaration) throw new Error('Missing production hotel function: ' + name);
  return declaration.getText(ast);
};
const handler = literal('handleStays'), rosterWriter = literal('saveRosterMysql'), rosterRoute = literal('handleRosterSync');
const syncContext = ast.statements.some(node => ts.isFunctionDeclaration(node) && node.name?.text === 'syncRosterForContext') ? literal('syncRosterForContext') : '';
export const association = { contractVersion: 2, action: 'associate', id: 'stay-A', rosterKey: '2030-01', expectedVersion: '0',
  confirmation: 'associate-this-existing-stay', contextRef: 'event-A', contextSignature: 'event-A|2030-01-01|AAA' };
export function harness(rows, options) {
  const d = hotelDatabase(rows, options); const context = { identity: { email: 'owner-A' }, db: d.db };
  const sandbox = { hotelReadiness, runHotelTransaction, reconcileHotelRoster, hotelProjection,
    readBody: async req => req.body, requireMain: async () => context, requirePremium: async () => true,
    normalizeText: (value, n) => String(value ?? '').trim().slice(0,n), parseDateOnly: value => String(value || '').slice(0,10),
    hotelKey: value => value.toLowerCase().replaceAll(' ', '-'), decryptPrivate: value => value || '',
    sanitizeRoster: value => structuredClone(value), rosterKey: value => `${value.year}-${String(value.month).padStart(2,'0')}`,
    rosterFingerprint: () => 'synthetic-fingerprint', rosterSummary: value => value, crypto: { randomUUID: () => 'synthetic-roster' },
    sendJson: (res, status, body) => Object.assign(res, { status, body }) };
  const funcs = vm.runInNewContext(handler + '\n' + rosterWriter + '\n' + syncContext + '\n' + rosterRoute + '\n({handleStays,saveRosterMysql,handleRosterSync})', sandbox);
  return { ...d, get rows() { return d.rows; }, get rosters() { return d.rosters; },
    async request(method = 'GET', body = {}) { const res = {}; await funcs.handleStays({ method, body },res); return res; },
    async sync(body = {}) { const res = {}; await funcs.handleRosterSync({ method:'POST', body },res); return res; } };
}
