import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');
const app = fs.readFileSync('client/src/App.tsx', 'utf8');
const auth = fs.readFileSync('client/src/pages/AuthPage.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const featureHub = home.slice(home.indexOf('function FeatureHub'), home.indexOf('function RadarView'));

assert(pkg.includes('"version": "13.5.1"'), 'package.json precisa estar em 13.5.1');
assert(home.includes("const DEFAULT_VERSION = '13.5.1'"), 'DEFAULT_VERSION precisa ser 13.5.1');
assert(app.includes('13.5.1'), 'App precisa registrar/cachear 13.5.1');
assert(auth.includes('V13.5.1'), 'AuthPage precisa exibir V13.5.1');
assert(!featureHub.includes('useWeatherLandingMonitor(flightEvent)'), 'FeatureHub nao pode chamar flightEvent fora de escopo');
assert(home.includes('useWeatherLandingMonitor(flightEvent);'), 'Monitor meteorologico precisa rodar no componente principal');
assert(css.includes('CrewCheck v13.5.1 - Visual/menu hotfix'), 'CSS precisa conter hotfix v13.5.1');
assert(css.includes('overflow-y: auto !important'), 'Menu precisa ter rolagem vertical');
assert(css.includes('-webkit-overflow-scrolling: touch'), 'Menu precisa ter rolagem suave mobile');
assert(css.includes('html[data-crew-theme="light"] .cz-radar-screen article'), 'Radar precisa de card claro legivel');
assert(css.includes('html[data-crew-theme="light"] .cz-weather-grid article'), 'Meteorologia precisa de card claro legivel');
assert(css.includes('html[data-crew-theme="light"] .cz-menu-section>button'), 'Botoes do menu precisam seguir o tema claro premium');

console.log('v13.5.1 visual/menu hotfix regression OK');

