import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth = fs.readFileSync('client/src/lib/authClient.ts', 'utf8');

assert.match(auth, /const PUBLIC_AUTH_ENDPOINTS = new Set\(/, 'Rotas públicas de autenticação devem ser explícitas.');
assert.match(auth, /'\/api\/auth\/login'/, 'Login deve ser tratado como rota pública.');
assert.match(auth, /const token = protectedRequest \? getToken\(\) : null;/, 'Login não deve enviar token Bearer expirado.');
assert.match(auth, /export function expireSession\(\)/, 'Expiração deve remover somente a credencial.');
assert.match(auth, /expireSession\(\);\n  const session = await jsonFetch/, 'Nova tentativa de login deve invalidar o token antigo antes da requisição.');
assert.match(auth, /status === 401 && protectedRequest/, 'Mensagem de sessão expirada deve ficar restrita a chamadas protegidas.');
assert.match(auth, /status === 401\) return String\(payload\?\.message \|\| 'E-mail ou senha inválidos/, 'Falha de credenciais deve exibir mensagem de login e não sessão expirada.');

const expireBlock = auth.match(/export function expireSession\(\) \{[\s\S]*?\n\}/)?.[0] || '';
assert.doesNotMatch(expireBlock, /USER_KEY|crewcheck_roster|crewcheck_latest_roster_bundle/, 'Expiração simples não deve apagar identidade anterior nem escala local.');

console.log('CrewCheck v14.0.2 expired-session login recovery regression OK.');
