import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';
import { CREWCHECK_BRAND } from './brand';

export type CrewCheckPdfExportResult = {
  fileName: string;
  blob: Blob;
  url: string;
  sizeKb: number;
  createdAt: string;
  open: () => void;
  download: () => void;
};

type RGB = [number, number, number];

const COLOR = {
  navy950: [2, 8, 23] as RGB,
  navy900: [7, 29, 51] as RGB,
  navy800: [9, 40, 70] as RGB,
  text: [7, 29, 51] as RGB,
  muted: [93, 112, 131] as RGB,
  white: [255, 255, 255] as RGB,
  surface: [248, 250, 255] as RGB,
  lavender: [246, 241, 255] as RGB,
  pink: [255, 241, 247] as RGB,
  cyanSoft: [236, 251, 255] as RGB,
  line: [220, 230, 240] as RGB,
  violet: [154, 77, 255] as RGB,
  magenta: [236, 44, 134] as RGB,
  cyan: [39, 195, 232] as RGB,
  green: [22, 134, 90] as RGB,
  amber: [217, 119, 6] as RGB,
  red: [200, 62, 90] as RGB,
};

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function triggerBlobDownload(blob: Blob, fileName: string): string {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => { try { anchor.remove(); } catch {} }, 250);
  return url;
}

function rememberLastPdfExport(fileName: string, blob: Blob) {
  try {
    localStorage.setItem('crewcheck_last_pdf_export_v1', JSON.stringify({
      fileName,
      sizeKb: Math.max(1, Math.round(blob.size / 1024)),
      createdAt: new Date().toISOString(),
      locationHint: 'Downloads/Arquivos do dispositivo',
      brand: CREWCHECK_BRAND.name,
    }));
    window.dispatchEvent(new CustomEvent('crewcheck:export-created', { detail: { type: 'pdf', fileName } }));
  } catch {}
}

function fill(doc: jsPDF, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
}

function stroke(doc: jsPDF, color: RGB) {
  doc.setDrawColor(color[0], color[1], color[2]);
}

function text(doc: jsPDF, color: RGB) {
  doc.setTextColor(color[0], color[1], color[2]);
}

function drawTopAccent(doc: jsPDF, pageWidth: number) {
  const segment = pageWidth / 3;
  fill(doc, COLOR.violet);
  doc.rect(0, 0, segment, 2.4, 'F');
  fill(doc, COLOR.magenta);
  doc.rect(segment, 0, segment, 2.4, 'F');
  fill(doc, COLOR.cyan);
  doc.rect(segment * 2, 0, pageWidth - segment * 2, 2.4, 'F');
}

/**
 * Símbolo vetorial do CrewCheck para manter a identidade oficial também no PDF,
 * sem depender de internet, cache do navegador ou conversão externa de imagem.
 */
function drawBrandIcon(doc: jsPDF, x: number, y: number, size: number) {
  fill(doc, COLOR.magenta);
  doc.roundedRect(x, y, size, size, size * 0.23, size * 0.23, 'F');

  fill(doc, COLOR.violet);
  doc.triangle(x, y, x + size * 0.72, y, x, y + size * 0.72, 'F');
  fill(doc, COLOR.cyan);
  doc.triangle(x + size, y + size, x + size * 0.38, y + size, x + size, y + size * 0.38, 'F');

  stroke(doc, COLOR.white);
  doc.setLineWidth(Math.max(0.9, size * 0.065));
  doc.setLineCap('round');
  doc.setLineJoin('round');
  const points = [
    [0.18, 0.46], [0.43, 0.49], [0.66, 0.27], [0.76, 0.23], [0.79, 0.27],
    [0.58, 0.51], [0.61, 0.79], [0.55, 0.82], [0.43, 0.61], [0.33, 0.70],
    [0.27, 0.79], [0.23, 0.76], [0.27, 0.65], [0.17, 0.60], [0.15, 0.56],
    [0.18, 0.52], [0.29, 0.54], [0.16, 0.49], [0.15, 0.46], [0.18, 0.46],
  ];
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];
    doc.line(x + from[0] * size, y + from[1] * size, x + to[0] * size, y + to[1] * size);
  }
  doc.setLineWidth(0.2);
}

