/** Browser-only, pinned Tesseract v7 worker protocol; no provider/API integration.
 * A direct Worker handle is intentional: createWorker() exposes its handle only
 * after initialization, which cannot satisfy cancellation while models load.
 */
export const STAY_OCR_ASSET_PATH = '/ocr/v7/';
export const STAY_SCREENSHOT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 12_000_000;
const MAX_EDGE = 10_000;
const OCR_EDGE = 2400;
const OCR_TIMEOUT_MS = 90_000;
export type StayOcrErrorCode = 'unsupported' | 'invalid-image' | 'too-large' | 'unavailable' | 'timeout' | 'cancelled';
export class StayOcrError extends Error {
  constructor(public readonly code: StayOcrErrorCode) { super(code); this.name = 'StayOcrError'; }
}
export type StayScreenshotResult = { text: string; confidence: number };
export type StayOcrOptions = { signal: AbortSignal; onProgress?: (progress: number) => void };
function fail(code: StayOcrErrorCode): never { throw new StayOcrError(code); }
const checkAbort = (signal: AbortSignal) => { if (signal.aborted) fail('cancelled'); };
const abortable = <T>(promise: Promise<T>, signal: AbortSignal, disposeLate?: (value: T) => void): Promise<T> => new Promise((resolve, reject) => {
  const aborted = () => reject(new StayOcrError('cancelled'));
  signal.addEventListener('abort', aborted, { once: true });
  if (signal.aborted) aborted();
  promise.then(value => {
    signal.removeEventListener('abort', aborted);
    if (signal.aborted) { disposeLate?.(value); reject(new StayOcrError('cancelled')); }
    else resolve(value);
  }, reason => { signal.removeEventListener('abort', aborted); reject(reason); });
});

/** Signature + dimensions are checked before pixel decode, not MIME/filename trust. */
export function inspectStayScreenshot(bytes: Uint8Array, declaredType = ''): { mime: string; width: number; height: number } {
  if (!bytes.length || bytes.length > STAY_SCREENSHOT_MAX_BYTES) fail('too-large');
  const ascii = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let mime = ''; let width = 0; let height = 0;
  if (bytes.length >= 33 && bytes[0] === 137 && ascii(1, 3) === 'PNG' && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
    mime = 'image/png';
    if (view.getUint32(8) !== 13 || ascii(12, 4) !== 'IHDR') fail('invalid-image');
    width = view.getUint32(16); height = view.getUint32(20);
    // Animated PNGs are intentionally outside the one-image import contract.
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset);
      if (length > bytes.length - offset - 12) fail('invalid-image');
      if (ascii(offset + 4, 4) === 'acTL') fail('unsupported');
      offset += length + 12;
    }
  } else if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    mime = 'image/webp';
    if (view.getUint32(4, true) + 8 !== bytes.length) fail('invalid-image');
    const kind = ascii(12, 4);
    if (kind === 'VP8X') {
      if (bytes[20] & 2) fail('unsupported');
      width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    } else if (kind === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) {
      width = view.getUint16(26, true) & 16383; height = view.getUint16(28, true) & 16383;
    } else if (kind === 'VP8L' && bytes[20] === 47) {
      width = 1 + bytes[21] + ((bytes[22] & 63) << 8);
      height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10);
    } else fail('invalid-image');
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    mime = 'image/jpeg';
    for (let offset = 2; offset + 3 < bytes.length;) {
      if (bytes[offset++] !== 255) fail('invalid-image');
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) fail('invalid-image');
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) fail('invalid-image');
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        if (length < 8) fail('invalid-image');
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5); break;
      }
      offset += length;
    }
  } else fail('unsupported');
  if (declaredType && declaredType !== mime) fail('unsupported');
  if (!width || !height) fail('invalid-image');
  if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_PIXELS) fail('too-large');
  return { mime, width, height };
}

/** Decoding strips metadata and converts WebP to a format understood by the core.
 * Image/PNG bytes, canvas and bitmap stay in RAM and are released on every exit.
 */
