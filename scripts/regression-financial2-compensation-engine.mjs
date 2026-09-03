// Financeiro 2.0 — regressão do motor de remuneração (férias e 13º).
//
// Todos os valores esperados abaixo são calculados à mão no comentário de cada bloco e
// escritos como literais. Nenhuma asserção chama o motor para produzir o próprio
// esperado: um teste que compara o motor consigo mesmo não prova aritmética.
import assert from 'node:assert/strict';
import {
  VACATION_SALE,
  buildRubricCatalog,
  computeThirteenth,
  computeThirteenthInstallments,
  computeVacationPlan,
  defineCompensationRule,
  normalizeCompensationInput,
  simulateCompensation,
} from '../shared/financial2/index.mjs';
import { seedRubricCatalog, SEED_COMPENSATION_RULES } from '../shared/financial2/profiles.seed.mjs';

const FIXED = 1_000_000;          // R$ 10.000,00 de remuneração fixa mensal
const FLIGHT_HOUR = 60_000;       // R$ 600,00/mês de rubrica variável, 12 meses
const PER_DIEM = 40_000;          // diária: não integra
const INDEMNITY = 90_000;         // indenizatória: não integra

const catalog = seedRubricCatalog();
const PROFILE = 'latam-tripulante';

function monthsOfYear(year) {
  return Array.from({ length: 12 }, (_, index) => ({ year, month: index + 1 }));
}

function baseInput({ vacationPeriods = [], deductions = [], profile = PROFILE, referenceCompetence = { year: 2026, month: 11 } } = {}) {
  const earnings = [];
  // Duas competências-ano inteiras: a janela de médias termina na competência do
  // período, então 12 meses só de 2026 deixariam a janela de março pela metade.
  for (const competence of [...monthsOfYear(2025), ...monthsOfYear(2026)]) {
    earnings.push({ rubricCode: 'HORA_VOO', competence, amountCents: FLIGHT_HOUR });
    earnings.push({ rubricCode: 'DIARIA_ALIMENTACAO', competence, amountCents: PER_DIEM });
    earnings.push({ rubricCode: 'INDENIZACAO_FOLGA', competence, amountCents: INDEMNITY });
  }
  return normalizeCompensationInput({
    profile,
    referenceCompetence,
    monthlyFixedCents: FIXED,
    earnings,
    deductions,
    workedMonths: monthsOfYear(2026).map((competence) => ({ competence, daysWorked: 30 })),
    vacationPeriods,
  });
}

// --- 1. Férias de 30 dias -----------------------------------------------------------
// base férias = 1.000.000 + média(12×60.000)/12 = 1.060.000
// proporcional = 1.060.000 × 30/30 = 1.060.000
// 1/3 = round(1.060.000 / 3) = 353.333 ; bruto = 1.413.333
{
  const input = baseInput({ vacationPeriods: [{ id: 'p30', days: 30, competence: { year: 2026, month: 3 } }] });
  const plan = computeVacationPlan({ input, catalog, rules: SEED_COMPENSATION_RULES });
  const period = plan.periods[0];
  assert.equal(period.averagesCents, 60_000, 'média deve considerar somente a rubrica variável');
  assert.equal(period.vacationBaseCents, 1_060_000);
  assert.equal(period.proportionalCents, 1_060_000);
  assert.equal(period.constitutionalThirdCents, 353_333, 'adicional constitucional de 1/3');
  assert.equal(period.grossCents, 1_413_333);
  assert.equal(period.netCents, 1_413_333, 'sem descontos, líquido igual ao bruto');
  assert.ok(plan.valid, 'plano de 30 dias deve ser válido');
}

// --- 2/3. Fracionamento 15+15 em competências distintas ------------------------------
// cada período: proporcional = 530.000 ; 1/3 = round(176.666,67) = 176.667 ; bruto = 706.667
{
  const input = baseInput({
    vacationPeriods: [
      { id: 'mar', days: 15, competence: { year: 2026, month: 3 } },
      { id: 'out', days: 15, competence: { year: 2026, month: 10 } },
    ],
  });
  const plan = computeVacationPlan({ input, catalog, rules: SEED_COMPENSATION_RULES });
  assert.equal(plan.periods.length, 2, 'cada período é independente');
  assert.deepEqual(plan.periods.map((item) => item.competenceKey), ['2026-03', '2026-10'], 'competências distintas preservadas');
  for (const period of plan.periods) {
    assert.equal(period.proportionalCents, 530_000);
    assert.equal(period.constitutionalThirdCents, 176_667);
    assert.equal(period.grossCents, 706_667);
  }
  // Arredondamento por período é intencional: 2×706.667 = 1.413.334, um centavo acima do
  // período único de 30 dias. Cada competência é paga isoladamente e arredonda sozinha.
  assert.equal(plan.grossCents, 1_413_334);
  assert.ok(plan.valid);
}

