import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const runtime = fs.readFileSync('client/src/components/pulse/pulseRuntime.ts', 'utf8');
const component = fs.readFileSync('client/src/components/pulse/CrewCheckPulse.tsx', 'utf8');
const css = fs.readFileSync('client/src/components/pulse/crewcheck-pulse.css', 'utf8');
const headerCss = fs.readFileSync('client/src/styles/internal-global-header.css', 'utf8');

// Integração real depois da preparação canônica.
for (const marker of [
  "from '@/components/pulse/pulseRuntime'",
  "label=\"CrewCheck Pulse\"",
  'function NotificationPermissionSetting()',
  "title: 'Escala atualizada'",
  "title: 'Escala sem programação futura'",
  "category: 'gate'",
  "category: 'weather'",
  "category: 'compliance'",
  "systemNotification: 'background'",
  "action: { label: 'Revisar', view: 'alerts' }",
]) {
  assert.ok(home.includes(marker), 'integração Pulse ausente após prepare: ' + marker);
}

// O Pulse do header é attention-only: confirmações rotineiras ficam em toast e
// próxima programação continua no conteúdo principal.
for (const forbidden of [
  'id: `next:${event.id}',
  'id: `active-roster:',
  'id: `roster-import:${roster.year}',
  'id: `presentation:${event.id}',
  'id: `presentation-reset:${event.id}',
]) {
  assert.ok(!home.includes(forbidden), 'aviso rotineiro voltou a ocupar o Pulse: ' + forbidden);
}
assert.ok(home.includes("Portão alterado"), 'mudança confirmada de portão precisa alimentar o Pulse');
assert.ok(home.includes("Meteorologia crítica") && home.includes("Meteorologia requer atenção"), 'severidade meteorológica existente precisa alimentar o Pulse');
assert.ok(home.includes("Bloqueio ou ocorrência crítica na rota"), 'ocorrência crítica de trânsito precisa alimentar o Pulse');

// A publicação normal nunca pede permissão de notificação por conta própria.
const publishStart = runtime.indexOf('export function publishCrewCheckNotice');
const publishEnd = runtime.indexOf('export function subscribeCrewCheckPulse', publishStart);
const publishBlock = runtime.slice(publishStart, publishEnd);
assert.ok(publishStart >= 0 && publishEnd > publishStart, 'publishCrewCheckNotice não localizado');
assert.ok(!publishBlock.includes('requestPermission'), 'publicar aviso não pode abrir prompt de permissão');
assert.ok(!publishBlock.includes('requestCrewCheckNotificationPermission'), 'publicar aviso não pode pedir permissão nativa');
assert.ok(runtime.includes("safeLocalGet(DEVICE_NOTIFICATIONS_KEY, '0')"), 'notificações do aparelho precisam continuar opt-in');
assert.ok(runtime.includes("policy === 'background'") && runtime.includes("document.visibilityState !== 'hidden'"), 'política background deve notificar somente fora do foreground');
assert.ok(runtime.includes("pulseCooldownMs"), 'runtime precisa deduplicar contexto recorrente');
assert.ok(runtime.includes("notificationCooldownMs"), 'runtime precisa deduplicar notificações de sistema');

// UI da fila / ação contextual.
for (const marker of ['cc-pulse-compact', 'cc-pulse-popover', 'cc-pulse-controls', 'cc-pulse-queue', 'cc-pulse-action', 'data-priority']) {
  assert.ok(component.includes(marker) || css.includes(marker), 'UI do Slice 2 ausente: ' + marker);
}
assert.ok(component.includes("crewcheck:set-view"), 'ação do Pulse deve usar a navegação já existente');

// Interação compacta: o alerta inteiro navega direto; a seta é o único controle
// dedicado a expandir detalhes. Navegar não equivale a dispensar a mensagem.
const compactStart = component.indexOf('if (compact)');
const compactEnd = component.indexOf('return (', compactStart + 20);
const compactBlock = component.slice(compactStart, compactEnd > compactStart ? compactEnd : component.length);
assert.ok(compactBlock.includes('onClick={act}'), 'toque no alerta compacto deve executar sua ação contextual');
assert.ok(compactBlock.includes('className="cc-pulse-compact-details"') && compactBlock.includes('onClick={toggleDetails}'),
  'detalhes do Pulse devem ter controle separado da navegação');
const actStart = component.indexOf('const act = () => {');
const actEnd = component.indexOf('const toggleDetails', actStart);
const actBlock = component.slice(actStart, actEnd);
assert.ok(actStart >= 0 && actEnd > actStart, 'handler contextual do Pulse não localizado');
assert.ok(!actBlock.includes('dismiss();'), 'abrir o destino não pode dispensar automaticamente o alerta');

const triggerCssStart = css.indexOf('.cc-pulse-compact-trigger {');
const triggerCssEnd = css.indexOf('}', triggerCssStart);
const triggerCss = css.slice(triggerCssStart, triggerCssEnd + 1);
assert.ok(triggerCss.includes('border: 0;') && triggerCss.includes('background: transparent;'),
  'Pulse compacto não deve desenhar uma segunda moldura dentro do header');
assert.ok(css.includes('.cc-pulse-compact-details'), 'seta de detalhes precisa manter alvo de toque próprio');
assert.ok(headerCss.includes('position: fixed !important'),
  'Pulse compacto deve continuar dentro do header global fixo durante o scroll');

