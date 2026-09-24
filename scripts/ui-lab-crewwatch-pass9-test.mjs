import fs from 'node:fs';

const mainPath = 'android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java';
const source = fs.readFileSync(mainPath, 'utf8');

const mustContain = [
  'private void addNavigation(WatchContextSnapshot snapshot)',
  'for (int index = 0; index < PAGE_COUNT; index++)',
  'dotBg.setShape(GradientDrawable.OVAL)',
  'index == screenMode',
  '"Tela " + (screenMode + 1) + " de " + PAGE_COUNT',
  'renderFooter(snapshot, now);',
  'private void renderFooter(WatchContextSnapshot snapshot, long now)',
  '"↻ Atualizando"',
  '"● Sem dados · toque para sincronizar"',
  '"● Dados antigos · toque para atualizar"',
  '"● Sync automático · " + syncAgeLabel(snapshot, now)',
  'private String syncAgeLabel(WatchContextSnapshot snapshot, long now)',
  'WatchSyncClient.refresh',
  'requestSync();',
  'case MODE_JOURNEY -> "JORNADA"',
  'case MODE_NOTIFICATIONS -> "ALERTAS"',
  'case MODE_SCHEDULE -> "ESCALA"',
  'case MODE_CREWLIFE -> "CREWLIFE"',
  'case MODE_CONCIERGE -> "CONCIERGE"',
  'default -> "AGORA"',
];

for (const token of mustContain) {
  if (!source.includes(token)) {
    throw new Error(`UI Lab pass 9 contract missing: ${token}`);
  }
}

const forbidden = [
  'pageTitle() + "  " + (screenMode + 1) + "/" + PAGE_COUNT',
  'PdfParser',
  'parseAimsTokensIntoEventsV3',
];

for (const token of forbidden) {
  if (source.includes(token)) {
    throw new Error(`UI Lab pass 9 contract forbids: ${token}`);
  }
}

const pageModes = (source.match(/private static final int MODE_/g) || []).length;
if (pageModes !== 6) {
  throw new Error(`Expected exactly 6 CrewWatch page modes, found ${pageModes}`);
}

console.log('UI Lab CrewWatch pass 9: PASS');
