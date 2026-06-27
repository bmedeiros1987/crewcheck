import { authFetch } from './authClient';
import type { CrewRoster } from './pdfParser';
import type { ComplianceResult, GymRecommendation } from './complianceEngine';

export async function sendRosterByEmail(args: {
  to: string;
  roster: CrewRoster;
  compliance: ComplianceResult;
  gym: GymRecommendation[];
}): Promise<{ ok: boolean; provider?: string }> {
  const subject = `CrewCheck · ${args.roster.crewName} · ${String(args.roster.month).padStart(2, '0')}/${args.roster.year}`;
  const critical = args.compliance.alerts.filter((a) => a.severity === 'error').length;
  const warnings = args.compliance.alerts.filter((a) => a.severity === 'warning').length;
  const bestGym = args.gym.slice(0, 5).map((g) => `${g.date}: ${g.suggestedDuration} (${g.reason})`).join('\n');

  const message = [
    'Relatório CrewCheck Premium',
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
    'Este e-mail foi gerado automaticamente pelo CrewCheck Premium.',
  ].join('\n');

  return authFetch<{ ok: boolean; provider?: string }>('/api/email/share', {
    method: 'POST',
    body: JSON.stringify({
      to: args.to,
      subject,
      message,
      html: buildHtml(args, message),
    }),
  });
}

function buildHtml(args: { roster: CrewRoster; compliance: ComplianceResult; gym: GymRecommendation[] }, message: string): string {
  const critical = args.compliance.alerts.filter((a) => a.severity === 'error');
  const warnings = args.compliance.alerts.filter((a) => a.severity === 'warning');
  return `
  <div style="font-family:Inter,Arial,sans-serif;background:#eef5f8;padding:24px;color:#092846">
    <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 45px rgba(9,40,70,.12)">
      <div style="background:#092846;color:white;padding:24px">
        <div style="font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:#9ee7ff">CrewCheck Premium</div>
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
