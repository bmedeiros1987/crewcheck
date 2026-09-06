/**
 * #536 — os dois P1 de caminho real apontados pela auditoria independente.
 *
 * P1a — snapshot de compliance persistido era reutilizado por "existe compliance
 *       salvo". Uma escala reaberta exibia veredito calculado sobre outro contexto.
 * P1b — o histórico da competência anterior pode existir só na conta, não no
 *       aparelho. Com cobertura incompleta, o cálculo dizia "OK" silencioso.
 *
 * Arquitetura decidida: o motor continua puro e SÍNCRONO; a camada de carregamento
 * busca o histórico em background e dispara recálculo. Enquanto a cobertura for
 * incompleta, a janela de 28 dias fica NÃO CONCLUSIVA, nunca "OK". E um snapshot
 * só é reutilizado se bater rosterFingerprint + regulatoryHistoryFingerprint +
 * perfil/regras + versão do motor.
 *
 * Casos sintéticos no nível de campo; nenhum PDF ou fixture mensal (ver #533).
 */

import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB, createChecker } from './lib/ts-module-harness.mjs';

const { load, cleanup } = loadClientModules({
  files: [
    'client/src/lib/rosterCodes.ts', 'client/src/lib/actRules.ts', 'client/src/lib/rosterContinuity.ts',
    'client/src/lib/embeddedFormalDaysOff.ts', 'client/src/lib/scheduleActivityClassification.ts',
    'client/src/lib/canonicalRoster.ts', 'client/src/lib/complianceEngine.ts',
  ],
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  prefix: 'crewcheck-536-coverage-',
  expose: { complianceEngine: ['analyzeCompliance', 'selectRegulatoryHistoryDays', 'canReuseComplianceSnapshot', 'rosterFingerprint', 'regulatoryHistoryFingerprint'] },
});
const CE = load('complianceEngine');
const checker = createChecker('P-1 #536 — cobertura histórica e reuso de snapshot');
const { check } = checker;

// As APIs de proveniência são novas nesta slice. Sem guarda, rodar contra o motor
// anterior mata o teste no primeiro TypeError e esconde as asserções de
// comportamento — o fail-before viraria "crashou", não "afirmou conformidade sem
// cobertura". Com guarda, cada lacuna vira um check nomeado.
const hasSnapshotApi = typeof CE.canReuseComplianceSnapshot === 'function';
const hasFingerprintApi = typeof CE.rosterFingerprint === 'function' && typeof CE.regulatoryHistoryFingerprint === 'function';
check('motor expõe canReuseComplianceSnapshot', hasSnapshotApi);
check('motor expõe os fingerprints de escala e de histórico', hasFingerprintApi);

