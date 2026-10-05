import fs from 'node:fs';
import path from 'node:path';
import { buildProgramSummary, spokenTime } from '../server/v1404/telegram-language.mjs';

const language = fs.readFileSync('server/v1404/telegram-language.mjs', 'utf8');
const helpers = fs.readFileSync('server/v1403/premium-helpers.snippet', 'utf8');
const reply = fs.readFileSync('server/v1403/build-reply.snippet', 'utf8');
const platform = fs.readFileSync('client/src/components/platform/PlatformCenter.tsx', 'utf8');

function persist(message) {
  const runnerTemp = String(process.env.RUNNER_TEMP || '').trim();
  if (!runnerTemp) return;
  try {
    const content = `[CrewCheck v14.3.14 regression]\n${message}\n`;
    fs.writeFileSync(path.join(runnerTemp, 'android-build.log'), content, 'utf8');
    fs.writeFileSync(path.join(runnerTemp, 'android-build-tail.log'), content, 'utf8');
  } catch {}
}

function check(condition, message) {
  if (!condition) {
    persist(message);
    throw new Error(message);
  }
  console.log(`✓ ${message}`);
}

check(language.includes('translatedAirportName'), 'Tradução IATA/ICAO ausente.');
check(language.includes('translatedActivityLabel'), 'Tradução de atividades ausente.');
check(language.includes("PS:'deslocamento como passageiro'"), 'PS ainda não foi traduzido para passageiro.');
check(language.includes("EXTRA:'deslocamento como passageiro'"), 'EXTRA ainda não foi traduzido para passageiro.');
check(language.includes('vinte e duas horas'), 'Concordância de vinte e duas horas ausente.');
check(language.includes('Fim da jornada em') && !language.includes('e a chave termina em'), 'Resumo deve identificar o fim da jornada sem o termo chave.');
// Synthetic operational values: final arrival and duty end must remain distinct.
const summary = buildProgramSummary({ includeGreeting: false, record: {
  startTime: '22:15', endTime: '08:45', endKind: 'duty-debrief',
  legs: [{ flightNumber: 'LA0098', origin: 'NAT', destination: 'BSB', departureTime: '05:15', arrivalTime: '08:15' }],
} });
check(summary.includes(`Fim da jornada em Brasília às ${spokenTime('08:45')}.`), 'Fim da jornada deve preservar local e horário publicados.');
check(summary.includes(`chegada em Brasília às ${spokenTime('08:15')}.`), 'Chegada deve permanecer distinta do fim da jornada.');
check(!/a chave termina|e a programação termina em/.test(summary), 'Resumo não deve reintroduzir a redação legada.');
check(helpers.includes('conciergeFamilyReturnReply'), 'Resposta de retorno familiar ausente.');
check(helpers.includes('conciergeFamilyCityReply'), 'Resposta de cidade familiar ausente.');
check(helpers.includes('conciergeFamilyContactReply'), 'Resposta de disponibilidade familiar ausente.');
check(reply.includes('conciergeFamilyReturnReply(snapshot, profile)'), 'Intent de retorno familiar não conectado.');
check(reply.includes('conciergeFamilyCityReply(snapshot, profile)'), 'Intent de localização familiar não conectado.');
check(reply.includes('conciergeFamilyContactReply(snapshot, profile)'), 'Intent de ligação familiar não conectado.');
check(platform.includes('linguagem simples') || platform.includes('Programação compartilhada pelo titular'), 'Escala do visitante não foi humanizada.');

console.log('CrewCheck v14.3.14 — tradução aeronáutica e Concierge Familiar Premium: OK');

