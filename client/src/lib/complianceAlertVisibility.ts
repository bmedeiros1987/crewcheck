export type ComplianceAlertLike = {
  severity?: string;
  title?: string;
  description?: string;
  details?: string;
  legalReference?: string;
  date?: string;
  dismissed?: boolean;
  falsePositive?: boolean;
  active?: boolean;
  classification?: string;
  code?: string;
  actionable?: boolean;
  coverage?: {
    windowDays?: number;
    missingDates?: string[];
  };
};

export type AlertVisibilityStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type ComplianceAlertDismissal = {
  fingerprint: string;
  ignoredAt: string;
};

type ComplianceAlertDismissalState = {
  version: 3;
  rosterRevision: string;
  ignored: ComplianceAlertDismissal[];
};

const DISMISSAL_VERSION = 3;
const DISMISSAL_PREFIX = 'crewcheck:compliance-alert-visibility:v3:';

function clean(value: unknown): string {
  return String(value || '').trim();
}

function accountKey(accountId: string | null | undefined): string {
  const normalized = clean(accountId);
  return normalized ? encodeURIComponent(normalized) : 'anonymous';
}

export function complianceAlertVisibilityKey(accountId: string | null | undefined): string {
  return `${DISMISSAL_PREFIX}${accountKey(accountId)}`;
}

export function complianceAlertFingerprint(alert: ComplianceAlertLike): string {
  return [alert.code, alert.title, alert.date, alert.description, alert.legalReference]
    .map(clean)
    .join('|');
}

/**
 * Informational alerts are emitted by the authoritative compliance engine.
 * UI must never infer this state from user-facing title/message text.
 */
export function isInformationalComplianceAlert(alert: ComplianceAlertLike): boolean {
  return alert.actionable === false
    || clean(alert.classification) === 'dados_insuficientes'
    || clean(alert.code) === 'ROLLING_28D_DATA_GAP';
}

function isCandidateAlert(alert: ComplianceAlertLike): boolean {
  if (alert.dismissed || alert.falsePositive || alert.active === false) return false;
  const severity = clean(alert.severity).toLowerCase();
  return ['error', 'warning'].includes(severity);
}

export function filterActionableComplianceAlerts(source: unknown): ComplianceAlertLike[] {
  const alerts = Array.isArray(source) ? source : [];
  const seen = new Set<string>();
  return alerts.filter((alert): alert is ComplianceAlertLike => {
    if (!alert || typeof alert !== 'object') return false;
    if (!isCandidateAlert(alert) || isInformationalComplianceAlert(alert)) return false;
    const fingerprint = complianceAlertFingerprint(alert);
    if (!fingerprint.replaceAll('|', '')) return false;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

export function informationalComplianceAlerts(source: unknown): ComplianceAlertLike[] {
  const alerts = Array.isArray(source) ? source : [];
  const seen = new Set<string>();
  return alerts.filter((alert): alert is ComplianceAlertLike => {
    if (!alert || typeof alert !== 'object') return false;
    if (!isCandidateAlert(alert) || !isInformationalComplianceAlert(alert)) return false;
    const fingerprint = complianceAlertFingerprint(alert);
    if (!fingerprint.replaceAll('|', '')) return false;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

export function readComplianceAlertDismissals(
  storage: AlertVisibilityStorage,
  accountId: string | null | undefined,
  rosterRevision: string,
): ComplianceAlertDismissal[] {
  if (!clean(accountId)) return [];
  try {
    const parsed = JSON.parse(storage.getItem(complianceAlertVisibilityKey(accountId)) || 'null') as ComplianceAlertDismissalState | null;
    if (!parsed || parsed.version !== DISMISSAL_VERSION || parsed.rosterRevision !== clean(rosterRevision)) return [];
    return Array.isArray(parsed.ignored)
      ? parsed.ignored.filter((item) => Boolean(item?.fingerprint))
      : [];
  } catch {
    return [];
  }
}

function ignoredFingerprintSet(
  storage: AlertVisibilityStorage,
  accountId: string | null | undefined,
  rosterRevision: string,
): Set<string> {
  return new Set(readComplianceAlertDismissals(storage, accountId, rosterRevision).map((item) => item.fingerprint));
}

export function activeComplianceAlerts(
  source: unknown,
  storage: AlertVisibilityStorage,
  accountId: string | null | undefined,
  rosterRevision: string,
): ComplianceAlertLike[] {
  const ignored = ignoredFingerprintSet(storage, accountId, rosterRevision);
  return filterActionableComplianceAlerts(source)
    .filter((alert) => !ignored.has(complianceAlertFingerprint(alert)));
}

export function visibleInformationalComplianceAlerts(
  source: unknown,
  storage: AlertVisibilityStorage,
  accountId: string | null | undefined,
  rosterRevision: string,
): ComplianceAlertLike[] {
  const ignored = ignoredFingerprintSet(storage, accountId, rosterRevision);
  return informationalComplianceAlerts(source)
    .filter((alert) => !ignored.has(complianceAlertFingerprint(alert)));
}

export function dismissComplianceAlertUntilRosterUpdate(
  storage: AlertVisibilityStorage,
  accountId: string | null | undefined,
  rosterRevision: string,
  alert: ComplianceAlertLike,
  now = new Date(),
): boolean {
  if (!clean(accountId)) return false;
  if (clean(alert.severity).toLowerCase() !== 'warning') return false;
  const revision = clean(rosterRevision);
  if (!revision) return false;
  const fingerprint = complianceAlertFingerprint(alert);
  if (!fingerprint.replaceAll('|', '')) return false;
  const current = readComplianceAlertDismissals(storage, accountId, revision);
  const next = current.filter((item) => item.fingerprint !== fingerprint);
  next.push({ fingerprint, ignoredAt: now.toISOString() });
  try {
    const state: ComplianceAlertDismissalState = {
      version: DISMISSAL_VERSION,
      rosterRevision: revision,
      ignored: next,
    };
    storage.setItem(complianceAlertVisibilityKey(accountId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function resetComplianceAlertDismissals(
  storage: AlertVisibilityStorage,
  accountId: string | null | undefined,
): void {
  if (!clean(accountId)) return;
  try {
    storage.removeItem(complianceAlertVisibilityKey(accountId));
  } catch {}
}
