import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { detectPdfDestination, MAX_INTAKE_BYTES, type PdfDetection } from './universalPdfIntake';

// Independent local text inspection; no roster parser, OCR service or upload.
export async function inspectIntakePdf(file: File): Promise<PdfDetection> {
  if (file.size > MAX_INTAKE_BYTES) throw new Error('PDF maior que 35 MB.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async (): Promise<PdfDetection> => {
        const pdf = await task.promise;
        // Partial evidence must not silently classify a long/combined document.
        if (pdf.numPages > 12) return { destination: 'choose' };
        let text = '';
        for (let index = 1; index <= pdf.numPages; index += 1) {
          const page = await pdf.getPage(index);
          const content = await page.getTextContent();
          text += ' ' + content.items.map((item) => 'str' in item ? item.str : '').join(' ');
          page.cleanup();
          if (text.length > 200_000) return { destination: 'choose' };
        }
        return detectPdfDestination(text);
      })(),
      new Promise<PdfDetection>((resolve) => { timer = setTimeout(() => resolve({ destination: 'choose' }), 12_000); }),
    ]);
  } catch {
    // Scanned, encrypted, corrupt or unsupported PDFs require an explicit choice.
    return { destination: 'choose' };
  } finally {
    clearTimeout(timer);
    await task.destroy();
  }
}
