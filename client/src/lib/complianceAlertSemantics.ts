export type ComplianceAlertActionability = {
  severity?: string | null;
  classification?: string | null;
  actionable?: boolean | null;
};

/**
 * Presentation/transport consumers must honor the semantic contract emitted
 * by the authoritative Compliance Engine. Human-readable title/description
 * are never used to decide whether an item is actionable.
 */
export function isActionableComplianceAlert(
  alert: ComplianceAlertActionability | null | undefined,
): boolean {
  if (!alert || alert.actionable === false || alert.classification === 'dados_insuficientes') return false;
  return alert.severity === 'error' || alert.severity === 'warning';
}

/** Keep informational diagnostics visible without promoting them to actionable
 * alerts. Codes are evidence labels, never a closed allowlist of pending data. */
export function informationalComplianceDiagnostics<T extends ComplianceAlertActionability & {
  title?: string; description?: string; active?: boolean; dismissed?: boolean; falsePositive?: boolean;
}>(alerts: readonly T[] | null | undefined): T[] {
  return (alerts || []).filter(alert => alert && alert.active !== false && !alert.dismissed && !alert.falsePositive
    && (alert.actionable === false || alert.classification === 'dados_insuficientes')
    && ['warning', 'error'].includes(String(alert.severity))
    && Boolean(String(alert.title || alert.description || '').trim()));
}
