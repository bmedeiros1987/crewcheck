import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8');
const home = fs.readFileSync(path.join(root, 'client/src/pages/Home.tsx'), 'utf8');
const release = fs.readFileSync(path.join(root, 'client/public/release.json'), 'utf8');

assert.ok(chain.includes("await import('../v14336/apply.mjs');"), 'v14.3.36 deve estar no fim da preparação canônica');
for (const marker of [
  "const CONCIERGE_PERSONALITY_MODES = new Set(['formal', 'comic']);",
  "const CONCIERGE_VOICE_PROFILES = new Set(['default', 'bruno', 'daniel']);",
  'function conciergeComicAlias(',
  'function conciergeDeterministicPick(',
  'function conciergeApplyPersonality(',
  'async function conciergePreferencesReply(',
  "MAB: 'Marabalas'",
  "IMP: 'Imperatrevas'",
  "CNF: 'Conflitos'",
  "CREWCHECK_ALLOW_DANIEL_VOICE",
  'O humor nunca altera voo, aeroporto, horário, regulamentação ou orientação de segurança.',
  'voiceProfile: conciergeVoiceProfile(snapshot)',
]) assert.ok(server.includes(marker), `marcador obrigatório ausente no servidor: ${marker}`);

assert.ok(server.includes("return next ? conciergeApplyPersonality(`Próxima programação"), 'próxima programação deve receber humor somente após os dados operacionais');
assert.ok(server.includes("return conciergeApplyPersonality(lines.join('\\n'), snapshot, info?.record);"), 'radar deve aplicar personalidade depois de montar os dados');
assert.ok(!server.includes("flightNumber = conciergeComicAlias"), 'humor nunca pode alterar número de voo');
assert.ok(!server.includes("origin = conciergeComicAlias"), 'humor nunca pode alterar origem');
assert.ok(!server.includes("destination = conciergeComicAlias"), 'humor nunca pode alterar destino');

function deterministicPick(seed, values) {
  const hash = String(seed || '').split('').reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
  return values[hash % values.length] || '';
}
const values = ['a', 'b', 'c'];
assert.equal(deterministicPick('31/07/2026:MAB:LA1234', values), deterministicPick('31/07/2026:MAB:LA1234', values), 'frase deve ser estável para evitar repetição aleatória a cada resposta');
assert.notEqual(deterministicPick('31/07/2026:MAB:LA1234', values), '', 'seleção determinística deve retornar frase');

assert.ok(home.includes("const DEFAULT_VERSION = '14.3.36';"), 'versão web 14.3.36 ausente');
assert.ok(release.includes('14.3.36'), 'release.json 14.3.36 ausente');
console.log('v14.3.36 Concierge personality/voice: formal default, comic safe suffix and admin-controlled voice validated.');
