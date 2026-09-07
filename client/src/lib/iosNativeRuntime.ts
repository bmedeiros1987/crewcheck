// CrewCheck — fundação iOS/TestFlight.
//
// Este runtime é um ADAPTADOR FINO. Ele não reimplementa nada do produto:
//
//   - a importação de PDF reutiliza o MESMO contrato já usado pelo Android e
//     pelo PWA (`crewcheck:native-pdf` + `window.__crewcheckPendingNativePdf`),
//     de modo que o parser AIMS, o canonicalRoster, a APZ e a segmentação de
//     jornadas seguem intocados — o PDF entra pelo `handleFile` existente;
//   - a superfície nativa reutiliza a fachada `window.CrewCheckNative` que o web
//     já consome (ver `crewcheckPremiumRuntime.ts`), então nenhum consumidor
//     precisa saber que está rodando no iOS.
//
// Regras de segurança adotadas aqui:
//   - nada é instalado fora de um host iOS nativo reconhecido;
//   - a fachada do Android NUNCA é sobrescrita;
//   - capacidade ausente responde `false`, jamais um comportamento simulado;
//   - nenhum conteúdo de PDF, token, caminho de arquivo ou dado de escala vai
//     para log.

export const IOS_SHARED_PDF_MAX_BYTES = 20 * 1024 * 1024;
const PDF_SIGNATURE = '%PDF-';

/** Rotas aceitas em `crewcheck://`. Allowlist fechada: o que não está aqui é recusado. */
export const IOS_DEEP_LINK_VIEWS = [
  'home', 'import', 'roster', 'calendar', 'alerts', 'load', 'departure',
  'wakeup', 'radar', 'weather', 'perdiem', 'salary', 'reports', 'exports',
  'routine', 'database', 'crew', 'hotels', 'presentation', 'map', 'mycar',
  'gyms', 'iflight', 'updates', 'concierge', 'plans', 'community', 'compare',
  'regulation', 'bids', 'settings', 'features',
] as const;

export type IosDeepLinkTarget = { view: string; shareId?: string };

/**
 * Traduz uma URL nativa para um destino interno seguro.
 *
 * Devolve `null` para qualquer coisa que não seja `crewcheck://` com uma rota da
 * allowlist. Isso impede que um link externo aponte o app para uma view
 * arbitrária, para um host remoto ou para o esquema de outro app.
 */
export function parseCrewCheckDeepLink(rawUrl: unknown): IosDeepLinkTarget | null {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'crewcheck:') return null;

  // `crewcheck://import` e `crewcheck:///import` são equivalentes para o usuário.
  const candidate = (url.hostname || url.pathname.replace(/^\/+/, '').split('/')[0] || '')
    .trim()
    .toLowerCase();
  if (!candidate) return null;
  if (!(IOS_DEEP_LINK_VIEWS as readonly string[]).includes(candidate)) return null;

  const shareId = String(url.searchParams.get('shareId') || '').trim();
  // O shareId é opaco e só serve para deduplicar; nunca é lido como caminho.
  if (shareId && !/^[A-Za-z0-9._:-]{1,128}$/.test(shareId)) return null;
  return shareId ? { view: candidate, shareId } : { view: candidate };
}

export type SharedPdfPayload = { sourceFileName: string; shareId: string; dataBase64: string };
export type SharedPdfRejection = 'empty' | 'too_large' | 'undecodable' | 'not_a_pdf';

