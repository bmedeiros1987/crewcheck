import React from 'react';
import { ShieldCheck, ArrowRight } from 'lucide-react';
import './pairing-diagnostics.css';
export const PAIRING_BUILD = '0.2.2';
export type PairingCode = {deviceCode:string;userCode:string;verificationUri:string;expiresIn:number;interval:number;deadline:number;trusted?:boolean};
export function validatePairing(raw:any, origin:string, now=Date.now()): PairingCode {
  if (!raw || typeof raw.deviceCode!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(raw.deviceCode) ||
    typeof raw.userCode!=='string' || !/^[A-F0-9]{10}$/.test(raw.userCode) ||
    typeof raw.verificationUri!=='string' || !Number.isFinite(raw.expiresIn) || raw.expiresIn<1 || raw.expiresIn>600 ||
    !Number.isFinite(raw.interval) || raw.interval<5 || raw.interval>60) throw Error('invalid_pairing_response');
  const address=new URL(raw.verificationUri),expected=new URL(origin);
  if(address.protocol!=='https:' || address.origin!==expected.origin || address.username || address.password || address.pathname!=='/tv-pair' ||
    address.searchParams.get('code')!==raw.userCode || address.hash || Array.from(address.searchParams.keys()).some(key=>key!=='code')) throw Error('invalid_pairing_response');
  return {...raw,trusted:raw.trusted===true,deadline:now+raw.expiresIn*1000};
}
export function pairingFailure(error:unknown): {code:string;message:string} {
  // Never put raw network/server strings, credentials or user identifiers on screen.
  const message=error instanceof Error?error.message:'';
  if(/Illegal invocation|incompatible receiver/i.test(message)) return {code:'TV-NET-01',message:'Falha de compatibilidade na chamada de rede.'};
  if(message==='request_timeout') return {code:'TV-NET-02',message:'O servidor não respondeu a tempo. Tente novamente.'};
  if(message==='pair_again') return {code:'TV-AUTH-01',message:'Solicitação recusada. Confira a autorização do piloto.'};
  if(message==='invalid_pairing_response') return {code:'TV-PAIR-01',message:'O servidor retornou um código de vínculo inválido.'};
  const snapshot=message.match(/^invalid_snapshot_(schema|device|privacy|time|days_type|days_count|summary|changes|ticker)$/);
  if(snapshot){
    const details={
      schema:['TV-DATA-SCHEMA','A versão dos dados recebidos não é compatível com esta TV.'],
      device:['TV-DATA-DEVICE','A escala recebida pertence a outro vínculo de TV.'],
      privacy:['TV-DATA-PRIVACY','O modo de privacidade da escala não corresponde ao autorizado.'],
      time:['TV-DATA-TIME','A validade temporal da escala recebida não pôde ser confirmada.'],
      days_type:['TV-DATA-DAYS','O calendário recebido não está no formato esperado.'],
      days_count:['TV-DATA-DAYS','O calendário recebido excedeu o limite mensal esperado.'],
      summary:['TV-DATA-SUMMARY','O resumo mensal recebido está incompleto.'],
      changes:['TV-DATA-CHANGES','A lista de mudanças recebida não está no formato esperado.'],
      ticker:['TV-DATA-TICKER','As mensagens de contexto recebidas não estão no formato esperado.'],
    } as const;
    const detail=details[snapshot[1] as keyof typeof details];
    return {code:detail[0],message:detail[1]};
  }
  if(message==='invalid_snapshot') return {code:'TV-DATA-01',message:'A TV recusou uma escala que não passou na validação.'};
  const status=message.match(/^request_(\d{3})$/);
  if(status){const s=Number(status[1]);return {code:'TV-HTTP-'+s,message:s===404?'Pareamento não habilitado neste endereço.':s===429?'Muitas tentativas. Aguarde um minuto.':s>=500?'Serviço temporariamente indisponível.':'O servidor recusou a solicitação.'};}
  if(error instanceof SyntaxError) return {code:'TV-DATA-02',message:'A resposta recebida não é um documento válido.'};
  return {code:'TV-NET-03',message:'A TV não concluiu a conexão. Pode ser rede, certificado ou permissão de origem.'};
}
export function PairingDiagnostics({status,code,busy,pairing,qr,origin,trusted,onTrustedChange,onBegin,onCheck}:{status:string;code:string;busy:boolean;pairing:PairingCode|null;qr:string;origin:string;trusted:boolean;onTrustedChange:(value:boolean)=>void;onBegin:()=>void;onCheck:()=>void}) {
  let host='servidor configurado';try{host=new URL(origin).host;}catch{}
  const appOrigin=location.origin==='null'?'arquivo local':location.origin;
  return <section className="pair pair-diagnostics view-enter"><div>
    <p className="eyebrow"><ShieldCheck/> BEM-VINDO A BORDO</p><h1>Sua próxima jornada.<br/>Na sua TV.</h1>
    <p>Autorize esta tela pelo CrewCheck no celular.</p><div className="pair-buttons"><button className="primary-button" disabled={busy} onClick={onBegin}>{busy?'Conectando…':pairing?'Gerar novo código':'Vincular TV'} <ArrowRight/></button><button disabled={busy} onClick={onCheck}>Testar conexão</button></div>
    <button className="trusted-tv-choice" disabled={busy||Boolean(pairing)} aria-pressed={trusted} onClick={()=>onTrustedChange(!trusted)}><span>{trusted?'✓':'○'}</span><b>{trusted?'Manter esta TV vinculada':'Vincular só nesta sessão'}</b></button>
    <small className="trusted-tv-note">{trusted?'TV pessoal: o CrewCheck lembrará este aparelho até você desvincular ou revogar pelo celular.':'Ao fechar ou reiniciar a TV, será necessário vincular novamente.'}</small>
    <p role="status">{status}</p><small>Nenhuma senha da conta é solicitada nesta televisão.</small>
    <div className="pair-diagnostic-info"><b>CrewCheck TV Piloto · {PAIRING_BUILD}</b><span>{host}</span><span>Origem: {appOrigin}</span>{code&&<strong>Diagnóstico: {code}</strong>}</div>
  </div>{pairing&&<aside>{qr?<img src={qr} alt="QR Code de autorização da TV"/>:<div className="qr-fallback">Use o endereço e o código abaixo no celular.</div>}<h2>{pairing.userCode}</h2><p>{host}/tv-pair</p><small>Válido por {Math.ceil(pairing.expiresIn/60)} minutos. Confira o código no celular antes de autorizar.</small></aside>}</section>;
}
