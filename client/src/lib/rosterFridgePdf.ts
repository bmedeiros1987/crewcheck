import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CrewRoster, RosterDay } from './pdfParser';
import { addCrewCheckPdfLogo } from './brand';
import { AIMS_FLIGHT_ROLE_SOURCE, TICKET_FLIGHT_ROLE_SOURCE } from './flightRoleEvidence';

const verifiedRoles = new Set([AIMS_FLIGHT_ROLE_SOURCE, TICKET_FLIGHT_ROLE_SOURCE]);
function role(leg: RosterDay['legs'][number], compact = false): string {
  const value = String(leg.workType || '').trim();
  if (value && verifiedRoles.has(String(leg.workTypeSource || ''))) return value;
  return compact ? '?' : value ? `Função a confirmar (${value} informado)` : 'Função não informada';
}
function publishedClocks(day: RosterDay, compact = false): string[] {
  const startLabel = day.legs.length ? 'APZ' : 'Início';
  const start = day.dutyReportSource === 'published' && day.dutyReport ? `${startLabel} ${day.dutyReport}`
    : day.dutyReport ? `${startLabel} não confirmado` : '';
  const finish = day.dutyDebriefSource === 'published' && day.dutyDebrief
    ? `Fim ${day.dutyDebrief}${day.isNextDay && !/\(\+\d+\)/.test(day.dutyDebrief) ? ' (+1)' : ''}`
    : day.dutyDebrief ? 'Fim não confirmado' : '';
  const clocks = [start, finish].filter(Boolean);
  return compact && clocks.length ? [clocks.join(' / ')] : clocks;
}

/** Display the published roster; do not infer a free day or an operational clock. */
export function buildRosterFridgePdf(roster: CrewRoster, logo: string): jsPDF {
  if (!Number.isInteger(roster.month) || roster.month < 1 || roster.month > 12
    || !Number.isInteger(roster.year) || roster.year < 1900 || roster.year > 9999) {
    throw new Error('Competência da escala inválida para gerar o PDF.');
  }
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const width = doc.internal.pageSize.getWidth();
  const title = `Escala · ${String(roster.month).padStart(2, '0')}/${roster.year}`;
  addCrewCheckPdfLogo(doc, logo, 12, 7, 18);
  doc.setFontSize(17);
  doc.text(title, 42, 15);
  doc.setFontSize(9);
  doc.text(String(roster.crewName || 'Tripulante'), 42, 21);
  doc.text('Geladeira · programação informada; confira a escala oficial.', 12, 29);
  const grouped = new Map<number, RosterDay[]>();
  const details: string[][] = [];
  const describe = (day: RosterDay, compact = false): string[] => [
    String(day.pairingCode || day.type || 'Atividade não informada'),
    ...day.legs.map(leg => compact
      ? `${leg.flightNumber || 'Voo'} ${leg.origin || '?'}-${leg.destination || '?'} ${role(leg, true)}`
      : `${leg.flightNumber || 'Voo'} · ${role(leg)} · ${leg.origin || '?'}-${leg.destination || '?'} ${leg.departureTime || '--:--'} / ${leg.arrivalTime || '--:--'}${leg.isNextDay ? ' (+1)' : ''}`),
    ...publishedClocks(day, compact),
  ];
  // Standard PDF fonts cannot preserve arbitrary Unicode. Reject instead of
  // silently changing someone's name or a source field into different letters.
  for (const value of [roster.crewName || '', ...roster.days.flatMap(day => [day.date || '', ...describe(day)])]) {
    if (/[^\x09\x0a\x0d\x20-\xff]/.test(value)) {
      throw new Error('O PDF geladeira não suporta todos os caracteres desta escala. Use a fonte original para preservá-los.');
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
      const overview = doc.splitTextToSize(entries.flatMap(day => describe(day, true)).join('\n'), innerWidth) as string[];
      // Keep useful flight/route context in ordinary two-leg days. The appendix
      // retains full leg clocks and all content that does not fit this overview.
      compact = [...overview.slice(0, availableLines - 1), 'Ver detalhes no anexo'].join('\n');
      details.push([`${String(number).padStart(2, '0')}/${String(roster.month).padStart(2, '0')}/${roster.year}`, text]);
    }
    const index = start + number - 1;
    body[Math.floor(index / 7)][index % 7] = `${number}\n${compact}`;
  }
  autoTable(doc, {
    startY: 34, margin: { left: 12, right: 12, bottom: 14 },
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
      margin: { left: 12, right: 12, bottom: 14 }, styles: { fontSize: 9, overflow: 'linebreak' },
      headStyles: { fillColor: [7, 29, 51] }, columnStyles: { 0: { cellWidth: 35 } } });
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text(`CrewCheck · ${page}/${doc.getNumberOfPages()} · Função ? = origem não confirmada. Detalhes completos no anexo quando indicado.`, 12, 204);
  }
  return doc;
}
