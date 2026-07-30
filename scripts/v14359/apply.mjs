import fs from 'node:fs';

const file = 'client/src/lib/complianceEngine.ts';
const helperFile = 'scripts/v14359/compliance-temporal-helpers.txt';
if (!fs.existsSync(file)) throw new Error(`[v14.3.59] Arquivo não encontrado: ${file}`);
if (!fs.existsSync(helperFile)) throw new Error(`[v14.3.59] Helpers não encontrados: ${helperFile}`);

let source = fs.readFileSync(file, 'utf8');
const helpers = fs.readFileSync(helperFile, 'utf8').trim();
const marker = "type RegulatoryNightKind = 'worked' | 'standby';";

function replaceRequired(oldValue, newValue, label) {
  if (source.includes(newValue)) return;
  if (!source.includes(oldValue)) throw new Error(`[v14.3.59] Âncora não encontrada: ${label}`);
  source = source.replace(oldValue, newValue);
}

if (!source.includes(marker)) {
  replaceRequired("const COMPLIANCE_ENGINE_VERSION = '13.8.1';", "const COMPLIANCE_ENGINE_VERSION = '13.8.2';", 'versão do motor');

  const nightStart = source.indexOf('function getMadrugadaKeys(days: RosterDay[]): number[] {');
  const nightEnd = source.indexOf('\nfunction pushAlert(', nightStart);
  if (nightStart < 0 || nightEnd < 0) throw new Error('[v14.3.59] Bloco antigo de madrugadas não encontrado.');
  source = `${source.slice(0, nightStart)}${helpers}\n${source.slice(nightEnd + 1)}`;

  replaceRequired(
    `  let restTotal = 0;\n  let restCount = 0;\n  let consecutiveWorkPeriods = 0;`,
    `  let restTotal = 0;\n  let restCount = 0;\n\n  const consecutiveWindow = analyzeConsecutiveOperationalWindow(sortedDays);\n  if (consecutiveWindow.hours > limits.maxConsecutiveWorkPeriods * 24) {\n    pushAlert(alerts, {\n      severity: 'warning',\n      title: 'Mais de 6 períodos de 24h sem folga formal — revisar',\n      description: consecutiveWindow.startDate + ' a ' + consecutiveWindow.endDate + ': ' + consecutiveWindow.hours.toFixed(1) + 'h entre a primeira apresentação e o início da recuperação publicada.',\n      details: 'O cálculo usa tempo civil real desde a primeira apresentação. Múltiplas atividades no mesmo dia, MCK e continuidades (+1/+2/+3) não são contadas como novos períodos. Dias realmente em branco não viram atividade nem folga.',\n      legalReference: 'RBAC 117, Apêndice A, A117.25(a)',\n      date: consecutiveWindow.endDate,\n      confidence: 'media',\n      classification: 'atencao',\n      evidence: consecutiveWindow.periods + ' período(s) civil(is) estimado(s); limite automático: ' + limits.maxConsecutiveWorkPeriods + '.',\n    });\n  }`,
    'estado da sequência operacional',
  );

  const oldConsecutiveBlock = `    if (isFormalDayOff(day)) {
      metrics.totalDaysOff += 1;
      metrics.daysOff += 1;
      metrics.restDays += 1;
      consecutiveWorkPeriods = 0;
    } else if (isRestExtension(day) || isLayoverOrInactive(day)) {
      metrics.restDays += 1;
      consecutiveWorkPeriods = 0;
    } else if (isActiveDuty(day)) {
      consecutiveWorkPeriods += 1;
      if (consecutiveWorkPeriods > limits.maxConsecutiveWorkPeriods) {
        pushAlert(alerts, {
          severity: 'warning',
          title: 'Mais de 6 atividades consecutivas sem folga formal — revisar',
          description: \`${day.date}: identificados \${consecutiveWorkPeriods} períodos consecutivos de atividade sem folga periódica.\`,
          details: 'O sistema agora conta apenas atividades efetivas; DOP/DOPR/DO/DR/DOF/VC contam como folga formal; OFF e inativo/pernoite interrompem a sequência operacional, mas não entram como folga formal mensal.',
          legalReference: 'RBAC 117, Apêndice A, A117.25(a)',
          date: day.date,
        });
      }
    }`;
  const newConsecutiveBlock = `    if (isFormalDayOff(day)) {
      metrics.totalDaysOff += 1;
      metrics.daysOff += 1;
      metrics.restDays += 1;
    } else if (isRestExtension(day) || isLayoverOrInactive(day)) {
      metrics.restDays += 1;
    }`;
  replaceRequired(oldConsecutiveBlock, newConsecutiveBlock, 'contador por quantidade de objetos');

  replaceRequired(`    const hasMadrugada = hasMadrugadaDuty(day);\n`, '', 'variável de madrugada por objeto');
  replaceRequired(`\n    if (hasMadrugada) metrics.nightOperations += 1;\n`, '\n', 'contador de madrugada por objeto');

  replaceRequired(
    `  metrics.maxConsecutiveNights = countMaxConsecutiveMadrugadas(sortedDays);\n  const maxNightOpsWindow = countNightOpsInRolling168h(sortedDays);`,
    `  const nightSummary = summarizeRegulatoryNightEvents(sortedDays, actRules.nightOps.resetAfterFreeHours);\n  metrics.nightOperations = nightSummary.workedEvents.length;\n  metrics.maxConsecutiveNights = nightSummary.maxConsecutiveWorked;\n  const maxNightOpsWindow = nightSummary.maxWorkedIn168h;`,
    'resumo de madrugadas',
  );

  replaceRequired(
    `  if (maxNightOpsWindow > limits.maxNightOps168h) {`,
    `  if (nightSummary.maxCombinedIn168h > limits.maxNightOps168h && maxNightOpsWindow <= limits.maxNightOps168h && nightSummary.standbyEvents.length > 0) {\n    pushAlert(alerts, {\n      severity: 'warning',\n      title: 'HSB iniciado na madrugada dentro da janela — confirmar regra do ACT',\n      description: nightSummary.standbyEvents.length + ' HSB/HSBE iniciado(s) entre 00:00 e 06:00 e ' + nightSummary.workedEvents.length + ' madrugada(s) efetivamente trabalhada(s) foram identificados.',\n      details: 'O CrewCheck separa disponibilidade em HSB de madrugada efetivamente trabalhada. Este item é apenas contexto e não confirma extrapolação do limite de trabalho.',\n      legalReference: actRules.nightOps.legalReference,\n      confidence: 'media',\n      classification: 'atencao',\n    });\n  }\n\n  if (maxNightOpsWindow > limits.maxNightOps168h) {`,
    'contexto HSB separado',
  );

  replaceRequired(
    `      title: 'Madrugadas em 168h — revisar janela real',\n      description: \`Até \${maxNightOpsWindow} madrugada(s) em janela móvel de 168h. Revise a sequência real no PDF.\`,\n      details: 'O sistema conta voo que toca 00:00–06:00 e sobreaviso que começa na madrugada; folga, reserva sem voo e voo sem madrugada quebram sequência. Mantido como atenção para evitar falso positivo.',`,
    `      title: 'Madrugadas trabalhadas em 168h — revisar janela real',\n      description: 'Até ' + maxNightOpsWindow + ' madrugada(s) efetivamente trabalhada(s) em janela móvel de 168h.',\n      details: 'A janela usa o horário real em que cada atividade toca 00:00–06:00, é semiaberta (não duplica o limite exato de 168h) e reinicia após ' + actRules.nightOps.resetAfterFreeHours + 'h livres. HSB sem acionamento é exibido separadamente e não entra nesta soma.',`,
    'texto da janela de 168h',
  );

  replaceRequired(
    `      title: 'Madrugadas consecutivas — revisar sequência real',\n      description: \`\${metrics.maxConsecutiveNights} madrugada(s) consecutiva(s) detectada(s). Revise se houve folga, inativo ou pernoite quebrando a sequência.\`,\n      details: 'Folga, pernoite/inativo, reserva sem voo e voo sem madrugada quebram a sequência; sobreaviso só conta quando começa na madrugada.',`,
    `      title: 'Madrugadas trabalhadas consecutivas — revisar sequência real',\n      description: metrics.maxConsecutiveNights + ' madrugada(s) efetivamente trabalhada(s) e consecutiva(s) detectada(s).',\n      details: 'A sequência usa a data real da madrugada tocada pelo voo/atividade, reinicia após ' + actRules.nightOps.resetAfterFreeHours + 'h livres e não transforma HSB sem acionamento em madrugada trabalhada.',`,
    'texto de madrugadas consecutivas',
  );
}

if (!source.includes(marker)) throw new Error('[v14.3.59] Motor regulatório temporal não foi aplicado.');
if (source.includes('let consecutiveWorkPeriods = 0;')) throw new Error('[v14.3.59] Contador antigo por quantidade de objetos permaneceu ativo.');
if (source.includes('function getMadrugadaKeys(')) throw new Error('[v14.3.59] Chaves antigas por meia-noite permaneceram ativas.');

fs.writeFileSync(file, source, 'utf8');
console.log('[crewcheck:prepare] v14.3.59 alertas regulatórios por tempo real aplicados.');