// --- 4/5. Rubrica variável entra na média; indenizatória e diária ficam fora ---------
{
  const input = baseInput({ vacationPeriods: [{ id: 'p', days: 30, competence: { year: 2026, month: 6 } }] });
  const period = computeVacationPlan({ input, catalog, rules: SEED_COMPENSATION_RULES }).periods[0];
  const included = period.explanation.includedItems.map((item) => item.rubricCode);
  const excluded = period.explanation.excludedItems;
  assert.deepEqual([...new Set(included)], ['HORA_VOO'], 'somente a rubrica variável compõe a média');
  assert.ok(excluded.some((item) => item.rubricCode === 'INDENIZACAO_FOLGA' && /não integra férias/.test(item.reason)), 'indenizatória deve ser excluída com motivo');
  assert.ok(excluded.some((item) => item.rubricCode === 'DIARIA_ALIMENTACAO'), 'diária deve ser excluída');
  assert.equal(period.averagesCents, 60_000, 'excluídas não podem inflar a média');
}

// --- 6. 13º 12/12 -------------------------------------------------------------------
// base 13º = 1.060.000 ; avos 12/12 ; bruto = 1.060.000 ; 1ª = 530.000 ; 2ª = 530.000
{
  const input = baseInput();
  const full = computeThirteenth({ input, catalog, rules: SEED_COMPENSATION_RULES, installment: 'full' });
  assert.equal(full.avos, 12);
  assert.equal(full.thirteenthBaseCents, 1_060_000);
  assert.equal(full.fullGrossCents, 1_060_000);
  assert.equal(full.firstInstallmentCents, 530_000);
  assert.equal(full.secondInstallmentCents, 530_000);
}

// --- 7. 13º proporcional (7 avos) ---------------------------------------------------
// bruto = round(1.060.000 × 7/12) = round(618.333,33) = 618.333
// 1ª = round(618.333 × 0,5) = round(309.166,5) = 309.167 ; 2ª = 618.333 − 309.167 = 309.166
{
  const workedMonths = monthsOfYear(2026).map((competence, index) => ({
    competence,
    daysWorked: index < 7 ? 30 : 4, // 5 meses abaixo do mínimo de 15 dias
  }));
  const input = normalizeCompensationInput({
    profile: PROFILE,
    referenceCompetence: { year: 2026, month: 11 },
    monthlyFixedCents: FIXED,
    earnings: [...monthsOfYear(2025), ...monthsOfYear(2026)].map((competence) => ({ rubricCode: 'HORA_VOO', competence, amountCents: FLIGHT_HOUR })),
    workedMonths,
  });
  const parcels = computeThirteenthInstallments({ input, catalog, rules: SEED_COMPENSATION_RULES });
  assert.equal(parcels.first.avos, 7, 'apenas meses com 15+ dias viram avos');
  assert.equal(parcels.first.fullGrossCents, 618_333);
  assert.equal(parcels.first.payableGrossCents, 309_167, 'primeira parcela');
  assert.equal(parcels.second.payableGrossCents, 309_166, 'segunda parcela');
  assert.equal(parcels.first.payableGrossCents + parcels.second.payableGrossCents, 618_333, 'parcelas somam o bruto sem centavo perdido');
  assert.ok(parcels.first.explanation.avosDetail.rejectedMonths.length === 5, 'meses rejeitados devem ser reportados');
}

// --- 8. Descontos configuráveis: 1ª parcela isenta, 2ª absorve ----------------------
{
  const input = baseInput({ deductions: [{ code: 'INSS', name: 'INSS', rate: 0.09, basis: 'installment' }] });
  const parcels = computeThirteenthInstallments({ input, catalog, rules: SEED_COMPENSATION_RULES });
  // A regra semente declara deductFirstInstallment: false.
  assert.equal(parcels.first.deductionsCents, 0, 'regra vigente isenta a primeira parcela');
  assert.equal(parcels.second.deductionsCents, 47_700, '2ª parcela: 530.000 × 0,09 = 47.700');
  assert.equal(parcels.second.netCents, 482_300);
}

// --- 9. Vigência: duas regras para o mesmo perfil, competências distintas -----------
{
  const rules = [
    defineCompensationRule({
      id: 'perfil-x-v1', profile: 'perfil-x', effectiveFrom: { year: 2026, month: 1 }, effectiveTo: { year: 2026, month: 6 },
      vacation: { sale: VACATION_SALE.NOT_OFFERED, constitutionalThirdRate: 1 / 3 },
    }),
    defineCompensationRule({
      id: 'perfil-x-v2', profile: 'perfil-x', effectiveFrom: { year: 2026, month: 7 },
      vacation: { sale: VACATION_SALE.NOT_OFFERED, constitutionalThirdRate: 0.5 },
    }),
  ];
  const input = baseInput({
    profile: 'perfil-x',
    vacationPeriods: [
      { id: 'antes', days: 15, competence: { year: 2026, month: 3 } },
      { id: 'depois', days: 15, competence: { year: 2026, month: 10 } },
    ],
  });
  const plan = computeVacationPlan({ input, catalog, rules });
  assert.equal(plan.periods[0].explanation.rule.ruleId, 'perfil-x-v1');
  assert.equal(plan.periods[1].explanation.rule.ruleId, 'perfil-x-v2');
  assert.equal(plan.periods[0].constitutionalThirdCents, 176_667, 'vigência antiga: 1/3');
  assert.equal(plan.periods[1].constitutionalThirdCents, 265_000, 'vigência nova: 0,5 × 530.000');
  assert.equal(plan.periods[0].explanation.rule.effectiveTo, '2026-06', 'vigência reportada no breakdown');
}

