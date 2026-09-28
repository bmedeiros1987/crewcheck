import assert from 'node:assert/strict';
import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const database = fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8');
const server = fs.readFileSync('server/platform.mjs', 'utf8');

assert.ok(home.includes('A escala ativa pertence à conta, não ao cache deste dispositivo.'), 'Home deve hidratar cache vazio usando a escala da conta');
assert.match(home, /if \(Array\.isArray\(bundle\.roster\.days\) && bundle\.roster\.days\.length\) return;/, 'bootstrap não pode substituir uma escala local já carregada');
assert.match(home, /openActiveRoster\(\)\.then[\s\S]*saveRoster\(active\.roster, 'Escala ativa sincronizada'\)[\s\S]*setBundle\(/, 'snapshot remoto deve hidratar cache e FlyDeck');
assert.doesNotMatch(home, /A escala ativa pertence[\s\S]{0,1400}saveRosterAnalysis\(/, 'bootstrap é somente leitura e não pode criar outra escala');
assert.match(database, /jsonFetch<[^>]+>[\s\S]*?`\/api\/rosters\/active`|`\/api\/rosters\/active`[\s\S]*?cache: 'no-store'/, 'cliente deve consultar o endpoint ativo sem cache HTTP');
assert.match(server, /WHERE owner_email=\$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1/, 'servidor deve resolver a escala pela identidade autenticada');
assert.match(server, /data:\s*row \? \{ roster: row\.roster, compliance: row\.compliance, gym: row\.gym \|\| \[\] \}/, 'endpoint deve devolver o snapshot operacional canônico');
console.log('[v14.3.82] OK — cache vazio hidrata a única escala ativa por conta sem escrita server-side.');
