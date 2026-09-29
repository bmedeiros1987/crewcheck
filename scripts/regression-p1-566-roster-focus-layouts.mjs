import assert from 'node:assert/strict';
import fs from 'node:fs';

const roster = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');
const aims = fs.readFileSync('client/src/components/v1391/AimsRosterTable.tsx', 'utf8');
const calendar = fs.readFileSync('client/src/components/v1391/CalendarRosterView.tsx', 'utf8');
const focus = fs.readFileSync('client/src/lib/rosterFocus.ts', 'utf8');

// #560/#566: the premium renderer must consume the existing one-shot relay instead
// of dropping the date deposited by FlightDeck or inventing another navigation bus.
assert.match(roster, /import \{ consumePendingRosterFocus \} from '@\/lib\/rosterFocus';/);
assert.match(roster, /const focus = consumePendingRosterFocus\(\);/);
assert.match(roster, /const month = iso\.slice\(0, 7\);[\s\S]*setSelectedMonth\(month\);/);
assert.match(roster, /document\.querySelector<HTMLElement>\(\x60\[data-roster-iso="/);
assert.match(roster, /target\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\);/);
assert.match(roster, /target\.focus\(\{ preventScroll: true \}\);/);
assert.match(roster, /role="status" aria-live="polite"\>\{rosterFocusStatus \|\| message\}/);

// Every saved layout exposes the same date anchor after the month is restored.
assert.match(roster, /data-roster-iso=\{group\.iso\}/, 'Cards/Lista precisam expor a data focada');
assert.match(aims, /data-roster-iso=\{iso\}/, 'AIMS precisa expor a data focada');
assert.match(calendar, /data-roster-iso=\{iso\}/, 'Calendário precisa expor a data focada');

// Missing/stale focus fails closed and a clean menu/bottom-nav entry remains clean.
assert.match(roster, /if \(!focus\) return;/);
assert.match(roster, /não está mais neste período da escala/);
assert.match(roster, /A data da programação não está mais disponível nesta escala/);
assert.doesNotMatch(roster, /setPendingNavigationContext/, 'renderer da Escala não deve criar segundo contexto');
assert.match(focus, /consumePendingNavigationContext\('roster'\)/, 'adapter deve continuar consumindo o relay compartilhado');
assert.doesNotMatch(focus, /localStorage|sessionStorage/, 'foco contextual não pode ser persistido no navegador');

console.log('PASS: FlightDeck → Escala restaura mês/data em Cards, Lista, AIMS e Calendário usando o relay único; entrada global não herda foco');
