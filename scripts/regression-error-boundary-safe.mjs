import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('client/src/components/ErrorBoundary.tsx', 'utf8');

assert.match(source, /function errorReference\(/, 'ErrorBoundary deve gerar código de referência');
assert.match(source, /Código de referência/, 'tela deve mostrar referência segura');
assert.match(source, /role="alert"/, 'estado de falha deve ser anunciado como alerta');
assert.match(source, /aria-live="assertive"/, 'falha global deve ter live region assertiva');
assert.doesNotMatch(source, /const\s+stack\s*=\s*this\.state\.error/, 'stack não pode ser preparada para exibição');
assert.doesNotMatch(source, /<pre[\s>]/, 'stack trace não pode ser renderizada em bloco pre');
assert.doesNotMatch(source, />\s*\{this\.state\.error\?\.(?:stack|message)\}\s*</, 'erro técnico não pode ser renderizado diretamente');
assert.match(source, /console\.error\([^\n]*erro capturado pela proteção global/, 'diagnóstico interno deve permanecer disponível');
assert.match(source, /crewcheck_auth_token/, 'recuperação deve preservar autenticação');
assert.match(source, /crewcheck_theme_mode/, 'recuperação deve preservar preferência visual');

console.log('error boundary safe presentation: PASS');