assert.ok(css.includes('cc-pulse-beat 2.4s ease-in-out 2'), 'microinteração do Pulse não pode pulsar infinitamente');
assert.ok(css.includes('prefers-reduced-motion'), 'movimento reduzido deve continuar respeitado');

// O bridge legado de notificações locais agora passa pelo Pulse e não solicita permissão implicitamente.
const notifyStart = home.indexOf('function notifyCrewCheck(');
const notifyEnd = home.indexOf('function useWeatherLandingMonitor(', notifyStart);
const notifyBlock = home.slice(notifyStart, notifyEnd);
assert.ok(notifyBlock.includes('publishCrewCheckNotice'), 'notifyCrewCheck precisa alimentar o Pulse');
assert.ok(!notifyBlock.includes('Notification.requestPermission'), 'notifyCrewCheck não pode abrir prompt de permissão');

// Escopo: o Slice 2 não possui qualquer engine operacional.
for (const protectedToken of ['pdfParser', 'canonicalRoster', 'financialRules', 'complianceEngine', 'journeyId']) {
  assert.ok(!runtime.includes(protectedToken), 'runtime Pulse não pode depender de ' + protectedToken);
}

// Comportamento real da fila.
{
  const { load, cleanup } = loadClientModules({
    files: [
      'client/src/components/pulse/pulseTypes.ts',
      'client/src/components/pulse/pulseSession.ts',
    ],
    stubs: TYPE_ONLY_PDF_PARSER_STUB,
    prefix: 'crewcheck-546-live-',
  });
  const { createPulseSession, PULSE_LEAVE_MS, PULSE_QUEUE_LIMIT } = load('pulseSession');

  function fakeClock() {
    const jobs = new Map();
    let id = 1;
    return {
      timers: {
        set(fn, ms) { const key = id++; jobs.set(key, { fn, ms }); return key; },
        clear(key) { jobs.delete(key); },
      },
      count() { return jobs.size; },
      runMs(ms) {
        const match = [...jobs.entries()].find(([, job]) => job.ms === ms);
        assert.ok(match, 'timer esperado não encontrado: ' + ms);
        jobs.delete(match[0]);
        match[1].fn();
      },
    };
  }

  // Prioridade: alta preempta, a normal retorna antes da baixa.
  {
    const clock = fakeClock();
    let state;
    const session = createPulseSession((next) => { state = next; }, { timers: clock.timers });
    session.publish({ id: 'normal', title: 'Normal', priority: 'normal' });
    session.publish({ id: 'low', title: 'Baixa', priority: 'baixa' });
    session.publish({ id: 'high', title: 'Alta', priority: 'alta' });
    assert.equal(state.message.id, 'high');
    assert.equal(state.queued, 2);
    session.dismiss();
    clock.runMs(PULSE_LEAVE_MS);
    assert.equal(state.message.id, 'normal');
    session.dismiss();
    clock.runMs(PULSE_LEAVE_MS);
    assert.equal(state.message.id, 'low');
  }

  // FIFO para a mesma prioridade.
  {
    const clock = fakeClock();
    let state;
    const session = createPulseSession((next) => { state = next; }, { timers: clock.timers });
    session.publish({ id: 'a', title: 'A', priority: 'normal' });
    session.publish({ id: 'b', title: 'B', priority: 'normal' });
    session.publish({ id: 'c', title: 'C', priority: 'normal' });
    session.dismiss();
    clock.runMs(PULSE_LEAVE_MS);
    assert.equal(state.message.id, 'b');
    session.dismiss();
    clock.runMs(PULSE_LEAVE_MS);
    assert.equal(state.message.id, 'c');
  }

  // Dedupe atual e na fila.
  {
    const clock = fakeClock();
    let state;
    const session = createPulseSession((next) => { state = next; }, { timers: clock.timers });
    session.publish({ dedupeKey: 'same', title: 'Versão 1', priority: 'normal' });
    session.publish({ dedupeKey: 'same', title: 'Versão 2', priority: 'normal' });
    assert.equal(state.message.title, 'Versão 2');
    assert.equal(state.queued, 0);
    session.publish({ dedupeKey: 'queued', title: 'Fila 1', priority: 'baixa' });
    session.publish({ dedupeKey: 'queued', title: 'Fila 2', priority: 'baixa' });
    assert.equal(state.queued, 1);
    session.dismiss();
    clock.runMs(PULSE_LEAVE_MS);
    assert.equal(state.message.title, 'Fila 2');
  }

  // Auto-dismiss avança a fila só depois da animação.
  {
    const clock = fakeClock();
    let state;
    const session = createPulseSession((next) => { state = next; }, { timers: clock.timers });
    session.publish({ id: 'auto', title: 'Auto', autoDismissMs: 500, priority: 'normal' });
    session.publish({ id: 'next', title: 'Next', priority: 'normal' });
    clock.runMs(500);
    assert.equal(state.leaving, true);
    clock.runMs(PULSE_LEAVE_MS);
    assert.equal(state.message.id, 'next');
  }

  assert.equal(PULSE_QUEUE_LIMIT, 8, 'fila deve permanecer limitada');
  cleanup();
}

console.log('[p1-546-live] Pulse attention-only: header compacto, portão/meteo/trânsito/escala/compliance, fila/prioridade/dedupe e notificações opt-in validados.');
