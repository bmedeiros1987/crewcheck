import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CrewRoster, RosterDay } from './pdfParser';
import { addCrewCheckPdfLogo } from './brand';
import { capturePublishedFreeDayStart } from './freeDayStartEvidence';
import { AIMS_FLIGHT_ROLE_SOURCE, TICKET_FLIGHT_ROLE_SOURCE } from './flightRoleEvidence';

export class RosterFridgeValidationError extends Error {}
const pdfText = (value: string): string => value.normalize('NFC');

const verifiedRoles = new Set([AIMS_FLIGHT_ROLE_SOURCE, TICKET_FLIGHT_ROLE_SOURCE]);
function role(leg: RosterDay['legs'][number], compact = false): string {
  const value = String(leg.workType || '').trim();
  if (value && verifiedRoles.has(String(leg.workTypeSource || ''))) return value;
  return compact ? '?' : value ? `Função a confirmar (${value} informado)` : 'Função não informada';
}
const legsOf = (day: RosterDay): RosterDay['legs'] => Array.isArray(day.legs) ? day.legs : [];
const inferredContinuity = (day: RosterDay): boolean => (day as RosterDay & { continuityInferred?: boolean }).continuityInferred === true;
function restClock(day: RosterDay): string[] {
  const e = day.freeDayStartEvidence;
  if (!e || e.date !== day.date || e.code !== String(day.pairingCode || day.type).toUpperCase() || e.origin !== 'AIMS published rest tokens' || e.clockSource !== 'published') return [];
  const literal = capturePublishedFreeDayStart(String(e.tokenExcerpt || '').split(/\s+/), e.date);
  if (!literal?.clock || literal.clock !== e.clock || literal.code !== e.code) return [];
  if (day.dutyReportSource === 'published' && day.dutyReport && day.dutyReport !== e.clock) return ['Início folga não confirmado: fontes conflitantes'];
  const offset = e.utcOffsetMinutes;
  const zone = e.timeZoneSource === 'published' && Number.isInteger(offset) && Math.abs(offset!) <= 840
    ? `UTC${offset! < 0 ? '-' : '+'}${String(Math.floor(Math.abs(offset!) / 60)).padStart(2, '0')}:${String(Math.abs(offset!) % 60).padStart(2, '0')}` : 'fuso não informado';
  return [`Início folga ${e.clock} (${zone}${e.convertedDocument ? '; fonte convertida' : ''})`];
}
function legPresentation(leg: RosterDay['legs'][number]): string | null {
  const presentation = String(leg.presentationTime || '');
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(presentation)) return null;
  const departure = String(leg.departureTime || '').match(/(\d{1,2})[:hH](\d{2})/);
  const normalizedDeparture = departure ? `${String(Number(departure[1])).padStart(2, '0')}:${departure[2]}` : null;
  // Canonical roster treats equality as parser positioning fallback, not APZ proof.
  return presentation !== normalizedDeparture ? presentation : null;
}
function publishedClocks(day: RosterDay, compact = false): string[] {
  const availability = /^(HSB|HSBE|ASB|RES)$/.test(String(day.type)) || /^(HSB|HSBE|ASB|RES)$/.test(String(day.pairingCode));
  const startLabel = legsOf(day).length && !availability ? 'APZ' : 'Início';
  const inferred = inferredContinuity(day);
  const start = day.dutyReportSource === 'published' && day.dutyReport ? `${startLabel} ${day.dutyReport}`
    : day.dutyReport ? `${startLabel} não confirmado` : '';
  const finish = day.dutyDebriefSource === 'published' && day.dutyDebrief
    ? `Fim ${day.dutyDebrief}${day.isNextDay && !/\(\+\d+\)/.test(day.dutyDebrief) ? ' (+1)' : ''}`
    : day.dutyDebrief ? 'Fim não confirmado' : '';
  const rest = inferred ? [] : restClock(day);
  const clocks = [...rest, ...(rest.length ? [] : [start]), finish].filter(Boolean);
  return compact && clocks.length ? [clocks.join(' / ')] : clocks;
}

