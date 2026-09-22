export type CrewCheckSurface =
  | 'mobile' | 'web' | 'wear_os' | 'watchos'
  | 'tv' | 'google_tv' | 'samsung_tv' | 'lg_tv'
  | 'telegram' | 'whatsapp'
  | 'car' | 'carplay' | 'android_auto';

export type DisplayMode = 'preferredName' | 'callSign' | 'hidden';
export type HandoffDestination = 'home' | 'roster' | 'flightdeck' | 'finance' | 'crewcierge' | 'overnight' | 'crewlife';
export type NotificationReceiptState = 'new' | 'delivered' | 'seen' | 'dismissed' | 'acted';
export type Freshness = 'current' | 'recent' | 'stale' | 'unknown';
export type PrivacyClass = 'public' | 'personal' | 'sensitive';

export interface UserIdentityProfile {
  userId: string;
  preferredName: string;
  callSign?: string;
  avatarUrl?: string;
  discoverableByCallSign: boolean;
  display: {
    phone: DisplayMode;
    watch: DisplayMode;
    tv: DisplayMode;
    crewSearch: DisplayMode;
  };
}

export interface ContinuityContext {
  contextId: string;
  userId: string;
  sourceSurface: CrewCheckSurface;
  activeJourneyId?: string;
  activeFlightId?: string;
  activeStayId?: string;
  conversationId?: string;
  lastIntent?: string;
  lastResponseId?: string;
  updatedAt: string;
  expiresAt: string;
}

export interface ContinuityContextRef {
  journeyId?: string;
  flightId?: string;
  stayId?: string;
  conversationId?: string;
  rosterDate?: string;
}

export interface HandoffIntent {
  handoffId: string;
  userId: string;
  from: CrewCheckSurface;
  target: CrewCheckSurface;
  destination: HandoffDestination;
  contextRef: Readonly<ContinuityContextRef>;
  createdAt: string;
  expiresAt: string;
}

export interface HandoffConsumeSuccess {
  ok: true;
  handoffId: string;
  destination: HandoffDestination;
  target: CrewCheckSurface;
  contextRef: Readonly<ContinuityContextRef>;
}

export interface HandoffConsumeFailure {
  ok: false;
  reason: 'missing' | 'identity-mismatch' | 'expired' | 'invalid-surface' | 'invalid-destination';
}

export interface NotificationReceipt {
  eventId: string;
  userId: string;
  state: NotificationReceiptState;
  surface?: CrewCheckSurface;
  updatedAt: string;
}

export interface SurfaceCapabilities {
  audioInput: boolean;
  audioOutput: boolean;
  richCards: boolean;
  longFormText: boolean;
  handoff: boolean;
  sharedEnvironment: boolean;
  proactive: boolean;
  touch: boolean;
  textInput: boolean;
}

export interface CrewciergeFact {
  kind: string;
  value: string;
  label?: string;
  source?: string;
  freshness?: Freshness;
}

export interface CrewciergeAction {
  kind: string;
  label: string;
  deepLink?: string;
  confirmationRequired: boolean;
}

export interface CrewciergeResponse {
  responseId: string;
  intent: string;
  headline: string;
  shortText?: string;
  speechText?: string;
  primaryFact?: { kind: string; value: string };
  facts: readonly CrewciergeFact[];
  actions: readonly CrewciergeAction[];
  provenance: {
    source: string;
    observedAt?: string;
    freshness: Freshness;
  };
  privacyClass: PrivacyClass;
}

export function normalizeUserIdentityProfile(raw?: Record<string, any>): Readonly<UserIdentityProfile>;
export function resolveDisplayName(profile: UserIdentityProfile | Record<string, any>, target?: CrewCheckSurface | 'watch' | 'crew_search'): string;

export function createContinuityContext(raw: {
  userId: string;
  sourceSurface: CrewCheckSurface;
  contextId?: string;
  activeJourneyId?: string;
  activeFlightId?: string;
  activeStayId?: string;
  conversationId?: string;
  rosterDate?: string;
  lastIntent?: string;
  lastResponseId?: string;
  now?: number;
  ttlMs?: number;
}): Readonly<ContinuityContext>;

export function canResumeContinuity(
  context: ContinuityContext | null | undefined,
  options?: { userId?: string; now?: number },
): boolean;

export function createHandoffIntent(raw: {
  userId: string;
  from: CrewCheckSurface;
  target: CrewCheckSurface;
  destination: HandoffDestination;
  handoffId?: string;
  contextRef?: ContinuityContextRef;
  now?: number;
  ttlMs?: number;
}): Readonly<HandoffIntent>;

export function consumeHandoffIntent(
  intent: HandoffIntent | null | undefined,
  options?: { userId?: string; now?: number },
): Readonly<HandoffConsumeSuccess | HandoffConsumeFailure>;

export function advanceNotificationReceipt(
  current: NotificationReceipt | null | undefined,
  next: {
    eventId: string;
    userId: string;
    state: NotificationReceiptState;
    surface?: CrewCheckSurface;
    updatedAt?: string;
    now?: number;
  },
): Readonly<NotificationReceipt>;

export function mergeNotificationReceipt(
  left: NotificationReceipt,
  right: NotificationReceipt,
): Readonly<NotificationReceipt>;

export function surfaceCapabilities(surface: CrewCheckSurface): Readonly<SurfaceCapabilities>;

export function normalizeCrewciergeResponse(raw?: Record<string, any>): Readonly<CrewciergeResponse>;

export const continuityContract: Readonly<{
  schemaVersion: number;
  surfaces: readonly CrewCheckSurface[];
  receiptStates: readonly NotificationReceiptState[];
  handoffDestinations: readonly HandoffDestination[];
}>;
