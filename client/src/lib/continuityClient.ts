import { getStoredUser } from './authClient';
import {
  canResumeContinuity,
  createContinuityContext,
  createHandoffIntent,
  normalizeUserIdentityProfile,
  type ContinuityContext,
  type CrewCheckSurface,
  type HandoffDestination,
  type HandoffIntent,
  type UserIdentityProfile,
} from '@shared/continuity.mjs';

const IDENTITY_PREFIX = 'crewcheck_identity_profile_v1_';
const CONTINUITY_PREFIX = 'crewcheck_continuity_context_v1_';

function currentUserId(): string | null {
  const user = getStoredUser();
  const raw = String(user?.id || user?.email || '').trim().toLowerCase();
  return raw || null;
}

function storageSafeUserId(userId: string): string {
  return userId.replace(/[^a-z0-9_-]+/gi, '_').slice(0, 96);
}

function identityKey(userId: string): string {
  return `${IDENTITY_PREFIX}${storageSafeUserId(userId)}`;
}

function continuityKey(userId: string): string {
  return `${CONTINUITY_PREFIX}${storageSafeUserId(userId)}`;
}

function requireCurrentUserId(): string {
  const userId = currentUserId();
  if (!userId) throw new Error('Continuity requires an authenticated user');
  return userId;
}

function assertCurrentIdentity(userId: string): string {
  const current = requireCurrentUserId();
  if (String(userId || '').trim().toLowerCase() !== current) {
    throw new Error('Continuity identity mismatch');
  }
  return current;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

export function getLocalIdentityProfile(): UserIdentityProfile {
  const userId = requireCurrentUserId();
  const stored = readJson<UserIdentityProfile>(identityKey(userId));
  if (stored) {
    try {
      return normalizeUserIdentityProfile(stored);
    } catch {
      localStorage.removeItem(identityKey(userId));
    }
  }

  const user = getStoredUser();
  return normalizeUserIdentityProfile({
    userId,
    preferredName: user?.name || 'Tripulante',
    discoverableByCallSign: false,
  });
}

export function saveLocalIdentityProfile(profile: UserIdentityProfile | Record<string, unknown>): UserIdentityProfile {
  const normalized = normalizeUserIdentityProfile(profile as Record<string, unknown>);
  assertCurrentIdentity(normalized.userId);
  localStorage.setItem(identityKey(normalized.userId), JSON.stringify(normalized));
  return normalized;
}

export function saveLocalContinuityContext(context: ContinuityContext): ContinuityContext {
  const userId = assertCurrentIdentity(context.userId);
  if (!canResumeContinuity(context, { userId })) {
    throw new Error('Continuity context is expired or invalid');
  }
  localStorage.setItem(continuityKey(userId), JSON.stringify(context));
  return context;
}

export function updateLocalContinuity(input: {
  sourceSurface: CrewCheckSurface;
  activeJourneyId?: string;
  activeFlightId?: string;
  activeStayId?: string;
  conversationId?: string;
  rosterDate?: string;
  lastIntent?: string;
  lastResponseId?: string;
  ttlMs?: number;
}): ContinuityContext {
  const userId = requireCurrentUserId();
  const context = createContinuityContext({ userId, ...input });
  return saveLocalContinuityContext(context);
}

export function loadLocalContinuityContext(now = Date.now()): ContinuityContext | null {
  const userId = currentUserId();
  if (!userId) return null;
  const key = continuityKey(userId);
  const context = readJson<ContinuityContext>(key);
  if (!context) return null;
  if (!canResumeContinuity(context, { userId, now })) {
    try { localStorage.removeItem(key); } catch {}
    return null;
  }
  return context;
}

export function clearLocalContinuityForCurrentUser(): void {
  const userId = currentUserId();
  if (!userId) return;
  try {
    localStorage.removeItem(continuityKey(userId));
  } catch {}
}

export function createLocalHandoff(
  target: CrewCheckSurface,
  destination: HandoffDestination,
  options: { from?: CrewCheckSurface; ttlMs?: number } = {},
): HandoffIntent {
  const userId = requireCurrentUserId();
  const context = loadLocalContinuityContext();
  return createHandoffIntent({
    userId,
    from: options.from || context?.sourceSurface || 'mobile',
    target,
    destination,
    ttlMs: options.ttlMs,
    contextRef: {
      journeyId: context?.activeJourneyId,
      flightId: context?.activeFlightId,
      stayId: context?.activeStayId,
      conversationId: context?.conversationId,
    },
  });
}
