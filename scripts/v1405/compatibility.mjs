import fs from 'node:fs';

const calendarPath = 'client/src/lib/googleCalendarSync.ts';
if (fs.existsSync(calendarPath)) {
  let calendar = fs.readFileSync(calendarPath, 'utf8');

  // Em produção, tenta primeiro o fluxo seguro do servidor. A chamada acontece
  // imediatamente após o clique, antes de qualquer await de diagnóstico, para
  // que navegadores e PWAs não classifiquem a janela do Google como pop-up tardio.
  calendar = calendar
    .replace('  serverGoogleCalendarHealth,\n', '')
    .replace(
      "  const embedded = isEmbeddedCrewCheckWebView();\n  const bridgeHealth = await serverGoogleCalendarHealth();\n  if (embedded || bridgeHealth.configured || hasServerGoogleCalendarMarker()) {",
      "  const embedded = isEmbeddedCrewCheckWebView();\n  if (embedded || isProductionGoogleOrigin() || hasServerGoogleCalendarMarker()) {",
    );

  const signature = "export async function connectGoogleCalendar(prompt = 'consent select_account'): Promise<void> {";
  const disclosure = "  if (/consent|select_account/i.test(prompt)) confirmGoogleCalendarOwnedEventsDisclosure();";
  const start = calendar.indexOf(signature);
  if (start >= 0) {
    const end = calendar.indexOf('\n}', start);
    const block = end >= 0 ? calendar.slice(start, end) : '';
    if (!block.includes('confirmGoogleCalendarOwnedEventsDisclosure()')) {
      calendar = calendar.replace(signature, `${signature}\n${disclosure}`);
    }
  }
  fs.writeFileSync(calendarPath, calendar, 'utf8');
}

console.log('CrewCheck v14.0.5: popup seguro, divulgação OAuth e compatibilidade de verificação preservados.');
