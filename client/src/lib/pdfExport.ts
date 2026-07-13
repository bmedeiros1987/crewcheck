import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';

export type CrewCheckPdfExportResult = {
  fileName: string;
  blob: Blob;
  url: string;
  sizeKb: number;
  createdAt: string;
  open: () => void;
  download: () => void;
};

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
    }));
    window.dispatchEvent(new CustomEvent('crewcheck:export-created', { detail: { type: 'pdf', fileName } }));
  } catch {}
}


const CREWCHECK_LOGO_PNG_BASE64 = 'data:image/png;base64,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';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function exportReport(
  roster: CrewRoster,
  compliance: ComplianceResult,
  gymRecommendations: GymRecommendation[]
): CrewCheckPdfExportResult {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Derive irregularities and warnings from alerts
  const irregularities = compliance.alerts.filter(a => a.severity === 'error');
  const warnings = compliance.alerts.filter(a => a.severity === 'warning');
  
  // ============================================================
  // HEADER
  // ============================================================
  doc.setFillColor(27, 42, 74); // #1B2A4A
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  try {
    doc.addImage(CREWCHECK_LOGO_PNG_BASE64, 'PNG', 14, 8, 20, 20);
  } catch {}
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('CrewCheck', 39, 18);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatorio de Conformidade de Escala', 39, 26);
  doc.text('RBAC 117 - Lei 13.475/2017 - ACT aplicavel', 39, 33);
  
  // Date on right
  doc.setFontSize(9);
  const dateStr = `Gerado em ${new Date().toLocaleDateString('pt-BR')}`;
  doc.text(dateStr, pageWidth - 14, 33, { align: 'right' });
  
  // ============================================================
  // CREW INFO
  // ============================================================
  let y = 50;
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`${MONTHS[roster.month - 1]} ${roster.year}`, 14, y);
  
  y += 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${roster.crewName} - ${roster.rank} - Base ${roster.base}`, 14, y);
  y += 7;
  doc.setFontSize(9);
  doc.text(`ACT: ${compliance.legalProfile.actName} | Funcao: ${compliance.legalProfile.roleLabel} / ${compliance.legalProfile.functionLabel}`, 14, y);
  y += 5;
  doc.text(`Limite voo: ${compliance.legalProfile.flightLimit28Days}h/28d e ${compliance.legalProfile.flightLimit365Days}h/365d | Equipamento: ${compliance.legalProfile.aircraftGroupLabel}`, 14, y);
  
  // ============================================================
  // SCORE SUMMARY
  // ============================================================
  y += 12;
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(14, y, pageWidth - 28, 20, 3, 3, 'F');
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(27, 42, 74);
  
  const scoreX = 30;
  const irregX = 80;
  const alertX = 130;
  
  doc.text(`Score: ${compliance.score}`, scoreX, y + 13);
  
  const irregColor = irregularities.length > 0 ? [211, 47, 47] : [46, 125, 50];
  doc.setTextColor(irregColor[0], irregColor[1], irregColor[2]);
  doc.text(`Irregularidades: ${irregularities.length}`, irregX, y + 13);
  
  const alertColor = warnings.length > 0 ? [245, 124, 0] : [46, 125, 50];
  doc.setTextColor(alertColor[0], alertColor[1], alertColor[2]);
  doc.text(`Alertas: ${warnings.length}`, alertX, y + 13);
  
  // ============================================================
  // IRREGULARITIES
  // ============================================================
  y += 30;
  if (irregularities.length > 0) {
    doc.setTextColor(211, 47, 47);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`IRREGULARIDADES (${irregularities.length})`, 14, y);
    y += 4;
    
    const irregData = irregularities.map(item => [
      item.title,
      item.description,
      item.legalReference || '-'
    ]);
    
    autoTable(doc, {
      startY: y,
      head: [['Problema', 'Descricao', 'Base Legal']],
      body: irregData,
      theme: 'striped',
      headStyles: { fillColor: [211, 47, 47], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 45, fontStyle: 'bold' },
        1: { cellWidth: 80 },
        2: { cellWidth: 45 }
      },
      margin: { left: 14, right: 14 }
    });
    
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // ============================================================
  // WARNINGS
  // ============================================================
  if (warnings.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    
    doc.setTextColor(245, 124, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`PONTOS DE ATENCAO (${warnings.length})`, 14, y);
    y += 4;
    
    const warnData = warnings.map(item => [
      item.title,
      item.description,
      item.legalReference || '-'
    ]);
    
    autoTable(doc, {
      startY: y,
      head: [['Ponto', 'Descricao', 'Base Legal']],
      body: warnData,
      theme: 'striped',
      headStyles: { fillColor: [245, 124, 0], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 45, fontStyle: 'bold' },
        1: { cellWidth: 80 },
        2: { cellWidth: 45 }
      },
      margin: { left: 14, right: 14 }
    });
    
    y = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // If no irregularities and no warnings
  if (irregularities.length === 0 && warnings.length === 0) {
    doc.setTextColor(46, 125, 50);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('ESCALA CONFORME - Nenhuma irregularidade encontrada.', 14, y);
    y += 15;
  }
  
  // ============================================================
  // METRICS
  // ============================================================
  if (y > 220) { doc.addPage(); y = 20; }
  
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('METRICAS', 14, y);
  y += 4;
  
  const metricsData = [
    ['Horas de Voo', `${compliance.metrics.totalFlightHours.toFixed(0)}h`, `${compliance.legalProfile.flightLimit28Days}h/28d`, compliance.legalProfile.actName],
    ['Horas de Trabalho', `${compliance.metrics.totalDutyHours.toFixed(0)}h`, '176h (max)', 'Art. 41 - Lei 13.475'],
    ['Folgas no Mes', `${compliance.metrics.totalDaysOff} dias`, `${compliance.metrics.minDaysOffRequired} parametro / 9 atencao`, compliance.legalProfile.actName],
    ['Sobreavisos', `${compliance.metrics.totalStandby}`, `${compliance.metrics.maxStandbyMonth} max`, compliance.legalProfile.actName],
    ['Operacoes na Madrugada', `${compliance.metrics.nightOperations}`, `${compliance.metrics.maxNightOps168h} por 168h`, compliance.legalProfile.actName],
    ['Folgas em Fim de Semana', `${compliance.metrics.weekendPairs} dia(s)`, '2 (min)', 'Art. 51 - Lei 13.475'],
  ];
  
  autoTable(doc, {
    startY: y,
    head: [['Metrica', 'Valor', 'Limite', 'Base Legal']],
    body: metricsData,
    theme: 'striped',
    headStyles: { fillColor: [27, 42, 74], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 14, right: 14 }
  });
  
  y = (doc as any).lastAutoTable.finalY + 10;
  
  // ============================================================
  // TIMELINE
  // ============================================================
  doc.addPage();
  y = 20;
  
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('TIMELINE DA ESCALA', 14, y);
  y += 4;
  
  const timelineData = roster.days.map(day => {
    let details = '';
    if (day.type === 'VOO' && day.legs && day.legs.length > 0) {
      details = day.legs.map(l => `${l.origin}-${l.destination}`).join(', ');
    } else if (['HSB', 'HSBE'].includes(day.type)) {
      details = `Sobreaviso ${day.dutyReport || ''} - ${day.dutyDebrief || ''}`;
    } else if (['ASB'].includes(day.type)) {
      details = `Reserva aeroportuária ${day.dutyReport || ''} - ${day.dutyDebrief || ''}`;
    } else if (day.type === 'LAYOVER') {
      details = `Inativo/pernoite ${day.hotel || ''}`.trim();
    } else if (day.type === 'OFF') {
      details = 'Extensão de descanso/repouso';
    }
    return [
      day.date,
      day.dayOfWeek,
      day.type,
      day.dutyReport || '-',
      day.dutyDebrief || '-',
      day.dutyHours ? `${day.dutyHours.toFixed(1)}h` : '-',
      details
    ];
  });
  
  autoTable(doc, {
    startY: y,
    head: [['Data', 'Dia', 'Tipo', 'Inicio', 'Fim', 'Jornada', 'Detalhes']],
    body: timelineData,
    theme: 'striped',
    headStyles: { fillColor: [27, 42, 74], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 12 },
      2: { cellWidth: 15 },
      3: { cellWidth: 15 },
      4: { cellWidth: 15 },
      5: { cellWidth: 17 },
      6: { cellWidth: 'auto' }
    },
    margin: { left: 14, right: 14 }
  });
  
  // ============================================================
  // GYM RECOMMENDATIONS
  // ============================================================
  doc.addPage();
  y = 20;
  
  doc.setTextColor(27, 42, 74);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('PLANEJAMENTO DE ACADEMIA', 14, y);
  y += 4;
  
  const gymData = gymRecommendations.map(rec => {
    const status = rec.availability === 'ideal' ? 'IDEAL' : 
                   rec.availability === 'good' ? 'BOM' : 
                   rec.availability === 'moderate' ? 'MODERADO' : 'LIMITADO';
    return [
      rec.date,
      rec.dayType,
      status,
      rec.suggestedTime || `${rec.startTime}-${rec.endTime}`,
      rec.suggestedDuration,
      rec.reason
    ];
  });
  
  autoTable(doc, {
    startY: y,
    head: [['Data', 'Dia', 'Status', 'Horario', 'Duracao', 'Observacao']],
    body: gymData,
    theme: 'striped',
    headStyles: { fillColor: [27, 42, 74], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 12 },
      2: { cellWidth: 20 },
      3: { cellWidth: 28 },
      4: { cellWidth: 18 },
      5: { cellWidth: 'auto' }
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 2) {
        const cellText = data.cell.raw as string;
        if (cellText.includes('IDEAL') || cellText.includes('BOM')) {
          data.cell.styles.textColor = [46, 125, 50];
          data.cell.styles.fontStyle = 'bold';
        } else if (cellText.includes('MODERADO')) {
          data.cell.styles.textColor = [245, 124, 0];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [211, 47, 47];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    }
  });
  
  // ============================================================
  // FOOTER on all pages
  // ============================================================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `CrewCheck - Analise de Conformidade - Pagina ${i}/${totalPages}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }
  
  // Save / download with visible return information
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
