const SHARED_PDF_QUERY = 'crewcheckSharedPdf';
const SHARED_PDF_ROUTE = '/__crewcheck_shared_pdf/';
const PENDING_SHARE_KEY = 'crewcheck_pending_pwa_pdf_share_v2';
const SHARE_ERROR_KEY = 'crewcheck_pending_pwa_pdf_error_v1';
const MAX_SHARED_PDF_BYTES = 20 * 1024 * 1024;
const PENDING_SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PendingShareRecord = {
  id: string;
  capturedAt: number;
};

export type PwaSharedPdfClaim = {
  shareId: string;
  file: File;
};

function readPendingShare(): PendingShareRecord | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PENDING_SHARE_KEY) || 'null') as PendingShareRecord | null;
    if (!parsed?.id || !Number.isFinite(Number(parsed.capturedAt))) return null;
    if (Date.now() - Number(parsed.capturedAt) > PENDING_SHARE_MAX_AGE_MS) {
      window.localStorage.removeItem(PENDING_SHARE_KEY);
      return null;
    }
    return { id: String(parsed.id), capturedAt: Number(parsed.capturedAt) };
  } catch {
    return null;
  }
}

function writePendingShare(id: string) {
  try {
    window.localStorage.setItem(PENDING_SHARE_KEY, JSON.stringify({ id, capturedAt: Date.now() }));
  } catch {}
}

function clearPendingShare(id?: string) {
  try {
    const current = readPendingShare();
    if (!id || !current || current.id === id) window.localStorage.removeItem(PENDING_SHARE_KEY);
  } catch {}
}

function cleanShareQuery() {
  try {
    const url = new URL(window.location.href);
    const changed = url.searchParams.has(SHARED_PDF_QUERY) || url.searchParams.has('crewcheckShareError');
    url.searchParams.delete(SHARED_PDF_QUERY);
    url.searchParams.delete('crewcheckShareError');
    if (changed) window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

function rememberShareFromCurrentUrl() {
  try {
    const url = new URL(window.location.href);
    const shareId = String(url.searchParams.get(SHARED_PDF_QUERY) || '').trim();
    const shareError = String(url.searchParams.get('crewcheckShareError') || '').trim();

    if (shareId) {
      writePendingShare(shareId);
      try { window.localStorage.removeItem(SHARE_ERROR_KEY); } catch {}
      cleanShareQuery();
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('crewcheck:pwa-pdf-ready', { detail: { shareId } }));
      }, 0);
      return;
    }

    if (shareError) {
      const message = shareError === 'invalid_size'
        ? 'O PDF compartilhado é maior que o limite aceito pelo CrewCheck.'
        : shareError === 'invalid_pdf'
          ? 'O arquivo compartilhado não parece ser um PDF válido.'
          : 'Não consegui receber o PDF compartilhado.';
      try { window.localStorage.setItem(SHARE_ERROR_KEY, message); } catch {}
      cleanShareQuery();
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('crewcheck:pwa-share-error', { detail: { message } }));
      }, 0);
    }
  } catch {}
}

function pdfSignatureValid(bytes: Uint8Array) {
  return bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d;
}

export function hasPendingPwaSharedPdf(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(readPendingShare()?.id);
}

export function consumePendingPwaShareError(): string {
  if (typeof window === 'undefined') return '';
  try {
    const message = window.localStorage.getItem(SHARE_ERROR_KEY) || '';
    if (message) window.localStorage.removeItem(SHARE_ERROR_KEY);
    return message;
  } catch {
    return '';
  }
}

export async function claimPendingPwaSharedPdf(): Promise<PwaSharedPdfClaim | null> {
  if (typeof window === 'undefined') return null;
  const pending = readPendingShare();
  if (!pending?.id) return null;

  const response = await fetch(`${SHARED_PDF_ROUTE}${encodeURIComponent(pending.id)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    if (response.status === 404) clearPendingShare(pending.id);
    throw new Error('O PDF compartilhado não está mais disponível. Compartilhe novamente.');
  }

  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_SHARED_PDF_BYTES) {
    throw new Error('O PDF compartilhado tem tamanho inválido.');
  }

  const bytes = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  if (!pdfSignatureValid(bytes)) {
    throw new Error('O arquivo compartilhado não parece ser um PDF válido.');
  }

  const encodedName = response.headers.get('x-crewcheck-filename') || '';
  let filename = 'CrewCheck-escala.pdf';
  try {
    filename = decodeURIComponent(encodedName) || filename;
  } catch {}
  if (!filename.toLowerCase().endsWith('.pdf')) filename = `${filename}.pdf`;

  return {
    shareId: pending.id,
    file: new File([blob], filename, { type: 'application/pdf', lastModified: Date.now() }),
  };
}

export async function acknowledgePwaSharedPdf(shareId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const id = String(shareId || '').trim();
  if (!id) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const worker = navigator.serviceWorker.controller || registration.active;
    worker?.postMessage({ type: 'ACK_SHARED_PDF', shareId: id });
  } catch {
    // The local marker can still be cleared; the service-worker TTL will clean the blob.
  }

  clearPendingShare(id);
  cleanShareQuery();
}

if (typeof window !== 'undefined') {
  rememberShareFromCurrentUrl();
}
