import assert from 'node:assert/strict';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const { load, cleanup } = loadClientModules({
  files: ['client/src/lib/careEngine.ts'],
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  prefix: 'crewcheck-care-engine-',
});

const {
  buildWeeklyTrainingCareMoment,
  decideCareMoment,
  scoreCareMoment,
} = load('careEngine');

// 1. Semana puxada + treino precisa reconhecer a conquista, não cobrar o usuário.
{
  const moment = buildWeeklyTrainingCareMoment({
    gymVisitsThisWeek: 3,
    usualWeeklyGymVisits: 3,
    workload: 'heavy',
    nightsAwayFromBase: 3,
    earlyOrLateDuties: 2,
  });

  assert.ok(moment, 'deveria produzir um momento de cuidado');
  assert.equal(moment.intent, 'celebrate');
  assert.match(moment.title, /Semana puxada/);
  assert.doesNotMatch(`${moment.title} ${moment.detail}`, /precisa|deveria|falhou|meta quebrada/i);

  const decision = decideCareMoment([moment]);
  assert.equal(decision.intent, 'celebrate');
}

// 2. Queda de frequência oferece ajuda sem diagnosticar, culpar ou prescrever.
{
  const moment = buildWeeklyTrainingCareMoment({
    gymVisitsThisWeek: 1,
    usualWeeklyGymVisits: 4,
    workload: 'normal',
    goodTrainingWindowsNextWeek: 3,
    userHasTrainingGoal: true,
  });

  assert.ok(moment, 'deveria oferecer suporte quando existe rotina/objetivo do próprio usuário');
  assert.equal(moment.intent, 'support');
  assert.equal(moment.primaryAction?.actionId, 'care.plan-training-week');
  assert.match(moment.detail, /3 boas janelas/);
  assert.doesNotMatch(`${moment.title} ${moment.detail}`, /você precisa treinar|saúde|sedentár/i);
}

// 3. Sem contexto suficiente, o CrewCheck fica quieto.
{
  const moment = buildWeeklyTrainingCareMoment({
    gymVisitsThisWeek: 0,
    workload: 'normal',
    userHasTrainingGoal: false,
  });
  assert.equal(moment, null, 'sem rotina/objetivo estabelecido não deve inferir cobrança');
}

// 4. Intervenções pouco úteis não atravessam o limiar apenas porque existem.
{
  const lowValue = {
    id: 'low-value',
    intent: 'nudge',
    title: 'Curiosidade pouco útil',
    confidence: 0.7,
    importance: 0.2,
    utility: 0.2,
    interruptionCost: 0.8,
  };
  assert.ok(scoreCareMoment(lowValue) < 0.56);
  const decision = decideCareMoment([lowValue]);
  assert.equal(decision.intent, 'silence');
  assert.equal(decision.reason, 'below-threshold');
}

// 5. Cooldown impede repetição de mensagens dispensáveis.
{
  const candidate = buildWeeklyTrainingCareMoment({
    gymVisitsThisWeek: 2,
    workload: 'heavy',
  });
  assert.ok(candidate);
  const decision = decideCareMoment([candidate], {
    recentlyShownCooldownKeys: new Set(['weekly-training']),
  });
  assert.equal(decision.intent, 'silence');
  assert.equal(decision.reason, 'cooldown');
}

// 6. Evento crítico continua elegível apesar do custo de interrupção e ganha prioridade.
{
  const critical = {
    id: 'critical-op',
    intent: 'protect',
    title: 'Sua margem operacional mudou.',
    confidence: 0.95,
    importance: 1,
    utility: 1,
    interruptionCost: 1,
    safetyCritical: true,
  };
  const pleasant = {
    id: 'pleasant',
    intent: 'celebrate',
    title: 'Boa semana!',
    confidence: 0.98,
    importance: 0.9,
    utility: 0.9,
    interruptionCost: 0,
  };
  const decision = decideCareMoment([pleasant, critical]);
  assert.equal(decision.intent, 'protect');
  assert.equal(decision.moment.id, 'critical-op');
}

// 7. Conteúdo vencido não reaparece.
{
  const expired = {
    id: 'expired',
    intent: 'reassure',
    title: 'Tudo certo.',
    confidence: 1,
    importance: 1,
    utility: 1,
    interruptionCost: 0,
    expiresAt: '2026-09-01T10:00:00.000Z',
  };
  const decision = decideCareMoment([expired], { now: new Date('2026-09-04T10:00:00.000Z') });
  assert.equal(decision.intent, 'silence');
  assert.equal(decision.reason, 'expired');
}

cleanup();
console.log('[care] PASS — contexto, celebração, suporte, silêncio, cooldown e prioridade crítica protegidos.');
