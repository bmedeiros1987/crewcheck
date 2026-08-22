import fs from 'node:fs';

const file = 'server/rosterParser.mjs';
if (!fs.existsSync(file)) throw new Error('[v14.3.75] server roster parser ausente.');

let source = fs.readFileSync(file, 'utf8');
const marker = '// [v14.3.75] Telegram/server AIMS parity with canonical client parser';

const oldScoreGuard = "  if (!isAirportCodeToken(origin) || !isAirportCodeToken(destination) || origin === destination) return;\n  if (!depItem || !arrItem || arrItem.idx <= destIdx) return;";
const legacyBaseScoreGuardWithCna = "  if (!isAirportCodeToken(origin) || !isAirportCodeToken(destination) || origin === destination) return;\n  const routeBoundaries = new Set(['CNA']);\n  if (upper.slice(originIdx + 1, destIdx).some((token) => routeBoundaries.has(token))) return;\n  if (!depItem || !arrItem || arrItem.idx <= destIdx) return;";
const baseScoreGuardWithCna = "  if (!isAirportCodeToken(origin) || !isAirportCodeToken(destination) || origin === destination) return;\n  if (!depItem || !arrItem || arrItem.idx <= destIdx) return;\n  const routeBoundaries = new Set(['CNA']);\n  if (upper.slice(0, arrItem.idx).some((token) => routeBoundaries.has(token))) return;";
const legacyNewScoreGuard = "  if (!isAirportCodeToken(origin) || !isAirportCodeToken(destination) || origin === destination) return;\n  const routeBoundaries = new Set(['CNA','HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','RCFI','MT','MCK','MCK320','MCK_SS','CBF','EMER','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM']);\n  if (upper.slice(originIdx + 1, destIdx).some((token) => routeBoundaries.has(token))) return;\n  if (!depItem || !arrItem || arrItem.idx <= destIdx) return;";
const newScoreGuard = "  if (!isAirportCodeToken(origin) || !isAirportCodeToken(destination) || origin === destination) return;\n  if (!depItem || !arrItem || arrItem.idx <= destIdx) return;\n  const routeBoundaries = new Set(['CNA','HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','RCFI','MT','MCK','MCK320','MCK_SS','CBF','EMER','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM']);\n  if (upper.slice(0, arrItem.idx).some((token) => routeBoundaries.has(token))) return;";
if (source.includes(baseScoreGuardWithCna)) source = source.replace(baseScoreGuardWithCna, newScoreGuard);
else if (source.includes(legacyBaseScoreGuardWithCna)) source = source.replace(legacyBaseScoreGuardWithCna, newScoreGuard);
else if (source.includes(legacyNewScoreGuard)) source = source.replace(legacyNewScoreGuard, newScoreGuard);
else if (source.includes(oldScoreGuard)) source = source.replace(oldScoreGuard, newScoreGuard);
else if (!source.includes(newScoreGuard)) throw new Error('[v14.3.75] guard de inferência de rota não localizado.');

