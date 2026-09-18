import { createHash, timingSafeEqual } from 'node:crypto';

// One account only. Empty, malformed or multi-account configuration fails closed.
// Configuration is re-read per request; no personal email is committed to Git.
export function readPilotPolicy(env = process.env) {
  const hash = String(env.CREWCHECK_TV_PILOT_ACCOUNT_SHA256 || '').trim().toLowerCase();
  const candidate = String(env.CREWCHECK_TV_PILOT_ORIGIN || '').trim();
  let origin = '';
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:' && !url.username && !url.password && url.origin === candidate) origin = candidate;
  } catch {}
  const configured = /^[a-f0-9]{64}$/.test(hash) && Boolean(origin);
  const enabled = env.CREWCHECK_TV_ENABLED === 'true' && configured;
  const preview = env.IS_PULL_REQUEST === 'true';
  return {
    enabled, origin,
    bootstrap: enabled && preview && env.CREWCHECK_TV_PILOT_BOOTSTRAP === 'true',
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
