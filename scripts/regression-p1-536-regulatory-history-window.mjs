/**
 * #536 — a janela regulatória de 28 dias precisa enxergar o fim da competência
 * anterior, sem que o mês anterior contamine a competência exibida.
 *
 * A auditoria independente do #526 apontou que a matemática da janela estava
 * correta mas o caminho real de dados não carregava os até 27 dias anteriores:
 * cada importação traz uma competência, então 50h no fim de janeiro + 50h no
 * começo de fevereiro nunca somavam na mesma janela. Medido antes da correção:
 *
 *   jan+fev no bundle   -> alerta dispara (100,8h)
 *   só fevereiro        -> nenhum alerta
 *
 * Este teste cobre os dois lados do contrato:
 *   1. com histórico disponível, a violação que atravessa a virada é detectada;
 *   2. o histórico NÃO entra na competência — KPIs seguem só com fevereiro.
 *
 * Casos sintéticos no nível de campo; nenhum PDF ou fixture mensal (ver #533).
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const checker = createChecker('P-1 #536 — histórico regulatório na janela de 28 dias');
const { check } = checker;

const { load, cleanup } = loadClientModules({
  files: [
    'client/src/lib/rosterCodes.ts', 'client/src/lib/actRules.ts', 'client/src/lib/rosterContinuity.ts',
    'client/src/lib/embeddedFormalDaysOff.ts', 'client/src/lib/scheduleActivityClassification.ts',
    'client/src/lib/canonicalRoster.ts', 'client/src/lib/complianceEngine.ts',
  ],
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  prefix: 'crewcheck-536-history-',
  expose: { complianceEngine: ['analyzeCompliance', 'worstFlightHoursWindow28Days', 'selectRegulatoryHistoryDays'] },
});
const CE = load('complianceEngine');

const day = (d, m, y, h) => ({
  date: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
  dayNumber: d, month: m, year: y, dayOfWeek: 'Seg', type: 'VOO',
  pairingCode: `LA${1000 + d}`, flyingHours: h, dutyHours: h + 1,
  legs: [{ flightNumber: `LA${1000 + d}`, origin: 'BSB', destination: 'GRU', departureTime: '10:00', arrivalTime: '12:00', duration: h }],
});
// 14 dias x 3,6h = 50,4h de cada lado da virada; juntos, 100,8h em 28 dias.
const jan = Array.from({ length: 14 }, (_, i) => day(18 + i, 1, 2026, 3.6));
const fev = Array.from({ length: 14 }, (_, i) => day(1 + i, 2, 2026, 3.6));
const roster = (days) => ({ crewName: 'X', crewId: '1', base: 'BSB', rank: 'CCM', month: 2, year: 2026, days });
const flightAlerts = (result) => (result.alerts || []).filter((a) => /voo/i.test(String(a.title || '')));

// ---------------------------------------------------------------------------
// 1. O seletor: só dias anteriores, dentro da janela, sem duplicar.
// ---------------------------------------------------------------------------
{
  const picked = CE.selectRegulatoryHistoryDays(fev, jan);
  check('seleciona os 14 dias de janeiro que precedem a competência', picked.length === 14, `recebido=${picked.length}`);
  check('nenhum dia selecionado pertence à competência',
    picked.every((d) => d.month === 1), JSON.stringify(picked.map((d) => d.date).slice(0, 3)));

  const semHistorico = CE.selectRegulatoryHistoryDays(fev, []);
  check('sem candidatos, devolve vazio', semHistorico.length === 0);

  const naoDuplica = CE.selectRegulatoryHistoryDays(fev, fev);
  check('dias já presentes na competência não são reintroduzidos', naoDuplica.length === 0, `recebido=${naoDuplica.length}`);

  const antigoDemais = CE.selectRegulatoryHistoryDays(fev, [day(1, 1, 2025, 5)]);
  check('dia fora da janela de 27 dias é descartado', antigoDemais.length === 0);

  const futuro = CE.selectRegulatoryHistoryDays(fev, [day(20, 3, 2026, 5)]);
  check('dia posterior à competência nunca entra como histórico', futuro.length === 0);
}

// ---------------------------------------------------------------------------
// 2. Detecção — o caso que motivou o #526.
// ---------------------------------------------------------------------------
{
  const semHistorico = CE.analyzeCompliance(roster(fev));
  check('FAIL-BEFORE: só a competência no bundle não detecta a violação',
    flightAlerts(semHistorico).length === 0);

  const historico = CE.selectRegulatoryHistoryDays(fev, jan);
  const comHistorico = CE.analyzeCompliance(roster(fev), 'auto', historico);
  check('com histórico, a violação de 100,8h que atravessa a virada dispara alerta',
    flightAlerts(comHistorico).length > 0, JSON.stringify((comHistorico.alerts || []).map((a) => a.title)));

  const janela = CE.worstFlightHoursWindow28Days([...historico, ...fev]);
  check('a pior janela soma 100,8h', Math.abs(janela.flightHours - 100.8) < 0.05, `flightHours=${janela.flightHours}`);
  check('a pior janela é marcada como atravessando a virada do mês', janela.spansMonthBoundary === true);
}

// ---------------------------------------------------------------------------
// 3. Não contaminação — estrutural: o histórico chega por parâmetro e nunca entra
//    em `roster.days`, então nenhum total da competência pode enxergá-lo. Mesclar
//    no roster inflava os KPIs no estado base (50,4h -> 100,8h), onde o filtro
//    `competenceDays` ainda não existe. — o histórico não pode aparecer na competência.
// ---------------------------------------------------------------------------
{
  const soCompetencia = CE.analyzeCompliance(roster(fev));
  const comHistorico = CE.analyzeCompliance(roster(fev), 'auto', CE.selectRegulatoryHistoryDays(fev, jan));

  check('KPI de horas de voo não muda com o histórico presente',
    Math.abs((comHistorico.metrics?.totalFlightHours ?? 0) - (soCompetencia.metrics?.totalFlightHours ?? 0)) < 0.05,
    `com=${comHistorico.metrics?.totalFlightHours} sem=${soCompetencia.metrics?.totalFlightHours}`);
  check('KPI de horas de voo permanece o de fevereiro (50,4h)',
    Math.abs((comHistorico.metrics?.totalFlightHours ?? 0) - 50.4) < 0.05,
    `totalFlightHours=${comHistorico.metrics?.totalFlightHours}`);
  check('KPI de horas de trabalho não é inflado pelo histórico',
    Math.abs((comHistorico.metrics?.totalDutyHours ?? 0) - (soCompetencia.metrics?.totalDutyHours ?? 0)) < 0.05,
    `com=${comHistorico.metrics?.totalDutyHours} sem=${soCompetencia.metrics?.totalDutyHours}`);
}

cleanup();
process.exit(checker.report());
