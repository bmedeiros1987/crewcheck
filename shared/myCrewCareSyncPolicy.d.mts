export const MYCREWCARE_BACKGROUND_CAPABILITY: Readonly<{
  NONE: 'none';
  INTERACTIVE_WEBVIEW: 'interactive-webview';
  AUTHORIZED_HTTP: 'authorized-http';
}>;

export type MyCrewCareSyncAction = 'idle' | 'reconnect' | 'wait-network' | 'sync-now' | 'background-sync' | 'defer-to-foreground';
export type MyCrewCareSyncPlan = Readonly<{
  action: MyCrewCareSyncAction;
  reason: string;
  dueAt: number;
  intervalMs: number;
  mayOpenInteractiveUi: boolean;
  backgroundEligible: boolean;
}>;

export function planMyCrewCareSync(input?: {
  now?: number | string;
  automatic?: boolean;
  networkAvailable?: boolean;
  foreground?: boolean;
  reason?: 'manual' | 'roster-changed' | 'connected' | string;
  sessionState?: string;
  backgroundCapability?: 'none' | 'interactive-webview' | 'authorized-http';
  lastSuccessAt?: number | string | null;
  lastAttemptAt?: number | string | null;
  nextStayAt?: number | string | null;
  nextPickupAt?: number | string | null;
  retryCount?: number;
  lastFailure?: string | null;
  retryAfterAt?: number | string | null;
}): MyCrewCareSyncPlan;
