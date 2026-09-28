const SHARED_PDF_QUERY = 'crewcheckSharedPdf';
const SHARED_PDF_ROUTE = '/__crewcheck_shared_pdf/';

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

async function consumePwaSharedPdf() {
  const url = new URL(window.location.href);
  const shareId = String(url.searchParams.get(SHARED_PDF_QUERY) || '').trim();
  if (!shareId) return;

  try {
    const response = await fetch(`${SHARED_PDF_ROUTE}${encodeURIComponent(shareId)}`, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('shared_pdf_unavailable');

    const blob = await response.blob();
    if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('shared_pdf_invalid_size');

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const signature = new TextDecoder('ascii').decode(bytes.subarray(0, 5));
    if (signature !== '%PDF-') throw new Error('shared_pdf_invalid_signature');

    const encodedName = response.headers.get('x-crewcheck-filename') || '';
    let filename = 'CrewCheck-escala.pdf';
    try {
      filename = decodeURIComponent(encodedName) || filename;
    } catch {}
    if (!filename.toLowerCase().endsWith('.pdf')) filename = `${filename}.pdf`;

    const payload = {
      sourceFileName: filename,
      shareId: `pwa:${shareId}`,
      dataBase64: bytesToBase64(bytes),
    };

    (window as any).__crewcheckPendingNativePdf = payload;
    window.dispatchEvent(new CustomEvent('crewcheck:native-pdf', { detail: payload }));

    url.searchParams.delete(SHARED_PDF_QUERY);
    url.searchParams.delete('crewcheckShareError');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    (window as any).__crewcheckPwaShareError = 'Não consegui abrir o PDF compartilhado. Abra Importar escala e tente novamente.';
    window.dispatchEvent(new CustomEvent('crewcheck:pwa-share-error', {
      detail: { message: (window as any).__crewcheckPwaShareError },
    }));
    url.searchParams.delete(SHARED_PDF_QUERY);
    url.searchParams.set('view', 'import');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
}

if (typeof window !== 'undefined') {
  window.setTimeout(() => { void consumePwaSharedPdf(); }, 0);
}
