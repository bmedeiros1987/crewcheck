/** Content signature, including PDFs supplied by mobile providers without MIME. */
export async function isLocalCrewPdf(blob:Blob):Promise<boolean>{
  const header=new Uint8Array(await blob.slice(0,1024).arrayBuffer());
  return new TextDecoder('latin1').decode(header).includes('%PDF-');
}
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
export async function openLocalCrewPdf(blob: Blob) {
  if(blob.size>15*1024*1024)throw new Error('PDF acima de 15 MB.');
  const module:any=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs=module.default||module;pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
  const task=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,enableXfa:false,useWorkerFetch:false});
  let pdf;
  try {pdf=await task.promise;} catch(error){await task.destroy();throw error;}
  if(pdf.numPages>40){await task.destroy();throw new Error('PDF acima de 40 páginas.');}
  return {numPages:pdf.numPages,getPage:pdf.getPage.bind(pdf),destroy:()=>task.destroy()};
}
/** Device-local only. Never retains text, identifiers or document bytes. */
export async function crewPdfText(blob:Blob):Promise<string> {
  const pdf=await openLocalCrewPdf(blob);
  try {
    const pages:string[]=[];let characters=0;
    for(let number=1;number<=pdf.numPages;number++){
      const content=await (await pdf.getPage(number)).getTextContent();
      const rows=new Map<number,Array<{x:number;text:string}>>();
      for(const item of content.items){if(typeof item.str!=='string'||!Number.isFinite(item.transform?.[4])||!Number.isFinite(item.transform?.[5]))continue;characters+=item.str.length;if(characters>500000)throw new Error('Texto acima do limite local.');const y=Math.round(item.transform[5]),row=rows.get(y)||[];row.push({x:item.transform[4],text:item.str});rows.set(y,row);}
      pages.push([...rows].sort((a,b)=>b[0]-a[0]).map(([,row])=>row.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')).join('\n'));
    }
    return pages.join('\n\f\n');
  } finally {await pdf.destroy();}
}
