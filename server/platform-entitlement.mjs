// Extracted from platform.mjs subscriptionStatus at main 561e3a05.
// No environment reads, connections, provider calls, usage writes or module side effects.
import { withProfileLocks } from './profile-locks.mjs';
export const PLATFORM_PLAN_IDS = new Set(['free', 'premium_monthly', 'premium_annual', 'premium_unlimited']);

export function resolvePlatformEntitlement(profile, subscription, { trustLegacyPremiumProfile = false, now = Date.now() } = {}) {
  const subscriptionActive = subscription && ['active', 'trialing', 'grace_period'].includes(subscription.status)
    && (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now);
  const legacyPremium = trustLegacyPremiumProfile === true
    && !subscription && ['premium_monthly', 'premium_annual'].includes(profile.plan);
  const plan = profile.plan === 'premium_unlimited'
    ? profile.plan
    : subscriptionActive && PLATFORM_PLAN_IDS.has(subscription.plan)
      ? subscription.plan
      : legacyPremium
        ? profile.plan
        : 'free';
  return {
    plan,
    status: profile.plan === 'premium_unlimited' ? 'lifetime' : subscription?.status || (legacyPremium ? 'legacy_migration' : 'free'),
    provider: subscription?.provider || (profile.plan === 'premium_unlimited' ? 'admin' : legacyPremium ? 'legacy' : null),
    productId: subscription?.product_id || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    premiumAccess: plan !== 'free',
    entitlements: {
      roster: true, compliance: true, workload: true, finance: true, export: true,
      radar: plan !== 'free', smartDeparture: plan !== 'free', hotelLearning: plan !== 'free',
      gyms: plan !== 'free', visitors: plan !== 'free', rosterComparison: plan !== 'free', chat: plan !== 'free',
    },
  };
}

export async function readPlatformEntitlement(db, profile, options = {}) {
  const result = await db.query('SELECT * FROM crewcheck_platform_subscriptions WHERE email=$1 LIMIT 1', [profile.email]);
  return resolvePlatformEntitlement(profile, result.rows[0] || null, options);
}

// Caller must hold ordered owner-profile locks in a REPEATABLE READ transaction.
// Acquire ALL relevant profile locks before invoking for multi-owner operations.
// Do not pass a pool here: FOR UPDATE locks must survive through the caller's commit.
// Missing subscription: RR unique-email gap lock serializes INSERT/UPSERT as well.
export async function readLockedPlatformEntitlement(client, { email, expectedPublicId, trustLegacyPremiumProfile = false, now } = {}) {
  if (typeof email !== 'string' || !email || typeof expectedPublicId !== 'string' || !expectedPublicId)
    throw Object.assign(new Error('Identidade atual não confirmada.'), { status: 401, code: 'ENTITLEMENT_OWNER_REQUIRED' });
  const profiles = await client.query('SELECT * FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [email]);
  const profile = profiles.rows[0];
  if (!profile || profile.email !== email || profile.public_id !== expectedPublicId)
    throw Object.assign(new Error('Identidade atual não confirmada.'), { status: 401, code: 'ENTITLEMENT_OWNER_MISMATCH' });
  const subscriptions = await client.query('SELECT * FROM crewcheck_platform_subscriptions WHERE email=$1 FOR UPDATE', [email]);
  const subscription = subscriptions.rows[0] || null;
  if (subscription && subscription.email !== email)
    throw Object.assign(new Error('Assinatura indisponível.'), { status: 503, code: 'ENTITLEMENT_SUBSCRIPTION_MISMATCH' });
  return { profile, subscription, billing: resolvePlatformEntitlement(profile, subscription, { trustLegacyPremiumProfile, ...(now === undefined ? {} : { now }) }) };
}

// Preferred write boundary. No transport or other irreversible effects in action:
// the shared helper may retry the transaction once after a database deadlock.
// All owner profile rows are locked before any subscription, in sorted order.
export async function withPlatformEntitlements(db, owners, action, { trustLegacyPremiumProfile = false } = {}) {
  if (!Array.isArray(owners) || !owners.length || owners.some(owner =>
    typeof owner?.email !== 'string' || !owner.email || typeof owner?.expectedPublicId !== 'string' || !owner.expectedPublicId))
    throw Object.assign(new Error('Identidade atual não confirmada.'), { status: 401, code: 'ENTITLEMENT_OWNER_REQUIRED' });
  const ordered = [...owners].sort((a, b) => a.email.localeCompare(b.email));
  if (new Set(ordered.map(owner => owner.email)).size !== ordered.length)
    throw Object.assign(new Error('Titular duplicado.'), { status: 400 });
  return withProfileLocks(db, ordered.map(owner => owner.email), async client => {
    const refresh = async () => {
      const result = new Map();
      for (const owner of ordered) result.set(owner.email, await readLockedPlatformEntitlement(client, {
        email: owner.email, expectedPublicId: owner.expectedPublicId, trustLegacyPremiumProfile,
      }));
      return result;
    };
    return action(client, await refresh(), refresh);
  }, { repeatableRead: true });
}
