import vm from 'node:vm';
import fs from 'node:fs';

const sw = fs.readFileSync('client/public/sw.js', 'utf8');
const runtime = fs.readFileSync('client/src/lib/offlineRuntime.ts', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(`[p0-offline-shell] ${message}`);
};

assert(main.includes("import './lib/offlineRuntime';"), 'main.tsx deve instalar o runtime offline');
assert(runtime.includes("navigator.serviceWorker.register('/sw.js'"), 'runtime deve registrar /sw.js');
assert(runtime.includes("installPwaUpdateCoordinator()"), 'runtime deve preservar o coordenador de atualização segura');
assert(!runtime.includes('window.location.reload'), 'runtime offline não pode forçar reload');
assert(runtime.includes("window.addEventListener('offline'"), 'runtime deve publicar estado offline');
const shellMatch = sw.match(/const APP_SHELL = (\[[^\]]*\]);/);
assert(Boolean(shellMatch), 'SW deve definir shell mínimo');
const shellUrls = vm.runInNewContext(shellMatch[1], Object.create(null), { timeout: 100 });
assert(['/', '/index.html', '/manifest.json'].every(url => shellUrls.includes(url)) && shellUrls.some(url => new URL(url, 'https://crewcheck.invalid').pathname === '/icons/crewcheck-icon-v2.png'), 'SW deve incluir shell mínimo e ícone canônico, inclusive URL versionada');
assert(sw.includes('precachePreparedShell'), 'SW deve preparar shell e assets do HTML');
assert(sw.includes("request.mode === 'navigate'"), 'SW deve possuir fallback de navegação');
assert(sw.includes("url.pathname.startsWith('/api/')"), 'SW não deve persistir respostas de API como shell');
assert(sw.includes("event.data?.type"), 'SW deve aceitar contrato de mensagem do coordenador');
assert(!/install[\s\S]{0,220}skipWaiting\(\)/.test(sw), 'install não pode ativar update à força');

console.log('[p0-offline-shell] contrato offline P0 validado');
