import assert from 'node:assert/strict';
import fs from 'node:fs';

const server = fs.readFileSync('server/v139/auth.mjs', 'utf8');
const page = fs.readFileSync('client/src/pages/AuthPage.tsx', 'utf8');

assert.equal(server.includes("const confirmation = String(body.confirmPassword || '');"), true, 'register must read a distinct confirmation');
assert.equal(server.includes("if (!confirmation || password !== confirmation)"), true, 'server must reject mismatched registration passwords');
assert.equal(server.includes("password.length > 128"), true, 'new passwords must have a bounded length');
assert.equal(server.includes("/[\\u0000-\\u001F\\u007F]/.test(password)"), true, 'new passwords must reject control characters');

assert.equal(page.includes("const [confirmPassword, setConfirmPassword] = useState('');"), true, 'UI must keep confirmation separate');
assert.equal(page.includes('Confirmar senha *'), true, 'UI must expose required confirmation field');
assert.equal(page.includes('confirmPassword: password'), false, 'client must never fabricate confirmation from the password');
assert.equal(page.includes('As senhas não coincidem.'), true, 'UI must give immediate mismatch feedback');
assert.equal(page.includes('Símbolos não são obrigatórios.'), true, 'UI must explain the accepted password policy');

console.log('auth password confirmation regression: ok');
