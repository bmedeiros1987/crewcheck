import { readPilotPolicy } from './pilot-policy.mjs';

export function isScopedTvPilot(env = process.env) {
  return env.IS_PULL_REQUEST === 'true' && typeof env.CREWCHECK_TV_PILOT_SCOPED_CONFIG === 'string' && readPilotPolicy(env).enabled;
}

// Only used by the explicitly pinned TV preview. Never switches databases or
// hides a failed SQL command; an initialization failure returns no usable pool.
export function createPilotPoolLifecycle({ createNative, initialize, onFailure = () => {}, now = Date.now }) {
  let pending = null, ready = null, failures = 0, retryAt = 0, identity = null;
  return {
    async get(connectionString, options) {
      if (!/^mysql:\/\//i.test(connectionString || '')) return null;
      if (identity !== null && identity !== connectionString) return null;
      if (ready) return ready;
      if (pending) return pending;
      if (now() < retryAt) return null;
      identity = connectionString;
      pending = (async () => {
        let native;
        try {
          native = await createNative({ ...options, connectionLimit: 1, maxIdle: 0, idleTimeout: 5000, queueLimit: 10, waitForConnections: true });
          const value = await initialize(native);
          if (!value) throw Object.assign(new Error('Pool initialization failed'), { code: 'TV_POOL_NOT_READY' });
          ready = value; failures = 0; retryAt = 0;
          return value;
        } catch (error) {
          // A pool that connected but failed a later schema probe must not leak.
          if (native) { try { await native.end(); } catch {} }
          failures++;
          retryAt = now() + Math.min(60000, 5000 * 2 ** Math.min(failures - 1, 4));
          try { onFailure(error); } catch {}
          return null;
        }
      })();
      try { return await pending; }
      finally { pending = null; }
    },
  };
}
