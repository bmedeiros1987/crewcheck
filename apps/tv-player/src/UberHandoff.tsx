import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Car, Smartphone, ShieldCheck } from 'lucide-react';

export type TvMobilityHandoff={
  provider:'uber';
  deepLink:string;
  pickupLabel?:string|null;
  destinationLabel?:string|null;
};

function safeUberLink(value:unknown):string{
  try{
    const url=new URL(String(value||''));
    return url.protocol==='https:' && url.hostname==='m.uber.com' ? url.toString() : '';
  }catch{return '';}
}

export function UberHandoff({mobility}:{mobility:TvMobilityHandoff|null|undefined}){
  const link=useMemo(()=>mobility?.provider==='uber'?safeUberLink(mobility.deepLink):'',[mobility]);
  const [qr,setQr]=useState('');
  useEffect(()=>{
    let active=true;
    if(!link){setQr('');return()=>{active=false;};}
    QRCode.toDataURL(link,{margin:1,width:320,errorCorrectionLevel:'M'}).then(value=>{if(active)setQr(value);}).catch(()=>{if(active)setQr('');});
    return()=>{active=false;};
  },[link]);
  if(!link)return null;
  return <article className="uber-handoff">
    <div className="uber-handoff-copy"><p><Car/> UBER NO CELULAR</p><h3>Seu transporte continua no telefone.</h3>
      <span>{mobility?.pickupLabel||'Local de embarque no Uber'} → {mobility?.destinationLabel||'destino sugerido'}</span>
      <small><ShieldCheck/>A TV não confirma nem compra a corrida. Escaneie e finalize no aplicativo/site da Uber.</small>
    </div>
    <div className="uber-handoff-qr">{qr?<img src={qr} alt="QR Code para abrir solicitação de Uber no celular"/>:<Smartphone/>}<b>Escaneie para continuar</b></div>
  </article>;
}
