import { createHash, timingSafeEqual } from 'node:crypto';

// One account only. Empty, malformed or multi-account configuration fails closed.
// Configuration is re-read per request; no personal email is committed to Git.
export function readPilotPolicy(env = process.env) {
  // Compact configuration uses one Render slot. It grants no trust by itself:
  // identity, HTTPS origin and the preview-only bootstrap are still enforced.
  let configuration;
  if (env.CREWCHECK_TV_PILOT_CONFIG !== undefined) {
    try {
      const raw = JSON.parse(env.CREWCHECK_TV_PILOT_CONFIG);
      const keys = ['enabled', 'accountSha256', 'origin', 'bootstrap'];
      configuration = raw && !Array.isArray(raw) && typeof raw === 'object' &&
        Object.keys(raw).every(key => keys.includes(key)) &&
        typeof raw.enabled === 'boolean' && typeof raw.bootstrap === 'boolean' &&
        typeof raw.accountSha256 === 'string' && typeof raw.origin === 'string' ? raw : {};
    } catch { configuration = {}; }
  } else {
    configuration = {
      enabled: env.CREWCHECK_TV_ENABLED === 'true',
      accountSha256: env.CREWCHECK_TV_PILOT_ACCOUNT_SHA256,
      origin: env.CREWCHECK_TV_PILOT_ORIGIN,
      bootstrap: env.CREWCHECK_TV_PILOT_BOOTSTRAP === 'true',
    };
  }
  const hash = String(configuration.accountSha256 || '').trim().toLowerCase();
  const candidate = String(configuration.origin || '').trim();
  let origin = '';
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:' && !url.username && !url.password && url.origin === candidate) origin = candidate;
  } catch {}
  const configured = /^[a-f0-9]{64}$/.test(hash) && Boolean(origin);
  const enabled = configuration.enabled === true && env.CREWCHECK_TV_ENABLED !== 'false' && configured;
  const preview = env.IS_PULL_REQUEST === 'true';
  return {
    enabled, origin,
    bootstrap: enabled && preview && configuration.bootstrap === true,
    allows(userId) {
      if (!enabled || typeof userId !== 'string') return false;
      const normalized = userId.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
      const actual = createHash('sha256').update(normalized).digest();
      return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
    },
    allowsOrigin(value, accountRoute = false) {
      return !value || value === origin || (!accountRoute && ['null', 'https://appassets.androidplatform.net'].includes(value));
    },
  };
}
