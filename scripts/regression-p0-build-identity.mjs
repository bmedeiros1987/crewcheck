import assert from 'node:assert/strict';
import fs from 'node:fs';

// #399 production/Auth runtime alignment: a real production report showed the auth
// page footer reading "CREWCHECK V14.3.78 - ACESSO PROTEGIDO" and concluded (wrongly)
// that the deploy was stale. Root cause: v14378's patch did a ONE-TIME literal JSX
// text substitution ("CREWCHECK V14.3.78 - ACESSO PROTEGIDO"), and no later patch in
// the chain ever touches that text again - it is frozen forever regardless of how
// many further releases actually ship. Verified live against crewcheck.online on
// 2026-08-15: /api/health's dynamic `release` field (RENDER_GIT_COMMIT) correctly
// matched the current main HEAD, proving the backend was NOT stale - only the footer
// display was wrong. This test must run AFTER `node scripts/v139/apply.mjs` (the
// footer/health fields below only exist post-chain, same convention as
// auth-profile-only-recovery.yml running v14396/apply.mjs before its regression).

const viteConfig = fs.readFileSync('vite.config.ts', 'utf8');
assert.match(viteConfig, /VITE_CREWCHECK_BUILD_VERSION/, 'vite.config.ts deve definir VITE_CREWCHECK_BUILD_VERSION');
assert.match(viteConfig, /VITE_CREWCHECK_BUILD_COMMIT/, 'vite.config.ts deve definir VITE_CREWCHECK_BUILD_COMMIT');
assert.match(viteConfig, /VITE_CREWCHECK_BUILD_TIME/, 'vite.config.ts deve definir VITE_CREWCHECK_BUILD_TIME');
assert.match(viteConfig, /RENDER_GIT_COMMIT/, 'commit do frontend deve usar a mesma variável (RENDER_GIT_COMMIT) que o backend já usa em /api/health');

const runtime = fs.readFileSync('client/src/lib/buildIdentityRuntime.ts', 'utf8');
assert.match(runtime, /export function getCrewCheckBuildIdentity/, 'buildIdentityRuntime deve exportar getCrewCheckBuildIdentity()');
assert.match(runtime, /window\.__CREWCHECK_BUILD__/, 'identidade de build deve ficar acessível em window.__CREWCHECK_BUILD__ (console/devtools) sem UI nova');

const mainEntry = fs.readFileSync('client/src/main.tsx', 'utf8');
assert.match(mainEntry, /import '\.\/lib\/buildIdentityRuntime'/, 'main.tsx deve carregar buildIdentityRuntime em toda a aplicação, não só na tela de auth');

const server = fs.readFileSync('server.mjs', 'utf8');
assert.match(server, /const CREWCHECK_SERVER_START_ISO = new Date\(\)\.toISOString\(\);/, 'server.mjs deve capturar um timestamp de início de processo (proxy sanitizado de build timestamp do backend)');
const healthLine = server.split('\n').find((line) => line.includes("url.pathname === '/api/health'"));
const releaseLine = server.split('\n').find((line) => line.includes("url.pathname === '/api/release'"));
assert.ok(healthLine, '/api/health não encontrado em server.mjs (rodar node scripts/v139/apply.mjs antes deste teste)');
assert.ok(releaseLine, '/api/release não encontrado em server.mjs (rodar node scripts/v139/apply.mjs antes deste teste)');
assert.match(healthLine, /release: String\(process\.env\.RENDER_GIT_COMMIT/, '/api/health deve continuar expondo o commit real via RENDER_GIT_COMMIT (mecanismo já existente, reaproveitado)');
assert.match(healthLine, /buildTimestamp: CREWCHECK_SERVER_START_ISO/, '/api/health deve expor buildTimestamp');
assert.match(releaseLine, /buildTimestamp: CREWCHECK_SERVER_START_ISO/, '/api/release deve expor buildTimestamp');

const authPage = fs.readFileSync('client/src/pages/AuthPage.tsx', 'utf8');
assert.match(authPage, /from '@\/lib\/buildIdentityRuntime'/, 'AuthPage.tsx deve importar buildIdentityRuntime');
assert.match(authPage, /const crewCheckBuildIdentity = getCrewCheckBuildIdentity\(\);/, 'AuthPage.tsx deve calcular a identidade de build uma vez, no escopo do módulo');
const footerLine = authPage.split('\n').find((line) => line.includes('cz-auth-footer'));
assert.ok(footerLine, 'rodapé cz-auth-footer não encontrado em AuthPage.tsx');
assert.match(footerLine, /crewCheckBuildIdentity\.version/, 'rodapé deve exibir a versão dinâmica, não um literal');
assert.match(footerLine, /shortCrewCheckCommit\(crewCheckBuildIdentity\.commit\)/, 'rodapé deve exibir o commit dinâmico, não um literal');
// The exact regression this closes: a hardcoded "V<digits>.<digits>.<digits>" baked
// directly into the JSX text (as opposed to inside the dynamic expression above).
assert.doesNotMatch(footerLine, /CREWCHECK V\d+\.\d+\.\d+ /, 'rodapé não pode voltar a conter uma versão semver hardcoded (regressão do bug original)');

console.log('[p0-build-identity] OK — versão/commit/build timestamp do frontend e do backend são dinâmicos, reaproveitando /api/health existente; rodapé de auth não fica mais hardcoded.');
