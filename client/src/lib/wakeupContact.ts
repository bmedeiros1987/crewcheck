export const CREWCHECK_WAKEUP_CONTACT_NAME = 'Despertador CrewCheck';

export function normalizeWakeupCallerId(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (!/^\d{8,15}$/.test(digits)) return '';
  return `+${digits}`;
}

export function wakeupCallerIdFromHealth(health: any): string {
  return normalizeWakeupCallerId(
    health?.phoneProvider?.infobip?.callerId
      || health?.phoneProvider?.callerId
      || health?.infobip?.callerId
      || health?.callerId
      || '',
  );
}

function escapeVCardText(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildWakeupContactVCard(callerId: unknown): string {
  const phone = normalizeWakeupCallerId(callerId);
  if (!phone) return '';
  const name = CREWCHECK_WAKEUP_CONTACT_NAME;
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCardText(name)}`,
    'N:CrewCheck;Despertador;;;',
    `TEL;TYPE=CELL:${phone}`,
    'NOTE:Ligação oficial do Despertador CrewCheck.',
    'END:VCARD',
    '',
  ].join('\r\n');
}

export function downloadWakeupContact(callerId: unknown): boolean {
  const vcard = buildWakeupContactVCard(callerId);
  if (!vcard || typeof document === 'undefined' || typeof URL === 'undefined') return false;
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = 'Despertador-CrewCheck.vcf';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
  return true;
}
