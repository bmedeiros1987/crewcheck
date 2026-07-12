import fs from 'node:fs';
import { execSync } from 'node:child_process';

const server = fs.readFileSync('server.mjs', 'utf8');
const home = fs.existsSync('client/src/pages/Home.tsx') ? fs.readFileSync('client/src/pages/Home.tsx', 'utf8') : '';
function assert(condition, message) { if (!condition) { console.error(`ERRO: ${message}`); process.exit(1); } console.log(`OK: ${message}`); }
assert(server.includes('CrewCheck v13.7.6 — Telegram Voice STT Restore'), 'backend STT inserido');
assert(server.includes('handleTelegramVoiceMessage'), 'handler de áudio existe');
assert(server.includes('telegramGetFileInfo'), 'download Telegram getFile existe');
assert(server.includes('telegramDownloadFile'), 'download do arquivo Telegram existe');
assert(server.includes('transcribeTelegramAudioWithOpenAI'), 'transcrição por provedor configurado existe');
assert(server.includes('/api/telegram/stt-health'), 'endpoint stt-health registrado');
assert(server.includes('OPENAI_API_KEY'), 'env de STT suportada');
assert(server.includes('CREWCHECK_STT_MODEL'), 'modelo STT configurável');
assert(!server.includes('A transcrição ainda não está configurada neste ambiente; envie por texto'), 'placeholder antigo removido');
assert(server.includes("version:'13.7.6'") || server.includes("version: '13.7.6'"), 'server versionado 13.7.6');
if (home) assert(home.includes("const DEFAULT_VERSION = '13.7.6'"), 'Home versionado 13.7.6');
let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); } catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');
const secretPatterns = [/sk-[A-Za-z0-9_-]{20,}/, /ghp_[A-Za-z0-9_]{20,}/, /xoxb-[A-Za-z0-9-]{20,}/];
for (const pattern of secretPatterns) assert(!pattern.test(server + home), `sem segredo hardcoded: ${pattern}`);
console.log('OK: CrewCheck v13.7.6 Telegram Voice STT regression OK');
