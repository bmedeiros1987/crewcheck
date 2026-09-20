/**
 * Redacao de segredos.
 *
 * O token do Home Assistant nunca pode sair do processo: nem em log, nem em
 * resposta HTTP, nem em mensagem de erro. Os erros do `fetch` e do HA muitas
 * vezes carregam a URL e os headers da requisicao, entao tudo que for virar
 * texto passa por aqui antes.
 */

const SECRET_ENV_KEYS = ['HA_TOKEN', 'LAURINHA_BRIDGE_KEY'];

/** Valores que devem ser mascarados, registrados em tempo de execucao. */
const secrets = new Set();

export function registerSecret(value) {
  if (typeof value === 'string' && value.length >= 6) secrets.add(value);
}

export function registerSecretsFromEnv(env = process.env) {
  for (const key of SECRET_ENV_KEYS) registerSecret(env[key]);
}

export function clearSecrets() {
  secrets.clear();
}

/**
 * Substitui qualquer segredo conhecido, alem de padroes que parecem
 * credencial mesmo que nao estejam registrados (Bearer, token=..., JWT).
 */
export function redact(input) {
  if (input == null) return input;

  if (typeof input === 'string') {
    let out = input;
    for (const secret of secrets) {
      if (secret) out = out.split(secret).join('[REDACTED]');
    }
    out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED]');
    out = out.replace(/((?:token|api[_-]?key|authorization|bridge[_-]?key)["'\s:=]+)[A-Za-z0-9._~+/-]{6,}=*/gi,
                      '$1[REDACTED]');
    // JWT solto (tres segmentos base64url)
    out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]');
    return out;
  }

  if (Array.isArray(input)) return input.map(redact);

  if (input instanceof Error) {
    const copy = new Error(redact(input.message));
    copy.name = input.name;
    if (input.code) copy.code = input.code;
    return copy;
  }

  if (typeof input === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (/^(authorization|token|ha_token|bridge_key|api_?key)$/i.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = redact(value);
      }
    }
    return out;
  }

  return input;
}

/** Logger que redige tudo antes de escrever. */
export function createLogger(sink = console) {
  const emit = (level, args) => {
    const safe = args.map((arg) =>
      typeof arg === 'string' || arg instanceof Error ? redact(arg)
        : redact(arg));
    sink[level](...safe);
  };
  return {
    info: (...args) => emit('log', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
  };
}
