import fs from 'node:fs';

// Web compatibility only: preserve the current importer and all upstream guards.
const path = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(path, 'utf8');
const bindingImport = "import { sharedPdfAccountReceipt, sharedPdfIdentity, markSharedPdfCommitted } from '@/lib/sharedPdfAccountBinding';\n";
if (!source.includes(bindingImport.trim())) source = bindingImport + source;
if (!source.includes('function captureSharedPdfImport(')) {
  const start = source.indexOf('  const nativePdfClaimsRef = useRef<Set<string>>(new Set());');
  const end = source.indexOf('  }, [bundle]);', start);
  if (start < 0 || end < 0) throw new Error('[android-share-web] legacy listener missing');
  source = source.slice(0, start) + fs.readFileSync(new URL('./native-pdf.snippet', import.meta.url), 'utf8')
    + source.slice(end + '  }, [bundle]);\n'.length);
}
if (!source.includes('sharedContext?: ReturnType<typeof captureSharedPdfImport>')) {
  const first = source.indexOf('  async function handleFile(inputEvent:');
  const last = source.indexOf('  async function copyCurrentSummarySilently(', first);
  if (first < 0 || last < 0) throw new Error('[android-share-web] canonical importer missing');
  let handler = source.slice(first, last);
  const replace = (before, after) => {
    if (!handler.includes(before)) throw new Error('[android-share-web] missing importer anchor: ' + before);
    handler = handler.replace(before, after);
  };
  replace('async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>) {',
    'async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>, sharedContext?: ReturnType<typeof captureSharedPdfImport>): Promise<boolean> {');
  replace('const importOwner = publicationOwner();', 'const importOwner = sharedContext?.importOwner ?? publicationOwner();');
  replace('const importReference = currentPublicationReview()?.publication.revision ?? null;',
    'const importReference = sharedContext ? sharedContext.importReference : currentPublicationReview()?.publication.revision ?? null;');
  replace('const plannedImport = beginOwnedPlannedImport();', 'const plannedImport = sharedContext?.plannedImport ?? beginOwnedPlannedImport();');
  replace('const canCommit = beginRosterChoice();',
    'const canCommit = sharedContext?.canCommit ?? beginRosterChoice();\n    let committed = false;\n    const importCurrent = () => plannedImport.canCommit() && canCommit() && importOwner === publicationOwner()\n      && (!sharedContext || sharedContext.isAlive());');
  // Every former early exit now explicitly reports that no commit was confirmed.
  handler = handler.replace(/\breturn;/g, 'return false;');
  replace('const parsed = await parsePDFResilient(file);', 'const parsed = await parsePDFResilient(file);\n      if (!importCurrent()) return false;');
  replace('const decision = await confirmRosterImport(roster, file.name);',
    'const decision = await confirmRosterImport(roster, file.name);\n      if (!importCurrent()) return false;');
  replace('await recordPublication(importOwner, buildCanonicalRosterEvents(normalizeRosterDays(roster)), importReference);',
    'await recordPublication(importOwner, buildCanonicalRosterEvents(normalizeRosterDays(roster)), importReference);\n      if (!importCurrent()) return false;');
  // A rejected async compliance computation must not replace the active roster.
  replace('      saveRoster(roster, file.name);\n', '');
  replace("      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);",
    "      if (!importCurrent()) return false;\n      saveRoster(roster, file.name);\n      if (!importCurrent()) return false;\n      if (sharedContext) {\n        const persisted = JSON.parse(localStorage.getItem(startupKey()) || 'null');\n        if (persisted?.owner !== startupOwner() || persisted?.sourceFileName !== file.name\n          || JSON.stringify(persisted.roster) !== JSON.stringify(roster)) {\n          throw new Error('Não consegui preservar a escala importada neste dispositivo. Tente novamente.');\n        }\n      }\n      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);");
  replace('      setBundle({ roster, compliance: newCompliance, source: file.name });',
    '      setBundle({ roster, compliance: newCompliance, source: file.name });\n      committed = true;');
  replace("      setLocation('/result');", "      setLocation('/result');\n      return committed;");
  replace('      if (plannedImport.canCommit()) toast.error(sanitizePdfImportError(error));',
    '      if (plannedImport.canCommit()) toast.error(sanitizePdfImportError(error));\n      return committed;');
  source = source.slice(0, first) + handler + source.slice(last);
}
fs.writeFileSync(path, source);
console.log('[android-share-web] Base64/chunk compatibility; current-session canonical commit gates ACK.');

const pwaPath = 'client/src/lib/pwaSharedPdfRuntime.ts';
let pwa = fs.readFileSync(pwaPath, 'utf8');
if (!pwa.includes("import { sharedPdfAccountReceipt } from './sharedPdfAccountBinding';")) {
  pwa = "import { sharedPdfAccountReceipt } from './sharedPdfAccountBinding';\n" + pwa;
  const anchor = '  if (!shareId) return;';
  if (!pwa.includes(anchor)) throw new Error('[android-share-web] PWA receipt anchor missing');
  pwa = pwa.replace(anchor, anchor + `
  // Bind BEFORE the single-use SW fetch, blob read, decode or parser/upload.
  const receipt = sharedPdfAccountReceipt({ shareId: 'pwa:' + shareId });
  if (receipt.committed) {
    url.searchParams.delete(SHARED_PDF_QUERY);
    window.history.replaceState(window.history.state, '', \`${'${url.pathname}'}${'${url.search}'}${'${url.hash}'}\`);
    return;
  }
  if (!receipt.allowed) {
    (window as any).__crewcheckPwaShareError = 'Este PDF não pode ser retomado nesta conta. Compartilhe novamente após entrar na conta correta.';
    return;
  }`);
  // A failed SW fetch must retain the opaque URL ID for a same-account retry.
  const lostRetry = "    url.searchParams.delete(SHARED_PDF_QUERY);\n    url.searchParams.set('view', 'import');";
  if (!pwa.includes(lostRetry)) throw new Error('[android-share-web] PWA failure retry anchor missing');
  pwa = pwa.replace(lostRetry, "    url.searchParams.set('view', 'import');");
  fs.writeFileSync(pwaPath, pwa);
}
