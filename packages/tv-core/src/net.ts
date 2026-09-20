// Classificacao de origem compartilhada entre a API publica e o Connected Hub.
//
// A TV vive numa LAN: o Hub responde em http://192.168.0.32:8188 e nao tem
// (nem vai ter) certificado. Exigir HTTPS de tudo impediria a integracao; abrir
// para qualquer http:// exporia a TV a qualquer host. O meio-termo e aceitar
// HTTPS em qualquer lugar e HTTP somente em faixa privada/loopback.
//
// Nada aqui lanca: classificar uma origem invalida devolve um motivo. Quem
// chama decide o que fazer. Origem ruim nunca pode derrubar o boot do app.

export type OriginKind = 'https' | 'loopback' | 'private-lan' | 'rejected';

export type OriginVerdict = {
  kind: OriginKind;
  origin: string;
  /** Motivo legivel quando kind === 'rejected'. Nunca contem credencial. */
  reason: string | null;
};

/** IPv4 em faixa privada (RFC1918) ou link-local (RFC3927). */
export function isPrivateIpv4(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  const parts = match.slice(1).map((value) => Number(value));
  if (parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function isLoopback(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  if (hostname === '::1' || hostname === '[::1]') return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/**
 * Normaliza e classifica uma origem. Devolve sempre um veredito; nunca lanca,
 * nem para entrada vazia ou sintaticamente invalida.
 */
export function classifyOrigin(raw: string): OriginVerdict {
  const value = String(raw || '').trim();
  if (!value) return {kind: 'rejected', origin: '', reason: 'Origem vazia.'};

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {kind: 'rejected', origin: value, reason: 'Origem nao e uma URL valida.'};
  }

  const origin = `${url.protocol}//${url.host}`;

  if (url.protocol === 'https:') return {kind: 'https', origin, reason: null};
  if (url.protocol !== 'http:') {
    return {kind: 'rejected', origin, reason: `Protocolo ${url.protocol} nao e aceito.`};
  }
  if (isLoopback(url.hostname)) return {kind: 'loopback', origin, reason: null};
  if (isPrivateIpv4(url.hostname)) return {kind: 'private-lan', origin, reason: null};

  return {
    kind: 'rejected',
    origin,
    reason: 'HTTP so e aceito em loopback ou rede local (10.x, 172.16-31.x, 192.168.x, 169.254.x).',
  };
}

export function isUsableOrigin(raw: string): boolean {
  return classifyOrigin(raw).kind !== 'rejected';
}

/**
 * `fetch` guardado como propriedade e chamado como metodo (`this.request(...)`)
 * lanca "Illegal invocation" no navegador: a implementacao nativa exige o
 * objeto global como receptor. Em Node isso passa despercebido, porque o fetch
 * do undici nao checa o receptor - e por isso o defeito sobrevive a teste
 * unitario e so aparece na TV.
 */
export function bindFetch(impl: typeof fetch): typeof fetch {
  if (typeof impl !== 'function') return impl;
  try {
    const target = typeof globalThis === 'undefined' ? undefined : globalThis;
    return impl.bind(target as never);
  } catch {
    return impl;
  }
}
