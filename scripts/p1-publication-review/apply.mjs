import fs from 'node:fs';
const path = 'client/src/pages/Home.tsx';
let source = fs.readFileSync(path,'utf8');
if (!source.includes("from '@/lib/rosterPublicationRuntime'")) {
  source = "import { publicationOwner, recordPublication } from '@/lib/rosterPublicationRuntime';\nimport { publication as publicationSnapshot } from '@/lib/rosterPublicationReview';\n" + source;
  const replace = (before, after) => { if (!source.includes(before)) throw Error(`[publication-review] missing anchor: ${before.slice(0,80)}`); source = source.replace(before,after); };
  replace('  async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>) {','  async function handleFile(inputEvent: ChangeEvent<HTMLInputElement>) {\n    const importOwner = publicationOwner();');
  replace('      saveRoster(roster, file.name);', "      if (importOwner !== publicationOwner()) { toast.error('A conta mudou durante a importação. Importe novamente nesta conta.'); return; }\n      await recordPublication(importOwner, buildCanonicalRosterEvents(normalizeRosterDays(roster)));\n      if (importOwner !== publicationOwner()) return;\n      saveRoster(roster, file.name);");
  replace("      syncing = true;\n      try {", "      syncing = true;\n      const reviewOwner = publicationOwner();\n      try {");
  replace('        if (!alive || !active?.roster?.days?.length) return;', '        if (!alive || !active?.roster?.days?.length || !reviewOwner || reviewOwner !== publicationOwner()) return;\n        await recordPublication(reviewOwner, buildCanonicalRosterEvents(normalizeRosterDays(active.roster)));\n        if (!alive || reviewOwner !== publicationOwner()) return;');
  replace('        if (serverRevision === localRevision) return;', '        const publishedRevision = publicationSnapshot(buildCanonicalRosterEvents(normalizeRosterDays(active.roster))).revision;\n        const localPublishedRevision = hasLocalRoster ? publicationSnapshot(buildCanonicalRosterEvents(normalizeRosterDays(bundle.roster))).revision : "";\n        if (serverRevision === localRevision && publishedRevision === localPublishedRevision) return;');
}
if (!source.includes('publication-review-account-guards')) {
  const replaceGuard = (before,after) => { if (!source.includes(before)) throw Error(`[publication-review] missing account guard anchor: ${before.slice(0,80)}`); source = source.replace(before,after); };
  replaceGuard("        saveRoster(active.roster, 'Escala ativa sincronizada');", "        if (!alive || reviewOwner !== publicationOwner()) return; // publication-review-account-guards\n        saveRoster(active.roster, 'Escala ativa sincronizada');");
  replaceGuard('        if (alive && remote?.roster?.days?.length) {', '        if (alive && reviewOwner && reviewOwner === publicationOwner() && remote?.roster?.days?.length) {\n          await recordPublication(reviewOwner, buildCanonicalRosterEvents(normalizeRosterDays(remote.roster)));\n          if (!alive || reviewOwner !== publicationOwner()) return;');
  replaceGuard('          if (remoteRevision !== localRevision) {', '          const remotePublishedRevision = publicationSnapshot(buildCanonicalRosterEvents(normalizeRosterDays(remote.roster))).revision;\n          const localPublishedRevision = hasLocalRoster ? publicationSnapshot(buildCanonicalRosterEvents(normalizeRosterDays(bundle.roster))).revision : "";\n          if (remoteRevision !== localRevision || remotePublishedRevision !== localPublishedRevision) {');
  replaceGuard('      setBundle({ roster, compliance: newCompliance, source: file.name });', '      if (importOwner !== publicationOwner()) return;\n      setBundle({ roster, compliance: newCompliance, source: file.name });');
}
if (!source.includes('publication-review-import-after-compliance')) source = source.replace("      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);", "      if (importOwner !== publicationOwner()) return; // publication-review-import-after-compliance\n      storage.set('crewcheck_last_import_guardian_summary', decision.summaryText);");
if (!source.includes('publication-review-order-guard')) {
  source = source.replace("import { publicationOwner, recordPublication }", "import { publicationOwner, recordPublication, currentPublicationReview }");
  source = source.replace('    const importOwner = publicationOwner();', '    const importOwner = publicationOwner();\n    const importReference = currentPublicationReview()?.publication.revision ?? null; // publication-review-order-guard');
  source = source.replace('      const reviewOwner = publicationOwner();', '      const reviewOwner = publicationOwner();\n      const reviewReference = currentPublicationReview()?.publication.revision ?? null;');
  source = source.replace('recordPublication(importOwner, buildCanonicalRosterEvents(normalizeRosterDays(roster)))', 'recordPublication(importOwner, buildCanonicalRosterEvents(normalizeRosterDays(roster)), importReference)');
  source = source.replaceAll('recordPublication(reviewOwner, buildCanonicalRosterEvents(normalizeRosterDays(active.roster)))', 'recordPublication(reviewOwner, buildCanonicalRosterEvents(normalizeRosterDays(active.roster)), reviewReference)');
  source = source.replaceAll('recordPublication(reviewOwner, buildCanonicalRosterEvents(normalizeRosterDays(remote.roster)))', 'recordPublication(reviewOwner, buildCanonicalRosterEvents(normalizeRosterDays(remote.roster)), reviewReference)');
}
fs.writeFileSync(path,source);
console.log('[publication-review] account publication observer; no coverage inferred, no automatic read acknowledgement');
