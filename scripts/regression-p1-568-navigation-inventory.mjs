import assert from 'node:assert/strict';
import fs from 'node:fs';

const functional = JSON.parse(fs.readFileSync('config/functional-surfaces.json', 'utf8'));
const inventory = JSON.parse(fs.readFileSync('config/navigation-surface-inventory.json', 'utf8'));

assert.equal(inventory.issue, 568, 'inventory must remain tied to roadmap #568');
assert.equal(inventory.policy?.noRemovalByClassification, true, 'classification must never authorize feature removal by itself');
assert.equal(inventory.policy?.globalNavigationMustStartClean, true, 'menu/bottom navigation must open a clean/default context');
assert.equal(inventory.policy?.contextualNavigationMayCarryCanonicalContext, true, 'contextual links may carry only known context');

const allowedClasses = new Set(inventory.policy?.classificationValues || []);
const allowedOwners = new Set(inventory.policy?.ownerDomains || []);
assert.deepEqual(
  [...allowedClasses].sort(),
  ['CONFIGURACAO', 'CONTEXTUAL', 'ESPECIALIZADA', 'ESSENCIAL', 'LEGACY_REVIEW'].sort(),
  '5S classification vocabulary changed unexpectedly',
);
assert.deepEqual(
  [...allowedOwners].sort(),
  ['admin', 'bem-estar', 'conta', 'escala', 'financeiro', 'legacy-review', 'mobilidade', 'operacao', 'pernoite', 'relatorios'].sort(),
  'conceptual owner vocabulary changed unexpectedly',
);

const functionalIds = functional.surfaces.map((surface) => surface.id);
const inventoryIds = inventory.surfaces.map((surface) => surface.id);
assert.equal(new Set(functionalIds).size, functionalIds.length, 'functional-surfaces contains duplicate ids');
assert.equal(new Set(inventoryIds).size, inventoryIds.length, 'navigation inventory contains duplicate ids');
assert.deepEqual(
  [...inventoryIds].sort(),
  [...functionalIds].sort(),
  'every existing functional surface must have exactly one #568 navigation inventory entry',
);

for (const surface of inventory.surfaces) {
  assert.ok(allowedOwners.has(surface.owner), `${surface.id}: unknown conceptual owner ${surface.owner}`);
  assert.ok(allowedClasses.has(surface.classification), `${surface.id}: unknown 5S classification ${surface.classification}`);
}

const byId = new Map(inventory.surfaces.map((surface) => [surface.id, surface]));
const expectOwner = (ids, owner) => {
  for (const id of ids) assert.equal(byId.get(id)?.owner, owner, `${id} must belong conceptually to ${owner}`);
};

// Product contracts already decided in #568: these prevent future menu drift while
// leaving runtime navigation untouched in this inventory-only slice.
expectOwner(['roster', 'roster-compare', 'import', 'iflight', 'bids', 'monthly-map', 'calendar'], 'escala');
expectOwner(['flydeck', 'smart-departure', 'weather', 'presentation', 'radar', 'alerts', 'regulation', 'workload', 'emergency'], 'operacao');
expectOwner(['hotels', 'wakeup', 'concierge'], 'pernoite');
expectOwner(['salary', 'perdiem', 'crew'], 'financeiro');
expectOwner(['my-car'], 'mobilidade');
expectOwner(['life', 'routine', 'gyms'], 'bem-estar');
expectOwner(['history', 'crew-locker', 'reports', 'exports'], 'relatorios');
expectOwner(['plans', 'settings', 'manual', 'guardian', 'support', 'crewlock', 'community'], 'conta');
expectOwner(['updates', 'maintenance', 'admin'], 'admin');
expectOwner(['feature-hub'], 'legacy-review');

assert.equal(byId.get('wakeup')?.classification, 'CONTEXTUAL', 'Despertador must be contextual under Pernoite, not a competing top-level hub');
assert.equal(byId.get('feature-hub')?.classification, 'LEGACY_REVIEW', 'Central de recursos remains review-only until an explicit migration/removal decision');
assert.match(byId.get('import')?.discoveryRule || '', /sem escala ativa/i, 'Importar Escala must document its dynamic priority when no roster is active');
assert.match(byId.get('import')?.discoveryRule || '', /escala válida/i, 'Importar Escala must document its lower priority when a valid roster exists');

console.log(`✓ #568 navigation inventory: ${inventoryIds.length}/${functionalIds.length} functional surfaces have one owner and one 5S classification`);
