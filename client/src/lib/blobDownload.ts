/** Request a browser download. A click is not a receipt that the file was saved. */
export function requestBlobDownload(blob: Blob, fileName: string): string {
  if (!blob.size) throw new Error('O arquivo está vazio. Gere o documento novamente.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.replace(/[\\/\u0000-\u001f\u007f]/g, '_').slice(0, 180) || 'CrewCheck-documento';
  anchor.rel = 'noopener';
  anchor.hidden = true;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    anchor.remove();
  }
  // Download navigation may consume the Blob after click() has returned.
  // Keep its URL alive; immediate revocation loses that race on some clients.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return url;
}
