import fs from 'node:fs';

const VERSION = '14.3.13';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14313] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;
  if (!next.includes("import LifeConciergePanel from '@/components/v14313/LifeConciergePanel';")) {
    const anchor = "import { toast } from 'sonner';";
    if (!next.includes(anchor)) throw new Error('[v14313] Âncora de importação do CrewCheck Life não encontrada.');
    next = next.replace(anchor, `${anchor}\nimport LifeConciergePanel from '@/components/v14313/LifeConciergePanel';\nimport { clearLifeConciergeData, ingestHealthSummary, ingestManualSummary, saveLifeGoals } from '@/lib/lifeConcierge';`);
  }

  if (!next.includes('ingestHealthSummary(detail);')) {
    const anchor = '      if (detail.ok) writeStored(KEYS.nativeSummary, detail);';
    if (!next.includes(anchor)) throw new Error('[v14313] Âncora do resumo nativo não encontrada.');
    next = next.replace(anchor, `      if (detail.ok) {\n        writeStored(KEYS.nativeSummary, detail);\n        ingestHealthSummary(detail);\n      }`);
  }

  if (!next.includes('saveLifeGoals(safe);')) {
    const anchor = '    writeStored(KEYS.profile, safe);';
    if (!next.includes(anchor)) throw new Error('[v14313] Âncora dos objetivos do Life não encontrada.');
    next = next.replace(anchor, `${anchor}\n    saveLifeGoals(safe);`);
  }

  if (!next.includes('ingestManualSummary(safe);')) {
    const anchor = '    writeStored(KEYS.manual, safe);';
    if (!next.includes(anchor)) throw new Error('[v14313] Âncora do resumo manual não encontrada.');
    next = next.replace(anchor, `${anchor}\n    ingestManualSummary(safe);`);
  }

  if (!next.includes('clearLifeConciergeData();')) {
    const anchor = "    setConsentChecked(false);\n    toast.success('Dados locais do CrewCheck Life apagados.');";
    if (!next.includes(anchor)) throw new Error('[v14313] Âncora de exclusão do Life não encontrada.');
    next = next.replace(anchor, `    setConsentChecked(false);\n    clearLifeConciergeData();\n    toast.success('Dados locais do CrewCheck Life apagados.');`);
  }

  if (!next.includes('<LifeConciergePanel nextProgram={nextProgram} healthSummary={nativeSummary} profile={profile}/>')) {
    const anchor = '    <section className="cc-life-metrics" aria-label="Resumo do CrewCheck Life">';
    if (!next.includes(anchor)) throw new Error('[v14313] Âncora dos indicadores do Life não encontrada.');
    next = next.replace(anchor, `    <LifeConciergePanel nextProgram={nextProgram} healthSummary={nativeSummary} profile={profile}/>\n\n${anchor}`);
  }

  if (!next.includes('LifeConciergePanel') || !next.includes('ingestHealthSummary(detail)') || !next.includes('clearLifeConciergeData()')) {
    throw new Error('[v14313] Concierge adaptativo não foi integrado à tela Life por completo.');
  }
  return next;
}, { optional: true });

