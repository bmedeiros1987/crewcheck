import { useEffect, useMemo, useState } from 'react';
import {
  Tv, ShieldCheck, Users, WalletCards, CloudSun, Hotel, Car,
  Gauge, MapPin, Languages, RefreshCcw, Trash2, LockKeyhole,
} from 'lucide-react';
import { toast } from 'sonner';
import { authFetch } from '@/lib/authClient';
import './tv-device-control.css';

type Audience='owner'|'family'|'visitor';
type TvShare={
  operational:boolean;
  weather:boolean;
  hotel:boolean;
  crew:boolean;
  finance:boolean;
  mobility:boolean;
  traffic:boolean;
};
type TvPreferences={audience:Audience;share:TvShare};
type TvDevice={
  deviceId:string;
  platform:string;
  privacy:'family'|'private';
  trusted?:boolean;
  expiresAt?:string;
  lastSeenAt?:number;
  revoked?:boolean;
  contextActive?:boolean;
  preferences?:TvPreferences;
};
const DEFAULT_SHARE:TvShare={
  operational:true,weather:true,hotel:false,crew:false,finance:false,mobility:false,traffic:false,
};

function normalized(device:TvDevice):TvPreferences{
  const current=device.preferences||({audience:'owner',share:DEFAULT_SHARE} as TvPreferences);
  return{
    audience:['owner','family','visitor'].includes(current.audience)?current.audience:'owner',
    share:{...DEFAULT_SHARE,...current.share},
  };
}
function platformLabel(value:string){
  if(value==='lg-webos')return 'LG webOS';
  if(value==='samsung-tizen')return 'Samsung Tizen';
  if(value==='android-tv')return 'Android / Google TV';
  return value||'TV';
}
function relative(value?:number){
  if(!value)return 'Ainda não sincronizada';
  const delta=Math.max(0,Date.now()-value);
  if(delta<60000)return 'Agora';
  if(delta<3600000)return `há ${Math.floor(delta/60000)} min`;
  if(delta<86400000)return `há ${Math.floor(delta/3600000)} h`;
  return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short'}).format(new Date(value));
}
const SHARE_ROWS:Array<[keyof TvShare,string,string,any,boolean?]>=[
  ['operational','Operação','Escala, programação e contexto operacional.',ShieldCheck],
  ['weather','Meteorologia','Clima da base e próximo pernoite quando disponível.',CloudSun],
  ['traffic','Trânsito','Permite enviar sua localização por poucos minutos para calcular a rota até o aeroporto.',Gauge,true],
  ['mobility','Uber','Permite mostrar QR para continuar a solicitação no celular.',Car,true],
  ['hotel','Hotel / pernoite','Pode incluir hotel confirmado; quarto continua tratado como informação sensível.',Hotel,true],
  ['crew','Tripulação','Nomes e funções somente quando você autorizar.',Users,true],
  ['finance','Financeiro','Estimativas e diárias somente quando você autorizar.',WalletCards,true],
];

