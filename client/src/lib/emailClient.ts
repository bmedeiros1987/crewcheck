import { authFetch } from './authClient';
import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';
import { CREWCHECK_BRAND, crewCheckPublicAssetUrl } from './brand';

type PdfAttachment = {
  fileName: string;
  blob: Blob;
};

function actionableAlerts(compliance: ComplianceResult): any[] {
  const source = Array.isArray((compliance as any)?.alerts) ? (compliance as any).alerts : [];
  const seen = new Set<string>();
  return source.filter((alert: any) => {
    if (!alert || alert.dismissed || alert.falsePositive || alert.active === false) return false;
    const severity = String(alert.severity || '').toLowerCase();
    const title = String(alert.title || '').trim();
    const description = String(alert.description || '').trim();
    if (!['error', 'warning'].includes(severity) || (!title && !description)) return false;
    const signature = `${severity}|${title}|${description}|${String(alert.legalReference || '')}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      if (comma < 0) return reject(new Error('Não consegui preparar o PDF para envio.'));
      resolve(value.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('Não consegui ler o PDF para envio.'));
    reader.readAsDataURL(blob);
  });
}

export async function sendRosterByEmail(args: {
  to: string;
  roster: CrewRoster;
  compliance: ComplianceResult;
  gym: GymRecommendation[];
  attachment: PdfAttachment;
}): Promise<{ ok: boolean; provider?: string; message?: string; messageId?: string }> {
  const recipient = String(args.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) throw new Error('Informe um e-mail válido.');
  if (!args.attachment?.blob || args.attachment.blob.type && args.attachment.blob.type !== 'application/pdf') throw new Error('O anexo precisa ser um PDF.');
  if (args.attachment.blob.size > 20 * 1024 * 1024) throw new Error('O PDF ultrapassa 20 MB. Reduza o relatório antes de enviar.');

  const subject = `CrewCheck · Relatório Premium · ${args.roster.crewName} · ${String(args.roster.month).padStart(2, '0')}/${args.roster.year}`;
  const currentAlerts = actionableAlerts(args.compliance);
  const critical = currentAlerts.filter((alert) => alert.severity === 'error').length;
  const warnings = currentAlerts.filter((alert) => alert.severity === 'warning').length;
  const bestGym = args.gym.slice(0, 5).map((item) => `${item.date}: ${item.suggestedDuration} (${item.reason})`).join('\n');

  const message = [
    'CrewCheck · Relatório Premium de Escala',
    '',
    `Tripulante: ${args.roster.crewName}`,
    `Base: ${args.roster.base}`,
    `Período: ${String(args.roster.month).padStart(2, '0')}/${args.roster.year}`,
    `Conformidade: ${args.compliance.score}/100`,
    `Irregularidades: ${critical}`,
    `Pontos de atenção: ${warnings}`,
    `Escala puxada: ${args.compliance.loadAnalysis?.intensityScore ?? '-'} / 100`,
    '',
    'Resumo:',
    args.compliance.summary,
    '',
    bestGym ? `Melhores janelas de academia:\n${bestGym}` : 'Sem recomendação de academia disponível.',
    '',
    'O relatório completo, com a identidade visual oficial do CrewCheck, está anexado em PDF.',
    'Mensagem enviada de forma segura pelo CrewCheck.',
  ].join('\n');

  const contentBase64 = await blobToBase64(args.attachment.blob);
  return authFetch<{ ok: boolean; provider?: string; message?: string; messageId?: string }>('/api/email/share', {
    method: 'POST',
    body: JSON.stringify({
      to: recipient,
      subject,
      message,
      html: buildHtml(args, message),
      attachment: {
        fileName: String(args.attachment.fileName || 'CrewCheck.pdf').replace(/[^A-Za-z0-9._-]+/g, '_'),
        mimeType: 'application/pdf',
        contentBase64,
      },
    }),
  });
}

function metricCard(label: string, value: string, tone: 'violet' | 'pink' | 'cyan'): string {
  const tones = {
    violet: { background: '#F6F1FF', border: '#D8C2FF', accent: '#9A4DFF' },
    pink: { background: '#FFF1F7', border: '#FFC7DF', accent: '#C83E5A' },
    cyan: { background: '#ECFBFF', border: '#BCEEF8', accent: '#16865A' },
  } as const;
  const palette = tones[tone];
  return `<td width="33.33%" valign="top" style="padding:6px">
    <div style="background:${palette.background};border:1px solid ${palette.border};border-radius:16px;padding:15px 14px;min-height:68px">
      <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#5D7083">${escapeHtml(label)}</div>
      <div style="font-size:25px;line-height:1.15;font-weight:800;color:${palette.accent};margin-top:7px">${escapeHtml(value)}</div>
    </div>
  </td>`;
}

function listItems(items: any[], emptyText: string): string {
  if (!items.length) return `<div style="padding:14px 16px;background:#ECFBFF;border:1px solid #BCEEF8;border-radius:16px;color:#16865A;font-weight:700">${escapeHtml(emptyText)}</div>`;
  return `<div style="border:1px solid #DCE6F0;border-radius:16px;overflow:hidden">${items.map((item, index) => `
    <div style="padding:14px 16px;background:${index % 2 ? '#F8FAFF' : '#FFFFFF'};border-bottom:${index === items.length - 1 ? '0' : '1px solid #E8EEF5'}">
      <div style="font-weight:800;color:#071D33">${escapeHtml(item.title || item.date || 'Item')}</div>
      <div style="font-size:13px;line-height:1.55;color:#5D7083;margin-top:4px">${escapeHtml(item.description || `${item.suggestedDuration || ''}${item.reason ? ` · ${item.reason}` : ''}`)}</div>
    </div>`).join('')}</div>`;
}

function buildHtml(args: { roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[] }, message: string): string {
  const currentAlerts = actionableAlerts(args.compliance);
  const critical = currentAlerts.filter((alert) => alert.severity === 'error');
  const warnings = currentAlerts.filter((alert) => alert.severity === 'warning');
  const logoUrl = crewCheckPublicAssetUrl(CREWCHECK_BRAND.iconPath);
  const period = `${String(args.roster.month).padStart(2, '0')}/${args.roster.year}`;
  const alertItems = [...critical, ...warnings].slice(0, 10);
  const gymItems = args.gym.slice(0, 8).map((item) => ({
    title: `${item.date} · ${item.suggestedDuration}`,
    description: item.reason,
  }));

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(CREWCHECK_BRAND.name)} · Relatório Premium</title>
</head>
<body style="margin:0;padding:0;background:#F4F3FB;color:#071D33;font-family:Inter,Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Relatório premium da escala de ${escapeHtml(args.roster.crewName)} · ${period}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F3FB;padding:24px 10px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:720px;background:#FFFFFF;border:1px solid #E1E7F0;border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(7,29,51,.14)">
        <tr><td style="height:5px;background:linear-gradient(90deg,#9A4DFF 0%,#EC2C86 52%,#27C3E8 100%)"></td></tr>
        <tr><td style="background:#020817;padding:26px 28px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="72" valign="middle"><img src="${escapeHtml(logoUrl)}" width="58" height="58" alt="CrewCheck" style="display:block;border:0;border-radius:16px;width:58px;height:58px"></td>
              <td valign="middle">
                <div style="font-size:27px;line-height:1;font-weight:850;color:#FFFFFF;letter-spacing:-.03em">CrewCheck</div>
                <div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#BCEEF8;margin-top:8px">Roster Intelligence</div>
              </td>
              <td valign="middle" align="right" style="color:#DCE6F0;font-size:12px;line-height:1.5">
                <strong style="color:#FFFFFF">${period}</strong><br>
                Base ${escapeHtml(args.roster.base || 'não informada')}
              </td>
            </tr>
          </table>
          <div style="margin-top:24px;color:#FFFFFF;font-size:24px;font-weight:800;letter-spacing:-.02em">Relatório Premium de Escala</div>
          <div style="margin-top:7px;color:#C9D7E6;font-size:14px">${escapeHtml(args.roster.crewName)} · análise regulatória e operacional</div>
        </td></tr>
        <tr><td style="padding:22px 22px 6px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            ${metricCard('Conformidade', `${args.compliance.score}/100`, 'violet')}
            ${metricCard('Irregularidades', String(critical.length), 'pink')}
            ${metricCard('Bem-estar', String(args.gym.length), 'cyan')}
          </tr></table>
        </td></tr>
        <tr><td style="padding:18px 28px 8px">
          <div style="font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#9A4DFF">Resumo executivo</div>
          <div style="margin-top:10px;padding:18px;background:#F8FAFF;border:1px solid #DCE6F0;border-radius:18px;font-size:14px;line-height:1.7;color:#334A5F">${escapeHtml(args.compliance.summary)}</div>
        </td></tr>
        <tr><td style="padding:18px 28px 8px">
          <div style="font-size:18px;font-weight:850;color:#071D33;margin-bottom:12px">Alertas principais</div>
          ${listItems(alertItems, 'Nenhum alerta ativo foi encontrado nesta análise.')}
        </td></tr>
        <tr><td style="padding:18px 28px 24px">
          <div style="font-size:18px;font-weight:850;color:#071D33;margin-bottom:12px">Academia e bem-estar</div>
          ${listItems(gymItems, 'Nenhuma janela de academia foi calculada para este período.')}
        </td></tr>
        <tr><td style="padding:0 28px 26px">
          <div style="padding:16px 18px;background:#020817;border-radius:18px;color:#DCE6F0;font-size:12px;line-height:1.65">
            O relatório completo está anexado em PDF e segue a identidade visual oficial do CrewCheck.<br>
            <span style="color:#9EE7FF">RBAC 117 · Lei 13.475/2017 · ACT aplicável</span>
          </div>
        </td></tr>
        <tr><td style="background:#F8FAFF;border-top:1px solid #E1E7F0;padding:18px 28px;color:#5D7083;font-size:11px;line-height:1.6">
          Enviado com segurança pelo <strong style="color:#071D33">CrewCheck</strong>. Este e-mail acompanha o PDF oficial gerado pelo sistema.<br>
          <span style="color:#8A9AAA">Versão em texto para acessibilidade:</span><br>
          <span style="white-space:pre-line">${escapeHtml(message)}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character] || character));
}
