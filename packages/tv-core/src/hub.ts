// Cliente do Laurinha Connected Hub para a TV.
//
// Tres invariantes que este modulo sustenta, e que os testes cobrem:
//
//  1. A TV fala SO com o Hub. Nao existe caminho daqui para o Home Assistant,
//     e nao ha parametro para token de HA. O Hub e quem guarda esse token.
//  2. Nenhuma funcao lanca. Toda falha vira {ok:false, code, message} com
//     texto pronto para a tela. Hub fora do ar degrada a UI, nunca derruba.
//  3. So caminhos de uma lista fixa saem daqui. O CSP restringe por origem;
//     a lista restringe por rota, que o CSP nao sabe fazer.

import { bindFetch, classifyOrigin } from './net';

export type HubFailure = { ok: false; code: string; message: string };
export type HubSuccess<T> = { ok: true; value: T };
export type HubResult<T> = HubSuccess<T> | HubFailure;

/** Rotas que a TV tem permissao de chamar. Qualquer outra e recusada aqui. */
export const HUB_PATHS = {
  health: '/health',
  soundState: '/api/sound/state',
  soundPlay: '/api/sound/play',
  soundPause: '/api/sound/pause',
  soundStop: '/api/sound/stop',
  soundNext: '/api/sound/next',
  soundPrevious: '/api/sound/previous',
  soundVolume: '/api/sound/volume',
  soundOutput: '/api/sound/output',
  soundLibrary: '/api/sound/library',
  soundQueue: '/api/sound/queue',
  homeState: '/api/home/state',
  homeAction: '/api/home/action',
} as const;

const ALLOWED_PATHS: ReadonlySet<string> = new Set(Object.values(HUB_PATHS));
const MEDIA_PREFIX = '/api/media/';

function failure(code: string, message: string): HubFailure {
  return { ok: false, code, message };
}

export type HubOptions = {
  request?: typeof fetch;
  /** Chave da ponte do Hub. NAO e o token do Home Assistant. */
  bridgeKey?: string;
  timeoutMs?: number;
  now?: () => number;
};

export class HubClient {
  readonly origin: string;
  readonly configError: string | null;
  private readonly request: typeof fetch;
  private readonly bridgeKey: string;
  private readonly timeoutMs: number;

  constructor(rawOrigin: string, options: HubOptions = {}) {
    const verdict = classifyOrigin(rawOrigin);
    // Construtor nunca lanca: ele roda cedo no boot do app.
    this.configError = verdict.kind === 'rejected'
      ? (verdict.reason || 'Endereco do Hub invalido.')
      : null;
    this.origin = this.configError ? '' : verdict.origin;
    this.request = bindFetch(options.request || globalThis.fetch);
    this.bridgeKey = String(options.bridgeKey || '');
    this.timeoutMs = Math.min(Math.max(Number(options.timeoutMs) || 6000, 500), 30000);
  }

  get configured(): boolean {
    return !this.configError && Boolean(this.origin);
  }

  /**
   * URL de midia servida pelo Hub. Devolve null quando o Hub nao esta
   * configurado, para a UI cair no placeholder em vez de pedir uma URL quebrada.
   */
  mediaUrl(kind: 'track' | 'photo', id: string): string | null {
    if (!this.configured) return null;
    const safeId = String(id || '').trim();
    if (!safeId) return null;
    return `${this.origin}${MEDIA_PREFIX}${kind}/${encodeURIComponent(safeId)}`;
  }

  private async call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<HubResult<T>> {
    if (this.configError) return failure('HUB-CONFIG', 'O endereco do Hub nao esta configurado.');
    if (!ALLOWED_PATHS.has(path)) return failure('HUB-PATH', 'Essa rota do Hub nao e permitida pela TV.');

    const method = init?.method || 'GET';
    const headers: Record<string, string> = {};
    if (init?.body !== undefined) headers['Content-Type'] = 'application/json';
    // Unica credencial que a TV carrega. O token do Home Assistant fica no Hub.
    if (this.bridgeKey) headers['X-Laurinha-Key'] = this.bridgeKey;

    let response: Response;
    try {
      response = await this.request(`${this.origin}${path}`, {
        method,
        headers,
        cache: 'no-store',
        credentials: 'omit',
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = (error as { name?: string })?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        return failure('HUB-TIMEOUT', 'O Hub da casa demorou para responder.');
      }
      // Inclui bloqueio de CSP, DNS, recusa de conexao: tudo vira o mesmo
      // estado de UI, sem repassar a mensagem crua do motor.
      return failure('HUB-OFFLINE', 'Nao consegui falar com o Hub da casa.');
    }

    if (response.status === 401 || response.status === 403) {
      return failure('HUB-AUTH', 'A TV nao tem permissao no Hub da casa.');
    }
    if (!response.ok) {
      return failure(`HUB-HTTP-${response.status}`, 'O Hub da casa respondeu com erro.');
    }

    try {
      return { ok: true, value: (await response.json()) as T };
    } catch {
      return failure('HUB-JSON', 'O Hub da casa respondeu algo que eu nao entendi.');
    }
  }

  health() { return this.call<Record<string, unknown>>(HUB_PATHS.health); }
  soundState() { return this.call<Record<string, unknown>>(HUB_PATHS.soundState); }
  soundQueue() { return this.call<Record<string, unknown>>(HUB_PATHS.soundQueue); }
  soundLibrary() { return this.call<Record<string, unknown>>(HUB_PATHS.soundLibrary); }
  homeState() { return this.call<Record<string, unknown>>(HUB_PATHS.homeState); }

  pause() { return this.call(HUB_PATHS.soundPause, { method: 'POST', body: {} }); }
  play(payload: unknown = {}) { return this.call(HUB_PATHS.soundPlay, { method: 'POST', body: payload }); }
  next() { return this.call(HUB_PATHS.soundNext, { method: 'POST', body: {} }); }
  previous() { return this.call(HUB_PATHS.soundPrevious, { method: 'POST', body: {} }); }
  volume(payload: unknown) { return this.call(HUB_PATHS.soundVolume, { method: 'POST', body: payload }); }
  homeAction(action: string, params: unknown = {}) {
    return this.call(HUB_PATHS.homeAction, { method: 'POST', body: { action, params } });
  }

  /** Rota arbitraria, para deixar explicito que nao existe caminho livre. */
  rejectsArbitraryPath(path: string): boolean {
    return !ALLOWED_PATHS.has(path);
  }
}
