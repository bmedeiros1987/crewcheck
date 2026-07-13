import fs from 'node:fs';
import { execSync } from 'node:child_process';

const server = fs.readFileSync('server.mjs', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

assert(server.includes("version:'13.7.13'") || server.includes("version: '13.7.13'") || server.includes('13.7.13'), 'server versionado 13.7.13');
assert(!/url\.pathname === '\/' \|\| url\.pathname === '\/index\.html'.*handleCrewCheckStaticShell/.test(server), 'safe shell não captura / e /index.html');
assert(server.includes("['/crewcheck-repair','/repair','/safe-start','/emergency'].includes(url.pathname)"), 'safe shell restrito a reparo/emergência');
assert(home.includes("const DEFAULT_VERSION = '13.7.13'"), 'Home versionado 13.7.13');
assert(home.includes('cz-menu-user'), 'menu mostra usuário');
assert(home.includes('crewcheck_profile_avatar'), 'foto do usuário preservada');
assert(home.includes('openProfile'), 'clique no usuário abre perfil');
assert(css.includes('CrewCheck v13.7.13 — Premium UI Layout Guard'), 'CSS premium aplicado');
assert(css.includes('.cz-bottom-nav'), 'bottom nav protegido');
assert(css.includes('.cz-roster-linked-chips'), 'chips da escala protegidos');
assert(css.includes('.cz-brand-row'), 'header/hambúrguer sticky protegido');
assert(!/url\.pathname\s*===\s*['\"][^'\"]+['\"]\s*,\s*['\"][^'\"]+['\"]/.test(server), 'sem operador vírgula em rotas');

let changed = '';
try { changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' }); }
catch { changed = execSync('git diff --name-only', { encoding: 'utf8' }); }
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não alterado');
assert(!changed.includes('client/src/lib/googleCalendarSync.ts'), 'Google Calendar não alterado');

const secretPatterns = [/sk-[A-Za-z0-9_-]{20,}/, /ghp_[A-Za-z0-9_]{20,}/, /xoxb-[A-Za-z0-9-]{20,}/];
for (const pattern of secretPatterns) assert(!pattern.test(server + home + css), `sem segredo hardcoded: ${pattern}`);

console.log('OK: CrewCheck v13.7.13 Premium UI Layout Guard regression OK');
