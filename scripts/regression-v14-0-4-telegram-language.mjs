import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildDepartureSummary,
  buildProgramSummary,
  calculateDepartureWindow,
  matchesDepartureIntent,
  matchesNextIntent,
  matchesRadarIntent,
  matchesRosterSummaryIntent,
  matchesTodayIntent,
  matchesTomorrowIntent,
  originDeparturePhrase,
  spokenTime,
} from '../server/v1404/telegram-language.mjs';

await import('./v139/apply.mjs');

const server = fs.readFileSync('server.mjs', 'utf8');
const metadata = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const android = fs.readFileSync('android-wrapper/app/build.gradle', 'utf8');

assert.equal(metadata.version, '14.0.4');
assert.match(android, /versionCode 140004\b/);
assert.match(android, /versionName '14\.0\.4'/);
assert.match(server, /matchesTodayIntent\(value\)/);
assert.match(server, /matchesDepartureIntent\(value\)/);
assert.match(server, /calculateDepartureWindow\(presentationDate, route\)/);
assert.match(server, /server\/v1404\/telegram-language\.mjs/);

for (const question of [
  'o que tenho para hoje?',
  'o que eu tenho hoje',
  'como vai ser meu dia hoje?',
  'tenho algum voo hoje?',
  'quais pernas tenho hoje?',
  'o que está previsto para hoje?',
  'onde vou hoje?',
]) assert.equal(matchesTodayIntent(question), true, question);

for (const question of [
  'o que tenho amanhã?',
  'qual é minha programação para amanhã?',
  'tenho voo amanhã?',
  'como vai ser meu dia amanhã?',
]) assert.equal(matchesTomorrowIntent(question), true, question);

for (const question of [
  'qual é meu próximo voo?',
  'o que vem depois?',
  'quando eu trabalho de novo?',
]) assert.equal(matchesNextIntent(question), true, question);

for (const question of [
  'como está minha escala?',
  'quantas pernas eu tenho?',
  'o que tenho neste mês?',
]) assert.equal(matchesRosterSummaryIntent(question), true, question);

for (const question of [
  'que horas devo sair de casa?',
  'preciso sair que horas?',
  'qual é o horário da minha saída?',
]) assert.equal(matchesDepartureIntent(question), true, question);

for (const question of [
  'qual é o portão do meu voo?',
  'onde eu embarco?',
  'meu voo está atrasado?',
]) assert.equal(matchesRadarIntent(question), true, question);

assert.equal(originDeparturePhrase('BSB'), 'de Brasília');
assert.equal(originDeparturePhrase('GRU'), 'de Guarulhos');
assert.equal(originDeparturePhrase('REC'), 'do Recife');
assert.equal(spokenTime('01:01'), '1 hora e 1 minuto');
assert.equal(spokenTime('14:30'), '14 horas e 30 minutos');

const profile = { name: 'Bruno', role: 'CCM' };
const snapshot = { preferences: { preferredName: 'Bruno' } };
const record = {
  startTime: '12:00',
  endTime: '19:40',
  legs: [
    { flightNumber: 'LA3794', origin: 'BSB', destination: 'CWB', departureTime: '14:45', arrivalTime: '16:30' },
    { flightNumber: 'LA3001', origin: 'REC', destination: 'GRU', departureTime: '17:15', arrivalTime: '19:40' },
  ],
};
const summary = buildProgramSummary({ profile, snapshot, record, label: 'Hoje', presentationTime: '12:00' });
assert.match(summary, /Hoje, você tem 2 pernas/);
assert.match(summary, /saindo de Brasília/);
assert.match(summary, /saindo do Recife/);
assert.doesNotMatch(summary, /saindo do Brasília/);
assert.match(summary, /voo três sete nove quatro da LATAM/);

const presentation = new Date('2026-07-20T12:00:00-03:00');
const window = calculateDepartureWindow(presentation, { minutes: 0 });
assert.equal(window.leadMinutes, 45);
assert.equal(window.leave.getTime(), presentation.getTime() - 45 * 60_000);
assert.ok(window.leave.getTime() < presentation.getTime());

const departure = buildDepartureSummary({
  profile,
  snapshot,
  record,
  route: { minutes: 35, distanceKm: 22 },
  leaveTime: '10:35',
  origin: 'BSB',
  presentationTime: '12:00',
});
assert.match(departure, /Saia de casa às 10 horas e 35 minutos/);
assert.match(departure, /O trânsito está/);
assert.match(departure, /aeroporto de Brasília/);
assert.doesNotMatch(departure, /saia.*12 horas/);

console.log('CrewCheck v14.0.4 Telegram natural language and grammar regression OK.');
