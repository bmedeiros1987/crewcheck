// Mirrors the existing visitor server bounds; changing these is a security-policy decision.
export const VISITOR_PASSWORD_MIN = 10;
export const VISITOR_PASSWORD_MAX = 256;
export function visitorAccessError(reason: unknown): string {
  const error = reason as { status?: number; payload?: { code?: string }; message?: string };
  if (error?.status === 429 || error?.payload?.code === 'LOGIN_THROTTLED') return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  if (error?.payload?.code === 'OWNER_SELECTION_REQUIRED') return 'Escolha o titular para continuar.';
  if (error?.status === 401 || error?.status === 403) return 'Confira o e-mail e a senha. No primeiro acesso, use a senha temporária do convite.';
  return 'Não foi possível concluir. Tente novamente mais tarde.';
}
