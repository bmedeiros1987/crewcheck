import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[CC-0001/KM] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function expect(condition, message) {
  if (!condition) throw new Error(`[CC-0001/KM] ${message}`);
}

const home = read('client/src/pages/Home.tsx');
const patch = read('scripts/v14386/apply.mjs');
const financialRules = read('client/src/lib/financialRules.ts');

expect(
  home.includes('data-km-source="operational-estimate"'),
  'Previsão financeira precisa identificar a origem do KM como estimativa operacional.',
);
expect(
  home.includes('KM exibido nesta previsão é uma estimativa operacional pela distância entre aeroportos.'),
  'Aviso deve explicar que o KM atual deriva da distância entre aeroportos.',
);
expect(
  home.includes('A quilometragem remunerável da folha pode usar a tabela corporativa por trecho'),
  'Aviso deve diferenciar distância operacional de KM remunerável.',
);
expect(
  /function flightDistanceKmFromEvent\(event: ZeroLeg\): number \{[\s\S]{0,400}?routeDistanceKm\(from, to\)/.test(home),
  'Enquanto não houver fonte corporativa, a origem técnica atual deve permanecer rastreável como distância geográfica.',
);
expect(
  financialRules.includes('ACT-LATAM-2025-2027.2025-12-SNA-109.95')
    && financialRules.includes("commander: {")
    && financialRules.includes('dayKm: 0.216028')
    && financialRules.includes('nightKm: 0.432096'),
  'Tarifas ACT de CMTE devem permanecer na tabela auditada e não podem mascarar erro de quantidade de KM.',
);

for (const protectedPath of [
  'client/src/lib/pdfParser.ts',
  'client/src/lib/aimsParser.ts',
  'client/src/lib/canonicalRoster.ts',
  'client/src/lib/rosterContinuity.ts',
  'client/src/lib/complianceEngine.ts',
  'client/src/lib/financialRules.ts',
]) {
  expect(!patch.includes(protectedPath), `Guard de fonte de KM não deve alterar ${protectedPath}.`);
}

expect(
  !patch.includes('1.67') && !patch.includes('/ 1.67') && !patch.includes('* 0.598'),
  'Não é permitido aplicar fator arbitrário para reproduzir a folha do Tácio.',
);

console.log('[CC-0001/KM] OK — KM geográfico permanece explicitamente estimativo; tarifas ACT e motores protegidos não foram alterados.');
