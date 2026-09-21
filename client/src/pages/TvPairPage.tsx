import { useEffect, useState } from 'react';
import { authFetch } from '../lib/authClient';

type TvAudience='owner'|'family'|'visitor';
type TvShare={
  operational:boolean;
  weather:boolean;
  hotel:boolean;
  crew:boolean;
  finance:boolean;
  mobility:boolean;
  traffic:boolean;
};
type TvPreferences={audience:TvAudience;share:TvShare};
type TvDevice={
  deviceId:string;
  platform:string;
  privacy:'family'|'private';
  trusted?:boolean;
  expiresAt?:string|null;
  lastSeenAt:number|string;
  revoked:boolean;
  contextActive?:boolean;
  preferences?:TvPreferences;
};

const DEFAULT_PREFS:TvPreferences={
  audience:'owner',
  share:{operational:true,weather:true,hotel:false,crew:false,finance:false,mobility:false,traffic:false},
};

function normalizedPreferences(value?:TvPreferences):TvPreferences{
  const share=value?.share||({} as TvShare);
  return{
    audience:['owner','family','visitor'].includes(value?.audience||'')?value!.audience:'owner',
    share:{
      operational:share.operational!==false,
      weather:share.weather!==false,
      hotel:share.hotel===true,
      crew:share.crew===true,
      finance:share.finance===true,
      mobility:share.mobility===true,
      traffic:share.traffic===true,
    },
  };
}

const SHARE_LABELS:Array<[keyof TvShare,string,string,boolean]>=[
  ['operational','Operação','Apresentação, portão e contexto da jornada.',false],
  ['weather','Meteorologia','Clima da base/origem/pernoite quando disponível.',false],
  ['hotel','Hotel','Nome do hotel quando confirmado.',true],
  ['crew','Tripulação','Nomes e funções da tripulação, quando a fonte existir.',true],
  ['finance','Financeiro','Estimativas e memória financeira permitida para a TV.',true],
  ['mobility','Uber no celular','Permite QR de handoff para a Uber; a TV nunca confirma a corrida.',true],
  ['traffic','Trânsito','Permite usar uma localização efêmera do celular para calcular a rota.',true],
];

