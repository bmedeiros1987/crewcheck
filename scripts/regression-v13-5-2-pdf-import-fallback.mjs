import fs from 'node:fs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const parser = fs.readFileSync('client/src/lib/pdfParser.ts', 'utf8');
const app = fs.readFileSync('client/src/App.tsx', 'utf8');
const auth = fs.readFileSync('client/src/pages/AuthPage.tsx', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');
const lock = fs.readFileSync('package-lock.json', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(pkg.includes('"version": "13.5.2"'), 'package.json precisa estar em 13.5.2');
assert(lock.includes('"version": "13.5.2"'), 'package-lock precisa estar em 13.5.2');
assert(home.includes("const DEFAULT_VERSION = '13.5.2'"), 'DEFAULT_VERSION precisa ser 13.5.2');
assert(app.includes('13.5.2') && app.includes('/sw.js?v=13.5.2'), 'App precisa registrar/cachear 13.5.2');
assert(auth.includes('V13.5.2'), 'AuthPage precisa exibir V13.5.2');
assert(home.includes('async function parsePDFResilient'), 'Home precisa ter importacao PDF resiliente');
assert(home.includes('parsePDF(file)'), 'Leitura local do parser canonico precisa continuar como primeira tentativa');
assert(home.includes("fetch('/api/parse-pdf'"), 'Fallback precisa usar endpoint interno /api/parse-pdf');
assert(home.includes("source: 'server-fallback'"), 'Fallback precisa registrar origem server-fallback');
assert(home.includes('crewcheck_last_pdf_import_source'), 'Diagnostico de origem do PDF precisa ser salvo');
assert(home.includes('sanitizePdfImportError'), 'Erro tecnico/minificado precisa ser sanitizado');
assert(home.includes('Map as MapIcon'), 'Icone Map nao pode esconder o Map nativo do JavaScript');
assert(home.includes("'map' | 'mycar' | 'iflight'"), 'Views mapa, meu carro e iFlight precisam estar tipadas');
assert(home.includes("{view === 'mycar' && <CarView event={event}/>}"), 'Meu Carro precisa renderizar CarView');
assert(home.includes('function IFlightPushView'), 'Push iFlight assistido precisa ter tela propria');
assert(!home.includes('MyCarView event'), 'MyCarView antigo nao pode ficar referenciado sem existir');
assert(parser.includes('const pdfjs = module.default || module'), 'PDF.js precisa suportar export default e namespace');
assert(parser.includes('pdfjsModulePromise = null'), 'Falha de import PDF.js precisa permitir nova tentativa');

console.log('v13.5.2 PDF import fallback regression OK');
