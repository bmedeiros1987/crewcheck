import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const source = fs.readFileSync('client/src/components/StartupProgress.tsx', 'utf8');
const js = ts.transpileModule(source.replace("import './startup-progress.css';", ''), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const loaded = new Map();
const load = (file, context = {}) => {
  const key = file + JSON.stringify(context);
  if (loaded.has(key)) return loaded.get(key);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, require: name => name === '../lib/i18n' ? load('client/src/lib/i18n.ts', context) : require(name), navigator: { language: 'pt-BR' }, ...context });
  loaded.set(key, exports); return exports;
};
const startupRequire = name => name === './startupCopy' ? load('client/src/components/startupCopy.ts') : require(name);
const exports = {};
vm.runInNewContext(js, { exports, require: startupRequire, navigator: { onLine:true } });
const render = stage => renderToStaticMarkup(React.createElement(exports.StartupProgress, {stage}));
const session = render('session');
const profile = render('profile');
assert.match(session, /Etapa 2 de 3: Verificando sessão/);
assert.match(profile, /Etapa 3 de 3: Preparando seu acesso/);
assert.equal((session.match(/data-state="done"/g)||[]).length, 1);
assert.equal((profile.match(/data-state="done"/g)||[]).length, 2);
assert.doesNotMatch(session, /aria-valuenow|100%|Tentar novamente/);
const offlineExports = {};
vm.runInNewContext(js, { exports:offlineExports, require: startupRequire, navigator:{onLine:false} });
const offline = renderToStaticMarkup(React.createElement(offlineExports.StartupProgress, {stage:'session'}));
assert.match(offline, /sem conexão/);
assert.match(offline, /Tentar novamente/);

for (const [language, opening, step, retry] of [
  ['pt','Abrindo CrewCheck','Etapa 2 de 3','Tentar novamente'],
  ['en','Opening CrewCheck','Step 2 of 3','Try again'],
  ['es','Abriendo CrewCheck','Paso 2 de 3','Reintentar'],
  ['fr','Ouverture de CrewCheck','Étape 2 sur 3','Réessayer'],
  ['it','Apertura di CrewCheck','Fase 2 di 3','Riprova'],
  ['de','CrewCheck wird geöffnet','Schritt 2 von 3','Erneut versuchen'],
]) {
  const localized = {};
  vm.runInNewContext(js, { exports: localized, navigator: { onLine:false }, require: name => name === './startupCopy' ? load('client/src/components/startupCopy.ts', { navigator: { language, languages:[language] } }) : require(name) });
  const html = renderToStaticMarkup(React.createElement(localized.StartupProgress, {stage:'session'}));
  assert(html.includes('aria-label="'+opening+'"'));
  assert(html.includes(step)); assert(html.includes(retry));
  assert(html.includes('data-i18n-skip="true"'));
  if(language !== 'pt') assert.doesNotMatch(html, /Verificando sessão|Tentar novamente|Etapas da abertura/);
}

const css = fs.readFileSync('client/src/components/startup-progress.css','utf8');
assert.match(css, /\.cc-startup-help button\s*\{[^}]*min-height:\s*44px/s);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.cc-startup-track span\s*\{[^}]*animation:\s*none/s);

const app = fs.readFileSync('client/src/App.tsx','utf8');
assert.match(app, /getMe\(\{ isCurrent, onSessionExpired:/);
assert.match(app, /return enablePartnerDemoRoster\(isCurrent, session.owner\)/);
assert.match(app, /if \(!expired && isCurrent\(\)\) setReady\(true\)/);
assert.match(app, /if \(!ready\) return <CrewCheckOpeningSplash stage=\{startupStage\}/);
assert.match(app, /<StartupProgress stage=\{stage\}/);

const nativeBoot = fs.readFileSync('scripts/p0-android-self-heal/boot-progress.mjs','utf8');
assert.match(nativeBoot, /progress\.setIndeterminate\(true\)/);
assert.match(nativeBoot, /status\.setAccessibilityLiveRegion\(View\.ACCESSIBILITY_LIVE_REGION_POLITE\)/);
assert.match(nativeBoot, /crewCheckBootStatusText\.setText\(message\)/);
assert.match(nativeBoot, /CREWCHECK_PROGRESS_DELAY_MS/);
assert.doesNotMatch(nativeBoot, /setProgress\s*\(/);

console.log('PASS startup: rendered stages, offline fallback, reduced motion, native live status, no fictitious percentage, prepared integration');
