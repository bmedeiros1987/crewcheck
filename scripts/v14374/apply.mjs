import fs from 'node:fs';

const file = 'client/src/lib/aimsParser.ts';
if (!fs.existsSync(file)) throw new Error('[v14.3.74] aimsParser.ts não encontrado.');

let source = fs.readFileSync(file, 'utf8');
const marker = '// [v14.3.74] fold trusted secondary superset into canonical visual duty';

if (!source.includes(marker)) {
  const helperAnchor = 'function mergeMissingAimsLegs(target: RosterDay, source: RosterDay): void {';
  if (!source.includes(helperAnchor)) throw new Error('[v14.3.74] helper de merge AIMS não encontrado.');

  const helper = `${marker}\nfunction aimsMergeLegIdentity(leg: FlightLeg): string {\n  return [leg.flightNumber, leg.origin, leg.destination, leg.departureTime, leg.arrivalTime].join('|');\n}\n\nfunction canFoldAimsSecondarySuperset(target: RosterDay, candidate: RosterDay): boolean {\n  if (!target?.date || target.date !== candidate?.date) return false;\n  if (target.type !== 'VOO' || candidate.type !== 'VOO') return false;\n  if (!target.legs?.length || !candidate.legs?.length || isAimsDaySuspicious(candidate)) return false;\n\n  const targetKeys = new Set(target.legs.map(aimsMergeLegIdentity));\n  const candidateKeys = new Set(candidate.legs.map(aimsMergeLegIdentity));\n  if (candidateKeys.size <= targetKeys.size) return false;\n  for (const key of targetKeys) if (!candidateKeys.has(key)) return false;\n\n  // A fonte secundária só pode completar a jornada visual quando sua própria\n  // sequência preserva continuidade física. Isso evita colar duas jornadas\n  // independentes do mesmo dia ou reintroduzir teletransporte.\n  for (let index = 1; index < candidate.legs.length; index += 1) {\n    const previous = candidate.legs[index - 1];\n    const next = candidate.legs[index];\n    if (!previous?.destination || !next?.origin || previous.destination !== next.origin) return false;\n  }\n  return true;\n}\n\n`;
  source = source.replace(helperAnchor, helper + helperAnchor);

  const oldWindow = `  target.rawText = [target.rawText, source.rawText].filter(Boolean).join(' | ');\n  if (!target.dutyReport) target.dutyReport = source.dutyReport;\n  if (!target.dutyDebrief) target.dutyDebrief = source.dutyDebrief;`;
  const newWindow = `  target.rawText = [target.rawText, source.rawText].filter(Boolean).join(' | ');\n  target.dutyReport = source.dutyReport || target.dutyReport;\n  target.dutyDebrief = source.dutyDebrief || target.dutyDebrief;\n  target.dutyHours = source.dutyHours ?? target.dutyHours;\n  target.flyingHours = source.flyingHours ?? target.flyingHours;\n  target.isNextDay = Boolean(target.isNextDay || source.isNextDay);\n  target.hotel = source.hotel || target.hotel;`;
  if (!source.includes(oldWindow)) throw new Error('[v14.3.74] janela temporal do merge AIMS não encontrada.');
  source = source.replace(oldWindow, newWindow);

  const oldMissing = `    if (missingLegs.length) {\n      addActivity({ ...day, legs: missingLegs, rawText: [day.rawText, 'CrewCheck v11.1.100: atividade adicionada sem substituir outra programação da mesma data.'].filter(Boolean).join(' | ') });\n      return;\n    }`;
  const newMissing = `    if (missingLegs.length) {\n      const compatibleSupersetTarget = sameDate.find((item) => canFoldAimsSecondarySuperset(item, day));\n      if (compatibleSupersetTarget) {\n        mergeMissingAimsLegs(compatibleSupersetTarget, day);\n        compatibleSupersetTarget.rawText = [\n          compatibleSupersetTarget.rawText,\n          'CrewCheck v14.3.74: perna ausente na coluna visual restaurada dentro da mesma jornada física.',\n        ].filter(Boolean).join(' | ');\n        return;\n      }\n      addActivity({ ...day, legs: missingLegs, rawText: [day.rawText, 'CrewCheck v11.1.100: atividade adicionada sem substituir outra programação da mesma data.'].filter(Boolean).join(' | ') });\n      return;\n    }`;
  if (!source.includes(oldMissing)) throw new Error('[v14.3.74] bloco de pernas ausentes do merge AIMS não encontrado.');
  source = source.replace(oldMissing, newMissing);

  fs.writeFileSync(file, source, 'utf8');
  console.log('[v14.3.74] fallback textual confiável completa pernas ausentes dentro da mesma jornada visual, sem criar card paralelo.');
} else {
  console.log('[v14.3.74] correção FOR-CGH já aplicada.');
}
