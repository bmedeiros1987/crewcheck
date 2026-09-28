import assert from 'node:assert/strict';
import {
  PREPARSER_MINIMIZATION_LIMITS,
  validateOfficialRosterFixture,
} from './lib/official-roster-corpus-validator.mjs';

function validate(fixture, fileName = 'fixture.json') {
  return validateOfficialRosterFixture({ fixture, raw: JSON.stringify(fixture), fileName });
}

const derivedFixture = {
  source: 'Canonical anonymized test fixture',
  cases: [{ date: '01/01/2030', expected: 'PASS' }],
};
assert.deepEqual(validate(derivedFixture).errors, [], 'artifact derivado anonimizado continua aceito');

const minimalPreParser = {
  source: 'Anonymized synthetic minimal pre-parser fixture',
  format: 'AIMS',
  privacy: { classification: 'synthetic-minimal', realIdentifiers: false },
  pages: [{
    pageNo: 1,
    items: [
      { str: '01Jan', x: 100, y: 700, page: 1 },
      { str: 'LA', x: 100, y: 680, page: 1 },
      { str: '9000', x: 100, y: 660, page: 1 },
      { str: '09:25', x: 100, y: 640, page: 1 },
      { str: '10:15', x: 100, y: 620, page: 1 },
      { str: 'AAA', x: 100, y: 600, page: 1 },
      { str: 'BBB', x: 100, y: 580, page: 1 },
      { str: '12:55', x: 100, y: 560, page: 1 },
    ],
  }],
};
assert.deepEqual(validate(minimalPreParser).errors, [], 'caso pré-parser sintético e mínimo deve passar');

const missingPrivacyContract = structuredClone(minimalPreParser);
delete missingPrivacyContract.privacy;
assert.ok(
  validate(missingPrivacyContract).errors.some((error) => error.includes('privacy.classification=synthetic-minimal')),
  'fixture pré-parser sem contrato explícito de minimização deve falhar fechada',
);

const malformedPages = structuredClone(minimalPreParser);
malformedPages.pages = null;
assert.ok(
  validate(malformedPages).errors.some((error) => error.includes('pages como array não vazio')),
  'campo pages inválido não pode escapar como artifact derivado',
);

const malformedItems = structuredClone(minimalPreParser);
malformedItems.pages[0].items = null;
assert.ok(
  validate(malformedItems).errors.some((error) => error.includes('items como array não vazio')),
  'página sem items válidos deve falhar fechada',
);

const fullScheduleShape = structuredClone(minimalPreParser);
fullScheduleShape.pages = Array.from({ length: PREPARSER_MINIMIZATION_LIMITS.maxPages + 1 }, (_, pageIndex) => ({
  pageNo: pageIndex + 1,
  items: Array.from({ length: PREPARSER_MINIMIZATION_LIMITS.maxFlightMarkers + 1 }, (_, flightIndex) => [
    { str: `${String(flightIndex + 1).padStart(2, '0')}Jan`, x: 100, y: 700 - flightIndex * 20, page: pageIndex + 1 },
    { str: 'LA', x: 100, y: 690 - flightIndex * 20, page: pageIndex + 1 },
    { str: String(9000 + flightIndex), x: 100, y: 680 - flightIndex * 20, page: pageIndex + 1 },
  ]).flat(),
}));
const fullScheduleValidation = validate(fullScheduleShape, 'full-schedule-shape.json');
assert.ok(fullScheduleValidation.errors.some((error) => error.includes('páginas')), 'múltiplas páginas devem acionar minimização');
assert.ok(fullScheduleValidation.errors.some((error) => error.includes('marcadores de data')), 'sequência mensal deve acionar minimização');
assert.ok(fullScheduleValidation.errors.some((error) => error.includes('marcadores de voo')), 'LA + número em tokens separados deve ser contado');

const tooManyItems = structuredClone(minimalPreParser);
tooManyItems.pages[0].items = [
  { str: '01Jan' },
  ...Array.from({ length: PREPARSER_MINIMIZATION_LIMITS.maxItems }, () => ({ str: 'x' })),
];
assert.ok(
  validate(tooManyItems).errors.some((error) => error.includes('itens pdfjs')),
  'excesso de itens pdfjs deve acionar minimização',
);

const tooManyTokens = structuredClone(minimalPreParser);
tooManyTokens.pages[0].items = [{
  str: `01Jan ${Array.from({ length: PREPARSER_MINIMIZATION_LIMITS.maxTokens }, () => 'x').join(' ')}`,
}];
assert.ok(
  validate(tooManyTokens).errors.some((error) => error.includes('tokens')),
  'excesso de tokens deve acionar minimização',
);

const tooManyBytes = structuredClone(minimalPreParser);
tooManyBytes.pages[0].items = [{ str: `01Jan ${'x'.repeat(PREPARSER_MINIMIZATION_LIMITS.maxBytes)}` }];
assert.ok(
  validate(tooManyBytes).errors.some((error) => error.includes('bytes')),
  'payload excessivo deve acionar minimização mesmo com poucos itens',
);

const identifierLeak = structuredClone(minimalPreParser);
identifierLeak.pages[0].items.push({ str: '12345678', x: 100, y: 540, page: 1 });
assert.ok(
  validate(identifierLeak).errors.some((error) => error.includes('sequência de oito dígitos')),
  'sequência de oito dígitos deve continuar bloqueada',
);

const labeledIdentityLeak = structuredClone(minimalPreParser);
labeledIdentityLeak.pages[0].items.push({ str: 'Crew: SAMPLE PERSON', x: 100, y: 520, page: 1 });
assert.ok(
  validate(labeledIdentityLeak).errors.some((error) => error.includes('identidade nominal rotulada')),
  'identidade nominal rotulada deve falhar sem depender de um usuário conhecido',
);

const structuredIdentityLeak = structuredClone(derivedFixture);
structuredIdentityLeak.metadata = { employeeId: 'SYNTHETIC-ID' };
assert.ok(
  validate(structuredIdentityLeak).errors.some((error) => error.includes('campo de identidade estruturado')),
  'campo de identidade deve falhar independentemente do valor',
);

console.log('Official roster privacy gate: OK — derivados mínimos passam; corpus pré-parser amplo, tokens de voo separados e identificadores falham fechados.');