async function decodedPng(file: File, signal: AbortSignal): Promise<Uint8Array> {
  checkAbort(signal);
  if (!file.size || file.size > STAY_SCREENSHOT_MAX_BYTES) fail('too-large');
  const original = new Uint8Array(await abortable(file.arrayBuffer(), signal, value => new Uint8Array(value).fill(0)));
  let bitmap: ImageBitmap | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    checkAbort(signal);
    const info = inspectStayScreenshot(original, file.type);
    if (typeof createImageBitmap !== 'function') fail('unavailable');
    bitmap = await abortable(createImageBitmap(new Blob([original], { type: info.mime })), signal, value => value.close());
    checkAbort(signal);
    if (!bitmap.width || !bitmap.height || bitmap.width > MAX_EDGE || bitmap.height > MAX_EDGE || bitmap.width * bitmap.height > MAX_PIXELS) fail('too-large');
    const scale = Math.min(1, OCR_EDGE / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) fail('unavailable');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await abortable(new Promise<Blob>((resolve, reject) => canvas!.toBlob(value => value ? resolve(value) : reject(new StayOcrError('invalid-image')), 'image/png')), signal);
    checkAbort(signal);
    const result = new Uint8Array(await abortable(blob.arrayBuffer(), signal, value => new Uint8Array(value).fill(0)));
    checkAbort(signal);
    return result;
  } catch (error) {
    if (error instanceof StayOcrError) throw error;
    throw new StayOcrError('invalid-image');
  } finally {
    original.fill(0); bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

/** No URL/string inputs: callers must supply a user-selected local File.
 * Timeout/abort terminate the native worker immediately, including initialization.
 * Only public engine/model assets can be fetched; OCR output is never logged.
 */
export async function recognizeStayScreenshot(file: File, { signal, onProgress }: StayOcrOptions): Promise<StayScreenshotResult> {
  checkAbort(signal);
  if (typeof Worker !== 'function' || typeof WebAssembly !== 'object') fail('unavailable');
  const lifetime = new AbortController();
  let timedOut = false;
  const cancel = () => lifetime.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(() => { timedOut = true; lifetime.abort(); }, OCR_TIMEOUT_MS);
  let worker: Worker | undefined;
  let png: Uint8Array | undefined;
  let pending: { id: string; action: string; resolve: (value: any) => void; reject: (error: Error) => void } | undefined;
  const error = () => new StayOcrError(timedOut ? 'timeout' : lifetime.signal.aborted ? 'cancelled' : 'unavailable');
  const stop = () => {
    worker?.terminate(); worker = undefined;
    pending?.reject(error()); pending = undefined;
  };
  lifetime.signal.addEventListener('abort', stop, { once: true });
  try {
    png = await decodedPng(file, lifetime.signal);
    checkAbort(lifetime.signal);
    const base = new URL(STAY_OCR_ASSET_PATH, window.location.origin);
    worker = new Worker(new URL('worker-f7266295819b4f8f.js', base), { name: 'crewcheck-local-screenshot-ocr' });
    let sequence = 0;
    worker.onerror = event => { event.preventDefault(); pending?.reject(error()); stop(); };
    worker.onmessageerror = () => { pending?.reject(error()); stop(); };
    worker.onmessage = ({ data }) => {
      if (!pending || data?.workerId !== 'stay-screenshot' || data?.jobId !== pending.id || data?.action !== pending.action) return;
      if (data.status === 'progress') {
        if (data.action === 'recognize' && Number.isFinite(data.data?.progress)) onProgress?.(Math.max(0, Math.min(1, data.data.progress)));
        return;
      }
      const current = pending; pending = undefined;
      if (data.status === 'resolve') current.resolve(data.data);
      else current.reject(error()); // Deliberately discard upstream error payloads.
    };
    const job = (action: string, payload: unknown) => new Promise<any>((resolve, reject) => {
      if (!worker || lifetime.signal.aborted) { reject(error()); return; }
      const id = String(++sequence); pending = { id, action, resolve, reject };
      worker.postMessage({ workerId: 'stay-screenshot', jobId: id, action, payload });
    });
    await job('load', { options: { lstmOnly: true, corePath: base.href, logging: false } });
    await job('loadLanguage', { langs: ['eng', 'por'], options: { langPath: base.href, cacheMethod: 'none', gzip: true, lstmOnly: true } });
    await job('initialize', { langs: ['eng', 'por'], oem: 1, config: { load_system_dawg: '0', load_freq_dawg: '0' } });
    await job('setParameters', { params: { tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' } });
    const result = await job('recognize', { image: png, options: {}, output: { text: true } });
    checkAbort(lifetime.signal);
    if (typeof result?.text !== 'string' || result.text.length > 20_000) fail('unavailable');
    return { text: result.text, confidence: Number.isFinite(result.confidence) ? result.confidence : 0 };
  } catch (cause) {
    if (timedOut) fail('timeout');
    if (lifetime.signal.aborted) fail('cancelled');
    if (cause instanceof StayOcrError) throw cause;
    throw new StayOcrError('unavailable');
  } finally {
    clearTimeout(timeout); signal.removeEventListener('abort', cancel);
    lifetime.signal.removeEventListener('abort', stop); stop(); png?.fill(0);
  }
}

export function startStayScreenshotOcr(file: File, options: { onProgress?: (progress: number) => void } = {}) {
  const controller = new AbortController();
  return { promise: recognizeStayScreenshot(file, { signal: controller.signal, onProgress: options.onProgress }), cancel: () => controller.abort() };
}
