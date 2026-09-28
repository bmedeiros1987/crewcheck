import fs from 'node:fs';
import { execSync } from 'node:child_process';
const server = fs.readFileSync('server.mjs','utf8');
const home = fs.existsSync('client/src/pages/Home.tsx') ? fs.readFileSync('client/src/pages/Home.tsx','utf8') : '';
function assert(c,m){ if(!c){ console.error(`ERRO: ${m}`); process.exit(1); } console.log(`OK: ${m}`); }
assert(server.includes('CrewCheck v13.7.12 — ElevenLabs STT Provider'), 'ElevenLabs STT inserido');
assert(server.includes('https://api.elevenlabs.io/v1/speech-to-text'), 'endpoint ElevenLabs STT');
assert(server.includes('sttProviderPreference'), 'provider STT configurável');
assert(server.includes('scribe_v2'), 'modelo default scribe_v2');
assert(/await\s+transcribeTelegramAudio\s*\(\s*downloaded\.buffer\s*,\s*fileName\s*,\s*mimeType\s*\)/.test(server), 'handler usa roteador STT');
assert(!server.includes('const result = await transcribeTelegramAudioWithOpenAI(downloaded.buffer'), 'OpenAI não é caminho único');
assert(server.includes('CREWCHECK_ALLOW_OPENAI_STT_FALLBACK'), 'fallback OpenAI exige liberação explícita');
assert(server.includes('provider: sttProviderPreference()'), 'health mostra provider STT');
assert(!/url\.pathname\s*===\s*['\"][^'\"]+['\"]\s*,\s*['\"][^'\"]+['\"]/.test(server), 'sem operador vírgula em rotas');
assert(server.includes("version:'13.7.12'") || server.includes("version: '13.7.12'"), 'server versionado 13.7.12');
if(home) assert(home.includes("const DEFAULT_VERSION = '13.7.12'"), 'Home versionado 13.7.12');
let changed=''; try{ changed=execSync('git diff --name-only main...HEAD',{encoding:'utf8'}); }catch{ changed=execSync('git diff --name-only',{encoding:'utf8'}); }
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');
const secretPatterns=[/sk-[A-Za-z0-9_-]{20,}/,/ghp_[A-Za-z0-9_]{20,}/,/xoxb-[A-Za-z0-9-]{20,}/,/JBFqnCBsd6RMkjVDRZzb/];
for(const p of secretPatterns) assert(!p.test(server+home), `sem segredo hardcoded: ${p}`);
console.log('OK: CrewCheck v13.7.12 ElevenLabs STT regression OK');
