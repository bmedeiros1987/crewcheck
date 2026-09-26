/**
 * Erros do Hub com codigo estavel + mensagem amigavel em pt-BR.
 *
 * A TV mostra `message` direto na tela, entao nada de stack trace, nome de
 * entidade cru ou texto em ingles vindo do Home Assistant. `hint` e opcional
 * e serve para quem esta configurando o Hub.
 */

export class HubError extends Error {
  constructor(code, message, { status = 500, hint = null, details = null, cause = null } = {}) {
    super(message);
    this.name = 'HubError';
    this.code = code;
    this.status = status;
    this.friendlyMessage = message;
    this.hint = hint;
    this.details = details;
    if (cause) this.cause = cause;
  }

  toJSON() {
    const payload = { code: this.code, message: this.friendlyMessage };
    if (this.hint) payload.hint = this.hint;
    if (this.details) payload.details = this.details;
    return payload;
  }
}

export const ERRORS = {
  hubNotConfigured: () => new HubError(
    'hub_not_configured',
    'O Hub ainda nao esta ligado ao Home Assistant.',
    { status: 503, hint: 'Defina HA_BASE_URL e HA_TOKEN no ambiente do Hub.' },
  ),
  haTimeout: (timeoutMs) => new HubError(
    'ha_timeout',
    'A casa demorou para responder. Tente de novo em instantes.',
    { status: 504, hint: `Sem resposta do Home Assistant em ${timeoutMs} ms.` },
  ),
  haUnreachable: (reason) => new HubError(
    'ha_unreachable',
    'Nao consegui falar com a casa agora.',
    { status: 502, hint: reason || 'Home Assistant inacessivel a partir do Hub.' },
  ),
  haUnauthorized: () => new HubError(
    'ha_unauthorized',
    'O Hub nao tem permissao na casa.',
    { status: 502, hint: 'O token do Home Assistant foi recusado (401/403). Gere um novo token de longa duracao.' },
  ),
  haError: (status) => new HubError(
    'ha_error',
    'A casa respondeu com um erro.',
    { status: 502, hint: `Home Assistant devolveu HTTP ${status}.` },
  ),
  entityNotFound: (label) => new HubError(
    'entity_not_found',
    `Nao encontrei "${label}" na casa.`,
    { status: 404, hint: 'A entidade nao existe no Home Assistant ou foi renomeada.' },
  ),
  entityUnavailable: (label) => new HubError(
    'entity_unavailable',
    `"${label}" esta indisponivel agora.`,
    { status: 409, hint: 'A entidade existe, mas o estado e unavailable/unknown. Costuma ser aparelho offline.' },
  ),
  serviceNotAllowed: (service) => new HubError(
    'service_not_allowed',
    'Essa acao nao e permitida pelo Hub.',
    { status: 403, hint: `O servico "${service}" esta fora da lista permitida.` },
  ),
  outputNotFound: (id) => new HubError(
    'output_not_found',
    'Essa saida de som nao existe.',
    { status: 404, hint: `Saida "${id}" nao esta configurada.` },
  ),
  outputCannotPlayLocal: (label, alternatives) => new HubError(
    'output_cannot_play_local',
    `${label} nao toca musica da biblioteca da casa.`,
    {
      status: 422,
      hint: 'Alexa nao reproduz MP3 local por play_media. Use a TV, uma radio TuneIn ou o Music Assistant.',
      details: { alternatives },
    },
  ),
  playMediaRejected: (label) => new HubError(
    'play_media_rejected',
    `${label} recusou tocar esse conteudo.`,
    { status: 422, hint: 'O media_player.play_media falhou. Conteudo nao suportado por esse aparelho.' },
  ),
  sourceUnavailable: (source) => new HubError(
    'source_unavailable',
    'Essa fonte de musica nao esta disponivel.',
    { status: 409, hint: `Fonte "${source}" nao configurada ou offline.` },
  ),
  actionNotConfigured: (action, key) => new HubError(
    'action_not_configured',
    'Essa acao ainda nao foi configurada na casa.',
    {
      status: 501,
      hint: `Defina homeActions.${action} no arquivo LAURINHA_HUB_CONFIG (chave esperada: ${key}).`,
    },
  ),
  badRequest: (message, hint = null) => new HubError(
    'bad_request', message, { status: 400, hint },
  ),
  unauthorized: () => new HubError(
    'unauthorized',
    'Chave do Hub ausente ou invalida.',
    { status: 401, hint: 'Envie o header X-Laurinha-Key com a bridge key configurada.' },
  ),
  mediaNotFound: () => new HubError(
    'media_not_found',
    'Nao encontrei esse arquivo na biblioteca.',
    { status: 404 },
  ),
  libraryUnavailable: (hint) => new HubError(
    'library_unavailable',
    'A biblioteca de musicas nao esta disponivel.',
    { status: 503, hint },
  ),
};

/** Garante que qualquer coisa lancada vire um HubError com mensagem amigavel. */
export function toHubError(error) {
  if (error instanceof HubError) return error;
  return new HubError(
    'internal_error',
    'Algo deu errado no Hub.',
    { status: 500, hint: 'Veja o log do Hub.', cause: error },
  );
}
