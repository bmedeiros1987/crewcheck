import fs from 'node:fs';

const read = (path) => {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.13] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
};

const engine = read('client/src/lib/lifeConcierge.ts');
const panel = read('client/src/components/v14313/LifeConciergePanel.tsx');
const css = read('client/src/components/v14313/life-concierge.css');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const routine = read('client/src/lib/routinePlanner.ts');
const gradle = read('android-wrapper/app/build.gradle');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['motor adaptativo local', engine.includes('export function getLifeRoutineContext') && engine.includes('buildLifeConciergeRecommendation')],
  ['retenção limitada a 90 dias', engine.includes('const cutoff = daysAgo(90)') && engine.includes('.slice(0, 1200)')],
  ['resumo Health Connect agregado', engine.includes('ingestHealthSummary') && engine.includes('LifeHealthSnapshot')],
  ['hidratação por meta pessoal', engine.includes('hydrationTargetMl') && engine.includes('recordHydration')],
  ['aprendizado de horários', engine.includes('weightedPreferredPeriod') && engine.includes('preferredExercisePeriod') && engine.includes('preferredStudyPeriod')],
  ['feedback das recomendações', engine.includes('recordRecommendationFeedback')],
  ['check-in compartilhado opcional', engine.includes('recordGymCheckIn') && engine.includes('shareGymCheckInText')],
  ['lembretes opcionais e limitados', engine.includes('scheduleLifeRemindersForToday') && engine.includes('.slice(0, 3)')],
  ['painel premium integrado', panel.includes('Seu gerenciamento pessoal, sem rotina engessada') && panel.includes('CHECK-IN COMPARTILHADO')],
  ['dados locais explicitados', panel.includes('dados brutos do relógio não são copiados para o servidor')],
  ['design responsivo do concierge', css.includes('.cc-life-ai-shell') && css.includes('@media(max-width:680px)')],
  ['tela Life ingere dados', life.includes('ingestHealthSummary(detail)') && life.includes('ingestManualSummary(safe)')],
  ['tela Life renderiza concierge', life.includes('<LifeConciergePanel nextProgram={nextProgram} healthSummary={nativeSummary} profile={profile}/>')],
  ['rotina usa contexto adaptativo', routine.includes('applyLifeAdaptiveContext(applyPremiumRoutineReliability') && routine.includes('getLifeRoutineContext')],
  ['sono protege treino forte', routine.includes('sono recente abaixo da meta: treino forte rebaixado')],
  ['escala continua no motor', routine.includes('DayLoadAnalysis') && routine.includes('day.isNightDuty')],
  ['versionName 14.3.13', gradle.includes('versionName "14.3.13"')],
  ['versionCode 140313', gradle.includes('versionCode 140313')],
  ['package 14.3.13', pkg.version === '14.3.13'],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`[v14.3.13] Reprovado: ${label}`);
  console.log(`✓ ${label}`);
}

if (/fetch\(|authFetch|\/api\//.test(engine)) {
  throw new Error('[v14.3.13] O motor adaptativo não pode enviar dados de saúde ao servidor.');
}

console.log(`[v14.3.13] ${checks.length} verificações aprovadas: concierge local, rotina adaptativa, check-in, hidratação, estudo, lazer e privacidade.`);
