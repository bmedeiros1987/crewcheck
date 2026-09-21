const PREMIUM_PLANS = new Set([
  'premium_monthly','premium_annual','premium_unlimited','premium_lifetime','admin',
]);

function planId(data = {}) {
  return String(
    data?.billing?.plan ||
    data?.accountPlan ||
    data?.plan ||
    'free'
  ).trim().toLowerCase() || 'free';
}

export function tvAccessPolicy(data = {}) {
  const plan = planId(data);
  const premium = data?.billing?.premiumAccess === true ||
    data?.premiumAccess === true ||
    PREMIUM_PLANS.has(plan);
  const noCost = data?.tvNoCostProviders && typeof data.tvNoCostProviders === 'object'
    ? data.tvNoCostProviders
    : {};
  return {
    tier: premium ? 'premium' : 'free',
    plan,
    premium,
    features: {
      roster: true,
      calendar: true,
      nextProgramming: true,
      presentation: true,
      overnight: true,
      visitorExplanations: true,
      userGate: true,
      basicFinance: true,
      mobilityHandoff: true,
      airlineVisual: true,
      hotel: premium,
      crew: premium,
      advancedFinance: premium,
    },
    providers: {
      radar: premium,
      traffic: premium,
      weather: premium || noCost.weather === true,
    },
  };
}

function safeTimestamp(value) {
  const n = Date.parse(String(value || ''));
  return Number.isFinite(n) ? n : null;
}

// Free TV can display a gate only when the account loader explicitly marks it
// as a user-originated fact. It must never reinterpret cached provider data as
// a user update.
export function tvUserGateFact(data = {}, now = Date.now()) {
  const raw = data?.tvUserFacts?.gate || data?.userFacts?.gate || null;
  if (!raw || String(raw.source || '').toLowerCase() !== 'user') return null;
  const label = String(raw.label || raw.gate || '').trim().slice(0, 24);
  const observedMs = safeTimestamp(raw.observedAt || raw.updatedAt);
  const expiresMs = safeTimestamp(raw.expiresAt || raw.validUntil);
  if (!label || observedMs == null || expiresMs == null) return null;
  if (observedMs > now || expiresMs <= now || expiresMs <= observedMs) return null;
  return {
    value: {
      label,
      remoteStand: typeof raw.remoteStand === 'boolean' ? raw.remoteStand : null,
    },
    source: 'user',
    observedAt: new Date(observedMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

export function publicTvEntitlements(policy) {
  return {
    tier: policy?.premium ? 'premium' : 'free',
    userGate: true,
    automaticGate: policy?.providers?.radar === true,
    automaticTraffic: policy?.providers?.traffic === true,
    automaticWeather: policy?.providers?.weather === true,
    hotel: policy?.features?.hotel === true,
    crew: policy?.features?.crew === true,
    advancedFinance: policy?.features?.advancedFinance === true,
    paidProviderAccess: policy?.premium === true,
  };
}
