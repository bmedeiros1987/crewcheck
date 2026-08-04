import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.CREWCHECK_MANUAL_SYNC_SKIP_APPLY = '1';
const { syncCanonicalManualVersion } = await import('./ci/sync-canonical-manual.mjs');

const release = JSON.parse(fs.readFileSync('client/public/release.json', 'utf8'));
const manual = fs.readFileSync('client/public/manual.html', 'utf8');
const chain = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
const version = String(release?.version || '').trim();

assert.match(version, /^\d+\.\d+\.\d+$/, 'release canônica deve possuir versão semântica');
assert.ok(manual.includes(`<title>Manual CrewCheck v${version}</title>`), 'título do manual deve acompanhar a release canônica');
assert.ok(manual.includes(`<span class="tag">CrewCheck v${version}</span>`), 'selo do manual deve acompanhar a release canônica');
assert.ok(manual.includes(`Última revisão: CrewCheck v${version}`), 'revisão do manual deve acompanhar a release canônica');
assert.equal(syncCanonicalManualVersion(manual, version), manual, 'sincronização do manual deve ser idempotente');
assert.ok(chain.trimEnd().endsWith("await import('../ci/sync-canonical-manual.mjs');"), 'sincronização do manual deve encerrar a preparação canônica');

const staleFixture = manual.replaceAll(`CrewCheck v${version}`, 'CrewCheck v0.0.1');
const repairedFixture = syncCanonicalManualVersion(staleFixture, version);
assert.ok(repairedFixture.includes(`<title>Manual CrewCheck v${version}</title>`), 'sincronização deve reparar título legado');
assert.ok(repairedFixture.includes(`<span class="tag">CrewCheck v${version}</span>`), 'sincronização deve reparar selo legado');
assert.ok(repairedFixture.includes(`Última revisão: CrewCheck v${version}`), 'sincronização deve reparar revisão legada');

console.log(`[android-manual-sync] OK — manual e release canônica alinhados em ${version}.`);
