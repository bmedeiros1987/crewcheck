import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('client/src/lib/careMomentum.ts', 'utf8');

for (const contract of [
  "'celebrate' | 'support' | 'protect' | 'silence'",
  "'discreto' | 'incentivador' | 'fogo-no-parquinho'",
  'context.demandingWeek && strained',
  'Hoje a vitória é descansar.',
  'Semana puxada — e você ainda cuidou de você.',
  'A escala não facilitou. Você evoluiu mesmo assim.',
  'Você voltou.',
  'signal.confidence >= 0.75',
]) {
  assert.ok(source.includes(contract), `missing Momentum contract: ${contract}`);
}

assert.ok(!source.includes('sua saúde melhorou'), 'Momentum must not diagnose health improvement');
assert.ok(!source.includes('você precisa treinar'), 'Momentum must not prescribe training');
assert.ok(!source.includes('streak'), 'Momentum must not use punitive streak mechanics');

console.log('PASS CrewCheck Care Momentum contract');
