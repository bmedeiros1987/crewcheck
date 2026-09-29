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
