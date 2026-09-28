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

assert(server.includes('CrewCheck v13.7.7 — ElevenLabs TTS Restore'), 'backend ElevenLabs TTS inserido');
assert(server.includes('generateElevenLabsSpeech'), 'gerador ElevenLabs existe');
assert(server.includes('sendTelegramTtsAudio'), 'envio Telegram por TTS existe');
assert(server.includes('/api/tts/health'), 'endpoint tts health existe');
assert(server.includes('/api/tts/speak'), 'endpoint tts speak existe');
assert(server.includes('ELEVENLABS_API_KEY'), 'env ELEVENLABS_API_KEY suportada');
assert(server.includes('ELEVENLABS_VOICE_ID'), 'env ELEVENLABS_VOICE_ID suportada');
assert(server.includes('eleven_multilingual_v2'), 'modelo multilingual default');
assert(server.includes('ttsProvider') || server.includes('tts-elevenlabs'), 'health/reliability informa ElevenLabs');
assert(server.includes("version:'13.7.7'") || server.includes("version: '13.7.7'"), 'server versionado 13.7.7');
if (home) assert(home.includes("const DEFAULT_VERSION = '13.7.7'"), 'Home versionado 13.7.7');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }

assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

const secretPatterns = [/sk-[A-Za-z0-9_-]{20,}/, /ghp_[A-Za-z0-9_]{20,}/, /xoxb-[A-Za-z0-9-]{20,}/];
for (const pattern of secretPatterns) {
  assert(!pattern.test(server + home), `sem segredo hardcoded: ${pattern}`);
}

console.log('OK: CrewCheck v13.7.7 ElevenLabs TTS regression OK');
