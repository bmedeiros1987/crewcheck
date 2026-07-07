import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';

/**
 * Generate a summary message for sharing
 */
export function generateShareMessage(
  roster: CrewRoster,
  compliance: ComplianceResult
): string {
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const statusText = 
    compliance.overallStatus === 'violation'
      ? '🚨 IRREGULARIDADES ENCONTRADAS'
      : compliance.overallStatus === 'warning'
      ? '⚠️ ATENÇÃO - Pontos de Atenção'
      : '✅ CONFORME com a legislação';

  const errors = compliance.alerts.filter(a => a.severity === 'error').length;
  const warnings = compliance.alerts.filter(a => a.severity === 'warning').length;

  // Calculate flight hours and count from roster days
  const totalFlightHours = roster.days.reduce((sum, day) => sum + (day.flyingHours || 0), 0);
  const flightCount = roster.days.filter(d => d.type === 'VOO').length;

  const message = `
*CrewCheck - Análise de Escala*

📅 ${monthNames[roster.month - 1]} ${roster.year}
👤 ${roster.crewName} (${roster.rank})
✈️ Base ${roster.base}

${statusText}

📊 Resumo:
• Horas de voo: ${totalFlightHours.toFixed(1)}h
• Voos: ${flightCount}
• Irregularidades: ${errors}
• Pontos de atenção: ${warnings}

Analisado com CrewCheck
Conformidade: RBAC 117 · Lei 13.475/2017
`.trim();

  return message;
}

/**
 * Share to WhatsApp
 */
export function shareToWhatsApp(roster: CrewRoster, compliance: ComplianceResult) {
  const message = generateShareMessage(roster, compliance);
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/?text=${encoded}`;
  window.open(url, '_blank');
}

/**
 * Share to Telegram
 */
export function shareToTelegram(roster: CrewRoster, compliance: ComplianceResult) {
  const message = generateShareMessage(roster, compliance);
  const encoded = encodeURIComponent(message);
  const appUrl = `tg://msg?text=${encoded}`;
  const webUrl = `https://t.me/share/url?url=&text=${encoded}`;
  try {
    const win = window.open(appUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => {
      try { if (!win || win.closed) window.open(webUrl, '_blank', 'noopener,noreferrer'); }
      catch { window.open(webUrl, '_blank', 'noopener,noreferrer'); }
    }, 650);
  } catch {
    window.open(webUrl, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Copy to clipboard
 */
export async function copyToClipboard(roster: CrewRoster, compliance: ComplianceResult) {
  const message = generateShareMessage(roster, compliance);
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    return false;
  }
}


export type ShareableExportFile = {
  fileName: string;
  blob: Blob;
  sizeKb?: number;
  open?: () => void;
  download?: () => void;
};

function exportedFileMessage(file: ShareableExportFile) {
  return `Relatório CrewCheck gerado: ${file.fileName}. Se o anexo não abrir automaticamente, procure o arquivo em Downloads/Arquivos do dispositivo.`;
}

export async function shareExportedPdfNative(file: ShareableExportFile, text?: string): Promise<'shared' | 'downloaded'> {
  const message = text || exportedFileMessage(file);
  const pdfFile = new File([file.blob], file.fileName, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (navigator.share && (!nav.canShare || nav.canShare({ files: [pdfFile] }))) {
    await navigator.share({ title: 'CrewCheck Premium', text: message, files: [pdfFile] });
    return 'shared';
  }
  file.download?.();
  await copyTextSafe(message);
  return 'downloaded';
}

export async function shareExportedPdfToWhatsApp(file: ShareableExportFile): Promise<'shared' | 'opened'> {
  try {
    const result = await shareExportedPdfNative(file, `CrewCheck Premium - segue meu relatório em PDF: ${file.fileName}`);
    if (result === 'shared') return 'shared';
  } catch {}
  const message = encodeURIComponent(`CrewCheck Premium\nPDF gerado: ${file.fileName}\n\nO arquivo foi salvo em Downloads/Arquivos do dispositivo. Anexe esse PDF nesta conversa.`);
  window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
  return 'opened';
}

export async function shareExportedPdfByEmail(file: ShareableExportFile, to?: string): Promise<'shared' | 'opened'> {
  try {
    const result = await shareExportedPdfNative(file, `CrewCheck Premium - relatório em PDF: ${file.fileName}`);
    if (result === 'shared') return 'shared';
  } catch {}
  const subject = encodeURIComponent(`CrewCheck Premium - ${file.fileName}`);
  const body = encodeURIComponent(`Olá,\n\nGerei o relatório ${file.fileName} no CrewCheck.\n\nO arquivo foi salvo em Downloads/Arquivos do dispositivo. Anexe esse PDF a este e-mail antes de enviar.\n\nCrewCheck Premium`);
  window.location.href = `mailto:${to || ''}?subject=${subject}&body=${body}`;
  return 'opened';
}

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
