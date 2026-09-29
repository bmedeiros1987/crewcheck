import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Music2, Radio, Check } from 'lucide-react';
import { channelDeck, channelInterval, nextChannelView, RotationClock, type ChannelView } from './channelPolicy';
import { CrewSoundtrack, CREW_TRACKS, musicIndex, musicVolume, type SoundState } from './soundtrack';
import './tv-channel.css';
const read = (key:string) => {try{return localStorage.getItem(key);}catch{return null;}};
const save = (key:string,value:string) => {try{localStorage.setItem(key,value);}catch{}};
const now = () => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
export function useTvChannel<T extends string>(options:{view:T;setView:(view:T)=>void;hasSnapshot:boolean;hasChanges:boolean;hasNews:boolean;quick?:{presentation:boolean;weather:boolean;radar:boolean;stay:boolean};covered:boolean;hidden:boolean;exitRequested:boolean}) {
  const [enabled,setEnabled] = useState(()=>read('crewcheck-tv-auto-screens')!=='false');
  const [interval,setIntervalValue] = useState(()=>channelInterval(read('crewcheck-tv-auto-interval')));
  const [countdown,setCountdown] = useState(interval), [reading,setReading] = useState(false);
  const [sound,setSound] = useState<SoundState>(()=>({index:musicIndex(read('crewcheck-tv-track')),volume:musicVolume(read('crewcheck-tv-volume')),status:'off',wanted:false}));
  const schedule = useRef(new RotationClock()), player = useRef<CrewSoundtrack|null>(null);
  const current = useRef({...options,enabled,interval}); current.current={...options,enabled,interval};
  useEffect(()=>{
    schedule.current.configure(interval);
    // One audio element survives React view changes; files are packaged locally.
    const audio=document.createElement('audio'); audio.id='crewcheck-soundtrack';
    // Do not use display:none on physical webOS: the hardware media pipeline is
    // more reliable when the single audio element remains attached/renderable.
    audio.preload='metadata'; audio.controls=false; audio.muted=false;
    audio.setAttribute('aria-hidden','true'); audio.setAttribute('playsinline','true');
    audio.style.position='fixed';audio.style.width='1px';audio.style.height='1px';audio.style.left='-2px';audio.style.bottom='-2px';audio.style.opacity='0.01';audio.style.pointerEvents='none';
    document.body.appendChild(audio);
    const engine=new CrewSoundtrack(audio,state=>{setSound(state);save('crewcheck-tv-track',String(state.index));save('crewcheck-tv-volume',String(state.volume));},sound.index,sound.volume);
    player.current=engine;
    const context=()=>{const c=current.current;engine.setContext(c.hasSnapshot,c.covered||c.hidden||document.hidden||c.exitRequested);};
    const interaction=(event:Event)=>{
      if(event.type==='keydown') {
        const e=event as KeyboardEvent;
        if(![13,27,37,38,39,40,461,10009,9,32].includes(e.keyCode)&&!['Enter','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab',' '].includes(e.key)) return;
      }
      schedule.current.interact();setReading(true);setCountdown(current.current.interval);
    };
    const events=['keydown','mousedown','touchstart','wheel'];events.forEach(event=>document.addEventListener(event,interaction,true));
    const hide=()=>engine.setContext(current.current.hasSnapshot,true);
    document.addEventListener('visibilitychange',context);window.addEventListener('pagehide',hide);window.addEventListener('webOSRelaunch',context);
    let last=now();
    const tick=window.setInterval(()=>{
      const instant=now(),delta=instant-last;last=instant;const c=current.current;
      const deck=channelDeck(c.hasSnapshot,c.hasChanges,c.hasNews,c.quick);
      const allowed=c.enabled&&!c.covered&&!c.hidden&&!document.hidden&&!c.exitRequested&&deck.includes(c.view as ChannelView);
      if(schedule.current.step(delta,allowed)) {const next=nextChannelView(c.view,deck);if(next)c.setView(next as T);}
      setReading(schedule.current.hold>0);setCountdown(Math.ceil(schedule.current.remaining/1000));
    },1000);
    context();
    return()=>{clearInterval(tick);engine.dispose();audio.remove();player.current=null;events.forEach(event=>document.removeEventListener(event,interaction,true));document.removeEventListener('visibilitychange',context);window.removeEventListener('pagehide',hide);window.removeEventListener('webOSRelaunch',context);};
  },[]);
  useEffect(()=>{schedule.current.configure(interval);setCountdown(interval);},[interval]);
  useEffect(()=>{player.current?.setContext(options.hasSnapshot,options.covered||options.hidden||document.hidden||options.exitRequested);},[options.hasSnapshot,options.covered,options.hidden,options.exitRequested]);
  const deck=channelDeck(options.hasSnapshot,options.hasChanges,options.hasNews,options.quick);
  const isReading=reading||!deck.includes(options.view as ChannelView);
  return {enabled,interval,countdown,reading:isReading,sound,
    toggle:()=>{const value=!current.current.enabled;setEnabled(value);save('crewcheck-tv-auto-screens',String(value));schedule.current.resume();setReading(false);},
    chooseInterval:(value:number)=>{const seconds=channelInterval(value);setIntervalValue(seconds);save('crewcheck-tv-auto-interval',String(seconds));},
    resume:()=>{schedule.current.resume();setReading(false);options.setView('Agora' as T);},
    music:()=>player.current?.toggle(),select:(index:number)=>player.current?.select(index),move:(delta:number)=>player.current?.move(delta),volume:(value:number)=>player.current?.setVolume(value),
  };
}
export type TvChannel=ReturnType<typeof useTvChannel>;
const soundLabel=(state:SoundState)=>state.status==='playing'?CREW_TRACKS[state.index].title:state.status==='starting'?'Carregando música…':state.status==='error'?'Áudio local indisponível':state.status==='blocked'?'Pressione OK para tentar':state.status==='paused'?'Música pausada':'Tocar música';
export function ChannelDock({channel}:{channel:TvChannel}) {
  return <div className="channel-dock">
    <button className="channel-state" aria-label="Ativar ou desativar troca automática de telas" aria-pressed={channel.enabled} onClick={channel.toggle}><Radio/><span>{channel.enabled?(channel.reading?'Auto · pausa':'Auto · '+channel.countdown+'s'):'Telas manuais'}</span></button>
    <button className="channel-music" onClick={channel.music} aria-label={channel.sound.wanted?'Pausar música de fundo':'Tocar música de fundo'}>{channel.sound.status==='playing'?<Pause/>:<Music2/>}<span>{soundLabel(channel.sound)}</span></button>
  </div>;
}
export function ChannelSettings({channel}:{channel:TvChannel}) {
  const track=CREW_TRACKS[channel.sound.index];
  return <section className="channel-settings" aria-label="Canal automático e música">
    <div className="channel-settings-row"><article><h2><Radio/> Telas automáticas</h2><p>Agora → Semana → Mês. Mudanças e Notícias entram quando houver conteúdo.</p>
      <div className="options"><button role="switch" aria-label="Troca automática de telas" aria-checked={channel.enabled} onClick={channel.toggle}>{channel.enabled?'Ativada':'Desativada'}</button>{[20,30,45,60].map(seconds=><button key={seconds} disabled={!channel.enabled} aria-pressed={seconds===channel.interval} onClick={()=>channel.chooseInterval(seconds)}>{seconds}s</button>)}</div>
      <button className="channel-start" onClick={channel.resume} disabled={!channel.enabled}><Play/> Exibir canal agora</button>
      <small>Controle em uso: pausa de 1 minuto. Dia, Configurações e vínculo não mudam sozinhos. A proteção de tela continua independente.</small>
    </article><article><h2><Music2/> Trilha CrewCheck</h2><p className="channel-now">{track.title}</p><div className="channel-controls">
      <button aria-label="Faixa anterior" onClick={()=>channel.move(-1)}><SkipBack/></button><button className="channel-play" onClick={channel.music}>{channel.sound.wanted?<Pause/>:<Play/>}{channel.sound.wanted?'Pausar música':'Tocar música'}</button><button aria-label="Próxima faixa" onClick={()=>channel.move(1)}><SkipForward/></button>
      <button aria-label="Diminuir volume da música" onClick={()=>channel.volume(channel.sound.volume-5)} disabled={channel.sound.volume===0}>−</button><span className="channel-volume"><Volume2/>{channel.sound.volume}%</span><button aria-label="Aumentar volume da música" onClick={()=>channel.volume(channel.sound.volume+5)} disabled={channel.sound.volume===100}>+</button>
    </div><p className="channel-audio-status" role="status">{channel.sound.status==='error'?'Não foi possível tocar as faixas deste pacote. Sua escala continua funcionando.':channel.sound.status==='blocked'?'A TV não iniciou o áudio. Pressione Tocar música para tentar novamente.':channel.sound.status==='playing'?'Reproduzindo · playlist em sequência e repetição':channel.sound.status==='starting'?'Carregando a faixa local…':'O áudio começa somente quando você escolher tocar.'}{channel.sound.diagnostic&&<b className="audio-diagnostic">{channel.sound.diagnostic}</b>}</p><small>Música pausada ao ocultar o app, perder o vínculo ou entrar na proteção de tela. O volume da TV continua independente.</small></article></div>
    <div className="channel-playlist">{CREW_TRACKS.map((item,index)=><button key={item.id} aria-label={'Tocar '+item.title} aria-pressed={channel.sound.index===index} onClick={()=>channel.select(index)}><span className="channel-track-number">{index+1}</span><span>{item.title}</span>{channel.sound.index===index&&<Check/>}</button>)}</div>
  </section>;
}