export default function TvDeviceControl(){
  const [devices,setDevices]=useState<TvDevice[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const active=useMemo(()=>devices.filter(device=>!device.revoked),[devices]);

  async function reload(){
    setLoading(true);
    try{
      const payload=await authFetch<any>('/api/tv/devices',{cache:'no-store'});
      setDevices(Array.isArray(payload)?payload:[]);
    }catch{
      toast.error('Não consegui carregar suas TVs vinculadas.');
    }finally{setLoading(false);}
  }
  useEffect(()=>{void reload();},[]);

  async function save(device:TvDevice,preferences:TvPreferences){
    setBusy(device.deviceId);
    try{
      const payload=await authFetch<any>('/api/tv/preferences',{
        method:'POST',
        body:JSON.stringify({deviceId:device.deviceId,preferences}),
      });
      setDevices(current=>current.map(item=>item.deviceId===device.deviceId?{...item,preferences:payload?.preferences||preferences}:item));
      toast.success('Preferências da TV atualizadas.');
    }catch{
      toast.error('Não consegui atualizar esta TV.');
    }finally{setBusy('');}
  }

  async function setAudience(device:TvDevice,audience:Audience){
    const current=normalized(device);
    const owner=audience==='owner';
    const share:TvShare={
      ...current.share,
      hotel:owner?current.share.hotel:false,
      crew:owner?current.share.crew:false,
      finance:owner?current.share.finance:false,
      mobility:owner?current.share.mobility:false,
      traffic:owner?current.share.traffic:false,
    };
    await save(device,{audience,share});
  }

  async function toggle(device:TvDevice,key:keyof TvShare){
    const current=normalized(device);
    const next=!current.share[key];
    if(current.audience!=='owner'&&['hotel','crew','finance','mobility','traffic'].includes(key)){
      toast.message('Esse dado sensível só pode ser habilitado no modo Proprietário.');
      return;
    }
    await save(device,{...current,share:{...current.share,[key]:next}});
  }

  async function pushTraffic(device:TvDevice){
    const preferences=normalized(device);
    if(preferences.audience!=='owner'||preferences.share.traffic!==true){
      toast.message('Ative Trânsito no modo Proprietário primeiro.');
      return;
    }
    if(!navigator.geolocation){
      toast.error('Localização indisponível neste dispositivo.');
      return;
    }
    setBusy(device.deviceId);
    navigator.geolocation.getCurrentPosition(async position=>{
      try{
        await authFetch('/api/tv/context',{
          method:'POST',
          body:JSON.stringify({
            deviceId:device.deviceId,
            context:{
              routeOrigin:{
                latitude:Number(position.coords.latitude),
                longitude:Number(position.coords.longitude),
                label:'Localização autorizada pelo celular',
              },
              ttlMs:5*60*1000,
            },
          }),
        });
        setDevices(current=>current.map(item=>item.deviceId===device.deviceId?{...item,contextActive:true}:item));
        toast.success('Trânsito liberado para esta TV por até 5 minutos.');
      }catch{
        toast.error('Não consegui enviar a localização para a TV.');
      }finally{setBusy('');}
    },()=>{
      setBusy('');
      toast.error('Permissão de localização negada ou indisponível.');
    },{enableHighAccuracy:true,timeout:10000,maximumAge:15000});
  }

  async function revoke(device:TvDevice){
    if(!confirm(`Desvincular ${platformLabel(device.platform)} desta conta?`))return;
    setBusy(device.deviceId);
    try{
      await authFetch('/api/tv/revoke',{method:'POST',body:JSON.stringify({deviceId:device.deviceId})});
      setDevices(current=>current.map(item=>item.deviceId===device.deviceId?{...item,revoked:true}:item));
      toast.success('TV desvinculada.');
    }catch{
      toast.error('Não consegui desvincular esta TV.');
    }finally{setBusy('');}
  }

  return <section className="cc-tv-control">
    <header>
      <div><span><Tv/> MINHA TV</span><h2>Controle o que cada tela pode ver.</h2>
        <p>A TV é uma extensão do CrewCheck. Dados sensíveis continuam sob controle do celular.</p></div>
      <button type="button" onClick={()=>void reload()} disabled={loading}><RefreshCcw/> Atualizar</button>
    </header>

    {loading&&<article className="cc-tv-empty"><Tv/><p>Carregando TVs vinculadas…</p></article>}
    {!loading&&!active.length&&<article className="cc-tv-empty"><Tv/><h3>Nenhuma TV vinculada</h3><p>Abra o CrewCheck TV e use o QR de autorização.</p></article>}

    <div className="cc-tv-device-list">
      {active.map(device=>{
        const prefs=normalized(device);
        const owner=prefs.audience==='owner';
        return <article className="cc-tv-device" key={device.deviceId}>
          <div className="cc-tv-device-head">
            <span className="cc-tv-device-icon"><Tv/></span>
            <div><h3>{platformLabel(device.platform)}</h3><p>{device.trusted?'TV confiável · vínculo persistente':'Vínculo temporário'} · {relative(device.lastSeenAt)}</p></div>
            <span className={device.contextActive?'context-on':'context-off'}><MapPin/>{device.contextActive?'Trânsito ativo':'Sem localização'}</span>
          </div>

          <div className="cc-tv-audience">
            <small>QUEM ESTÁ ASSISTINDO</small>
            <div>{(['owner','family','visitor'] as Audience[]).map(value=><button
              type="button"
              key={value}
              disabled={busy===device.deviceId}
              aria-pressed={prefs.audience===value}
              onClick={()=>void setAudience(device,value)}
            >{value==='owner'?'Proprietário':value==='family'?'Família':'Visitante'}</button>)}</div>
            <p>{prefs.audience==='visitor'
              ? 'Visitante: linguagem simples, códigos traduzidos e dados sensíveis bloqueados.'
              : prefs.audience==='family'
                ? 'Família: visão reduzida, sem dados sensíveis ou localização precisa.'
                : 'Proprietário: você escolhe individualmente o que pode chegar à TV.'}</p>
          </div>

          <div className="cc-tv-share-grid">
            {SHARE_ROWS.map(([key,title,detail,Icon,sensitive])=>{
              const disabled=!owner&&Boolean(sensitive);
              return <button type="button" key={key}
                disabled={busy===device.deviceId||disabled}
                aria-pressed={prefs.share[key]}
                onClick={()=>void toggle(device,key)}
              >
                <span><Icon/></span><div><b>{title}</b><small>{detail}</small>{sensitive&&<em><LockKeyhole/> autorização sensível</em>}</div><i>{prefs.share[key]?'ON':'OFF'}</i>
              </button>;
            })}
          </div>

          {owner&&prefs.share.traffic&&<button className="cc-tv-location-button" type="button" disabled={busy===device.deviceId} onClick={()=>pushTraffic(device)}>
            <MapPin/> Atualizar trânsito na TV agora
          </button>}

          <footer>
            <span><Languages/> No modo Visitante, IATA/ICAO e siglas conhecidas ganham explicação em linguagem simples.</span>
            <button type="button" className="danger" disabled={busy===device.deviceId} onClick={()=>void revoke(device)}><Trash2/> Desvincular</button>
          </footer>
        </article>;
      })}
    </div>
  </section>;
}
