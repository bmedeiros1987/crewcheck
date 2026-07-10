import fs from 'node:fs';

const files = {
  app: fs.readFileSync('client/src/App.tsx', 'utf8'),
  css: fs.readFileSync('client/src/index.css', 'utf8'),
  home: fs.readFileSync('client/src/pages/Home.tsx', 'utf8'),
  auth: fs.readFileSync('client/src/pages/AuthPage.tsx', 'utf8'),
  pkg: fs.readFileSync('package.json', 'utf8'),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(files.pkg.includes('"version": "13.5.0"'), 'package.json precisa estar em 13.5.0');
assert(files.home.includes("const DEFAULT_VERSION = '13.5.0'"), 'DEFAULT_VERSION precisa ser 13.5.0');
assert(files.app.includes('crewcheck_last_loaded_version') && files.app.includes('13.5.0'), 'App precisa gravar versao 13.5.0');
assert(files.css.includes('CrewCheck v13.5.0'), 'CSS precisa conter camada visual v13.5.0');
assert(files.css.includes('max-width: 100%'), 'CSS precisa proteger max-width');
assert(files.css.includes('min-width: 0'), 'CSS precisa proteger min-width');
assert(files.css.includes('overflow-x: hidden'), 'CSS precisa proteger overflow horizontal');
assert(files.css.includes('scroll-padding-bottom'), 'CSS precisa proteger scroll contra bottom nav');
assert(files.css.includes('minmax(0, 1fr)'), 'CSS precisa usar grid seguro');
assert(files.css.includes('--cc-ios-on'), 'Toggle estilo iOS/CrewCheck precisa existir');
assert(files.css.includes('data-crew-theme="light"'), 'Tema claro precisa ter tokens especificos');
assert(files.home.includes('Alertas'), 'Bottom nav deve usar Alertas em portugues');
assert(files.home.includes('Escala'), 'Bottom nav deve usar Escala em portugues');
assert(files.home.includes('METAR/TAF Origem'), 'Card de voo deve ter pill METAR/TAF Origem');
assert(files.home.includes('METAR/TAF Destino'), 'Card de voo deve ter pill METAR/TAF Destino');
assert(files.home.includes('Alerta meteo até pouso'), 'Card de voo deve ter alerta meteorologico ate pouso');
assert(files.home.includes('Aeronave:') && files.home.includes('Matrícula:'), 'Status deve separar aeronave e matricula');
assert(files.auth.includes('V13.5.0'), 'AuthPage deve exibir V13.5.0');
assert(!files.home.includes('Import PDF'), 'Home nao deve exibir Import PDF em ingles');
assert(!files.home.includes('TomTom'), 'Home nao deve expor TomTom ao usuario');

console.log('v13.5.0 visual mobile/light theme regression OK');
