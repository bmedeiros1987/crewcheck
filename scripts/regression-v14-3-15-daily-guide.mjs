import fs from 'node:fs';
import path from 'node:path';

const read = (file) => {
  if (!fs.existsSync(file)) throw new Error(`[v14.3.15] Arquivo ausente: ${file}`);
  return fs.readFileSync(file, 'utf8');
};

const server = read('server.mjs');
const places = read('client/src/lib/lifePlaces.ts');
const guide = read('client/src/components/v14314/RoutineDailyConcierge.tsx');
const guideCss = read('client/src/components/v14314/routine-daily-concierge.css');
const routine = read('client/src/components/v139/RoutineIntelligenceView.tsx');
const life = read('client/src/lib/lifeConcierge.ts');
const health = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt');
const gradle = read('android-wrapper/app/build.gradle');
const chain = read('scripts/v14312/apply.mjs');
const aviationFamily = read('scripts/v14314/apply.mjs');
const pkg = JSON.parse(read('package.json'));

function persist(message) {
  const runnerTemp = String(process.env.RUNNER_TEMP || '').trim();
  if (!runnerTemp) return;
  try {
    const content = `[CrewCheck v14.3.15 regression]\n${message}\n`;
    fs.writeFileSync(path.join(runnerTemp, 'android-build.log'), content, 'utf8');
    fs.writeFileSync(path.join(runnerTemp, 'android-build-tail.log'), content, 'utf8');
  } catch {}
}

const checks = [
  ['cadeia preserva 14.3.14 e aplica 14.3.15', chain.includes("await import('../v14314/apply.mjs')") && chain.includes("await import('../v14315/apply.mjs')")],
  ['Concierge Familiar anterior preservado', aviationFamily.includes('conciergeFamilyReturnReply') && aviationFamily.includes('translatedAirportName')],
  ['categorias de esporte ampliadas', server.includes("crossfit: { label: 'boxes de CrossFit'") && server.includes("swimming: { label: 'locais de natação'") && server.includes("sports: { label: 'locais de esporte'")],
  ['categorias de lazer e folga ampliadas', server.includes("leisure: { label: 'opções de lazer'") && server.includes("trip: { label: 'passeios para folga'") && server.includes("study: { label: 'locais para estudo'")],
  ['busca internacional sem viés fixo Brasil', !server.includes("regionCode: 'BR'")],
  ['raio variável por modalidade', server.includes('radius: Number(config.radius || 12_000)')],
  ['ranking com volume de avaliações', server.includes('userRatingCount: Number(place.userRatingCount)')],
  ['localização armazenada localmente', places.includes("crewcheck:life:last-location:v1") && places.includes('requestLifeLocation')],
  ['busca usa endpoint existente de locais', places.includes('/api/places/search?') && places.includes('searchLifePlaceSet')],
  ['cache curto de locais', places.includes('20 * 60_000')],
  ['guia cruza escala e Life', guide.includes('buildDailyPlan(events, settings)') && guide.includes('getLifeRoutineContext(now)')],
  ['café padrão 09:30 configurável', guide.includes("breakfastTime: '09:30'") && guide.includes('Decisão sobre o café')],
  ['sono protegido antes da próxima programação', guide.includes('latestWake') && guide.includes('sleepTargetMinutes') && guide.includes('preparationMinutes')],
  ['folga longa habilita bate-volta', guide.includes('tripEligible') && guide.includes("category: 'trip'")],
  ['carga elevada prioriza recuperação', guide.includes('recoveryPriority') && guide.includes('RECUPERAÇÃO REFORÇADA')],
  ['conexão rápida Health Connect', guide.includes('connectHealth') && guide.includes('openHealthConnect')],
  ['conexão rápida Telegram', guide.includes('connectTelegram') && guide.includes('/api/telegram/health') && guide.includes('tg://resolve')],
  ['conexão rápida calendário e notificações', guide.includes('openCalendar') && guide.includes('connectNotifications')],
  ['check-in usa local encontrado', guide.includes('recordGymCheckIn(place.name') && guide.includes('shareGymCheckInText(place.name)')],
  ['locais exibem rota, distância e abertura', guide.includes('openLifePlace(place)') && guide.includes('placeDistanceLabel') && guide.includes('aberto agora')],
  ['Rotina renderiza guia do dia', routine.includes('<RoutineDailyConcierge events={events}/>')],
  ['meta pessoal substitui sono fixo', routine.includes('getLifeRoutineContext().sleep.targetMinutes') && routine.includes('plan.sleepHours')],
  ['design responsivo', guideCss.includes('.cc-life-day-shell') && guideCss.includes('@media(max-width:700px)')],
  ['Health Connect continua local-first', health.includes('localOnly') && life.includes('getLifeRoutineContext')],
  ['versionName 14.3.15', gradle.includes('versionName "14.3.15"')],
  ['versionCode 140315', gradle.includes('versionCode 140315')],
  ['package 14.3.15', pkg.version === '14.3.15'],
];

for (const [label, ok] of checks) {
  if (!ok) {
    const message = `[v14.3.15] Reprovado: ${label}`;
    persist(message);
    throw new Error(message);
  }
  console.log(`✓ ${label}`);
}

if (/diagnostica|apto|inapto|risco cardíaco/i.test(guide)) {
  const message = '[v14.3.15] O guia diário não pode apresentar avaliação clínica ou aptidão.';
  persist(message);
  throw new Error(message);
}

if (/fetch\([^)]*health|\/api\/life\/health/i.test(life)) {
  const message = '[v14.3.15] O motor adaptativo não pode enviar resumos de saúde ao servidor.';
  persist(message);
  throw new Error(message);
}

console.log(`[v14.3.15] ${checks.length} verificações aprovadas: escala, recuperação, café, localização, esportes, lazer, folga e conexões rápidas.`);