// --- 10. Perfil sem venda de férias -------------------------------------------------
{
  const input = baseInput({ vacationPeriods: [{ id: 'p', days: 20, soldDays: 10, competence: { year: 2026, month: 3 } }] });
  const plan = computeVacationPlan({ input, catalog, rules: SEED_COMPENSATION_RULES });
  assert.equal(plan.saleOffered, false, 'perfil vigente não oferece venda');
  assert.equal(plan.valid, false, 'pedido de abono deve invalidar o plano');
  assert.ok(plan.violations.some((item) => /não oferece venda de férias/.test(item)), 'violação deve nomear a regra');
  assert.equal(plan.periods[0].soldCents, 0, 'nenhum valor de abono pode ser produzido');
}

// --- 11. Perfil futuro hipotético COM venda: prova que a regra não é global ---------
{
  const futureRules = [defineCompensationRule({
    id: 'perfil-hipotetico-v1',
    profile: 'perfil-hipotetico',
    effectiveFrom: { year: 2027, month: 1 },
    vacation: { sale: VACATION_SALE.OPTIONAL, maxSaleDays: 10, entitlementDays: 30, minFractionDays: 10 },
  })];
  const input = baseInput({
    profile: 'perfil-hipotetico',
    vacationPeriods: [{ id: 'p', days: 20, soldDays: 10, competence: { year: 2028, month: 3 } }],
  });
  const plan = computeVacationPlan({ input, catalog, rules: futureRules });
  assert.equal(plan.saleOffered, true, 'mesmo motor, política diferente vinda de dado');
  assert.equal(plan.valid, true, 'abono permitido não pode gerar violação');
  // abono = base férias × 10/30. base = 1.000.000 + 0 (sem janela 2027) = 1.000.000
  assert.equal(plan.periods[0].averagesCents, 0, 'janela de 2028 não alcança ganhos de 2025/2026: média zero, não NaN');
  assert.equal(plan.periods[0].soldCents, 333_333, '1.000.000 × 10/30');
  assert.equal(plan.periods[0].proportionalCents, 666_667, '1.000.000 × 20/30');
}

// --- Simulador: projeção separada por competência -----------------------------------
{
  const input = baseInput({
    vacationPeriods: [
      { id: 'mar', days: 15, competence: { year: 2026, month: 3 } },
      { id: 'out', days: 15, competence: { year: 2026, month: 10 } },
    ],
  });
  const projection = simulateCompensation({ input, catalog, rules: SEED_COMPENSATION_RULES, includeThirteenth: true });
  assert.deepEqual(projection.competences, ['2026-03', '2026-10', '2026-11'], 'timeline ordenada por competência');
  assert.equal(projection.timeline[0].items.length, 1, 'março tem apenas o período de férias');
  assert.equal(projection.timeline[2].items.length, 2, 'novembro concentra as duas parcelas do 13º');
  assert.equal(projection.totals.grossCents, 1_413_334 + 1_060_000, 'total = férias + 13º integral');
}

// --- Explicabilidade: todo resultado precisa ser legível ----------------------------
{
  const input = baseInput({ vacationPeriods: [{ id: 'p', days: 30, competence: { year: 2026, month: 3 } }] });
  const period = computeVacationPlan({ input, catalog, rules: SEED_COMPENSATION_RULES }).periods[0];
  for (const field of ['rule', 'formula', 'averagesWindow', 'includedItems', 'excludedItems', 'deductions']) {
    assert.ok(period.explanation[field] !== undefined, `breakdown deve expor ${field}`);
  }
  assert.equal(period.explanation.averagesWindow.length, 12, 'janela de médias declarada pela regra');
  assert.ok(period.explanation.formula.some((line) => /adicional constitucional/.test(line)), 'fórmula deve citar o 1/3');
  assert.equal(period.explanation.rule.effectiveFrom, '2024-01', 'vigência da regra utilizada');
}

// --- Isolamento estrutural: o domínio não pode importar escala/parser --------------
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const dir = 'shared/financial2';
  const forbidden = /(pdfParser|aimsParser|rosterParser|canonicalRoster|complianceEngine|actRules|scheduleActivity|rosterNormalizer|journey)/i;
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.mjs')) continue;
    const source = fs.readFileSync(path.join(dir, file), 'utf8');
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
    for (const specifier of imports) {
      assert.ok(!forbidden.test(specifier), `${file} não pode importar ${specifier}`);
      assert.ok(specifier.startsWith('./') || specifier.startsWith('node:'), `${file} deve depender só do próprio domínio; achou ${specifier}`);
    }
  }
}

console.log('[financial2] OK — férias 30d e 15+15, competências distintas, rubricas, 13º 12/12 e proporcional, parcelas, vigência, perfil sem venda e perfil hipotético com venda.');
