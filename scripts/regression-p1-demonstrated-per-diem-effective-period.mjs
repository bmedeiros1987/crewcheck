import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { loadClientModules, createChecker } from './lib/ts-module-harness.mjs';

const checker = createChecker('Per diem demonstrado — período efetivo e precedência');
const { check } = checker;

const { load, cleanup } = loadClientModules({
  files: [
    'client/src/lib/financialAmounts.ts',
    'client/src/lib/financialStatementLearning.ts',
    'client/src/lib/sharedAllowanceResolution.ts',
    'client/src/lib/financialActApplicability.ts',
  ],
  prefix: 'crewcheck-perdiem-effective-',
});

try {
  const amounts = load('financialAmounts');
  const learning = load('financialStatementLearning');

  check('antes do período não usa valor demonstrado',
    amounts.demonstratedDomesticPerDiemAt('2026-08-04') === null);
  check('início do período usa 109,44 / 27,36',
    JSON.stringify(amounts.demonstratedDomesticPerDiemAt('2026-08-05')) === JSON.stringify({ mainMeal: 109.44, breakfast: 27.36 }));
  check('fim do período ainda está incluído',
    JSON.stringify(amounts.demonstratedDomesticPerDiemAt('2026-09-01')) === JSON.stringify({ mainMeal: 109.44, breakfast: 27.36 }));
  check('depois do período volta ao fallback aplicável',
    amounts.demonstratedDomesticPerDiemAt('2026-09-02') === null);

  const actBefore = amounts.resolveDomesticPerDiemRate({
    effectiveDate: '2026-08-04',
    actMainMeal: 105.04,
    manualOverride: null,
    learnedMainMeal: null,
    learnedBreakfast: null,
    breakfastPercent: 0.25,
  });
  check('fallback ACT histórico permanece intacto',
    actBefore.source === 'act' && actBefore.mainMeal === 105.04 && actBefore.breakfast === 26.26,
    JSON.stringify(actBefore));

  const demonstrated = amounts.resolveDomesticPerDiemRate({
    effectiveDate: '2026-08-20',
    actMainMeal: 105.04,
    manualOverride: null,
    learnedMainMeal: null,
    learnedBreakfast: null,
    breakfastPercent: 0.25,
  });
  check('amostra legada sem owner não é aplicada globalmente',
    demonstrated.source === 'act' && demonstrated.mainMeal === actBefore.mainMeal && demonstrated.breakfast === actBefore.breakfast,
    JSON.stringify(demonstrated));

  const manual = amounts.resolveDomesticPerDiemRate({
    effectiveDate: '2026-08-20',
    actMainMeal: 105.04,
    manualOverride: 120,
    learnedMainMeal: null,
    learnedBreakfast: null,
    breakfastPercent: 0.25,
  });
  check('override manual prevalece e café acompanha 25%',
    manual.source === 'manual' && manual.mainMeal === 120 && manual.breakfast === 30,
    JSON.stringify(manual));

  const learned = amounts.resolveDomesticPerDiemRate({
    effectiveDate: '2026-08-20',
    actMainMeal: 105.04,
    manualOverride: null,
    learnedMainMeal: 111.11,
    learnedBreakfast: null,
    breakfastPercent: 0.25,
  });
  check('refeição aprendida não altera café sem preço revisado próprio',
    learned.source === 'learned' && learned.mainMeal === 111.11 && learned.breakfast === 26.26 && learned.breakfastSource === 'act',
    JSON.stringify(learned));

  const learnedBreakfast = amounts.resolveDomesticPerDiemRate({
    effectiveDate: '2026-08-20',
    actMainMeal: 105.04,
    manualOverride: 120,
    learnedMainMeal: 111.11,
    learnedBreakfast: 29.5,
    breakfastPercent: 0.25,
  });
  check('café aprendido específico prevalece sobre derivação',
    learnedBreakfast.source === 'manual' && learnedBreakfast.mainMeal === 120 && learnedBreakfast.breakfast === 29.5,
    JSON.stringify(learnedBreakfast));

  const total = amounts.roundCurrencyAmount(
    32 * demonstrated.mainMeal + 3 * demonstrated.breakfast,
  );
  check('fallback não fabrica confirmação do documento', total === amounts.roundCurrencyAmount(32 * actBefore.mainMeal + 3 * actBefore.breakfast), String(total));

  const statement = [
    'DEMONSTRATIVO DE DIÁRIAS',
    'De 2032-08-05 até 2032-09-01',
    'Pagamento em 2032-09-05',
    'ALMOCO R$ 100,00',
    'JANTAR R$ 100,00',
    'CAFE R$ 25,00',
    'Total depositado R$ 3.275,00',
  ].join('\n');
  const learnedStatement = learning.learnPerDiemStatement(statement, 'statement.pdf');
  const lunch = learnedStatement.rates.find((rate) => rate.key === 'per_diem.lunch');
  const breakfast = learnedStatement.rates.find((rate) => rate.key === 'per_diem.breakfast');
  check('aprendizado grava início e fim do período',
    lunch?.effectiveFrom === '2032-08-05' && lunch?.effectiveTo === '2032-09-01'
      && breakfast?.effectiveFrom === '2032-08-05' && breakfast?.effectiveTo === '2032-09-01',
    JSON.stringify(learnedStatement.rates));

  const confirmed = learnedStatement.rates.map((rate) => ({ ...rate, confirmed: true }));
  check('rateAt encontra tarifa dentro do período',
    learning.rateAt(confirmed, 'per_diem.lunch', '2032-08-20')?.value === 100);
  check('rateAt não vaza tarifa para data posterior',
    learning.rateAt(confirmed, 'per_diem.lunch', '2032-09-02') === null);
  check('rateAt não retroage tarifa para data anterior',
    learning.rateAt(confirmed, 'per_diem.lunch', '2032-08-04') === null);

  const financialRules = fs.readFileSync('client/src/lib/financialRules.ts', 'utf8');
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  check('fallback jurídico nacional continua 105,04',
    /key: 'domestic'[\s\S]{0,120}?mainMeal: 105\.04/.test(financialRules));
  // Execute the actual replacement caller rather than asserting obsolete helper names.
  const ast=ts.createSourceFile('Home.tsx',home,99,true,ts.ScriptKind.TSX);
  const configNode=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='perDiemConfig');assert(configNode);
  const journal=load('financialActApplicability'),shared=load('sharedAllowanceResolution');
  const context=vm.createContext({...amounts,...shared,...journal,
    resolveActFinancialRules:()=>({breakfastPercent:.25,perDiem:[{key:'domestic',label:'Literal floor metadata',currency:'BRL',mainMeal:105.04}]}),
    confirmedPerDiemReferencesAt:()=>({state:'missing',mainMeal:null,breakfast:null,taxi:null}),
    readOptionalNumberSetting:()=>null,loadAirportPerDiemOverrides:()=>({})});
  vm.runInContext(ts.transpileModule(configNode.getText(ast),{compilerOptions:{target:99}}).outputText,context);
  const empty={schema:1,ownerId:'synthetic-date-scope',revision:0,events:[]};
  const history=journal.planFinancialActChange(empty,0,{from:'2025-12-01',through:'2027-11-30',active:true,employer:'TAM_LINHAS_AEREAS_SA',role:'cabin',coverage:'clause_1_2_included'});assert(history);
  const scope={state:'ready',ownerId:empty.ownerId,raw:JSON.stringify(history),history,session:null,isCurrent:()=>true};
  const at=date=>context.perDiemConfig({},date,scope);
  const before=at('2025-12-31'),jan=at('2026-01-01'),nextIndex=at('2026-12-01');
  check('Home usa resolvedor date-aware em vez de constante global',
    before.resolveSlot('domestic','mainMeal').kind==='reference'&&before.resolveSlot('domestic','mainMeal').value===109.43
    &&jan.rates.domestic.mainMeal===109.44&&Number.isNaN(nextIndex.rates.domestic.mainMeal));
  check('café nacional vem da resolução efetiva',
    jan.domesticBreakfast===27.36&&jan.resolveSlot('domestic','breakfast').value===27.36&&Number.isNaN(nextIndex.domesticBreakfast));
  const unconfirmed=context.perDiemConfig({},'2026-01-01',{...scope,history:empty});
  check('Home não aplica piso atemporal sem abrangência declarada',Number.isNaN(unconfirmed.rates.domestic.mainMeal)&&Number.isNaN(unconfirmed.domesticBreakfast));
} finally {
  cleanup();
}

process.exit(checker.report());
