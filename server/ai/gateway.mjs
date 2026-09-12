import { assertExternalAiAllowed, sanitizeExternalAiContext } from './privacy.mjs';

const DEFAULTS = Object.freeze({ timeoutMs: 2500, retries: 1, failureThreshold: 3, circuitResetMs: 60_000, dailyBudgetUnits: 1000, rateLimitPerMinute: 30 });

function enabled(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function dayKey(now) { return now.toISOString().slice(0, 10); }

export class AiGateway {
  constructor({ providers = [], localResolvers = [], telemetry = () => {}, now = () => new Date(), config = {} } = {}) {
    this.providers = providers;
    this.localResolvers = localResolvers;
    this.telemetry = telemetry;
    this.now = now;
    this.config = { ...DEFAULTS, ...config };
    this.circuits = new Map();
    this.usage = { day: '', units: 0 };
    this.rate = new Map();
  }

  async resolve(request = {}) {
    const started = Date.now();
    for (const resolver of this.localResolvers) {
      const result = await resolver(request);
      if (result?.resolved) return this.finish('local', result, started);
    }
    if (this.config.killSwitch) return this.finish('disabled', { resolved: false, reason: 'kill_switch' }, started);
    assertExternalAiAllowed(request);
    const context = sanitizeExternalAiContext(request.context);
    const externalRequest = { ...request, context, prompt: this.buildPrompt(request, context) };
    for (const provider of this.eligibleProviders(request)) {
      const result = await this.tryProvider(provider, externalRequest);
      if (result) return this.finish(provider.id, { resolved: true, ...result }, started);
    }
    return this.finish('none', { resolved: false, reason: 'providers_exhausted' }, started);
  }

  buildPrompt(request, context) {
    return [String(request.instruction || request.prompt || '').slice(0, 1200), JSON.stringify(context)].filter(Boolean).join('\nContexto minimizado: ');
  }

  eligibleProviders(request) {
    return this.providers.filter((provider) => {
      if (!provider.enabled || this.config.providerFlags?.[provider.id] === false) return false;
      if (provider.tier === 'strong' && !(request.allowPaid === true && this.config.allowPaid === true)) return false;
      return !this.circuitOpen(provider.id) && this.withinLimits(provider.id);
    });
  }

  withinLimits(providerId) {
    const now = this.now();
    const day = dayKey(now);
    if (this.usage.day !== day) this.usage = { day, units: 0 };
    if (this.usage.units >= this.config.dailyBudgetUnits) return false;
    const minute = Math.floor(now.getTime() / 60_000);
    const bucket = this.rate.get(providerId);
    if (!bucket || bucket.minute !== minute) { this.rate.set(providerId, { minute, count: 0 }); return true; }
    return bucket.count < this.config.rateLimitPerMinute;
  }

  circuitOpen(providerId) {
    const state = this.circuits.get(providerId);
    if (!state || state.failures < this.config.failureThreshold) return false;
    if (this.now().getTime() - state.openedAt >= this.config.circuitResetMs) { this.circuits.delete(providerId); return false; }
    return true;
  }

  async tryProvider(provider, request) {
    for (let attempt = 0; attempt <= this.config.retries; attempt += 1) {
      const controller = new AbortController();
      let timer;
      try {
        const bucket = this.rate.get(provider.id);
        if (bucket) bucket.count += 1;
        this.usage.units += 1;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Object.assign(new Error('AI provider timeout'), { retryable: true, code: 'provider_timeout' }));
          }, this.config.timeoutMs);
        });
        const result = await Promise.race([provider.generate(request, { signal: controller.signal }), timeout]);
        this.circuits.delete(provider.id);
        return result;
      } catch (error) {
        const state = this.circuits.get(provider.id) || { failures: 0, openedAt: 0 };
        state.failures += 1;
        if (state.failures >= this.config.failureThreshold) state.openedAt = this.now().getTime();
        this.circuits.set(provider.id, state);
        if (attempt >= this.config.retries || error?.retryable === false) break;
      } finally { clearTimeout(timer); }
    }
    return null;
  }

  finish(layer, result, started) {
    try { this.telemetry({ event: 'ai_gateway_resolution', layer, resolved: Boolean(result.resolved), reason: result.reason || null, latencyMs: Date.now() - started }); } catch { /* telemetry must never break the experience */ }
    return { layer, ...result };
  }
}

export function aiGatewayConfigFromEnv(env = process.env) {
  return {
    killSwitch: enabled(env.AI_KILL_SWITCH), allowPaid: enabled(env.AI_ALLOW_PAID),
    timeoutMs: Number(env.AI_TIMEOUT_MS || DEFAULTS.timeoutMs), retries: Number(env.AI_MAX_RETRIES ?? DEFAULTS.retries),
    failureThreshold: Number(env.AI_CIRCUIT_FAILURE_THRESHOLD || DEFAULTS.failureThreshold), circuitResetMs: Number(env.AI_CIRCUIT_RESET_MS || DEFAULTS.circuitResetMs),
    dailyBudgetUnits: Number(env.AI_DAILY_BUDGET_UNITS || DEFAULTS.dailyBudgetUnits), rateLimitPerMinute: Number(env.AI_RATE_LIMIT_PER_MINUTE || DEFAULTS.rateLimitPerMinute),
    providerFlags: { openrouter: enabled(env.AI_OPENROUTER_ENABLED), cloudflare: enabled(env.AI_CLOUDFLARE_ENABLED), gemini: enabled(env.AI_GEMINI_ENABLED) },
  };
}