if (!source.includes(marker)) {
  source = source.replace(
    "'PDP','PET','PFB','PIN','PMW'",
    "'PDP','PET','PFB','PHB','PIN','PMW'",
  );

  const oldNonAirport = "'HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','MT','CBF','EMER','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM','FH'";
  const baseNonAirportWithCna = "'HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','MT','CBF','EMER','CNA','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM','FH'";
  const newNonAirport = "'HSB','HSBE','ASB','RES','CRM','CRMB','CRMBSB','MT','MCK','CBF','EMER','CNA','DO','DOF','DOP','DOPR','DR','OFF','VC','NS','NSJ','IJ','DM','FH'";
  if (source.includes(oldNonAirport)) source = source.replace(oldNonAirport, newNonAirport);
  else if (source.includes(baseNonAirportWithCna)) source = source.replace(baseNonAirportWithCna, newNonAirport);
  else if (!source.includes(newNonAirport)) throw new Error('[v14.3.75] conjunto de tokens não-aeroporto não localizado.');


  const oldTokenActivities = "['HSB','HSBE','ASB','CBF','EMER','MT','CRM','NS','NSJ','IJ','DM'].includes(token)";
  const newTokenActivities = "['HSB','HSBE','ASB','CBF','EMER','MT','CRM','RCFI','MCK','MCK320','MCK_SS','NS','NSJ','IJ','DM'].includes(token)";
  if (!source.includes(oldTokenActivities)) throw new Error('[v14.3.75] lista de atividades AIMS do servidor não localizada.');
  source = source.replace(oldTokenActivities, newTokenActivities);

  const oldTokenType = "day.type = code === 'HSB' || code === 'HSBE' || code === 'ASB' ? code : (code === 'CRM' || /^C\\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');";
  const newTokenType = "day.type = code === 'HSB' || code === 'HSBE' || code === 'ASB' ? code : (code === 'CRM' || code === 'RCFI' || /^MCK(?:320|_SS)?$/.test(code) || /^C\\d{2,3}F$/.test(code) || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');";
  if (!source.includes(oldTokenType)) throw new Error('[v14.3.75] classificação de atividade AIMS do servidor não localizada.');
  source = source.replace(oldTokenType, newTokenType);

  const oldColumnActivity = "const activity = text.match(/\\b(HSBE|HSB|ASB|RCFI|CRMBSB|CRMB|CRM|C\\d{2,3}F|MT|CBF|EMER)\\b/i)?.[1]?.toUpperCase();";
  const newColumnActivity = "const activity = text.match(/\\b(HSBE|HSB|ASB|RCFI|CRMBSB|CRMB|CRM|MCK320|MCK_SS|MCK|C\\d{2,3}F|MT|CBF|EMER)\\b/i)?.[1]?.toUpperCase();";
  if (!source.includes(oldColumnActivity)) throw new Error('[v14.3.75] atividade colunar AIMS do servidor não localizada.');
  source = source.replace(oldColumnActivity, newColumnActivity);

  const oldColumnType = "day.type = code === 'ASB' || code === 'HSB' || code === 'HSBE' ? code : (code === 'RCFI' || code === 'CRM' || code === 'MT' || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');";
  const newColumnType = "day.type = code === 'ASB' || code === 'HSB' || code === 'HSBE' ? code : (code === 'RCFI' || code === 'CRM' || /^MCK(?:320|_SS)?$/.test(code) || code === 'MT' || code === 'CBF' || code === 'EMER' ? 'CRM' : 'OTHER');";
  if (!source.includes(oldColumnType)) throw new Error('[v14.3.75] classificação colunar AIMS do servidor não localizada.');
  source = source.replace(oldColumnType, newColumnType);

  const oldAimsColumnDispatch = "  for (const { marker, tokens } of stitchServerAimsMidnightColumns(columns)) {\n   days.push(...parseAimsTokensIntoEventsV3(tokens, marker.day, marker.month, marker.year, h.base));\n  }";
  const newAimsColumnDispatch = "  for (const { marker, tokens } of stitchServerAimsMidnightColumns(columns)) {\n   const parsedEvents = parseAimsTokensIntoEventsV3(tokens, marker.day, marker.month, marker.year, h.base);\n   const mckIndex = tokens.findIndex((token) => /^MCK(?:320|_SS)?$/i.test(String(token || '')));\n   const hasParsedMck = parsedEvents.some((day) => /^MCK(?:320|_SS)?$/i.test(String(day?.pairingCode || '')));\n   if (mckIndex >= 0 && !hasParsedMck) {\n    const code = String(tokens[mckIndex]).toUpperCase();\n    const day = makeDay(marker.day, marker.month, marker.year, h.base);\n    const window = pickDutyWindowFromAimsTokensV3(tokens, mckIndex);\n    day.rawText = tokens.join(' ');\n    day.pairingCode = code;\n    day.type = 'CRM';\n    day.dutyReport = window.start;\n    day.dutyDebrief = window.end;\n    day.dutyHours = window.start && window.end ? diffHours(window.start, window.end) : null;\n    day.flyingHours = 0;\n    parsedEvents.push(day);\n   }\n   days.push(...parsedEvents);\n  }";
  if (!source.includes(oldAimsColumnDispatch)) throw new Error('[v14.3.75] despacho de colunas AIMS do servidor não localizado.');
  source = source.replace(oldAimsColumnDispatch, newAimsColumnDispatch);

  // v14.3.45 introduced a CrewRosterReport-specific offset rebuilder into the
  // shared server pipeline. On AIMS PDFs it has no authoritative dd-Mon-yyyy
  // blocks, so it removed valid MCK activities while trying to replace them.
  // Keep that reconstruction strictly on the format it was designed for.
  const unconditionalOffsetRebuild = ' roster.days = rebuildServerCrewRosterOffsetDays(roster.days, fullText, roster.month, roster.year, roster.base);';
  const guardedOffsetRebuild = ' if (!isAims) roster.days = rebuildServerCrewRosterOffsetDays(roster.days, fullText, roster.month, roster.year, roster.base);';
  if (source.includes(unconditionalOffsetRebuild)) source = source.replace(unconditionalOffsetRebuild, guardedOffsetRebuild);
  else if (!source.includes(guardedOffsetRebuild)) throw new Error('[v14.3.75] pipeline de offsets do servidor não localizado.');

  source = `${source.trimEnd()}\n\n${marker}\n`;
  fs.writeFileSync(file, source, 'utf8');
  console.log('[v14.3.75] Telegram/server: AIMS preserva MCK/RCFI, CNA não vira aeroporto e o rebuilder de offsets fica restrito ao CrewRosterReport.');
} else {
  console.log('[v14.3.75] paridade AIMS Telegram/server já aplicada.');
}
