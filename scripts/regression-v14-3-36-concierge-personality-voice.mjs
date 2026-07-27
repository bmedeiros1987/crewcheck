import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  normalizeConciergeMode,
  normalizeConciergePreferences,
  publicConciergeVoiceCatalog,
  conciergeVoiceIdForPreferences,
  conciergeFrequentDestination,
  conciergeHumorEligible,
  decorateConciergeReply,
  CONCIERGE_HUMOR_COOLDOWN_MS,
} from '../server/v14336/concierge-personality.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const chain = fs.readFileSync(path.join(root, 'scripts/v139/apply.mjs'), 'utf8');
assert.ok(chain.includes("await import('../v14336/apply.mjs');"), 'v14.3.36 deve estar na preparação canônica');
assert.ok(chain.includes("await import('../v14336/compatibility.mjs');"), 'compatibilidade visual deve rodar após v14.3.36');
assert.equal(CONCIERGE_HUMOR_COOLDOWN_MS, 12 * 60 * 60 * 1000, 'humor deve respeitar intervalo mínimo de 12 horas');
assert.equal(normalizeConciergeMode('cômico'), 'comic');
assert.equal(normalizeConciergeMode('formal'), 'formal');

const env = {
  ELEVENLABS_TTS_VOICE_ID: 'ADMIN_DEFAULT',
  CREWCHECK_BRUNO_VOICE_ID: 'BRUNO_ALLOWED',
  ELEVENLABS_DANIEL_VOICE_ID: 'DANIEL_BLOCKED',
  CREWCHECK_ALLOW_DANIEL_VOICE: 'false',
};
assert.deepEqual(publicConciergeVoiceCatalog(env), [
  { id: 'default', label: 'Padrão do CrewCheck' },
  { id: 'bruno', label: 'Bruno' },
], 'catálogo público não pode expor IDs ou voz não autorizada');
assert.equal(conciergeVoiceIdForPreferences({ voiceProfile: 'bruno' }, env), 'BRUNO_ALLOWED');
assert.equal(conciergeVoiceIdForPreferences({ voiceProfile: 'daniel' }, env), 'ADMIN_DEFAULT', 'voz não liberada deve cair para padrão');
const normalized = normalizeConciergePreferences({ mode: 'cômico', voiceProfile: 'daniel' }, {}, env);
assert.equal(normalized.mode, 'comic');
assert.equal(normalized.voiceProfile, 'default');

const roster = {
  days: [
    { legs: [{ destination: 'MAB' }, { destination: 'BSB' }] },
    { legs: [{ destination: 'MAB' }, { destination: 'MAB' }] },
  ],
};
assert.equal(conciergeFrequentDestination(roster), 'MAB');
const operational = 'Próxima programação: LA1234 · BSB → MAB · apresentação 12:00.';
const comic = decorateConciergeReply(operational, {
  preferences: { mode: 'comic' },
  roster,
  now: new Date('2026-07-27T12:00:00-03:00'),
  random: (() => { const values = [0.1, 0.1]; return () => values.shift() ?? 0; })(),
});
assert.equal(comic.humorApplied, true);
assert.ok(comic.reply.startsWith(operational), 'texto operacional deve permanecer intacto no início');
assert.match(comic.reply, /Nota leve:/);
assert.match(comic.reply, /Marabalas|Marabá/);

const formal = decorateConciergeReply(operational, { preferences: { mode: 'formal' }, roster, random: () => 0 });
assert.equal(formal.reply, operational, 'modo formal não pode receber apelidos');
assert.equal(formal.humorApplied, false);
const safetyReplies = [
  'Alerta de regulamentação: confirme o limite de jornada.',
  'Hospital próximo encontrado.',
  'Sua localização expirou. Compartilhe novamente.',
  'Radar: voo cancelado.',
  'Saída recomendada às 10:30.',
];
for (const reply of safetyReplies) {
  assert.equal(conciergeHumorEligible(reply), false, `humor proibido em resposta sensível: ${reply}`);
  assert.equal(decorateConciergeReply(reply, { preferences: { mode: 'comic' }, roster, random: () => 0 }).reply, reply);
}
const cooldown = decorateConciergeReply(operational, {
  preferences: { mode: 'comic', lastHumorAt: '2026-07-27T06:00:00-03:00' },
  roster,
  now: new Date('2026-07-27T12:00:00-03:00'),
  random: () => 0,
});
assert.equal(cooldown.humorApplied, false, 'intervalo menor que 12h deve bloquear nova frase');

const serverPath = path.join(root, 'server.mjs');
const homePath = path.join(root, 'client/src/pages/Home.tsx');
const serverBefore = fs.readFileSync(serverPath, 'utf8');
const homeBefore = fs.readFileSync(homePath, 'utf8');
for (const marker of [
  "from './server/v14336/concierge-personality.mjs';",
  'async function buildTelegramConciergeReplyCore(',
  'async function buildTelegramConciergeReply(text =',
  'conciergePreferenceCommandV14336(',
  'decorateConciergeReplyV14336(',
  'lastHumorAt: new Date().toISOString()',
  'voiceId = conciergeVoiceIdForSnapshotV14336(snapshot)',
  'sendHumanTelegramVoiceReply(chatId, reply, transcript, snapshot)',
  "conciergeModes: ['formal','comic']",
  'safeHumor: true',
]) assert.ok(serverBefore.includes(marker), `marcador de segurança ausente: ${marker}`);
for (const marker of [
  "const DEFAULT_VERSION = '14.3.36';",
  'Estilo e voz do Concierge',
  'Formal (profissional)',
  'Cômico leve (impessoal)',
  'Voz das respostas em áudio',
  'A voz padrão continua sob controle do administrador.',
  'saveTelegramConciergePreferences(',
  'MessageCircle,',
]) assert.ok(homeBefore.includes(marker), `configuração visual ausente: ${marker}`);
assert.ok(!serverBefore.includes('voiceId: body.voiceId'), 'cliente não pode enviar ID arbitrário de voz ao Concierge');

const second = spawnSync(process.execPath, [path.join(root, 'scripts/v14336/apply.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(second.status, 0, second.stderr || second.stdout || 'segunda aplicação v14.3.36 falhou');
const compatibility = spawnSync(process.execPath, [path.join(root, 'scripts/v14336/compatibility.mjs')], { cwd: root, encoding: 'utf8' });
assert.equal(compatibility.status, 0, compatibility.stderr || compatibility.stdout || 'compatibilidade v14.3.36 falhou');
assert.equal(fs.readFileSync(serverPath, 'utf8'), serverBefore, 'patch de personalidade deve ser idempotente no servidor');
assert.equal(fs.readFileSync(homePath, 'utf8'), homeBefore, 'patch de personalidade deve ser idempotente no cliente');
assert.ok(fs.readFileSync(path.join(root, 'client/public/release.json'), 'utf8').includes('14.3.36'));

console.log('v14.3.36 Concierge personality/voice: formal mode, safe comic cooldown, protected voice catalog and UI preferences validated.');
