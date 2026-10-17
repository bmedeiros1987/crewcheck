// Projection only. No scheduling, delivery, local storage or provider calls.
export function wakeDiagnosticLines(payload) {
  const unavailable = ['Diagnóstico indisponível. Não foi possível confirmar o estado do Wake.'];
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!record(payload)) return unavailable;
  const wake = payload.wake;
  if (!record(wake)) return unavailable;
  if (payload?.ok !== true || payload?.observational !== true || wake?.scope !== 'current_account_wake_history' || !['absent', 'recorded'].includes(wake.status) || !Array.isArray(wake.counts)) return unavailable;
  const labels = {
    pending: 'Agendado no servidor', processing: 'Em processamento', dispatching: 'Envio em andamento',
    sent: 'Aceito pelo provedor; entrega não confirmada', failed: 'Falha no envio',
    expired: 'Prazo de envio expirado', uncertain: 'Resultado do envio incerto',
    cancelled: 'Cancelado', partial: 'Envio parcial; entrega não confirmada', held: 'Retido',
  };
  if (Array.from(wake.counts).some(row => !record(row) || !Object.hasOwn(row, 'status') || !Object.hasOwn(row, 'total') || !Number.isSafeInteger(row.total) || row.total <= 0 || typeof row.status !== 'string' || !Object.hasOwn(labels, row.status))) return unavailable;
  if (wake.status === 'absent' && wake.counts.length) return unavailable;
  if (wake.status === 'recorded' && !wake.counts.length) return unavailable;
  if (!wake.counts.length) return ['Não agendado: nenhum registro de Wake nesta conta.'];
  const lines = wake.counts.map(row => `${Object.hasOwn(labels, row.status) ? labels[row.status] : 'Diagnóstico indisponível'}: ${row.total}`);
  if (wake.counts.every(row => Object.hasOwn(labels, row.status)) && !wake.counts.some(row => ['pending', 'processing', 'dispatching'].includes(row.status))) lines.unshift('Nenhum Wake agendado ou em envio nesta conta.');
  return lines;
}
