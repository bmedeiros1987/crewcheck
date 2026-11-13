import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CrewRoster, RosterDay } from './pdfParser';
import { addCrewCheckPdfLogo } from './brand';

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
  const describe = (day: RosterDay): string[] => [
    String(day.pairingCode || day.type || 'Atividade não informada'),
    ...day.legs.map(leg => `${leg.flightNumber || 'Voo'} ${leg.origin || '?'}-${leg.destination || '?'} ${leg.departureTime || '--:--'} / ${leg.arrivalTime || '--:--'}${leg.isNextDay ? ' (+1)' : ''}`),
    ...(day.dutyReport && day.dutyReportSource === 'published' ? [`APZ ${day.dutyReport}`] : []),
  ];
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
  for (let number = 1; number <= lastDay; number++) {
    const entries = grouped.get(number);
    const text = entries ? entries.flatMap(describe).join('\n') : 'Sem registro';
    const lines = doc.splitTextToSize(text, (width - 24) / 7 - 5) as string[];
    // Preserve long days in an appendix instead of shrinking or losing flights.
    const compact = lines.length > 4 ? 'Ver detalhes no anexo' : text;
    if (lines.length > 4) details.push([`${String(number).padStart(2, '0')}/${String(roster.month).padStart(2, '0')}/${roster.year}`, text]);
    const index = start + number - 1;
    body[Math.floor(index / 7)][index % 7] = `${number}\n${compact}`;
  }
  autoTable(doc, {
    startY: 34, margin: { left: 12, right: 12, bottom: 14 },
    head: [['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']], body,
    theme: 'grid', styles: { font: 'helvetica', fontSize: 8, cellPadding: 2, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [7, 29, 51] },
    bodyStyles: { minCellHeight: (158 - 9) / weeks },
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
    doc.text(`CrewCheck · ${page}/${doc.getNumberOfPages()} · Horários conforme a fonte; não representam status ao vivo.`, 12, 204);
  }
  return doc;
}
