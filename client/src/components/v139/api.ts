import { requestBlobDownload } from '@/lib/blobDownload';
export async function v139Api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...options });
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new Error('Operação indisponível.');
    return response;
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) throw new Error(payload?.message || 'Operação indisponível.');
  return payload;
}

export function downloadBlob(blob: Blob, fileName: string) {
  requestBlobDownload(blob, fileName);
}

export function notifyLocal(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body });
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => undefined);
  } catch {}
}
