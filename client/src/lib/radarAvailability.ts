export type RadarUnavailable = { ok: false; querySuppressed: boolean; queryReason: string; httpStatus: number; quality: 0; message: string };
const reasons: Record<string, string> = {
  'account-unverified': 'Entre na conta para vincular o voo à programação publicada.',
  'session-expired': 'Sua sessão expirou. Entre novamente para consultar este voo.',
  'access-denied': 'Esta conta não tem acesso a esta consulta.',
  'backend-unavailable': 'O serviço está indisponível. Tente novamente mais tarde.',
  'occurrence-unverified': 'O voo ainda não foi vinculado à programação publicada desta conta.',
  'origin-timezone-unverified': 'O fuso do aeroporto de origem ainda não foi confirmado.',
  'outside-published-flight-day': 'O Radar está disponível apenas no dia local do voo publicado.',
  'published-instant-unverified': 'O horário publicado do voo ainda não foi confirmado.',
  'published-instant-date-mismatch': 'A data e o horário publicado do voo não correspondem.',
  'response-context-expired': 'A conta, a data ou a ocorrência mudou durante a consulta. Atualize a programação.',
  'response-occurrence-changed': 'A programação publicada mudou durante a consulta.',
  'provider-unavailable': 'Nenhuma fonte confirmou esta ocorrência de voo.',
};
export function radarFailurePayload(error: unknown): RadarUnavailable {
  const failure = error as { status?: number; payload?: { ok?: boolean; querySuppressed?: boolean; queryReason?: string } } | null;
  const status = typeof failure?.status === 'number' ? failure.status : 0;
  const payload = status === 200 && failure?.payload?.ok === false ? failure.payload : null;
  const reason = status === 401 ? 'session-expired' : status === 403 ? 'access-denied'
    : status === 0 || status >= 500 ? 'backend-unavailable'
    : payload && /^[a-z0-9-]{1,80}$/.test(payload.queryReason || '') ? payload.queryReason! : 'provider-unavailable';
  // Negative transport/domain replies carry no gate, source identity or receipt.
  return { ok:false, querySuppressed:payload?.querySuppressed === true || !payload, queryReason:reason, httpStatus:status, quality:0,
    message:reasons[reason] || 'A consulta desta ocorrência está pendente de confirmação.' };
}
export function radarAvailabilityLabel(state: { querySuppressed?: boolean; queryReason?: string; httpStatus?: number } | null): string {
  if (state?.httpStatus === 401 || state?.queryReason === 'session-expired' || state?.queryReason === 'account-unverified') return 'Sessão necessária';
  if (state?.httpStatus === 403) return 'Acesso indisponível';
  if (state?.queryReason === 'backend-unavailable') return 'Serviço indisponível';
  return state?.querySuppressed ? 'Consulta suspensa' : 'Radar aguardando fonte';
}