update('client/src/lib/routinePlanner.ts', (source) => {
  let next = source;
  if (!next.includes("import { getLifeRoutineContext, type LifeRoutineContext } from './lifeConcierge';")) {
    const anchor = "import type { DayLoadAnalysis } from './complianceEngine';";
    if (!next.includes(anchor)) throw new Error('[v14313] Import do motor de rotina não encontrado.');
    next = next.replace(anchor, `${anchor}\nimport { getLifeRoutineContext, type LifeRoutineContext } from './lifeConcierge';`);
  }

  const returnAnchor = '  return applyPremiumRoutineReliability([...suggestions, ...restSuggestions, ...mealSuggestions], chronological)\n    .sort';
  if (next.includes(returnAnchor)) {
    next = next.replace(returnAnchor, '  return applyLifeAdaptiveContext(applyPremiumRoutineReliability([...suggestions, ...restSuggestions, ...mealSuggestions], chronological), chronological)\n    .sort');
  }

  if (!next.includes('function applyLifeAdaptiveContext(')) {
    const anchor = 'function applyPremiumRoutineReliability(items: RoutineSuggestion[], days: DayLoadAnalysis[]): RoutineSuggestion[] {';
    if (!next.includes(anchor)) throw new Error('[v14313] Âncora de confiabilidade da rotina não encontrada.');
    const adaptive = `function lifePeriodFromTime(value: string): 'manha' | 'tarde' | 'noite' | 'qualquer' {
  const match = String(value || '').match(/(\\d{1,2}):(\\d{2})/);
  if (!match) return 'qualquer';
  const hour = Number(match[1]);
  if (hour >= 5 && hour < 12) return 'manha';
  if (hour >= 12 && hour < 18) return 'tarde';
  return 'noite';
}

function applyLifeAdaptiveContext(items: RoutineSuggestion[], days: DayLoadAnalysis[], context: LifeRoutineContext = getLifeRoutineContext()): RoutineSuggestion[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  const flexibilityFactor = context.coaching.flexibility === 'estruturado' ? 1.1 : context.coaching.flexibility === 'flexivel' ? 0.78 : 1;
  return items.map((item) => {
    const date = parseRosterDate(item.date);
    const horizonDays = Math.round((date.getTime() - today.getTime()) / 86400000);
    const nearTerm = horizonDays >= -1 && horizonDays <= 2;
    const day = dayByDate.get(item.date);
    const physical = isPhysicalActivity(item.activityType);
    const study = item.activityType === 'estudo' || item.activityType === 'faculdade';
    const period = lifePeriodFromTime(item.startTime);
    let score = item.score;
    let confidence = item.confidence;
    const reasons = [item.reason];
    const cautions = [item.caution];

    if (physical) {
      if (context.exercise.preferredPeriod === period || context.exercise.preferredPeriod === 'qualquer') {
        score += context.learningLevel === 'personalizado' ? 12 : 7;
        reasons.push('horário com melhor adesão pessoal aprendida pelo CrewCheck Life');
      } else if (context.learningLevel !== 'iniciando') {
        score -= Math.round(5 * flexibilityFactor);
        cautions.push('fora do horário em que você costuma aderir melhor');
      }
      if (context.exercise.goalReached) {
        score -= Math.round(10 * flexibilityFactor);
        cautions.push('frequência semanal pessoal já atingida; recuperação ou lazer podem render melhor');
      } else {
        score += 6;
        reasons.push('frequência semanal ainda abaixo da meta pessoal');
      }
      if (nearTerm && context.sleep.available && context.sleep.deficitMinutes >= 90) {
        const highDemand = item.intensity === 'alta' || item.durationMinutes >= 75 || item.activityType === 'crossfit' || item.activityType === 'corrida';
        score -= Math.round((highDemand ? 30 : 14) * flexibilityFactor);
        cautions.push(highDemand ? 'sono recente abaixo da meta: treino forte rebaixado' : 'sono recente abaixo da meta: mantenha intensidade leve e opcional');
        confidence = context.freshness === 'fresh' ? 'alta' : 'media';
      }
      if (nearTerm && context.hydration.progress < 0.35) {
        score -= 4;
        cautions.push('hidratação registrada ainda baixa para a meta pessoal; faça uma pausa antes da atividade');
      }
    }

    if (study) {
      if (context.study.preferredPeriod === period || context.study.preferredPeriod === 'qualquer') {
        score += context.learningLevel === 'personalizado' ? 11 : 6;
        reasons.push('janela de estudo com melhor adesão pessoal');
      } else if (context.learningLevel !== 'iniciando') {
        score -= Math.round(4 * flexibilityFactor);
      }
      if (nearTerm && context.sleep.available && context.sleep.deficitMinutes >= 90 && item.durationMinutes >= 60) {
        score -= Math.round(12 * flexibilityFactor);
        cautions.push('bloco longo reduzido para preservar descanso e concentração');
      }
      if (context.study.sessions7Days < context.study.targetSessions) reasons.push('meta semanal de estudo ainda em andamento');
    }

    if (item.category === 'recovery' && nearTerm && context.sleep.available && context.sleep.deficitMinutes >= 60) {
      score += 16;
      reasons.push('recuperação reforçada pelo sono recente em relação à meta pessoal');
    }

    if (nearTerm && context.freshness === 'unavailable') {
      confidence = confidence === 'alta' ? 'media' : confidence;
      reasons.push('sem dado recente do Life; recomendação baseada principalmente na escala');
    } else if (context.learningLevel === 'personalizado') {
      reasons.push('padrão adaptativo local com histórico suficiente');
    }

    if (day?.isNightDuty && physical && item.intensity === 'alta') score -= Math.round(8 * flexibilityFactor);
    score = Math.round(Math.min(100, Math.max(0, score)));
    return {
      ...item,
      score,
      suitability: scoreToSuitability(score),
      confidence,
      reason: reasons.filter(Boolean).slice(0, 5).join(' · '),
      caution: cautions.filter(Boolean).slice(0, 5).join(' · '),
    };
  });
}

`;
    next = next.replace(anchor, `${adaptive}${anchor}`);
  }

  if (!next.includes('applyLifeAdaptiveContext(applyPremiumRoutineReliability') || !next.includes('horário com melhor adesão pessoal')) {
    throw new Error('[v14313] Aprendizado do Life não foi conectado ao motor de rotina.');
  }
  return next;
}, { optional: true });

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: Life Concierge adaptativo, aprendizado local de hábitos e rotina flexível ligada à escala';`), { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source
  .replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`)
  .replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`)
  .replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140313')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - adaptive local-first Life Concierge for rest, hydration, study, activity, leisure and routine learning`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.13'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-13-life-concierge.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v14313] CrewCheck ${VERSION}: Life Concierge adaptativo local, hábitos aprendidos, check-in motivacional e rotina flexível integrada.`);