function decodeBase64ToBytes(dataBase64: string): Uint8Array | null {
  try {
    const binary = atob(dataBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Normaliza o nome sem deixar o lado nativo escolher caminho de arquivo.
 * Descarta diretórios, caracteres de controle e pontos iniciais; o resultado é
 * sempre um nome simples terminado em `.pdf`.
 */
export function normalizeSharedPdfName(value: unknown): string {
  const base = String(value || '').split(/[\\/]/).pop() || '';
  const clean = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120) || 'CrewCheck-escala.pdf';
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

/**
 * Valida o payload vindo do nativo com os MESMOS critérios do caminho PWA:
 * tamanho, assinatura `%PDF-` e extensão. Arquivo que não é PDF é recusado antes
 * de chegar ao pipeline de importação.
 */
export function validateSharedPdf(
  payload: unknown,
): { ok: true; value: SharedPdfPayload } | { ok: false; reason: SharedPdfRejection } {
  const dataBase64 = String((payload as any)?.dataBase64 || '').trim();
  if (!dataBase64) return { ok: false, reason: 'empty' };
  // Base64 cresce ~4/3; barra o excesso antes de alocar o buffer.
  if (Math.floor((dataBase64.length * 3) / 4) > IOS_SHARED_PDF_MAX_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  const bytes = decodeBase64ToBytes(dataBase64);
  if (!bytes || !bytes.length) return { ok: false, reason: 'undecodable' };
  if (bytes.length > IOS_SHARED_PDF_MAX_BYTES) return { ok: false, reason: 'too_large' };

  let signature = '';
  for (let index = 0; index < PDF_SIGNATURE.length && index < bytes.length; index += 1) {
    signature += String.fromCharCode(bytes[index]);
  }
  if (signature !== PDF_SIGNATURE) return { ok: false, reason: 'not_a_pdf' };

  const sourceFileName = normalizeSharedPdfName(
    (payload as any)?.sourceFileName ?? (payload as any)?.filename,
  );
  const rawShareId = String((payload as any)?.shareId || '').trim();
  // Sem shareId próprio, deriva um estável a partir do conteúdo: o dedupe do
  // Home usa essa chave, então ela precisa ser a mesma para o mesmo arquivo.
  const shareId = rawShareId && /^[A-Za-z0-9._:-]{1,128}$/.test(rawShareId)
    ? `ios:${rawShareId}`
    : `ios:${sourceFileName}:${bytes.length}`;
  return { ok: true, value: { sourceFileName, shareId, dataBase64 } };
}

// ---------------------------------------------------------------------------
// Ponte com o host nativo.
// ---------------------------------------------------------------------------

type MessagePoster = (name: string, payload?: unknown) => void;

/** Handlers WKWebView instalados pelo shell iOS. Ausentes = app rodando no web. */
function iosMessageHandlers(win: any): Record<string, { postMessage: (value: unknown) => void }> | null {
  const handlers = win?.webkit?.messageHandlers;
  return handlers && typeof handlers === 'object' ? handlers : null;
}

export function isIosNativeHost(win: any): boolean {
  const handlers = iosMessageHandlers(win);
  return Boolean(handlers && typeof handlers.crewcheckIos?.postMessage === 'function');
}

function createPoster(win: any): MessagePoster {
  return (name, payload) => {
    try {
      iosMessageHandlers(win)?.crewcheckIos?.postMessage({ name, payload: payload ?? null });
    } catch {
      // Silencioso por desenho: falha de ponte não pode derrubar a UI, e o
      // conteúdo da mensagem não vai para log.
    }
  };
}

/**
 * Fachada `window.CrewCheckNative` no formato que o web já consome.
 *
 * Toda capacidade que depende de permissão ou de configuração ainda inexistente
 * responde `false`. Isso é deliberado: `crewcheckPremiumRuntime` cai no caminho
 * web quando recebe `false`, então o app segue utilizável. Nada aqui simula
 * concessão de permissão, entrega de push ou execução em background.
 */
export function createIosNativeFacade(win: any, post: MessagePoster = createPoster(win)) {
  const readFlag = (key: string): boolean => {
    try {
      return String(win?.localStorage?.getItem(key) || '') === 'granted';
    } catch {
      return false;
    }
  };
  return {
    platform: 'ios' as const,
    appVersion: String(win?.__crewcheckIosAppVersion || ''),
    openExternal(url: unknown): boolean {
      const raw = String(url || '').trim();
      // Só http(s) sai para o Safari; qualquer outro esquema é recusado para não
      // virar vetor de abertura de apps arbitrários.
      if (!/^https?:\/\//i.test(raw)) return false;
      post('openExternal', { url: raw });
      return true;
    },
    requestNotifications(): boolean {
      post('requestNotifications');
      return readFlag('crewcheck_notifications_permission');
    },
    requestLocation(): boolean {
      post('requestLocation');
      return readFlag('crewcheck_location_permission');
    },
    requestCurrentLocation(callbackId: unknown): boolean {
      post('requestCurrentLocation', { callbackId: String(callbackId || '') });
      return readFlag('crewcheck_location_permission');
    },
    // iOS não expõe "background mode" nem tela de bateria como o Android.
    // Responder `false` mantém o web no caminho degradado correto, em vez de
    // anunciar uma capacidade que o sistema não oferece.
    requestBackgroundMode(): boolean { return false; },
    openPowerSettings(): boolean { return false; },
    permissionStatus(): { location: boolean; notifications: boolean } {
      return {
        location: readFlag('crewcheck_location_permission'),
        notifications: readFlag('crewcheck_notifications_permission'),
      };
    },
    /** Confirma o consumo para o nativo poder descartar o item da caixa de entrada. */
    acknowledgeSharedPdf(shareId: unknown): boolean {
      const raw = String(shareId || '').trim();
      if (!raw) return false;
      post('acknowledgeSharedPdf', { shareId: raw });
      return true;
    },
  };
}

export type IosNativeFacade = ReturnType<typeof createIosNativeFacade>;

/**
 * Entrega o PDF ao pipeline existente pelo contrato compartilhado.
 *
 * Não chama parser algum: apenas publica o evento que o Home já escuta. O
 * dedupe por `shareId` continua sendo do Home — aqui só garantimos que a mesma
 * chave é usada, para que reenvio do mesmo arquivo não gere segunda publicação.
 */
export function deliverSharedPdf(win: any, payload: unknown): boolean {
  const result = validateSharedPdf(payload);
  if (!result.ok) {
    try {
      win.dispatchEvent(new win.CustomEvent('crewcheck:pwa-share-error', {
        detail: { message: 'Não consegui abrir o PDF compartilhado. Abra Importar escala e tente novamente.' },
      }));
    } catch {}
    return false;
  }
  try {
    win.__crewcheckPendingNativePdf = result.value;
    win.dispatchEvent(new win.CustomEvent('crewcheck:native-pdf', { detail: result.value }));
    return true;
  } catch {
    return false;
  }
}

/** Encaminha um deep link válido; inválido é descartado sem navegar. */
export function deliverDeepLink(win: any, rawUrl: unknown): IosDeepLinkTarget | null {
  const target = parseCrewCheckDeepLink(rawUrl);
  if (!target) return null;
  try {
    win.dispatchEvent(new win.CustomEvent('crewcheck:set-view', { detail: target.view }));
  } catch {
    return null;
  }
  return target;
}

/**
 * Instalação idempotente. Só age em host iOS reconhecido e nunca sobrescreve uma
 * fachada já presente (Android instala a sua antes do bundle carregar).
 */
export function installIosNativeRuntime(win: any): boolean {
  if (!win || !isIosNativeHost(win)) return false;
  if (win.__crewcheckIosRuntimeInstalled) return true;
  if (!win.CrewCheckNative) win.CrewCheckNative = createIosNativeFacade(win);
  win.__crewcheckIosBridge = {
    receiveSharedPdf: (payload: unknown) => deliverSharedPdf(win, payload),
    openDeepLink: (url: unknown) => Boolean(deliverDeepLink(win, url)),
  };
  win.__crewcheckIosRuntimeInstalled = true;
  return true;
}

if (typeof window !== 'undefined') {
  installIosNativeRuntime(window as any);
}
