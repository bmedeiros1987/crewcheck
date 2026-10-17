import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as human from '../server/v1403/telegram-human.mjs';
import { prepareConciergeCanonicalBridge } from './p1-concierge-journey/bridge.mjs';
prepareConciergeCanonicalBridge();
const { conciergeNextJourneyProgram } = await import('../server/concierge/journey-programs.mjs');
import { deliverWhatsAppMenuMessage } from '../server/concierge/whatsapp-menu.mjs';
const source = fs.readFileSync('server.mjs', 'utf8');
const extract = name => {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm')), end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, name); return source.slice(start, end);
};
const context = vm.createContext({ ...human, conciergeNextJourneyProgram,
  conciergeCareState: () => 'NONE', conciergeInactiveCodes: new Set(),
  conciergeIdentityFlow: async (_text, _profile, snapshot) => ({ handled: false, snapshot }),
  conciergeEasterEggReply: () => null,
  isWellhubPlanPreferenceMessage: () => false, isWellhubActivityPreferenceMessage: () => false,
  matchesTodayIntent: () => false, matchesTomorrowIntent: () => false, matchesNextIntent: () => false,
  matchesRosterSummaryIntent: () => false, matchesRadarIntent: () => false, matchesDepartureIntent: () => false,
});
for (const name of ['normalizeConciergeButtonText','conciergeMinimizeRoster','conciergeRosterDiagnostics','conciergeRosterDayParts','conciergeTime','conciergeProgramDate','conciergeProgramRecords','conciergeRecordDateKey','conciergeDateKey','conciergeDayForKey','conciergePresentationTime','conciergePremiumScheduleReply','conciergePerDiemReply','buildTelegramConciergeReplyCore']) vm.runInContext(extract(name), context);
const roster = (base, destination, crewName) => ({ base, crewName, month: 10, year: 2099, days: [{ date: '07/10/2099', dayNumber: 7, month: 10, year: 2099, type: 'FLIGHT', pairingCode: 'FIXTURE', dutyReport: '11:30', dutyDebrief: '14:30', legs: [{ flightNumber: 'LA9999', origin: base, destination, departureTime: '12:25', arrivalTime: '14:10' }] }] });
const snapshots = new Map([
  ['a@fixture.invalid', { email: 'a@fixture.invalid', name: 'Fictional A', roster: roster('BSB','GRU','Fictional A'), preferences: { mode: 'formal' } }],
  ['b@fixture.invalid', { email: 'b@fixture.invalid', name: 'Fictional B', roster: roster('GRU','BSB','Fictional B'), preferences: { mode: 'formal' } }],
]);
const bindings = new Map([['5511000000001', 'a@fixture.invalid'], ['5511000000002', 'b@fixture.invalid']]);
let sent = [];
const commands = [['Hoje','/hoje'], ['Amanhã','/amanha'], ['Escala','/escala'], ['Próxima programação','/proximo'], ['Diárias','/diarias']];
for (const [phone, email] of bindings) {
  for (const [label, command] of commands) {
    const snapshot = snapshots.get(email), profile = { email, name: snapshot.name, linked: true };
    const telegram = await context.buildTelegramConciergeReplyCore(command, { ...profile, channel: 'telegram' }, snapshot);
    await deliverWhatsAppMenuMessage({ id: 'fictional-' + label, from: phone, type: 'text', text: label }, {
      findLink: async from => ({ email: bindings.get(from), linked_at: '2099-01-01', consent_concierge: 1 }),
      handler: ({ email, text }) => context.buildTelegramConciergeReplyCore(text, { email, name: snapshots.get(email).name, linked: true, channel: 'whatsapp' }, snapshots.get(email)),
      send: async (to, text) => { sent.push({ to, text }); return { ok: true }; },
    });
    assert.equal(sent.at(-1).text, telegram, label + ': same canonical producer');
    assert.equal(sent.at(-1).to, phone);
    assert.doesNotMatch(sent.at(-1).text, email.startsWith('a') ? /Fictional B/ : /Fictional A/);
    if (command === '/diarias') { assert.match(telegram, /Pernoites potenciais detectados: 1/); assert.match(telegram, new RegExp(snapshot.roster.days[0].legs[0].destination)); assert.doesNotMatch(telegram, /R\$|valor calculado/i); }
  }
}
for (const channel of ['telegram','whatsapp']) {
  const empty = await context.buildTelegramConciergeReplyCore('/escala', { email: 'empty@fixture.invalid', channel }, { roster: { days: [] } });
  assert.match(empty, /não tenho uma escala ativa/);
  const finance = await context.buildTelegramConciergeReplyCore('/diarias', { email: 'empty@fixture.invalid', channel }, { roster: { base: 'BSB', days: [] } });
  assert.match(finance, /Não detectei pernoites/); assert.doesNotMatch(finance, /R\$/);
}
console.log('PASS actual canonical schedule/next/summary and per-diem operational queries match Telegram/WhatsApp for fictional A/B accounts; missing data and no invented financial values');
