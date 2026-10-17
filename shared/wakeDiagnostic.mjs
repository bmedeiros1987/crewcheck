// Projection only. No scheduling, delivery, local storage or provider calls.
export function wakeDiagnosticLines(payload) {
  const unavailable = ['Diagnóstico indisponível. Não foi possível confirmar o estado do Wake.'];
  const wake = payload?.wake;
  if (payload?.ok !== true || payload?.observational !== true || wake?.scope !== 'current_account_wake_history' || !['absent', 'recorded'].includes(wake.status) || !Array.isArray(wake.counts)) return unavailable;
  const labels = {
    pending: 'Agendado no servidor', processing: 'Em processamento', dispatching: 'Envio em andamento',
    sent: 'Aceito pelo provedor; entrega não confirmada', failed: 'Falha no envio',
    expired: 'Prazo de envio expirado', uncertain: 'Resultado do envio incerto',
    cancelled: 'Cancelado', partial: 'Envio parcial; entrega não confirmada', held: 'Retido',
  };
  if (wake.counts.some(row => !Number.isSafeInteger(row.total) || row.total <= 0 || typeof row.status !== 'string')) return unavailable;
  if (wake.status === 'absent' && wake.counts.length) return unavailable;
  if (wake.status === 'recorded' && !wake.counts.length) return unavailable;
  if (!wake.counts.length) return ['Não agendado: nenhum registro de Wake nesta conta.'];
  const lines = wake.counts.map(row => `${labels[row.status] || 'Estado desconhecido; diagnóstico indisponível'}: ${row.total}`);
  if (wake.counts.every(row => Object.hasOwn(labels, row.status)) && !wake.counts.some(row => ['pending', 'processing', 'dispatching'].includes(row.status))) lines.unshift('Nenhum Wake agendado ou em envio nesta conta.');
  return lines;
}
