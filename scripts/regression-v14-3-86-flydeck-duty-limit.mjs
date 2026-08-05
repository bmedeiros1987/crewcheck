import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const compliance = fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8');

assert.match(compliance, /export function getPublishedDutyLimitSummary/, 'motor deve expor a mesma régua B.1 em modo somente leitura');
assert.match(compliance, /applyMostRestrictiveDutyLimit\(getRbac117B1SimpleDutyLimit/, 'resumo deve reutilizar o limite canônico, sem tabela paralela');
assert.match(home, /getPublishedDutyLimitSummary\(event\.day, compliance\?\.legalProfile\)/, 'FlyDeck deve usar o perfil regulatório da análise ativa');
assert.match(home, /Limite desta jornada/, 'limite primordial deve aparecer junto à próxima programação');
assert.match(home, /setView\('regulation'\)/, 'resumo deve abrir os detalhes regulatórios');
assert.doesNotMatch(home, /const dutyLimit = \{[^}]*maxDutyHours/, 'FlyDeck não pode inventar limite local');

console.log('[v14.3.86] OK — FlyDeck mostra o limite canônico da próxima jornada na ordem operacional.');
