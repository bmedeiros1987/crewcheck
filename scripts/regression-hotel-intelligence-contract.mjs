import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../client/src/lib/hotelIntelligence.ts', import.meta.url), 'utf8');
const structuralBlock = source.match(/const STRUCTURAL_CANDIDATES = new Set<RoomNoiseOrigin>\(\[([\s\S]*?)\]\);/)?.[1] || '';

assert.match(source, /neighbor_guest/);
assert.match(source, /construction: 21/);
assert.match(source, /temporary_event: 3/);
assert.ok(structuralBlock.length > 0, 'bloco de origens estruturais não localizado');
assert.ok(!structuralBlock.includes("'neighbor_guest'"), 'hóspede vizinho não pode ser origem estrutural');
assert.ok(!structuralBlock.includes("'construction'"), 'obra não pode virar característica permanente');
assert.match(source, /distinctReporterCount >= 2 \|\| recurring >= 2/);
assert.match(source, /hotelConfirmed/);
assert.match(source, /evidenceIds/);
assert.match(source, /restPriority/);
assert.match(source, /circunstancial e não caracteriza permanentemente o quarto/);

console.log('CrewCheck Hotel Intelligence contract: PASS');
