import { useLayoutEffect, useRef, useState } from 'react';
import { HEALTH_CARD_FIELDS, healthLockscreenSvg, type HealthCardField, type HealthCardValues } from '@/lib/healthLockscreen';
import './health-lockscreen.css';
// Local-only opt-in: no network, clipboard, storage, native bridge or automatic export.
export default function HealthLockscreenCard({ values, isCurrent = () => true }: {values:HealthCardValues; isCurrent?: () => boolean}) {
 const [selected,setSelected]=useState<HealthCardField[]>([]),[approved,setApproved]=useState(false),[preview,setPreview]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 let expected='';try{expected=healthLockscreenSvg(values,selected);}catch{}
 const current=Boolean(preview&&preview===expected);
 const revision=useRef(0);
 const latest=useRef({approved,current,preview});latest.current={approved,current,preview};
 // A changed value or unmount cancels the pending image, including same-value
 // selection/consent roundtrips recorded synchronously by the controls below.
 useLayoutEffect(()=>{revision.current++;return()=>{revision.current++;};},[expected]);
 function showPreview(){revision.current++;setApproved(false);setError('');try{setPreview(healthLockscreenSvg(values,selected));}catch(e){setPreview('');setError((e as Error).message);}}
 async function save(){
  if(!isCurrent()||!approved||!current||busy)return;
  const ticket=revision.current,exportPreview=preview;
  const allowed=()=>ticket===revision.current&&isCurrent()&&latest.current.approved&&latest.current.current&&latest.current.preview===exportPreview;
  setBusy(true);setError('');
  try{const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(preview);await image.decode();if(!allowed())return;const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Prévia indisponível neste navegador.');ctx.drawImage(image,0,0);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Não foi possível gerar a imagem.')),'image/png'));if(!allowed())return;const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='CrewCheck-Saude-Tela-Bloqueada.png';link.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);setApproved(false);}catch{if(isCurrent())setError('Não foi possível salvar. Tente em um navegador com suporte a download de imagens.');}finally{if(isCurrent())setBusy(false);}
 }
 return <section className="cc-health-lockscreen" aria-labelledby="health-lockscreen-title"><h2 id="health-lockscreen-title">Imagem para tela bloqueada</h2><p>Escolha somente o que poderá ficar visível para qualquer pessoa que veja seu celular. Nada é selecionado por padrão.</p><fieldset><legend>Campos da imagem</legend>{HEALTH_CARD_FIELDS.map(([key,label])=><label key={key}><input type="checkbox" checked={selected.includes(key)} disabled={!String(values[key]||'').trim()} onChange={e=>{revision.current++;setSelected(e.target.checked?[...selected,key]:selected.filter(k=>k!==key));setPreview('');setApproved(false);}}/>{label}{!String(values[key]||'').trim()?' · não preenchido':''}</label>)}</fieldset><button type="button" onClick={showPreview}>Ver prévia</button>{error&&<p role="alert">{error}</p>}{current&&<><img src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(preview)} alt="Prévia local dos campos de saúde selecionados"/><p>A imagem não expira e não pode ser revogada depois de salva ou fotografada. Ela não contém QR ou link de acesso.</p><label><input type="checkbox" checked={approved} onChange={e=>{revision.current++;setApproved(e.target.checked);}}/>Autorizo salvar no meu aparelho a imagem com os campos desta prévia.</label></>}<button type="button" onClick={save} disabled={!current||!approved||busy}>{busy?'Preparando…':'Salvar imagem PNG'}</button><p>Depois de salvar, use os ajustes ou a galeria do Android para escolher a imagem como tela de bloqueio. Recorte, relógio e controles variam por aparelho; confira a tela antes de aplicar. O CrewCheck não altera seu papel de parede automaticamente.</p></section>;
}