function drawMainHeader(doc: jsPDF, pageWidth: number, roster: CrewRoster, reportTitle: string) {
  fill(doc, COLOR.navy950);
  doc.rect(0, 0, pageWidth, 49, 'F');
  drawTopAccent(doc, pageWidth);
  drawBrandIcon(doc, 14, 9, 25);

  text(doc, COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.text(CREWCHECK_BRAND.name, 44, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(205, 239, 255);
  doc.text(CREWCHECK_BRAND.descriptor.toUpperCase(), 44, 24.5);

  text(doc, COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(reportTitle, 14, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(211, 224, 239);
  const period = `${MONTHS[roster.month - 1] || String(roster.month).padStart(2, '0')} ${roster.year}`;
  doc.text(period, pageWidth - 14, 36, { align: 'right' });
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 42, { align: 'right' });
}

function drawContinuationHeader(doc: jsPDF, pageWidth: number, titleLabel: string) {
  fill(doc, COLOR.navy950);
  doc.rect(0, 0, pageWidth, 18, 'F');
  drawTopAccent(doc, pageWidth);
  drawBrandIcon(doc, 14, 5, 9);
  text(doc, COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(CREWCHECK_BRAND.name, 26, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(205, 239, 255);
  doc.text(titleLabel, pageWidth - 14, 12, { align: 'right' });
}

function sectionHeading(doc: jsPDF, y: number, titleLabel: string, accent: RGB = COLOR.violet): number {
  fill(doc, accent);
  doc.roundedRect(14, y - 3.8, 3, 9, 1.5, 1.5, 'F');
  text(doc, COLOR.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.text(titleLabel, 22, y + 2);
  return y + 7;
}

function ensureSpace(doc: jsPDF, y: number, needed: number, pageWidth: number, continuationTitle: string): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - 20) return y;
  doc.addPage();
  drawContinuationHeader(doc, pageWidth, continuationTitle);
  return 27;
}

function drawCrewCard(doc: jsPDF, pageWidth: number, y: number, roster: CrewRoster, compliance: ComplianceResult): number {
  fill(doc, COLOR.surface);
  stroke(doc, COLOR.line);
  doc.roundedRect(14, y, pageWidth - 28, 29, 4, 4, 'FD');
  fill(doc, COLOR.violet);
  doc.roundedRect(14, y, 3, 29, 1.5, 1.5, 'F');

  text(doc, COLOR.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(String(roster.crewName || 'Tripulante'), 22, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  text(doc, COLOR.muted);
  doc.text(`${roster.rank || 'Função não informada'} · Base ${roster.base || 'não informada'}`, 22, y + 16);
  doc.text(`ACT: ${compliance.legalProfile.actName} · ${compliance.legalProfile.roleLabel} / ${compliance.legalProfile.functionLabel}`, 22, y + 23);

  fill(doc, COLOR.cyanSoft);
  doc.roundedRect(pageWidth - 63, y + 6, 49, 17, 3, 3, 'F');
  text(doc, COLOR.navy800);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('PERÍODO ANALISADO', pageWidth - 58, y + 12);
  doc.setFontSize(11);
  doc.text(`${String(roster.month).padStart(2, '0')}/${roster.year}`, pageWidth - 58, y + 19);
  return y + 36;
}

function drawKpiCard(doc: jsPDF, x: number, y: number, width: number, label: string, value: string, accent: RGB, surfaceColor: RGB) {
  fill(doc, surfaceColor);
  stroke(doc, COLOR.line);
  doc.roundedRect(x, y, width, 22, 3.5, 3.5, 'FD');
  fill(doc, accent);
  doc.roundedRect(x, y, 3, 22, 1.5, 1.5, 'F');
  text(doc, COLOR.muted);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(label.toUpperCase(), x + 8, y + 8);
  text(doc, COLOR.text);
  doc.setFontSize(13);
  doc.text(value, x + 8, y + 17);
}

function premiumTableDefaults(headColor: RGB) {
  return {
    theme: 'grid' as const,
    headStyles: {
      fillColor: headColor,
      textColor: COLOR.white,
      fontStyle: 'bold' as const,
      fontSize: 8.5,
      cellPadding: 2.8,
      lineColor: headColor,
    },
    bodyStyles: {
      textColor: COLOR.text,
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: COLOR.line,
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: COLOR.surface },
    margin: { left: 14, right: 14, top: 22, bottom: 18 },
    tableLineColor: COLOR.line,
    tableLineWidth: 0.2,
  };
}

function addDocumentFooter(doc: jsPDF, pageWidth: number) {
  const totalPages = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    stroke(doc, COLOR.line);
    doc.setLineWidth(0.25);
    doc.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);

    fill(doc, COLOR.violet);
    doc.rect(14, pageHeight - 13.2, 16, 1.1, 'F');
    fill(doc, COLOR.magenta);
    doc.rect(30, pageHeight - 13.2, 16, 1.1, 'F');
    fill(doc, COLOR.cyan);
    doc.rect(46, pageHeight - 13.2, 16, 1.1, 'F');

    drawBrandIcon(doc, 14, pageHeight - 11, 6);
    text(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`${CREWCHECK_BRAND.name} · Relatório Premium`, 23, pageHeight - 7);
    doc.text(`Página ${page}/${totalPages}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }
}

export function exportReport(
  roster: CrewRoster,
  compliance: ComplianceResult,
  gymRecommendations: GymRecommendation[],
): CrewCheckPdfExportResult {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const pageWidth = doc.internal.pageSize.getWidth();

  const irregularities = compliance.alerts.filter((alert) => alert.severity === 'error');
  const warnings = compliance.alerts.filter((alert) => alert.severity === 'warning');

  drawMainHeader(doc, pageWidth, roster, 'Relatório Premium de Conformidade da Escala');

  let y = drawCrewCard(doc, pageWidth, 56, roster, compliance);
  const cardGap = 4;
  const cardWidth = (pageWidth - 28 - cardGap * 2) / 3;
  drawKpiCard(doc, 14, y, cardWidth, 'Conformidade', `${compliance.score}/100`, COLOR.violet, COLOR.lavender);
  drawKpiCard(doc, 14 + cardWidth + cardGap, y, cardWidth, 'Irregularidades', String(irregularities.length), irregularities.length ? COLOR.red : COLOR.green, irregularities.length ? COLOR.pink : COLOR.cyanSoft);
  drawKpiCard(doc, 14 + (cardWidth + cardGap) * 2, y, cardWidth, 'Pontos de atenção', String(warnings.length), warnings.length ? COLOR.amber : COLOR.green, warnings.length ? [255, 247, 237] : COLOR.cyanSoft);
  y += 31;

  if (irregularities.length > 0) {
    y = sectionHeading(doc, y, `Irregularidades confirmadas (${irregularities.length})`, COLOR.red);
    autoTable(doc, {
      startY: y,
      head: [['Problema', 'Descrição', 'Base legal']],
      body: irregularities.map((item) => [item.title, item.description, item.legalReference || '-']),
      ...premiumTableDefaults(COLOR.red),
      columnStyles: {
        0: { cellWidth: 43, fontStyle: 'bold' },
        1: { cellWidth: 88 },
        2: { cellWidth: 47 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (warnings.length > 0) {
    y = ensureSpace(doc, y, 42, pageWidth, 'Pontos de atenção');
    y = sectionHeading(doc, y, `Pontos de atenção (${warnings.length})`, COLOR.amber);
    autoTable(doc, {
      startY: y,
      head: [['Ponto', 'Descrição', 'Base legal']],
      body: warnings.map((item) => [item.title, item.description, item.legalReference || '-']),
      ...premiumTableDefaults(COLOR.amber),
      columnStyles: {
        0: { cellWidth: 43, fontStyle: 'bold' },
        1: { cellWidth: 88 },
        2: { cellWidth: 47 },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  if (irregularities.length === 0 && warnings.length === 0) {
    fill(doc, COLOR.cyanSoft);
    stroke(doc, COLOR.cyan);
    doc.roundedRect(14, y, pageWidth - 28, 18, 4, 4, 'FD');
    text(doc, COLOR.green);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('Escala conforme - nenhuma irregularidade ativa encontrada.', 22, y + 11.5);
    y += 27;
  }

  y = ensureSpace(doc, y, 64, pageWidth, 'Métricas regulatórias');
  y = sectionHeading(doc, y, 'Métricas regulatórias', COLOR.violet);
  const metricsData = [
    ['Horas de voo', `${compliance.metrics.totalFlightHours.toFixed(0)}h`, `${compliance.legalProfile.flightLimit28Days}h/28d`, compliance.legalProfile.actName],
    ['Horas de trabalho', `${compliance.metrics.totalDutyHours.toFixed(0)}h`, '176h (máx.)', 'Art. 41 - Lei 13.475'],
    ['Folgas no mês', `${compliance.metrics.totalDaysOff} dias`, `${compliance.metrics.minDaysOffRequired} parâmetro / 9 atenção`, compliance.legalProfile.actName],
    ['Sobreavisos', `${compliance.metrics.totalStandby}`, `${compliance.metrics.maxStandbyMonth} máx.`, compliance.legalProfile.actName],
    ['Operações na madrugada', `${compliance.metrics.nightOperations}`, `${compliance.metrics.maxNightOps168h} por 168h`, compliance.legalProfile.actName],
    ['Folgas em fim de semana', `${compliance.metrics.weekendPairs} dia(s)`, '2 (mín.)', 'Art. 51 - Lei 13.475'],
  ];
  autoTable(doc, {
    startY: y,
    head: [['Métrica', 'Valor', 'Limite', 'Base legal']],
    body: metricsData,
    ...premiumTableDefaults(COLOR.navy800),
    columnStyles: { 0: { fontStyle: 'bold' }, 1: { cellWidth: 28 }, 2: { cellWidth: 35 }, 3: { cellWidth: 49 } },
  });

  doc.addPage();
  drawContinuationHeader(doc, pageWidth, 'Timeline da escala');
  y = sectionHeading(doc, 28, 'Timeline da escala', COLOR.magenta);
  const timelineData = roster.days.map((day) => {
    let details = '';
    if (day.type === 'VOO' && day.legs?.length) details = day.legs.map((leg) => `${leg.origin}-${leg.destination}`).join(', ');
    else if (['HSB', 'HSBE'].includes(day.type)) details = `Sobreaviso ${day.dutyReport || ''} - ${day.dutyDebrief || ''}`;
    else if (day.type === 'ASB') details = `Reserva aeroportuária ${day.dutyReport || ''} - ${day.dutyDebrief || ''}`;
    else if (day.type === 'LAYOVER') details = `Pernoite ${day.hotel || ''}`.trim();
    else if (day.type === 'OFF') details = 'Folga / repouso';
    return [
      day.date,
      day.dayOfWeek,
      day.type,
      day.dutyReport || '-',
      day.dutyDebrief || '-',
      day.dutyHours ? `${day.dutyHours.toFixed(1)}h` : '-',
      details,
    ];
  });
  autoTable(doc, {
    startY: y,
    head: [['Data', 'Dia', 'Tipo', 'Início', 'Fim', 'Jornada', 'Detalhes']],
    body: timelineData,
    ...premiumTableDefaults(COLOR.magenta),
    headStyles: { ...premiumTableDefaults(COLOR.magenta).headStyles, fontSize: 7.8 },
    bodyStyles: { ...premiumTableDefaults(COLOR.magenta).bodyStyles, fontSize: 7.1 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 12 },
      2: { cellWidth: 16, fontStyle: 'bold' },
      3: { cellWidth: 15 },
      4: { cellWidth: 15 },
      5: { cellWidth: 17 },
      6: { cellWidth: 'auto' },
    },
  });

  doc.addPage();
  drawContinuationHeader(doc, pageWidth, 'Planejamento de bem-estar');
  y = sectionHeading(doc, 28, 'Planejamento de academia e bem-estar', COLOR.cyan);
  if (gymRecommendations.length) {
    const gymData = gymRecommendations.map((recommendation) => {
      const status = recommendation.availability === 'ideal' ? 'IDEAL'
        : recommendation.availability === 'good' ? 'BOM'
        : recommendation.availability === 'moderate' ? 'MODERADO'
        : 'LIMITADO';
      return [
        recommendation.date,
        recommendation.dayType,
        status,
        recommendation.suggestedTime || `${recommendation.startTime}-${recommendation.endTime}`,
        recommendation.suggestedDuration,
        recommendation.reason,
      ];
    });
    autoTable(doc, {
      startY: y,
      head: [['Data', 'Dia', 'Status', 'Horário', 'Duração', 'Observação']],
      body: gymData,
      ...premiumTableDefaults(COLOR.cyan),
      headStyles: { ...premiumTableDefaults(COLOR.cyan).headStyles, textColor: COLOR.navy950 },
      bodyStyles: { ...premiumTableDefaults(COLOR.cyan).bodyStyles, fontSize: 7.3 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 15 },
        2: { cellWidth: 20, fontStyle: 'bold' },
        3: { cellWidth: 28 },
        4: { cellWidth: 20 },
        5: { cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        if (data.section !== 'body' || data.column.index !== 2) return;
        const cellText = String(data.cell.raw || '');
        if (cellText.includes('IDEAL') || cellText.includes('BOM')) data.cell.styles.textColor = COLOR.green;
        else if (cellText.includes('MODERADO')) data.cell.styles.textColor = COLOR.amber;
        else data.cell.styles.textColor = COLOR.red;
        data.cell.styles.fontStyle = 'bold';
      },
    });
  } else {
    fill(doc, COLOR.cyanSoft);
    stroke(doc, COLOR.cyan);
    doc.roundedRect(14, y, pageWidth - 28, 22, 4, 4, 'FD');
    text(doc, COLOR.muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Nenhuma janela de academia foi calculada para este período.', 22, y + 13);
  }

  addDocumentFooter(doc, pageWidth);

  const safeName = String(roster.crewName || 'Tripulante').split(' ')[0].replace(/[^A-Za-z0-9_-]/g, '') || 'Tripulante';
  const fileName = `CrewCheck_${MONTHS[roster.month - 1]}_${roster.year}_${safeName}.pdf`;
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  rememberLastPdfExport(fileName, blob);

  return {
    fileName,
    blob,
    url,
    sizeKb: Math.max(1, Math.round(blob.size / 1024)),
    createdAt: new Date().toISOString(),
    open: () => window.open(url, '_blank', 'noopener,noreferrer'),
    download: () => { triggerBlobDownload(blob, fileName); rememberLastPdfExport(fileName, blob); },
  };
}
