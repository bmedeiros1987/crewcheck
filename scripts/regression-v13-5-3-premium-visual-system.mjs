import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');
const app = fs.readFileSync('client/src/App.tsx', 'utf8');
const auth = fs.readFileSync('client/src/pages/AuthPage.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const lock = fs.readFileSync('package-lock.json', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.includes('"version": "13.5.3"'), 'package.json precisa estar em 13.5.3');
assert(lock.includes('"version": "13.5.3"'), 'package-lock precisa estar em 13.5.3');
assert(home.includes("const DEFAULT_VERSION = '13.5.3'"), 'DEFAULT_VERSION precisa ser 13.5.3');
assert(app.includes('/sw.js?v=13.5.3'), 'App precisa registrar service worker 13.5.3');
assert(auth.includes('V13.5.3'), 'AuthPage precisa exibir V13.5.3');
assert(css.includes('CrewCheck v13.5.3 - Premium visual system hardening'), 'CSS precisa conter a camada visual v13.5.3');
assert(css.includes('--cc-page-max: 1180px'), 'Layout desktop precisa ter largura premium controlada');
assert(css.includes('height: 100svh !important'), 'Menu precisa usar altura segura de viewport');
assert(css.includes('overflow-y: scroll !important'), 'Menu precisa ter rolagem propria');
assert(css.includes('position: sticky'), 'Cabecalho do menu precisa permanecer acessivel durante rolagem');
assert(css.includes('html[data-crew-theme="light"] .cz-menu-panel'), 'Menu precisa ter tratamento claro especifico');
assert(css.includes('html[data-crew-theme="light"] .cz-radar-screen article'), 'Radar precisa de card claro legivel');
assert(css.includes('html[data-crew-theme="light"] .cz-weather-grid article'), 'Meteorologia precisa de card claro legivel');
assert(css.includes('html[data-crew-theme="light"] .cz-feature-grid button'), 'Botoes funcionais precisam do padrao premium claro');
assert(css.includes('overflow-wrap: anywhere'), 'Textos longos precisam ficar contidos nos cards');
assert(css.includes('grid-template-columns: 1fr !important'), 'Mobile precisa reduzir grids criticos para uma coluna');
assert(home.includes('async function parsePDFResilient'), 'Fallback resiliente de PDF v13.5.2 precisa permanecer');
assert(home.includes('useWeatherLandingMonitor(flightEvent);'), 'Monitor meteorologico precisa continuar no componente principal');
assert(home.includes("{view === 'radar' && <RadarView event={flightEvent}/>}"), 'Radar deve usar proximo voo real');
assert(home.includes("{view === 'weather' && <WeatherView event={flightEvent}/>}"), 'Meteorologia deve usar proximo voo real');

console.log('v13.5.3 premium visual system regression OK');
