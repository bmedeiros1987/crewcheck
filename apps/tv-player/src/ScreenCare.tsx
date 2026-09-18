import React, { useEffect, useRef, useState } from 'react';
import { carePhase, careProfile, careShift, careSpot, nextCareElapsed, CARE_PROFILES, type CarePhase, type CareProfile } from './screenCarePolicy';
import { readVisualSetting, writeVisualSetting, formatTvTime } from './presentation';
import './screen-care.css';

/** No wake locks, artificial input, panel-service calls, or backend mutations. */
export function useScreenCare(motionAllowed: boolean, onActivity: () => void) {
  const [profile, setProfile] = useState<CareProfile>(() => careProfile(readVisualSetting('crewcheck-tv-screen-care', ['oled','balanced','reading'], 'balanced')));
  const [sample, setSample] = useState({elapsed:0,idle:0,manual:false});
  const runtime = useRef({elapsed:0,lastActivity:0,wall:Date.now(),mono:0,manual:false});
  const motionRef = useRef(motionAllowed), profileRef = useRef(profile), activityRef = useRef(onActivity);
  const returnFocus = useRef<HTMLElement | null>(null);
  motionRef.current = motionAllowed; profileRef.current = profile; activityRef.current = onActivity;
  const monotonic = () => typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  function advance() {
    const r = runtime.current, wall = Date.now(), mono = monotonic();
    r.elapsed = nextCareElapsed(r.elapsed,wall-r.wall,mono-r.mono); r.wall = wall; r.mono = mono;
    return r;
  }
  function idleOf(r:typeof runtime.current) {
    return r.elapsed-r.lastActivity+(r.manual ? CARE_PROFILES[profileRef.current].saverAt : 0);
  }
  function publish() {
    const r = advance(); setSample({elapsed:r.elapsed,idle:idleOf(r),manual:r.manual});
  }
  const phase: CarePhase = carePhase(sample.idle,profile,motionAllowed);
  const covered = phase !== 'active';
  useEffect(() => {
    const r = runtime.current; r.wall=Date.now(); r.mono=monotonic();
    let swallowClickUntil=0, swallowedKey:string|null=null;
    function rememberFocus() {
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== document.body) returnFocus.current=active;
    }
    function restore() {
      setTimeout(() => {
        const target=returnFocus.current;
        if (target && document.documentElement.contains(target) && target.getBoundingClientRect().width) target.focus();
        else document.querySelector<HTMLElement>('nav .active,button')?.focus();
      },0);
    }
    function input(event:Event) {
      const keyboard = event as KeyboardEvent;
      const key=String(keyboard.keyCode || keyboard.key || '');
      // Do not swallow power/volume/home keys handled by the television.
      if (event.type==='keydown' && ![13,27,37,38,39,40,461,10009,9,32].includes(keyboard.keyCode) && !['Enter','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Tab',' '].includes(keyboard.key)) return;
      const current=advance();
      if (swallowedKey && event.type==='keydown' && key===swallowedKey) {event.preventDefault();event.stopImmediatePropagation();return;}
      const sleeping=carePhase(idleOf(current),profileRef.current,motionRef.current)!=='active';
      if (sleeping) {
        event.preventDefault(); event.stopImmediatePropagation();
        swallowClickUntil=current.elapsed+500;
        if (event.type==='keydown') swallowedKey=key;
        restore();
      }
      current.manual=false; current.lastActivity=current.elapsed;
      activityRef.current();
      setSample({elapsed:current.elapsed,idle:0,manual:false});
    }
    function release(event:KeyboardEvent) {
      if (String(event.keyCode || event.key || '')===swallowedKey) {event.preventDefault();event.stopImmediatePropagation();swallowedKey=null;}
    }
    function click(event:MouseEvent) {
      if (advance().elapsed < swallowClickUntil) {event.preventDefault();event.stopImmediatePropagation();}
    }
    function tick() {
      if(document.hidden) return;
      const current=advance();
      if (carePhase(idleOf(current),profileRef.current,motionRef.current)!=='active') rememberFocus();
      setSample({elapsed:current.elapsed,idle:idleOf(current),manual:current.manual});
    }
    const events=['keydown','mousedown','touchstart','wheel'];
    events.forEach(name=>document.addEventListener(name,input,true));
    document.addEventListener('keyup',release,true); document.addEventListener('click',click,true);
    document.addEventListener('visibilitychange',tick); window.addEventListener('webOSRelaunch',tick);
    const timer=setInterval(tick,1000);
    return()=>{clearInterval(timer);events.forEach(name=>document.removeEventListener(name,input,true));document.removeEventListener('keyup',release,true);document.removeEventListener('click',click,true);document.removeEventListener('visibilitychange',tick);window.removeEventListener('webOSRelaunch',tick);};
  },[]);
  function choose(value:CareProfile) {
    const normalized=careProfile(value);profileRef.current=normalized;setProfile(normalized);writeVisualSetting('crewcheck-tv-screen-care',normalized);publish();
  }
  function preview() {
    returnFocus.current=document.activeElement as HTMLElement;
    const current=advance();current.manual=true;current.lastActivity=current.elapsed;publish();
  }
  return {profile,phase,covered,shift:covered ? {x:0,y:0}:careShift(sample.elapsed,sample.idle,motionAllowed),spot:careSpot(sample.idle-CARE_PROFILES[profile].saverAt),choose,preview};
}
export type ScreenCare = ReturnType<typeof useScreenCare>;
export function ScreenCareCover({care,clock}:{care:ScreenCare;clock:Date}) {
  if (!care.covered) return null;
  return <section className="screen-care-cover" data-phase={care.phase} role="region" aria-label="Proteção de tela ativa. Pressione OK para voltar.">
    {care.phase==='saver' && <div className="screen-care-mark" style={care.spot}>
      <p className="screen-care-clock">{formatTvTime(clock.toISOString())}</p>
      <p>CrewCheck · pausa de tela</p><small>OK ou uma seta para voltar</small>
    </div>}
  </section>;
}
export function ScreenCareSettings({care}:{care:ScreenCare}) {
  return <article className="screen-care-settings"><h2>Proteção de tela</h2>
    <p>Pausa por inatividade. Não é garantia contra burn-in e não desliga a televisão.</p>
    <div className="options">{([['oled','2 min · OLED'],['balanced','5 min · padrão'],['reading','15 min · leitura']] as [CareProfile,string][]).map(([value,label])=><button key={value} aria-pressed={care.profile===value} onClick={()=>care.choose(value)}>{label}</button>)}<button onClick={care.preview}>Testar proteção agora</button></div>
    <small>Após {CARE_PROFILES[care.profile].blackAt/60000} minutos sem interação: fundo preto sem texto. Com movimento desligado, o fundo preto entra já na primeira pausa. As proteções da própria TV devem continuar ligadas.</small>
  </article>;
}