export default function TvPairPage() {
  const [code, setCode] = useState(new URLSearchParams(location.search).get('code') || '');
  const [privacy, setPrivacy] = useState('private');
  const [message, setMessage] = useState('');
  const [devices, setDevices] = useState<TvDevice[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [retry, setRetry] = useState(0);
  const [savingDevice,setSavingDevice]=useState('');

  useEffect(() => {
    let alive = true;
    setEnabled(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    fetch('/api/tv/status', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(value => { if (alive) setEnabled(value?.schemaVersion === 1 && value?.available === true && value?.mode === 'restricted-pilot'); })
      .catch(() => { if (alive) setEnabled(false); })
      .finally(() => clearTimeout(timer));
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [retry]);

  const refresh = () => authFetch<TvDevice[]>('/api/tv/devices')
    .then(value => setDevices(Array.isArray(value) ? value : []))
    .catch(() => setMessage('Dispositivos indisponíveis ou conta fora do piloto.'));
  useEffect(() => { if (enabled) void refresh(); }, [enabled]);

  async function approve() {
    try {
      await authFetch('/api/tv/approve', { method:'POST', body:JSON.stringify({userCode:code.toUpperCase().trim(), privacy}) });
      setMessage('Autorização registrada. A TV concluirá o vínculo e aplicará as opções de privacidade escolhidas.');
      setCode('');
      window.setTimeout(()=>void refresh(),6500);
    } catch { setMessage('Não foi possível autorizar. Confira sua conta, o código e a disponibilidade do piloto.'); }
  }

  async function savePreferences(device:TvDevice,next:TvPreferences){
    setSavingDevice(device.deviceId);
    try{
      await authFetch('/api/tv/preferences',{method:'POST',body:JSON.stringify({deviceId:device.deviceId,preferences:next})});
      setDevices(current=>current.map(item=>item.deviceId===device.deviceId?{...item,preferences:next}:item));
      setMessage('Preferências desta TV atualizadas.');
    }catch{
      setMessage('Não foi possível atualizar as preferências desta TV.');
    }finally{setSavingDevice('');}
  }

  async function shareTrafficOrigin(device:TvDevice){
    const preferences=normalizedPreferences(device.preferences);
    if(preferences.audience!=='owner'||!preferences.share.traffic){
      setMessage('Ative “Trânsito” e mantenha esta TV em “Só eu” antes de compartilhar a origem.');
      return;
    }
    if(!navigator.geolocation){
      setMessage('Localização indisponível neste dispositivo.');
      return;
    }
    setSavingDevice(device.deviceId);
    navigator.geolocation.getCurrentPosition(async position=>{
      try{
        await authFetch('/api/tv/context',{method:'POST',body:JSON.stringify({
          deviceId:device.deviceId,
          context:{
            routeOrigin:{
              latitude:position.coords.latitude,
              longitude:position.coords.longitude,
              label:'Localização autorizada pelo celular',
            },
            ttlMs:5*60*1000,
          },
        })});
        setDevices(current=>current.map(item=>item.deviceId===device.deviceId?{...item,contextActive:true}:item));
        setMessage('Origem de trânsito compartilhada por até 5 minutos. A TV recebe apenas o resultado da rota.');
      }catch{
        setMessage('Não foi possível enviar o contexto de trânsito agora.');
      }finally{setSavingDevice('');}
    },()=>{
      setSavingDevice('');
      setMessage('Permissão de localização recusada ou indisponível.');
    },{enableHighAccuracy:true,timeout:10000,maximumAge:15000});
  }

  if (!enabled) return <main className="mx-auto max-w-xl p-6">
    <h1 className="text-3xl font-bold">CrewCheck TV</h1>
    <p className="my-4" role="status">{enabled === null ? 'Verificando a disponibilidade do piloto…' : 'O vínculo real ainda não está disponível neste ambiente. Nenhum dispositivo foi autorizado.'}</p>
    {enabled === false && <button className="rounded-xl border p-3" onClick={() => setRetry(value => value + 1)}>Verificar novamente</button>}
  </main>;

  return <main className="mx-auto max-w-2xl p-5 pb-28">
    <section className="rounded-3xl border border-cyan-900/50 bg-slate-950/30 p-5">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-400">CrewCheck TV</p>
      <h1 className="mt-2 text-3xl font-black">Vincular sua tela</h1>
      <p className="my-3 text-sm opacity-70">Confira o código mostrado na TV. Senha e sessão principal da sua conta nunca são gravadas nela.</p>
      <label className="block text-sm font-bold">Código da TV
        <input className="mt-2 block w-full rounded-xl border p-3 text-black" value={code} maxLength={10} onChange={event => setCode(event.target.value.toUpperCase())}/>
      </label>
      <label className="my-4 block text-sm font-bold">Privacidade inicial
        <select className="mt-2 block w-full rounded-xl p-3 text-black" value={privacy} onChange={event => setPrivacy(event.target.value)}>
          <option value="private">Privado — minha TV, rota e número do voo</option>
          <option value="family">Família — projeção reduzida</option>
        </select>
      </label>
      <button className="w-full rounded-xl bg-cyan-700 p-3 font-bold text-white disabled:opacity-40" onClick={approve} disabled={!/^[A-F0-9]{10}$/i.test(code)}>Autorizar esta TV</button>
      <p className="mt-3 text-xs opacity-60">TV confiável permanece vinculada neste aparelho até você desvincular ou revogar pelo celular. A senha e a sessão principal da conta não ficam salvas na TV.</p>
      <div className="mt-4 rounded-2xl border border-violet-900/40 bg-violet-950/10 p-4 text-xs leading-5">
        <b className="block text-sm">Acesso da CrewCheck TV</b>
        <span className="mt-1 block opacity-75">Gratuito: escala, próxima programação, jornada completa, pernoites, apresentação publicada, calendário, personalização local e portão informado pelo próprio usuário. Nenhuma API paga é consultada para completar esses dados.</span>
        <span className="mt-2 block opacity-75">Premium: pode acrescentar portão/radar automático, trânsito, meteorologia automática e outros contextos conectados, sempre conforme autorização e disponibilidade.</span>
      </div>
    </section>

    <p role="status" className="my-4 min-h-6 text-sm">{message}</p>
    <div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-bold">Minhas TVs</h2><button className="rounded-lg border px-3 py-2 text-sm" onClick={refresh}>Atualizar</button></div>

    {devices.map(device => {
      const preferences=normalizedPreferences(device.preferences);
      const owner=preferences.audience==='owner';
      return <article key={device.deviceId} className="my-4 rounded-3xl border border-slate-700/60 bg-slate-950/20 p-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="font-bold">{device.platform==='lg-webos'?'LG webOS':device.platform} · {device.trusted?'TV confiável':'Vínculo temporário'}</p>
            <p className="mt-1 text-xs opacity-60">Último contato: {new Date(device.lastSeenAt).toLocaleString('pt-BR')} · {device.revoked?'Revogada':'Vinculada'}</p></div>
          <span className={"rounded-full px-2 py-1 text-xs "+(device.revoked?'bg-red-950/50 text-red-300':'bg-emerald-950/50 text-emerald-300')}>{device.revoked?'REVOGADA':'ATIVA'}</span>
        </div>

        {!device.revoked&&<div className="mt-5">
          <label className="block text-sm font-bold">Quem está vendo esta TV?
            <select className="mt-2 block w-full rounded-xl p-3 text-black" value={preferences.audience} disabled={savingDevice===device.deviceId} onChange={event=>{
              const audience=event.target.value as TvAudience;
              void savePreferences(device,{...preferences,audience});
            }}>
              <option value="owner">Só eu — experiência completa autorizável</option>
              <option value="family">Família — dados operacionais reduzidos</option>
              <option value="visitor">Visitante — linguagem simples e mínimo necessário</option>
            </select>
          </label>
          {preferences.audience==='visitor'&&<p className="mt-2 rounded-xl border border-cyan-900/40 p-3 text-xs opacity-80">Visitante recebe projeção reduzida. Códigos de aeroporto e siglas devem aparecer com tradução humana. Localização exata, tripulação, financeiro e quarto não são enviados.</p>}

          <div className="mt-4 space-y-2">
            {SHARE_LABELS.map(([key,title,detail,sensitive])=>{
              const forcedOff=!owner&&sensitive;
              const checked=!forcedOff&&preferences.share[key];
              return <label key={key} className={"flex items-start gap-3 rounded-xl border p-3 "+(forcedOff?'opacity-45':'')}>
                <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} disabled={forcedOff||savingDevice===device.deviceId} onChange={event=>{
                  void savePreferences(device,{...preferences,share:{...preferences.share,[key]:event.target.checked}});
                }}/>
                <span><b className="block text-sm">{title}</b><small className="block text-xs opacity-60">{detail}</small>{sensitive&&<em className="mt-1 block text-[10px] not-italic uppercase tracking-wider text-violet-300">{forcedOff?'Bloqueado neste público':'Dado controlado'}</em>}</span>
              </label>;
            })}
          </div>

          {owner&&preferences.share.traffic&&<div className="mt-3 rounded-xl border border-cyan-900/40 p-3">
            <button className="w-full rounded-xl border border-cyan-700/60 p-3 text-sm font-bold" disabled={savingDevice===device.deviceId} onClick={()=>void shareTrafficOrigin(device)}>
              {device.contextActive?'Atualizar trânsito por mais 5 min':'Compartilhar origem para trânsito por 5 min'}
            </button>
            <p className="mt-2 text-xs opacity-60">A coordenada é temporária e não é exibida na TV. O painel recebe duração/impacto da rota até o aeroporto.</p>
          </div>}
        </div>}

        <button className="mt-5 rounded-xl border border-red-800/60 px-4 py-2 text-sm text-red-300 disabled:opacity-40" disabled={device.revoked} onClick={async () => {
          try { await authFetch('/api/tv/revoke', {method:'POST',body:JSON.stringify({deviceId:device.deviceId})}); await refresh(); setMessage('TV revogada.'); }
          catch { setMessage('Não foi possível revogar agora. Tente novamente.'); }
        }}>Revogar acesso</button>
      </article>;
    })}
  </main>;
}
