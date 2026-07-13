import { authFetch } from './authClient';
import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';

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

  const subject = `CrewCheck · ${args.roster.crewName} · ${String(args.roster.month).padStart(2, '0')}/${args.roster.year}`;
  const currentAlerts = actionableAlerts(args.compliance);
  const critical = currentAlerts.filter((alert) => alert.severity === 'error').length;
  const warnings = currentAlerts.filter((alert) => alert.severity === 'warning').length;
  const bestGym = args.gym.slice(0, 5).map((item) => `${item.date}: ${item.suggestedDuration} (${item.reason})`).join('\n');

  const message = [
    'Relatório CrewCheck',
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
    'O relatório completo está anexado em PDF.',
    'Este e-mail foi enviado de forma segura pelo CrewCheck.',
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

function buildHtml(args: { roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[] }, message: string): string {
  const currentAlerts = actionableAlerts(args.compliance);
  const critical = currentAlerts.filter((a) => a.severity === 'error');
  const warnings = currentAlerts.filter((a) => a.severity === 'warning');
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#eef5f8;padding:24px;color:#092846">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 45px rgba(9,40,70,.12)">
      <div style="background:#092846;color:white;padding:24px">
        <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#9ee7ff">CrewCheck</div>
        <h1 style="margin:8px 0 0;font-size:24px">Relatório de escala</h1>
        <p style="margin:8px 0 0;color:#cdefff">${escapeHtml(args.roster.crewName)} · ${String(args.roster.month).padStart(2, '0')}/${args.roster.year}</p>
      </div>
      <div style="padding:24px">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
          <div style="background:#f4f9fc;border-radius:16px;padding:14px"><b>Conformidade</b><br><span style="font-size:24px">${args.compliance.score}/100</span></div>
          <div style="background:#fff7ed;border-radius:16px;padding:14px"><b>Irregularidades</b><br><span style="font-size:24px">${critical.length}</span></div>
          <div style="background:#f0fdf4;border-radius:16px;padding:14px"><b>Academia</b><br><span style="font-size:24px">${args.gym.length}</span></div>
        </div>
        <h2 style="margin-top:24px">Resumo</h2>
        <p style="line-height:1.6">${escapeHtml(args.compliance.summary)}</p>
        <h2>Alertas principais</h2>
        <ul>${[...critical, ...warnings].slice(0, 10).map((a) => `<li><b>${escapeHtml(a.title)}</b>: ${escapeHtml(a.description)}</li>`).join('') || '<li>Nenhum alerta principal.</li>'}</ul>
        <h2>Academia</h2>
        <ul>${args.gym.slice(0, 8).map((g) => `<li><b>${escapeHtml(g.date)}</b>: ${escapeHtml(g.suggestedDuration)} · ${escapeHtml(g.reason)}</li>`).join('') || '<li>Sem janelas recomendadas.</li>'}</ul>
        <pre style="white-space:pre-wrap;background:#f8fafc;border-radius:16px;padding:16px;color:#334155">${escapeHtml(message)}</pre>
      </div>
    </div>
  </div>`;
}

function escapeHtml(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch] || ch));
}
