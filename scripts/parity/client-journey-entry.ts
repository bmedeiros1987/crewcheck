/**
 * Entrada usada apenas pelo harness de paridade cliente/APK.
 * Fica fora de `client/src` de propósito: não faz parte do bundle da aplicação.
 *
 * Importar `pdfParser` aqui é intencional. Ele carrega
 * `pdfjs-dist/legacy/build/pdf.worker.min.mjs?url`, sintaxe que só o Vite
 * resolve, e é exatamente por isso que o caminho do cliente não podia ser
 * validado pelo harness Node do servidor. Construindo esta entrada com o Vite
 * real, o mesmo pipeline que gera o asset de Web/PWA/APK precisa resolver o
 * worker, compilar as mudanças de tipo e emitir a derivação de jornada.
 */
import { buildCanonicalRosterEvents, normalizeRosterDays, selectPhysicalLegSequence } from '@/lib/canonicalRoster';
import type { CrewRoster } from '@/lib/pdfParser';
import '@/lib/pdfParser';

export { buildCanonicalRosterEvents, normalizeRosterDays, selectPhysicalLegSequence };

/** Resumo estável para comparar o bundle do cliente com o parser do servidor. */
export function journeySummary(roster: CrewRoster) {
  return buildCanonicalRosterEvents(roster)
    .filter((event) => event.kind === 'flight')
    .map((event) => ({
      date: event.date,
      flightNumber: event.flightNumber,
      journeyId: event.journeyId,
      journeyBoundary: event.journeyBoundary,
      showPresentation: event.showPresentation,
      presentation: event.presentation,
      groundBeforeMinutes: event.groundBeforeMinutes,
    }));
}