const day = (d, m, y, h) => ({
  date: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`,
  dayNumber: d, month: m, year: y, dayOfWeek: 'Seg', type: 'VOO',
  pairingCode: `LA${1000 + d}`, flyingHours: h, dutyHours: h + 1,
  legs: [{ flightNumber: `LA${1000 + d}`, origin: 'BSB', destination: 'GRU', departureTime: '10:00', arrivalTime: '12:00', duration: h }],
});
const jan = Array.from({ length: 14 }, (_, i) => day(18 + i, 1, 2026, 3.6));
const fev = Array.from({ length: 14 }, (_, i) => day(1 + i, 2, 2026, 3.6));
const roster = (days) => ({ crewName: 'X', crewId: '1', base: 'BSB', rank: 'CCM', month: 2, year: 2026, days });
const alertsAbout = (r, re) => (r.alerts || []).filter((a) => re.test(String(a.title || '')));

// ---------------------------------------------------------------------------
// 1. P1b — cobertura incompleta não pode virar silêncio.
// ---------------------------------------------------------------------------
{
  const incompleto = CE.analyzeCompliance(roster(fev), 'auto', [], false);
  const naoConclusivo = alertsAbout(incompleto, /não conclusiva/i);
  check('cobertura incompleta produz item explícito de "não conclusiva"',
    naoConclusivo.length === 1, JSON.stringify((incompleto.alerts || []).map((a) => a.title)));
  check('o item não conclusivo é warning, não silêncio nem erro',
    naoConclusivo[0]?.severity === 'warning', `severity=${naoConclusivo[0]?.severity}`);

  const completo = CE.analyzeCompliance(roster(fev), 'auto', [], true);
  check('com cobertura declarada completa e sem violação, não há item não conclusivo',
    alertsAbout(completo, /não conclusiva/i).length === 0,
    JSON.stringify((completo.alerts || []).map((a) => a.title)));
}

// ---------------------------------------------------------------------------
// 2. Violação já comprovada não é rebaixada para "não conclusiva".
// ---------------------------------------------------------------------------
{
  const historico = CE.selectRegulatoryHistoryDays(fev, jan);
  const comViolacao = CE.analyzeCompliance(roster(fev), 'auto', historico, false);
  check('violação de 100,8h continua sendo alertada mesmo com cobertura incompleta',
    alertsAbout(comViolacao, /Limite de horas de voo/i).length > 0,
    JSON.stringify((comViolacao.alerts || []).map((a) => a.title)));
  check('violação comprovada não é rebaixada para "não conclusiva"',
    alertsAbout(comViolacao, /não conclusiva/i).length === 0);
}

// ---------------------------------------------------------------------------
// 3. P1a — reuso de snapshot só com todos os eixos batendo.
// ---------------------------------------------------------------------------
if (hasSnapshotApi) {
  const historico = CE.selectRegulatoryHistoryDays(fev, jan);
  const ctx = { roster: roster(fev), regulatoryHistoryDays: historico, roleSelection: 'auto', regulatoryHistoryComplete: true };
  const snapshot = CE.analyzeCompliance(ctx.roster, 'auto', historico, true);

  check('snapshot do mesmo contexto é reutilizável', CE.canReuseComplianceSnapshot(snapshot, ctx));

  check('snapshot sem provenance nunca é reutilizado (fail-closed)',
    !CE.canReuseComplianceSnapshot({ alerts: [], metrics: {} }, ctx));
  check('snapshot null nunca é reutilizado', !CE.canReuseComplianceSnapshot(null, ctx));

  check('escala diferente invalida o snapshot',
    !CE.canReuseComplianceSnapshot(snapshot, { ...ctx, roster: roster(fev.slice(0, 5)) }));
  check('histórico regulatório diferente invalida o snapshot',
    !CE.canReuseComplianceSnapshot(snapshot, { ...ctx, regulatoryHistoryDays: [] }));
  check('cobertura declarada diferente invalida o snapshot',
    !CE.canReuseComplianceSnapshot(snapshot, { ...ctx, regulatoryHistoryComplete: false }));
  check('perfil/regra diferente invalida o snapshot',
    !CE.canReuseComplianceSnapshot(snapshot, { ...ctx, roleSelection: 'cabin' }));

  const versaoAntiga = { ...snapshot, provenance: { ...snapshot.provenance, engineVersion: 'motor-antigo' } };
  check('versão de motor diferente invalida o snapshot',
    !CE.canReuseComplianceSnapshot(versaoAntiga, ctx));
}

// ---------------------------------------------------------------------------
// 4. Fingerprints — mudam com a entrada, estáveis para a mesma entrada.
// ---------------------------------------------------------------------------
if (hasFingerprintApi) {
  check('rosterFingerprint é estável para a mesma escala',
    CE.rosterFingerprint(roster(fev)) === CE.rosterFingerprint(roster(fev)));
  check('rosterFingerprint muda quando a escala muda',
    CE.rosterFingerprint(roster(fev)) !== CE.rosterFingerprint(roster(fev.slice(0, 10))));
  check('rosterFingerprint não depende da ordem dos dias',
    CE.rosterFingerprint(roster(fev)) === CE.rosterFingerprint(roster([...fev].reverse())));
  check('regulatoryHistoryFingerprint separa histórico vazio de preenchido',
    CE.regulatoryHistoryFingerprint([]) !== CE.regulatoryHistoryFingerprint(jan));
}

// ---------------------------------------------------------------------------
// 5. Histórico continua fora da competência (contrato do SHA anterior).
// ---------------------------------------------------------------------------
{
  const historico = CE.selectRegulatoryHistoryDays(fev, jan);
  const sem = CE.analyzeCompliance(roster(fev), 'auto', [], true);
  const com = CE.analyzeCompliance(roster(fev), 'auto', historico, true);
  check('KPI de horas de voo permanece o da competência, com ou sem histórico',
    Math.abs((com.metrics?.totalFlightHours ?? 0) - (sem.metrics?.totalFlightHours ?? 0)) < 0.05,
    `com=${com.metrics?.totalFlightHours} sem=${sem.metrics?.totalFlightHours}`);
}

cleanup();
process.exit(checker.report());
