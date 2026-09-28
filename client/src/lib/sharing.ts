import type { CrewRoster } from './pdfParser';
import type { ComplianceResult } from './complianceEngine';
import { CREWCHECK_BRAND } from './brand';

/**
 * Generate a branded summary message for sharing.
 */
export function generateShareMessage(
  roster: CrewRoster,
  compliance: ComplianceResult,
): string {
  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  const statusText = compliance.overallStatus === 'violation'
    ? '🚨 IRREGULARIDADES ENCONTRADAS'
    : compliance.overallStatus === 'warning'
      ? '⚠️ PONTOS DE ATENÇÃO'
      : '✅ ESCALA CONFORME';

  const errors = compliance.alerts.filter((alert) => alert.severity === 'error').length;
  const warnings = compliance.alerts.filter((alert) => alert.severity === 'warning').length;
  const totalFlightHours = roster.days.reduce((sum, day) => sum + (day.flyingHours || 0), 0);
  const flightCount = roster.days.filter((day) => day.type === 'VOO').length;

  return `
✈️ *${CREWCHECK_BRAND.name} · Relatório Premium*

📅 ${monthNames[roster.month - 1]} ${roster.year}
👤 ${roster.crewName} (${roster.rank})
📍 Base ${roster.base}

${statusText}

📊 *Resumo da escala*
• Conformidade: ${compliance.score}/100
• Horas de voo: ${totalFlightHours.toFixed(1)}h
• Voos: ${flightCount}
• Irregularidades: ${errors}
• Pontos de atenção: ${warnings}

Analisado pelo CrewCheck
RBAC 117 · Lei 13.475/2017 · ACT aplicável
`.trim();
}

export function shareToWhatsApp(roster: CrewRoster, compliance: ComplianceResult) {
  const encoded = encodeURIComponent(generateShareMessage(roster, compliance));
  window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
}

export function shareToTelegram(roster: CrewRoster, compliance: ComplianceResult) {
  const encoded = encodeURIComponent(generateShareMessage(roster, compliance));
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

export async function copyToClipboard(roster: CrewRoster, compliance: ComplianceResult) {
  try {
    await navigator.clipboard.writeText(generateShareMessage(roster, compliance));
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
  return `Relatório Premium CrewCheck gerado: ${file.fileName}. O PDF utiliza a identidade visual oficial do sistema. Se o anexo não abrir automaticamente, procure o arquivo em Downloads/Arquivos do dispositivo.`;
}

export async function shareExportedPdfNative(file: ShareableExportFile, text?: string): Promise<'shared' | 'downloaded'> {
  const message = text || exportedFileMessage(file);
  const pdfFile = new File([file.blob], file.fileName, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (navigator.share && (!nav.canShare || nav.canShare({ files: [pdfFile] }))) {
    await navigator.share({ title: `${CREWCHECK_BRAND.name} · Relatório Premium`, text: message, files: [pdfFile] });
    return 'shared';
  }
  file.download?.();
  await copyTextSafe(message);
  return 'downloaded';
}

export async function shareExportedPdfToWhatsApp(file: ShareableExportFile): Promise<'shared' | 'opened'> {
  try {
    const result = await shareExportedPdfNative(file, `${CREWCHECK_BRAND.name} · segue meu relatório Premium em PDF: ${file.fileName}`);
    if (result === 'shared') return 'shared';
  } catch {}
  const message = encodeURIComponent(`✈️ CrewCheck · Relatório Premium\nPDF: ${file.fileName}\n\nO arquivo foi salvo em Downloads/Arquivos do dispositivo. Anexe o PDF nesta conversa.`);
  window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
  return 'opened';
}

export async function shareExportedPdfByEmail(file: ShareableExportFile, to?: string): Promise<'shared' | 'opened'> {
  try {
    const result = await shareExportedPdfNative(file, `${CREWCHECK_BRAND.name} · relatório Premium em PDF: ${file.fileName}`);
    if (result === 'shared') return 'shared';
  } catch {}
  const subject = encodeURIComponent(`${CREWCHECK_BRAND.name} · Relatório Premium · ${file.fileName}`);
  const body = encodeURIComponent(`Olá,\n\nSegue o relatório Premium ${file.fileName}, gerado no CrewCheck com a identidade visual oficial do sistema.\n\nO arquivo foi salvo em Downloads/Arquivos do dispositivo. Anexe o PDF a este e-mail antes de enviar.\n\nCrewCheck · Roster Intelligence`);
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
