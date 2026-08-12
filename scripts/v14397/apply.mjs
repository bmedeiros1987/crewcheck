import fs from 'node:fs';

const authPath = 'server/v139/auth.mjs';
const pagePath = 'client/src/pages/AuthPage.tsx';
const auth = fs.readFileSync(authPath, 'utf8');
const page = fs.readFileSync(pagePath, 'utf8');

const serverAlreadyApplied = auth.includes("const confirmation = String(body.confirmPassword || '');")
  && auth.includes("password !== confirmation")
  && auth.includes("password.length > 128")
  && auth.includes("/[\\u0000-\\u001F\\u007F]/.test(password)");

let nextAuth = auth;
if (!serverAlreadyApplied) {
  const registerPasswordOld = `  const password = String(body.password || '');\n  const name = cleanText(body.name || '', 120);`;
  const registerPasswordNew = `  const password = String(body.password || '');\n  const confirmation = String(body.confirmPassword || '');\n  const name = cleanText(body.name || '', 120);`;
  const registerValidationOld = `  if (password.length < 8) return sendJson(res, 400, { ok: false, message: 'Use pelo menos 8 caracteres.' });`;
  const registerValidationNew = `  if (password.length < 8 || password.length > 128) return sendJson(res, 400, { ok: false, message: 'Use entre 8 e 128 caracteres.' });\n  if (password !== password.trim() || /[\\u0000-\\u001F\\u007F]/.test(password)) return sendJson(res, 400, { ok: false, message: 'A senha contém espaços nas extremidades ou caracteres de controle inválidos.' });\n  if (!confirmation || password !== confirmation) return sendJson(res, 400, { ok: false, message: 'As senhas não coincidem.' });`;

  const resetValidationOld = `  if (!email || code.length !== 6 || password.length < 8 || password !== confirmation) {\n    return sendJson(res, 400, { ok: false, message: 'Confira e-mail, código e a nova senha de pelo menos 8 caracteres.' });\n  }`;
  const resetValidationNew = `  if (!email || code.length !== 6 || password.length < 8 || password.length > 128) {\n    return sendJson(res, 400, { ok: false, message: 'Confira e-mail, código e a nova senha de 8 a 128 caracteres.' });\n  }\n  if (password !== password.trim() || /[\\u0000-\\u001F\\u007F]/.test(password)) {\n    return sendJson(res, 400, { ok: false, message: 'A senha contém espaços nas extremidades ou caracteres de controle inválidos.' });\n  }\n  if (!confirmation || password !== confirmation) {\n    return sendJson(res, 400, { ok: false, message: 'As senhas não coincidem.' });\n  }`;

  for (const [label, anchor] of [
    ['register password fields', registerPasswordOld],
    ['register password validation', registerValidationOld],
    ['reset password validation', resetValidationOld],
  ]) {
    if (!nextAuth.includes(anchor)) throw new Error(`v14.3.97 server anchor not found: ${label}`);
  }
  nextAuth = nextAuth
    .replace(registerPasswordOld, registerPasswordNew)
    .replace(registerValidationOld, registerValidationNew)
    .replace(resetValidationOld, resetValidationNew);
}

const pageAlreadyApplied = page.includes("const [confirmPassword, setConfirmPassword] = useState('');")
  && page.includes('confirmPassword,')
  && page.includes('As senhas não coincidem.')
  && page.includes('Confirmar senha *');

let nextPage = page;
if (!pageAlreadyApplied) {
  const stateOld = `  const [password, setPassword] = useState('');\n  const [showPassword, setShowPassword] = useState(false);`;
  const stateNew = `  const [password, setPassword] = useState('');\n  const [confirmPassword, setConfirmPassword] = useState('');\n  const [showPassword, setShowPassword] = useState(false);`;
  const registerValidationOld = `        if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');`;
  const registerValidationNew = `        if (password.length < 8 || password.length > 128) throw new Error('A senha precisa ter entre 8 e 128 caracteres.');\n        if (password !== password.trim() || /[\\u0000-\\u001F\\u007F]/.test(password)) throw new Error('Remova espaços no início/fim ou caracteres de controle inválidos.');\n        if (password !== confirmPassword) throw new Error('As senhas não coincidem.');`;
  const registerConfirmOld = `          confirmPassword: password,`;
  const registerConfirmNew = `          confirmPassword,`;
  const resetValidationOld = `        if (password.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');\n        await confirmPasswordReset({ email, code, password, confirmPassword: password });`;
  const resetValidationNew = `        if (password.length < 8 || password.length > 128) throw new Error('A nova senha precisa ter entre 8 e 128 caracteres.');\n        if (password !== password.trim() || /[\\u0000-\\u001F\\u007F]/.test(password)) throw new Error('Remova espaços no início/fim ou caracteres de controle inválidos.');\n        if (password !== confirmPassword) throw new Error('As senhas não coincidem.');\n        await confirmPasswordReset({ email, code, password, confirmPassword });`;
  const passwordFieldOld = `{(mode === 'login' || mode === 'register' || mode === 'reset') && <label><Lock/> {mode === 'reset' ? 'Nova senha' : 'Senha'} *<div className="cz-password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mínimo 8 caracteres" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/><button type="button" className="cz-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'} aria-pressed={showPassword}>{showPassword ? <EyeOff/> : <Eye/>}</button></div></label>}`;
  const passwordFieldNew = `{(mode === 'login' || mode === 'register' || mode === 'reset') && <label><Lock/> {mode === 'reset' ? 'Nova senha' : 'Senha'} *<div className="cz-password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="mínimo 8 caracteres" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}/><button type="button" className="cz-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'} aria-pressed={showPassword}>{showPassword ? <EyeOff/> : <Eye/>}</button></div>{mode !== 'login' && <small>Use pelo menos 8 caracteres. Símbolos não são obrigatórios.</small>}</label>}\n      {(mode === 'register' || mode === 'reset') && <label><Lock/> Confirmar senha *<div className="cz-password-field"><input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="digite a mesma senha novamente" autoComplete="new-password"/></div>{confirmPassword && <small role="status" aria-live="polite">{password === confirmPassword ? 'As senhas coincidem.' : 'As senhas não coincidem.'}</small>}</label>}`;

  for (const [label, anchor] of [
    ['password state', stateOld],
    ['register validation', registerValidationOld],
    ['register confirmation payload', registerConfirmOld],
    ['reset validation', resetValidationOld],
    ['password fields', passwordFieldOld],
  ]) {
    if (!nextPage.includes(anchor)) throw new Error(`v14.3.97 page anchor not found: ${label}`);
  }
  nextPage = nextPage
    .replace(stateOld, stateNew)
    .replace(registerValidationOld, registerValidationNew)
    .replace(registerConfirmOld, registerConfirmNew)
    .replace(resetValidationOld, resetValidationNew)
    .replace(passwordFieldOld, passwordFieldNew);
}

if (nextAuth !== auth) fs.writeFileSync(authPath, nextAuth, 'utf8');
if (nextPage !== page) fs.writeFileSync(pagePath, nextPage, 'utf8');
console.log('[crewcheck:prepare] v14.3.97 auth password confirmation applied.');
