import fs from 'node:fs';

const VERSION = '14.3.45';
const VERSION_DIGITS = VERSION.replace(/\./g, '');
const clientOffsetSnippet = fs.readFileSync(new URL('./client-offset-continuity.snippet', import.meta.url), 'utf8').trim();
const serverBlocksSnippet = fs.readFileSync(new URL('./server-offset-blocks.snippet', import.meta.url), 'utf8').trim();
const serverOffsetSnippet = fs.readFileSync(new URL('./server-offset-continuity.snippet', import.meta.url), 'utf8').trim()
  .replace('buildRosterDateBlocksV3(fullText)', 'buildServerCrewRosterOffsetBlocks(fullText, referenceYear)');

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14345] Arquivo ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function insertBefore(source, marker, content, label) {
  if (source.includes(content.trim())) return source;
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`[v14345] Âncora não localizada: ${label}`);
  return `${source.slice(0, index)}${content.trimEnd()}\n\n${source.slice(index)}`;
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v14345] Ponto não localizado: ${label}`);
  return source.replace(before, after);
}

update('client/src/lib/pdfParser.ts', (source) => {
  let next = source;
  next = insertBefore(next, 'function normalizeCrewRosterReportContinuationDays(', clientOffsetSnippet, 'reconstrução por offsets no cliente');

  if (!next.includes('const offsetAwareDays = rebuildCrewRosterOffsetDays(')) {
    const visualDeclaration = '  const visuallyRescuedDays = rescueFlightsFromVisualRows(rescuedDays, rows, header.month, header.year, header.base);';
    if (!next.includes(visualDeclaration)) throw new Error('[v14345] Resgate visual do cliente não está preparado.');
    next = next.replace(visualDeclaration, `${visualDeclaration}\n  const offsetAwareDays = rebuildCrewRosterOffsetDays(visuallyRescuedDays, fullText, header.month, header.year, header.base);`);
  }
  next = next.replace('normalizeCrewRosterReportContinuationDays(visuallyRescuedDays,', 'normalizeCrewRosterReportContinuationDays(offsetAwareDays,');
  if (!next.includes('normalizeCrewRosterReportContinuationDays(offsetAwareDays,') && !next.includes('const continuationDays = offsetAwareDays;')) throw new Error('[v14345] Reconstrução por offsets não foi conectada ao motor canônico do cliente.');

  next = next.replace(
    "if (current && /\\b(LA\\d{3,4}|OP|PS|DH|[A-Z]{3}\\s+\\d{1,2}:\\d{2}|\\d{1,2}:\\d{2}\\(\\+\\d+\\))\\b/.test(line)) {",
    "if (current && /\\b(LA\\d{3,4}|MCK(?:320|_SS)?|OP|PS|DH|[A-Z]{3}\\s+\\d{1,2}:\\d{2}|\\d{1,2}:\\d{2}\\(\\+\\d+\\))\\b/.test(line)) {",
  );

  const oldTotals = `  const totalsMatch = compactText.match(/FH\\s*:\\s*(\\d{1,3}:\\d{2})\\s*\\|\\s*DH\\s*:\\s*(\\d{1,3}:\\d{2})/i);\n  const totals = totalsMatch\n    ? { flightHours: timeStringToHours(totalsMatch[1]), dutyHours: timeStringToHours(totalsMatch[2]) }\n    : {};`;
  const newTotals = `  const flightHoursMatch = compactText.match(/\\bFH\\s*:\\s*(\\d{1,3}:\\d{2})/i);\n  const dutyHoursMatch = compactText.match(/\\bDH\\s*:\\s*(\\d{1,3}:\\d{2})/i);\n  const totals = {\n    ...(flightHoursMatch ? { flightHours: timeStringToHours(flightHoursMatch[1]) } : {}),\n    ...(dutyHoursMatch ? { dutyHours: timeStringToHours(dutyHoursMatch[1]) } : {}),\n  };`;
  next = replaceRequired(next, oldTotals, newTotals, 'totais FH/DH em qualquer ordem no cliente');

  const oldMckCodeExpression = "code === 'CRM' || code === 'RCFI' || code === 'MT' || code === 'CBF' || code === 'EMER'";
  const newMckCodeExpression = "code === 'CRM' || code === 'RCFI' || code === 'MT' || code === 'CBF' || code === 'EMER' || /^MCK(?:320|_SS)?$/.test(code)";
  next = next.replace(/\b\(HSBE\|HSB\|ASB\|RCFI\|CRMBSB\|CRMB\|CRM\|C\\d\{2,3\}F\|MT\|CBF\|EMER\)\b/g, '(HSBE|HSB|ASB|RCFI|CRMBSB|CRMB|CRM|C\\d{2,3}F|MT|CBF|EMER|MCK(?:320|_SS)?)');
  next = replaceRequired(next, oldMckCodeExpression, newMckCodeExpression, 'classificação MCK idempotente');
  next = next.replace("if (/\\bCRM\\b/.test(sample)) return 'CRM';", "if (/\\b(?:CRM|MCK(?:320|_SS)?)\\b/.test(sample)) return 'CRM';");
  next = next.replace(/ASB\|CBF\|EMER\|MT\|C\\d\{2,3\}F/g, 'ASB|CBF|EMER|MCK(?:320|_SS)?|MT|C\\d{2,3}F');
  return next;
});

update('server/rosterParser.mjs', (source) => {
  let next = source;
  next = insertBefore(next, 'function finalizeServerDays(', `${serverBlocksSnippet}\n\n${serverOffsetSnippet}`, 'reconstrução por offsets no servidor');

  const visualPipeline = ` roster.days = rescueServerFlightsFromVisualPages(roster.days, pages, roster.month, roster.year, roster.base);\n roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);`;
  const offsetPipeline = ` roster.days = rescueServerFlightsFromVisualPages(roster.days, pages, roster.month, roster.year, roster.base);\n roster.days = rebuildServerCrewRosterOffsetDays(roster.days, fullText, roster.month, roster.year, roster.base);\n roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);`;
  if (next.includes(visualPipeline)) next = next.replace(visualPipeline, offsetPipeline);
  else if (!next.includes('rebuildServerCrewRosterOffsetDays(roster.days, fullText')) {
    const finalLine = ' roster.days = finalizeServerDays(roster.days, roster.month, roster.year, roster.base);';
    if (!next.includes(finalLine)) throw new Error('[v14345] Pipeline final do servidor não localizado.');
    next = next.replace(finalLine, ` roster.days = rebuildServerCrewRosterOffsetDays(roster.days, fullText, roster.month, roster.year, roster.base);\n${finalLine}`);
  }

  next = next.replace("'NS','NSJ','IJ','DM','FH']);", "'NS','NSJ','IJ','DM','FH','MCK','MCK320']);");
  const oldTotals = "function extractTotals(fullText) { const m=fullText.match(/FH\\s*:\\s*(\\d{1,3}:\\d{2})\\s*\\|\\s*DH\\s*:\\s*(\\d{1,3}:\\d{2})/i); return m ? { flightHours: timeToHours(m[1]), dutyHours: timeToHours(m[2]) } : {}; }";
  const newTotals = "function extractTotals(fullText) { const fh=fullText.match(/\\bFH\\s*:\\s*(\\d{1,3}:\\d{2})/i); const dh=fullText.match(/\\bDH\\s*:\\s*(\\d{1,3}:\\d{2})/i); return { ...(fh ? { flightHours: timeToHours(fh[1]) } : {}), ...(dh ? { dutyHours: timeToHours(dh[1]) } : {}) }; }";
  next = replaceRequired(next, oldTotals, newTotals, 'totais FH/DH em qualquer ordem no servidor');
  if (!next.includes('rebuildServerCrewRosterOffsetDays(roster.days, fullText')) throw new Error('[v14345] Reconstrução por offsets não foi conectada ao fallback do servidor.');
  return next;
});

update('client/src/pages/Home.tsx', (source) => source
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, `const CREWCHECK_UI_CORE_NOTE = 'v${VERSION}: leitura oficial de agosto com offsets reais, MCK e continuidade preservada';`));
update('client/src/App.tsx', (source) => source
  .replace(/crewcheck_last_loaded_version',\s*'[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`)
  .replace(/crewcheck-client-cleanup:[^']+/g, `crewcheck-client-cleanup:${VERSION}`)
  .replace(/!name\.includes\('v[^']+'\)/g, `!name.includes('v${VERSION}')`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/14\.3\.\d+/g, VERSION), { optional: true });
update('client/index.html', (source) => source
  .replace(/data-crewcheck-release="[^"]+"/g, `data-crewcheck-release="${VERSION}"`)
  .replace(/name="crewcheck-release" content="[^"]+"/g, `name="crewcheck-release" content="${VERSION}"`)
  .replace(/var currentRelease = '[^']+';/g, `var currentRelease = '${VERSION}';`)
  .replace(/manifest\.json\?v=\d+/g, `manifest.json?v=${VERSION_DIGITS}`)
  .replace(/sw\.js\?v=\d+/g, `sw.js?v=${VERSION_DIGITS}`), { optional: true });
update('client/public/sw.js', (source) => source
  .replace(/crewcheck-v[0-9.]+-shell/g, `crewcheck-v${VERSION}-shell`)
  .replace(/crewcheck-v[0-9.]+-runtime/g, `crewcheck-v${VERSION}-runtime`), { optional: true });
update('client/public/release.json', () => `${JSON.stringify({
  version: VERSION,
  channel: 'web',
  updatePolicy: 'automatic-safe',
  notes: 'CrewRosterReport de agosto preserva data real dos offsets (+1/+2/+3), continuidade anterior ao mês e duas atividades MCK no mesmo dia.',
}, null, 2)}\n`);

console.log(`[v14345] CrewCheck ${VERSION}: CrewRosterReport reconstruído por offsets explícitos, MCK múltiplo e continuidade real entre meses.`);

await import('./orientation-hotfix.mjs');
