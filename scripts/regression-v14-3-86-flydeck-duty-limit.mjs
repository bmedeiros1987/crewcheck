import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const compliance = fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8');

assert.match(compliance, /export function getPublishedDutyLimitSummary/, 'motor deve expor a mesma régua B.1 em modo somente leitura');
assert.match(compliance, /applyMostRestrictiveDutyLimit\(getRbac117B1SimpleDutyLimit/, 'resumo deve reutilizar o limite canônico, sem tabela paralela');
assert.match(home, /measureCanonicalDuty\(events\.flatMap/, 'FlyDeck deve medir a identidade da jornada canônica selecionada');
assert.match(home, /CanonicalDutyCard measurement=\{dutyMeasurement\}/, 'jornada e pendência normativa devem aparecer junto à programação');
assert.match(home, /openCanonicalDutyDetails\(event\.canonical, setView\)/, 'resumo deve abrir detalhes com contexto canônico');
assert.match(fs.readFileSync('client/src/components/CanonicalDutyCard.tsx','utf8'), /navigate\('regulation'\)/, 'ponte navega para a regulamentação');
assert.doesNotMatch(home, /const dutyLimit = \{[^}]*maxDutyHours/, 'FlyDeck não pode inventar limite local');

console.log('[v14.3.86] OK — FlyDeck mostra a jornada canônica e mantém limites não comprovados pendentes.');
