import {useEffect,useRef,useState} from 'react';
import {openLocalCrewPdf} from '@/lib/crewlockerPdf';
import {crewLockerSession} from '@/lib/crewlockerOffline';
/** Canvas/image preview never navigates to a blob or changes external-link rules. */
export function CrewLocalPreview({blob,session,onClose}:{blob:Blob;session:string;onClose:()=>void}){
  const canvas=useRef<HTMLCanvasElement>(null),[pdf,setPdf]=useState<any>(null),[page,setPage]=useState(1),[error,setError]=useState(''),[image,setImage]=useState('');
  useEffect(()=>{
    let closed=false,document:any=null,url='';
    if(blob.type==='application/pdf')void openLocalCrewPdf(blob).then(async value=>{document=value;if(closed||session!==crewLockerSession())await value.destroy();else setPdf(value);}).catch(()=>{if(!closed)setError('Não foi possível visualizar este PDF. Use Baixar.');});
    else if(['image/png','image/jpeg','image/webp'].includes(blob.type)){url=URL.createObjectURL(blob);setImage(url);}
    else setError('Prévia indisponível para este formato. Use Baixar.');
    return()=>{closed=true;if(document)void document.destroy();if(url)URL.revokeObjectURL(url);};
  },[blob,session]);
  useEffect(()=>{
    let disposed=false,render:any;
    if(pdf&&canvas.current&&session===crewLockerSession())void pdf.getPage(page).then((value:any)=>{
      if(disposed||!canvas.current||session!==crewLockerSession())return;
      const viewport=value.getViewport({scale:Math.min(1.5,1200/value.getViewport({scale:1}).width)}),element=canvas.current;
      element.width=viewport.width;element.height=viewport.height;
      render=value.render({canvasContext:element.getContext('2d'),viewport});return render.promise;
    }).catch(()=>{if(!disposed)setError('Prévia indisponível. Use Baixar.');});
    return()=>{disposed=true;render?.cancel();};
  },[pdf,page,session]);
  if(session!==crewLockerSession())return null;
  return <section aria-label="Prévia local do documento"><button onClick={onClose}>Fechar prévia</button>{error&&<p role="status">{error}</p>}{image&&<img src={image} alt="Documento local" style={{maxWidth:'100%'}}/>}{pdf&&<><p><button disabled={page<=1} onClick={()=>setPage(page-1)}>Anterior</button> {page}/{pdf.numPages} <button disabled={page>=pdf.numPages} onClick={()=>setPage(page+1)}>Próxima</button></p><canvas ref={canvas} aria-label={`Página ${page}`} style={{maxWidth:'100%',height:'auto'}}/></>}</section>;
}
