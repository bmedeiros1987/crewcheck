import fs from 'node:fs';
import { execSync } from 'node:child_process';

const server = fs.readFileSync('server.mjs', 'utf8');
const home = fs.existsSync('client/src/pages/Home.tsx') ? fs.readFileSync('client/src/pages/Home.tsx', 'utf8') : '';

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(server.includes('CrewCheck v13.7.11 — TTS provider policy'), 'política de TTS inserida');
assert(server.includes('effectiveTtsProvider'), 'provedor efetivo calculado');
assert(server.includes('legacyGoogleTtsAllowed'), 'fallback Google/legacy controlado');
assert(server.includes('CREWCHECK_FORCE_ELEVENLABS_TTS'), 'força ElevenLabs por env');
assert(server.includes('CREWCHECK_ALLOW_GOOGLE_TTS_FALLBACK'), 'Google fallback exige liberação explícita');
assert(server.includes('/api/tts/provider-health'), 'endpoint provider-health existe');
assert(server.includes('policy.provider !== \'elevenlabs\''), 'envio de áudio bloqueia provider não ElevenLabs');
assert(server.includes('generateElevenLabsSpeech'), 'geração ElevenLabs preservada');
assert(server.includes('ELEVENLABS_TTS_VOICE_ID'), 'alias antigo de voz preservado');
assert(!/url\.pathname\s*===\s*['\"][^'\"]+['\"]\s*,\s*['\"][^'\"]+['\"]/.test(server), 'sem operador vírgula em rotas');
assert(server.includes("version:'13.7.11'") || server.includes("version: '13.7.11'"), 'server versionado 13.7.11');
if (home) assert(home.includes("const DEFAULT_VERSION = '13.7.11'"), 'Home versionado 13.7.11');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

const secretPatterns = [/sk-[A-Za-z0-9_-]{20,}/, /ghp_[A-Za-z0-9_]{20,}/, /xoxb-[A-Za-z0-9-]{20,}/, /JBFqnCBsd6RMkjVDRZzb/];
for (const pattern of secretPatterns) assert(!pattern.test(server + home), `sem segredo hardcoded: ${pattern}`);

console.log('OK: CrewCheck v13.7.11 ElevenLabs Exclusive TTS regression OK');