/** Display the published roster; do not infer a free day or an operational clock. */
export function buildRosterFridgePdf(roster: CrewRoster, logo: string): jsPDF {
  if (!Number.isInteger(roster.month) || roster.month < 1 || roster.month > 12
    || !Number.isInteger(roster.year) || roster.year < 1900 || roster.year > 9999) {
    throw new RosterFridgeValidationError('Competência da escala inválida para gerar o PDF.');
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const width = doc.internal.pageSize.getWidth();
  const title = `Escala · ${String(roster.month).padStart(2, '0')}/${roster.year}`;
  addCrewCheckPdfLogo(doc, logo, 12, 7, 18);
  doc.setFontSize(17);
  doc.text(title, 42, 15);
  doc.setFontSize(9);
  const nameLines = doc.splitTextToSize(pdfText(String(roster.crewName || 'Tripulante').trim()), width - 54) as string[];
  if (nameLines.length > 2) throw new RosterFridgeValidationError('O nome completo não cabe no cabeçalho do PDF geladeira. Use a fonte original para preservá-lo.');
  doc.text(nameLines, 42, 21);
  doc.text('Geladeira · programação informada; confira a escala oficial.', 12, 29);
  const grouped = new Map<number, RosterDay[]>();
  const details: string[][] = [];
  const describe = (day: RosterDay, compact = false): string[] => [
    String(day.pairingCode || day.type || 'Atividade não informada'),
    ...(inferredContinuity(day) ? ['Inferido por continuidade; não é folga publicada'] : []),
    ...(!Array.isArray(day.legs) ? ['Etapas não disponíveis neste registro'] : []),
    ...legsOf(day).map(leg => compact
      ? `${leg.flightNumber || 'Voo'} ${leg.origin || '?'}-${leg.destination || '?'} ${role(leg, true)}`
      : `${leg.flightNumber || 'Voo'} · ${role(leg)} · ${leg.origin || '?'}-${leg.destination || '?'} ${leg.departureTime || '--:--'} / ${leg.arrivalTime || '--:--'}${leg.isNextDay ? ' (+1)' : ''}${legPresentation(leg) ? ` · APZ etapa ${legPresentation(leg)}` : ''}`),
    ...publishedClocks(day, compact),
  ].map(pdfText);
  // Standard PDF fonts cannot preserve arbitrary Unicode. Reject instead of
  // silently changing someone's name or a source field into different letters.
  for (const value of [roster.crewName || '', ...roster.days.flatMap(day => [day.date || '', ...describe(day)])]) {
    if (/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/.test(pdfText(value))) {
      throw new RosterFridgeValidationError('O PDF geladeira não suporta todos os caracteres desta escala. Use a fonte original para preservá-los.');
    }
  }
  const lastDay = new Date(Date.UTC(roster.year, roster.month, 0)).getUTCDate();
  for (const day of roster.days) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(day.date || '');
    if (match && Number(match[2]) === roster.month && Number(match[3]) === roster.year
      && Number(match[1]) >= 1 && Number(match[1]) <= lastDay) {
      const number = Number(match[1]);
      grouped.set(number, [...(grouped.get(number) || []), day]);
    } else {
      details.push([String(day.date || 'Data ausente'), describe(day).join('\n')]);
    }
  }
  const start = new Date(Date.UTC(roster.year, roster.month - 1, 1)).getUTCDay();
  const weeks = Math.ceil((start + lastDay) / 7);
  const body: string[][] = Array.from({ length: weeks }, () => Array(7).fill(''));
  const cellHeight = 149 / weeks;
  const innerWidth = (width - 24) / 7 - 4;
  const fontSize = 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  const lineHeight = fontSize * 25.4 / 72 * doc.getLineHeightFactor();
  const availableLines = Math.floor((cellHeight - 4) / lineHeight) - 1; // day number
  for (let number = 1; number <= lastDay; number++) {
    const entries = grouped.get(number);
    const text = entries ? entries.flatMap(day => describe(day)).join('\n') : 'Sem registro';
    const lines = doc.splitTextToSize(text, innerWidth) as string[];
    let compact = text;
    if (lines.length > availableLines && entries) {
      const summary = entries.flatMap(day => describe(day, true));
      const overview = doc.splitTextToSize(summary.join('\n'), innerWidth) as string[];
      let visible = overview;
      let omittedFlights = 0;
      if (overview.length > availableLines - 1) {
        // Fit whole leg summaries, never a partial flight with no omission count.
        visible = entries.some(inferredContinuity) ? ['Continuidade inferida'] : [];
        let truncated = false;
        for (const day of entries) {
          const heading = doc.splitTextToSize(pdfText(`${day.pairingCode || day.type || 'Atividade não informada'}${inferredContinuity(day) ? ' (inferido)' : ''}`), innerWidth) as string[];
          if (!truncated && visible.length + heading.length <= availableLines - 1) visible.push(...heading);
          for (const leg of legsOf(day)) {
            const legLines = doc.splitTextToSize(pdfText(`${leg.flightNumber || 'Voo'} ${leg.origin || '?'}-${leg.destination || '?'} ${role(leg, true)}`), innerWidth) as string[];
            if (!truncated && visible.length + legLines.length <= availableLines - 1) visible.push(...legLines);
            else { omittedFlights++; truncated = true; }
          }
        }
      }
      compact = [...visible, omittedFlights ? `+${omittedFlights} voo(s) no anexo` : 'Ver detalhes no anexo'].join('\n');
      details.push([`${String(number).padStart(2, '0')}/${String(roster.month).padStart(2, '0')}/${roster.year}`, text]);
    }
    const index = start + number - 1;
    body[Math.floor(index / 7)][index % 7] = `${number}\n${compact}`;
  }
  autoTable(doc, {
    startY: 34, margin: { left: 12, right: 12, bottom: 18 },
    head: [['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']], body,
    theme: 'grid', styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [7, 29, 51] },
    bodyStyles: { minCellHeight: cellHeight },
    tableWidth: width - 24,
    columnStyles: Object.fromEntries(Array.from({ length: 7 }, (_, index) => [index, { cellWidth: (width - 24) / 7 }])),
  });
  if (details.length) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text('Detalhes da escala · registros preservados', 12, 15);
    autoTable(doc, { startY: 22, head: [['Data da fonte', 'Programação']], body: details, theme: 'grid',
      margin: { left: 12, right: 12, bottom: 18 }, styles: { fontSize: 9, overflow: 'linebreak' },
      headStyles: { fillColor: [7, 29, 51] }, columnStyles: { 0: { cellWidth: 35 } } });
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text(`CrewCheck · ${page}/${doc.getNumberOfPages()} · Função ? = origem não confirmada. Detalhes completos no anexo quando indicado.`, 12, 197);
    doc.text('Horários conforme a fonte; não representam status ao vivo.', 12, 201);
  }
  return doc;
}
