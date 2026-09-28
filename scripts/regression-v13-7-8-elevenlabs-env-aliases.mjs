import fs from 'node:fs';
import { execSync } from 'node:child_process';
const server = fs.readFileSync('server.mjs','utf8');
const home = fs.existsSync('client/src/pages/Home.tsx') ? fs.readFileSync('client/src/pages/Home.tsx','utf8') : '';
function assert(c,m){ if(!c){ console.error(`ERRO: ${m}`); process.exit(1); } console.log(`OK: ${m}`); }
assert(server.includes('CrewCheck v13.7.8 — ElevenLabs env aliases'),'aliases ElevenLabs inseridos');
['ELEVENLABS_TTS_VOICE_ID','ELEVENLABS_TTS_MODEL','ELEVENLABS_TTS_OUTPUT_FORMAT','ELEVENLABS_TTS_STABILITY','ELEVENLABS_TTS_SIMILARITY_BOOST','ELEVENLABS_TTS_STYLE','ELEVENLABS_TTS_SPEAKER_BOOST'].forEach(k=>assert(server.includes(k),`lê ${k}`));
assert(server.includes('activeVoiceEnv'),'health mostra variável ativa sem segredo');
assert(server.includes('acceptedVoiceEnvKeys'),'health lista aliases aceitos');
assert(server.includes('/api/tts/health'),'endpoint tts health preservado');
assert(server.includes('generateElevenLabsSpeech'),'gerador ElevenLabs preservado');
assert(server.includes("version:'13.7.8'") || server.includes("version: '13.7.8'"),'server versionado 13.7.8');
if(home) assert(home.includes("const DEFAULT_VERSION = '13.7.8'"),'Home versionado 13.7.8');
let changed=''; try{ changed=execSync('git diff --name-only main...HEAD',{encoding:'utf8'}); }catch{ changed=execSync('git diff --name-only',{encoding:'utf8'}); }
assert(!changed.includes('client/src/lib/pdfParser.ts'),'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'),'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'),'Google Calendar não alterado');
const secretPatterns=[/sk-[A-Za-z0-9_-]{20,}/,/ghp_[A-Za-z0-9_]{20,}/,/xoxb-[A-Za-z0-9-]{20,}/,/JBFqnCBsd6RMkjVDRZzb/];
for(const p of secretPatterns) assert(!p.test(server+home),`sem segredo hardcoded: ${p}`);
console.log('OK: CrewCheck v13.7.8 ElevenLabs env aliases regression OK');
