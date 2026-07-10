import fs from 'node:fs';
import { execSync } from 'node:child_process';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const css = fs.readFileSync('client/src/index.css', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

assert(home.includes("const DEFAULT_VERSION = '13.5.4'"), 'DEFAULT_VERSION atualizado para 13.5.4');
assert(home.includes('crewcheck_my_car_parking_position_v1'), 'storage key do Meu Carro existe');
assert(home.includes('Marcar posição atual do carro'), 'Meu Carro permite marcar posição atual');
assert(home.includes('Traçar rota até o carro'), 'Meu Carro permite traçar rota até o carro');
assert(home.includes('Resetar posição'), 'Meu Carro permite resetar posição');
assert(home.includes('getCurrentGeoPosition'), 'Meu Carro usa geolocalização atual');
assert(home.includes('buildGoogleMapsSearchUrl'), 'Meu Carro gera link de busca do Google Maps');
assert(home.includes('buildGoogleMapsWalkingDirectionsUrl'), 'Meu Carro gera rota a pé até a marcação');
assert(home.includes('Destinos da escala vigente'), 'Mapa do mês mostra destinos da escala vigente');
assert(home.includes('monthlyMapDestinations'), 'Mapa do mês usa destinos reais da escala');
assert(home.includes('Prévia da rota'), 'Saída Inteligente possui prévia da rota');
assert(home.includes('Abrir no Google Maps'), 'Há botão para abrir no Google Maps');
assert(css.includes('cz-google-map-preview'), 'CSS premium do mapa existe');

let changed = '';
try {
  changed = execSync('git diff --name-only main...HEAD', { encoding: 'utf8' });
} catch {
  changed = execSync('git diff --name-only', { encoding: 'utf8' });
}
assert(!changed.includes('client/src/lib/pdfParser.ts'), 'pdfParser não foi alterado');
assert(!changed.includes('client/src/lib/canonicalRoster.ts'), 'canonicalRoster não foi alterado');

console.log('✅ CrewCheck v13.5.4 Google Maps Premium Ops regression OK');
