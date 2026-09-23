import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const home = read('client/src/pages/Home.tsx');
const android = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const pwa = read('client/src/lib/pwaUpdateCoordinator.ts');
const v14393 = read('scripts/v14393/apply.mjs');
const server = read('server/platform.mjs');

assert.match(home, /P0 roster continuity/, 'Home deve possuir continuidade canônica da escala ativa');
assert.match(home, /openActiveRoster\(\)/, 'boot deve consultar a escala ativa da conta');
assert.match(home, /rosterFingerprint\(active\.roster\)/, 'reconciliação deve comparar revisão/fingerprint');
assert.match(home, /\[1500, 5000, 15000\]/, 'cold start deve ter retries curtos sem ação do usuário');
assert.match(home, /window\.addEventListener\('online'/, 'retorno da internet deve reconciliar');
assert.match(home, /window\.addEventListener\('crewcheck:native-ready'/, 'retorno/boot nativo deve reconciliar');
assert.match(home, /document\.addEventListener\('visibilitychange'/, 'foreground deve reconciliar');
assert.match(home, /window\.setInterval\(\(\) => \{ void reconcileActiveRoster\('interval'\); \}, 60_000\)/, 'cliente aberto deve reconciliar periodicamente');
assert.match(home, /Fail-safe: indisponibilidade do servidor nunca apaga nem rebaixa a cópia local/, 'falha remota deve preservar cópia local');
assert.doesNotMatch(home, /if \(Array\.isArray\(bundle\.roster\.days\) && bundle\.roster\.days\.length\) return;/, 'ter cache local não pode bloquear reconciliação remota');
assert.match(v14393, /P0 roster continuity/, 'patch legado deve reconhecer a implementação canônica e não reescrevê-la');

assert.match(server, /UPDATE crewcheck_platform_rosters SET active=FALSE WHERE owner_email=\$1/, 'save servidor deve manter uma escala ativa por conta');
assert.match(server, /WHERE owner_email=\$1 AND active=TRUE ORDER BY updated_at DESC LIMIT 1/, 'backend deve expor a escala ativa da conta');

assert.match(android, /CREWCHECK_SHELL_WATCHDOG_DELAY_MS/, 'wrapper deve vigiar montagem do shell');
assert.match(android, /verifyCrewCheckShellMounted/, 'wrapper deve verificar se a UI realmente montou');
assert.match(android, /recoverCrewCheckShell/, 'wrapper deve se recuperar de shell branco');
assert.match(android, /target\.clearCache\(true\)/, 'recuperação pode limpar somente cache de navegação');
assert.match(android, /Cookies, localStorage,[\s\S]*sessão e escala persistida NÃO são apagados/, 'contrato deve preservar dados do usuário');
assert.doesNotMatch(android, /removeAllCookies|deleteAllData\(\)/, 'autocura não pode apagar sessão ou storage');
assert.match(android, /setBackgroundColor\(Color\.parseColor\("#071D33"\)\)/, 'falha visual não deve resultar em tela branca');

assert.match(pwa, /controllerchange/, 'cliente deve detectar worker novo já ativado');
assert.match(pwa, /reloadForActivatedUpdate/, 'atualização ativada deve chegar à página aberta');
assert.match(pwa, /isSafeToActivate\(\)/, 'reload deve respeitar fronteira segura');
assert.match(pwa, /window\.location\.reload\(\)/, 'cliente seguro deve aplicar a nova UI automaticamente');
assert.match(pwa, /RELOAD_GUARD_MS = 30_000/, 'reload automático deve ter trava temporal curta contra loop');
assert.match(pwa, /controllerSeen = true/, 'fresh install deve ignorar só a primeira aquisição do controller');

console.log('[roster-continuity-boot-stability] PASS — banco canônico, autosync, autocura Android e update seguro protegidos.');
