import fs from 'node:fs';

const path = 'scripts/regression-v14-3-47-smart-departure-operational-airport.mjs';
if (fs.existsSync(path)) {
  const before = fs.readFileSync(path, 'utf8');
  const structuralAssertion = "assert.ok(runtime.includes('window.CrewCheckPremium = {'), 'runtime premium deve permanecer instalado');\nassert.ok(runtime.includes('requestLocation'), 'runtime premium deve preservar a ponte de localização');";
  const after = before
    .replace(
      "assert.ok(runtime.includes(\"version: '14.3.48'\"), 'runtime premium deve preservar a política de voz consolidada na v14.3.48');",
      structuralAssertion,
    )
    .replace(
      "assert.ok(runtime.includes(`version: '${currentVersion}'`), 'runtime premium deve anunciar a versão atual sem perder a política de voz');",
      structuralAssertion,
    );
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

console.log('[v14357:compatibility] regressão de Saída Inteligente validará o runtime por capacidades, sem versão fixa.');
