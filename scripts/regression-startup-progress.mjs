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
const exports = {};
vm.runInNewContext(js, { exports, require, navigator: { onLine:true } });
const render = stage => renderToStaticMarkup(React.createElement(exports.StartupProgress, {stage}));
const session = render('session');
const profile = render('profile');
assert.match(session, /Etapa 2 de 3: Verificando sessão/);
assert.match(profile, /Etapa 3 de 3: Preparando seu acesso/);
assert.equal((session.match(/data-state="done"/g)||[]).length, 1);
assert.equal((profile.match(/data-state="done"/g)||[]).length, 2);
assert.doesNotMatch(session, /aria-valuenow|100%|Tentar novamente/);
const offlineExports = {};
vm.runInNewContext(js, { exports:offlineExports, require, navigator:{onLine:false} });
const offline = renderToStaticMarkup(React.createElement(offlineExports.StartupProgress, {stage:'session'}));
assert.match(offline, /sem conexão/);
assert.match(offline, /Tentar novamente/);

const css = fs.readFileSync('client/src/components/startup-progress.css','utf8');
assert.match(css, /\.cc-startup-help button\s*\{[^}]*min-height:\s*44px/s);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.cc-startup-track span\s*\{[^}]*animation:\s*none/s);

const app = fs.readFileSync('client/src/App.tsx','utf8');
assert.match(app, /getMe\(\)\.then\(\(\) => \{\s*if \(!mounted\) return;\s*setStartupStage\("profile"\);\s*return enablePartnerDemoRoster\(\);/);
assert.match(app, /if \(!ready\) return <CrewCheckOpeningSplash stage=\{startupStage\}/);
assert.match(app, /<StartupProgress stage=\{stage\}/);

const nativeBoot = fs.readFileSync('scripts/p0-android-self-heal/boot-progress.mjs','utf8');
assert.match(nativeBoot, /progress\.setIndeterminate\(true\)/);
assert.match(nativeBoot, /status\.setAccessibilityLiveRegion\(View\.ACCESSIBILITY_LIVE_REGION_POLITE\)/);
assert.match(nativeBoot, /crewCheckBootStatusText\.setText\(message\)/);
assert.match(nativeBoot, /CREWCHECK_PROGRESS_DELAY_MS/);
assert.doesNotMatch(nativeBoot, /setProgress\s*\(/);

console.log('PASS startup: rendered stages, offline fallback, reduced motion, native live status, no fictitious percentage, prepared integration');
