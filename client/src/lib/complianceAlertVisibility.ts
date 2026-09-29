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
};

export type AlertVisibilityStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type ComplianceAlertDismissal = {
  fingerprint: string;
  ignoredAt: string;
};

type ComplianceAlertDismissalState = {
  version: 2;
  rosterRevision: string;
  ignored: ComplianceAlertDismissal[];
};

const DISMISSAL_VERSION = 2;
const DISMISSAL_PREFIX = 'crewcheck:compliance-alert-visibility:v2:';
export const INCOMPLETE_28_DAY_TITLE = 'Avaliação de horas de voo em 28 dias incompleta';

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
  return [alert.title, alert.date, alert.description, alert.legalReference]
    .map(clean)
    .join('|');
}

export function isIncomplete28DayAssessment(alert: ComplianceAlertLike): boolean {
  return clean(alert.title) === INCOMPLETE_28_DAY_TITLE;
}

export function filterActionableComplianceAlerts(source: unknown): ComplianceAlertLike[] {
  const alerts = Array.isArray(source) ? source : [];
  const seen = new Set<string>();
  return alerts.filter((alert): alert is ComplianceAlertLike => {
    if (!alert || typeof alert !== 'object') return false;
    if (alert.dismissed || alert.falsePositive || alert.active === false) return false;
    if (isIncomplete28DayAssessment(alert)) return false;
    const severity = clean(alert.severity).toLowerCase();
    if (!['error', 'warning'].includes(severity)) return false;
    const fingerprint = complianceAlertFingerprint(alert);
    if (!fingerprint.replaceAll('|', '')) return false;
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

export function informationalComplianceAlerts(source: unknown): ComplianceAlertLike[] {
  const alerts = Array.isArray(source) ? source : [];
  return alerts.filter((alert): alert is ComplianceAlertLike =>
    Boolean(alert && typeof alert === 'object' && isIncomplete28DayAssessment(alert)),
  );
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

export function activeComplianceAlerts(
  source: unknown,
  storage: AlertVisibilityStorage,
  accountId: string | null | undefined,
  rosterRevision: string,
): ComplianceAlertLike[] {
  const ignored = new Set(
    readComplianceAlertDismissals(storage, accountId, rosterRevision).map((item) => item.fingerprint),
  );
  return filterActionableComplianceAlerts(source)
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
