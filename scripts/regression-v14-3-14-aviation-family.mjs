import fs from 'node:fs';
import path from 'node:path';

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
check(language.includes('e a programação termina em'), 'Resumo ainda usa chave em vez de programação.');
check(helpers.includes('conciergeFamilyReturnReply'), 'Resposta de retorno familiar ausente.');
check(helpers.includes('conciergeFamilyCityReply'), 'Resposta de cidade familiar ausente.');
check(helpers.includes('conciergeFamilyContactReply'), 'Resposta de disponibilidade familiar ausente.');
check(reply.includes('conciergeFamilyReturnReply(snapshot, profile)'), 'Intent de retorno familiar não conectado.');
check(reply.includes('conciergeFamilyCityReply(snapshot, profile)'), 'Intent de localização familiar não conectado.');
check(reply.includes('conciergeFamilyContactReply(snapshot, profile)'), 'Intent de ligação familiar não conectado.');
check(platform.includes('traduzida em linguagem simples') || platform.includes('Programação compartilhada pelo titular'), 'Escala do visitante não foi humanizada.');

console.log('CrewCheck v14.3.14 — tradução aeronáutica e Concierge Familiar Premium: OK');
