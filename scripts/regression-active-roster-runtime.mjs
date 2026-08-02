import assert from 'node:assert/strict';
import fs from 'node:fs';

const databaseClient = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
assert.ok(databaseClient.includes("import { reconcileActiveRosterIdentity } from '@shared/activeRosterIdentity.mjs';"));
assert.ok(databaseClient.includes("reconcileActiveRosterIdentity({ remote: payload.roster || null, local: local || null })"));
assert.ok(databaseClient.includes("'ACTIVE_ROSTER_CONFLICT'"));
assert.ok(databaseClient.includes("Escala ativa precisa de confirmação: servidor e dispositivo possuem versões diferentes."));
assert.ok(databaseClient.includes("if (String(error?.code || '').toUpperCase() === 'ACTIVE_ROSTER_CONFLICT') throw error;"));
assert.ok(databaseClient.includes("reconciliation.decision === 'use-local'"));

const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
assert.ok(chain.includes("await import('../v14371/apply.mjs');"));

console.log('[active-roster-runtime] OK — conflito remoto/local não cai silenciosamente no fallback.');
