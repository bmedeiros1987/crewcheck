import assert from 'node:assert/strict';

process.env.CREWCHECK_V14353_SKIP_APPLY = '1';
const { removeLegacyCockpitBundlePropV14353 } = await import('./v14353/apply.mjs');

const preparedInvocation = [
  "{view === 'cockpit' && <Cockpit bundle={bundle} events={events}",
  ' compliance={compliance} setView={setView} onUpload={actions.upload}',
  ' openMenu={() => setDrawer(true)}/>} ',
].join('');

const fixed = removeLegacyCockpitBundlePropV14353(preparedInvocation);

assert.ok(
  fixed.includes("<Cockpit events={events} compliance={compliance}"),
  'o FlyDeck deve receber somente as propriedades declaradas em seu contrato',
);
assert.ok(!fixed.includes('bundle={bundle}'));
assert.equal(removeLegacyCockpitBundlePropV14353(fixed), fixed, 'a correção deve ser idempotente');

console.log('[v14.3.53-cockpit-props] contrato do FlyDeck validado.');
