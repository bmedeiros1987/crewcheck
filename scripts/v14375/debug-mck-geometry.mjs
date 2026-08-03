import { jsPDF } from 'jspdf';

const headerLine = 'Tripulante: TRIPULANTE TESTE -BP:00000000 -Base: BSB -01/08/2026 ate31/08/2026';
const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [800, 1400], compress: false });
doc.setFontSize(10);
doc.text('Escala de Tripulante Convertida para padrao AIMS', 25, 30);
doc.text(headerLine, 25, 50);
doc.text('07Aug', 100, 90);
['MCK', '08:00', 'BSB', '12:00'].forEach((token, index) => doc.text(token, 100, 110 + index * 14));
const bytes = Buffer.from(doc.output('arraybuffer'));

const pdfjsModuleUrl = import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs');
const pdfjsImport = await import(pdfjsModuleUrl);
const pdfjs = pdfjsImport.default || pdfjsImport;
const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true, isEvalSupported: false, disableFontFace: true }).promise;
const page = await pdf.getPage(1);
const tc = await page.getTextContent();
const items = tc.items.map((it) => ({ str: String(it.str || '').trim(), x: Number(it.transform?.[4] || 0), y: Number(it.transform?.[5] || 0) })).filter((it) => it.str);
console.log('[v14.3.75:mck-geometry]', JSON.stringify(items));

const marker = items.find((item) => item.str === '07Aug');
const column = marker ? items.filter((item) => item !== marker && item.x >= marker.x - 999 && item.x < marker.x + 999 && item.y < marker.y - 1).sort((a,b)=>b.y-a.y || a.x-b.x) : [];
console.log('[v14.3.75:mck-column]', JSON.stringify({ marker, column }));
