import { getStoredUser, getToken } from './authClient';

const PREFIX = 'crewcheck:shared-pdf-account:v1:';
type Receipt = { version: 1; owner: string | null; committed?: true };

// Only an existing stable share ID can authorize replay across login/reload.
// No PDF bytes, filename, token, email or display name is persisted.
export function sharedPdfIdentity(payload: any): string {
  return String(payload?.shareId || '').trim();
}

function connectedOwner(): string | null {
  try {
    const id = getToken() ? getStoredUser()?.id : null;
    return typeof id === 'string' && id.trim() ? id : null;
  } catch { return null; }
}

export function sharedPdfAccountReceipt(payload: any): { allowed: boolean; reason: string; committed?: boolean } {
  // Capture the authenticated opaque account ID before looking at the payload.
  const owner = connectedOwner();
  const shareId = sharedPdfIdentity(payload);
  if (!shareId) return { allowed: false, reason: 'invalid' };
  try {
    const key = PREFIX + encodeURIComponent(shareId);
    const raw = localStorage.getItem(key);
    let receipt: Receipt;
    if (raw === null) {
      receipt = { version: 1, owner };
      const encoded = JSON.stringify(receipt);
      localStorage.setItem(key, encoded);
      if (localStorage.getItem(key) !== encoded) return { allowed: false, reason: 'storage' };
    } else {
      receipt = JSON.parse(raw);
      if (receipt?.version !== 1 || !(receipt.owner === null || (typeof receipt.owner === 'string' && receipt.owner.trim()))) {
        return { allowed: false, reason: 'storage' };
      }
    }
    // An unowned receipt is NEVER silently adopted by the next login.
    if (receipt.owner === null) return { allowed: false, reason: 'signed-out' };
    if (!owner || receipt.owner !== owner) return { allowed: false, reason: 'other-account' };
    return { allowed: true, reason: 'same-account', committed: receipt.committed === true };
  } catch { return { allowed: false, reason: 'storage' }; }
}

// Keep a committed tombstone so failed/late ACK retries never reparse a saved PDF.
export function markSharedPdfCommitted(payload: any): boolean {
  const receipt = sharedPdfAccountReceipt(payload);
  const owner = connectedOwner();
  if (!receipt.allowed || !owner) return false;
  try {
    const key = PREFIX + encodeURIComponent(sharedPdfIdentity(payload));
    const encoded = JSON.stringify({ version: 1, owner, committed: true });
    localStorage.setItem(key, encoded);
    return owner === connectedOwner() && localStorage.getItem(key) === encoded;
  } catch { return false; }
}

// Loaded by the existing PWA bootstrap, before authenticated Home is mounted.
// This also captures native delivery while the login screen is displayed.
if (typeof window !== 'undefined') {
  window.addEventListener('crewcheck:native-pdf', (event: Event) => {
    sharedPdfAccountReceipt((event as CustomEvent).detail);
  });
  const pending = (window as any).__crewcheckPendingNativePdf;
  if (pending) sharedPdfAccountReceipt(pending);
}
