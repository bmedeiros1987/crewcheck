import React from 'react';
import {
  Plane, ArrowRight, Car, Clock3, MapPin, Gauge, CloudSun,
  ShieldCheck, BedDouble, Route, Info, ChevronRight
} from 'lucide-react';
import { currentFact, freshness, type TvSnapshot } from '../../../packages/tv-core/src/index';
import { WeatherArtwork } from './TvVisuals';
import { formatTvTime as time, activityLabel } from './presentation';
import {
  isVisitorPresentation, programsForDay, programPresentation,
  programRouteCodes, visitorAirportLabel, type TvProgram
} from './programming';
import type { TvDisplayPreferences } from './displayPreferences';
import { UberHandoff, type TvMobilityHandoff } from './UberHandoff';
import './home-essentials.css';

type ExtendedSnapshot=TvSnapshot & {
  traffic?: {
    value?: {durationText?:string|null;delayText?:string|null;status?:string|null;incidents?:number|null};
    source?:string;observedAt?:string;expiresAt?:string;
  }|null;
  mobility?:TvMobilityHandoff|null;
};

function programEnd(program:TvProgram){const n=Date.parse(program.last.endAt);return Number.isFinite(n)?n:0;}
function nextFlightProgram(snapshot:TvSnapshot,now:number):TvProgram|null{
  const programs=(snapshot.days||[]).flatMap(day=>programsForDay(day.activities||[]))
    .filter(program=>program.kind==='journey'&&program.flights.length>0&&programEnd(program)>now)
    .sort((a,b)=>Date.parse(a.first.startAt)-Date.parse(b.first.startAt));
  return programs[0]||null;
}
function routeText(program:TvProgram|null,visitor:boolean){
  if(!program)return 'Nenhuma jornada futura publicada';
  return programRouteCodes(program).map(code=>visitorAirportLabel(code,visitor)).join(' → ')||'Jornada publicada';
}
function airlinePhoto(snapshot:TvSnapshot,prefs:TvDisplayPreferences){
  const visual=snapshot.profile?.airlineVisual;
  if(!prefs.airlinePhoto||!visual?.licensed||!/^https:\/\//i.test(visual.imageUrl||''))return null;
  return visual;
}
function factIsCurrent(value:any,now:number){
  return value?.observedAt&&value?.expiresAt&&freshness({generatedAt:value.observedAt,expiresAt:value.expiresAt},now)==='current';
}
function Essential({
  icon,label,value,detail,accent=false
}:{icon:React.ReactNode;label:string;value:string;detail:string;accent?:boolean}){
  return <article className={'home-essential '+(accent?'is-accent':'')}>
    <span className="home-essential-icon">{icon}</span>
    <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
  </article>;
}

export function HomeEssentials({
  snapshot,prefs,clock,onOpenDay
}:{snapshot:TvSnapshot;prefs:TvDisplayPreferences;clock:Date;onOpenDay:(date:string)=>void}){
  const extended=snapshot as ExtendedSnapshot;
  const now=clock.getTime();
  const visitor=isVisitorPresentation(snapshot);
  const program=nextFlightProgram(snapshot,now);
  const firstFlight=program?.flights[0]||null;
  const presentation=program?programPresentation(program):null;
  const leave=currentFact(snapshot.leaveAt,now);
  const gate=prefs.gate?currentFact(snapshot.gate,now):null;
  const weather=prefs.weather?currentFact(snapshot.weather,now):null;
  const traffic=prefs.traffic&&factIsCurrent(extended.traffic,now)?extended.traffic?.value||null:null;
  const photo=airlinePhoto(snapshot,prefs);
  const fullRoute=routeText(program,visitor);
  const upcomingStay=(snapshot.days||[]).flatMap(day=>day.activities||[])
    .filter(item=>item.kind==='stay'&&Date.parse(item.endAt)>now)
    .sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt))[0]||null;

  return <section className="home-essentials">
    <article className={'home-flight-hero '+(photo?'has-airline-photo':'')}>
      {photo&&<div className="airline-photo" style={{backgroundImage:`url("${photo.imageUrl.replace(/"/g,'')}" )`}} aria-hidden="true"/>}
      <div className="airline-photo-shade" aria-hidden="true"/>
      <div className="home-flight-copy">
        <p className="eyebrow"><Plane/> {program?'PRÓXIMA JORNADA':'SEU CREWCHECK AGORA'}</p>
        <div className="home-airline-line">
          <span>{snapshot.profile?.airline||'Companhia não informada'}</span>
          {photo&&<small>Foto real · {photo.attribution||photo.source}</small>}
        </div>
        <h1>{fullRoute}</h1>
        <p className="home-flight-label">{firstFlight?activityLabel(firstFlight):'Nenhum voo futuro publicado na escala ativa'}</p>
        {program&&<div className="home-leg-ribbon" aria-label={program.flights.length+' etapas'}>
          {program.flights.map((leg,index)=><React.Fragment key={leg.id}>
            <span><b>{visitorAirportLabel(leg.origin,visitor)}</b><small>{leg.flight||`Etapa ${index+1}`}</small></span>
            {index<program.flights.length-1&&<i><ArrowRight/></i>}
          </React.Fragment>)}
          {program.flights.length>0&&<span><b>{visitorAirportLabel(program.flights[program.flights.length-1].destination,visitor)}</b><small>Destino</small></span>}
        </div>}
      </div>

      <div className="home-essential-grid">
        <Essential icon={<Car/>} label="SAIR DE CASA" value={leave||'—'} detail={leave?'Recomendação válida do CrewCheck':'Aguardando rota/saída válida'} accent/>
        <Essential icon={<Clock3/>} label="APRESENTAÇÃO" value={presentation||'Não informada'} detail={presentation?'Publicada na escala':'Nunca usamos partida como apresentação'}/>
        {prefs.traffic&&<Essential icon={<Gauge/>} label="TRÂNSITO" value={traffic?.durationText||traffic?.delayText||'Sem leitura'} detail={traffic?.status||'Envie localização pelo celular para atualizar'}/>}
        {prefs.gate&&<Essential icon={<MapPin/>} label="PORTÃO" value={gate?.label||'Não confirmado'} detail={gate?.remoteStand===true?'Embarque remoto':'Confirme novamente no aeroporto'}/>}
      </div>

      <div className="home-flight-footer">
        <span><ShieldCheck/>Escala oficial continua sendo a referência.</span>
        {program&&<button onClick={()=>onOpenDay(program.first.date)}>Abrir programação completa <ChevronRight/></button>}
      </div>
    </article>

    <aside className="home-context-column">
      {prefs.weather&&<article className="home-context-card weather-context-card">
        <div><p className="eyebrow"><CloudSun/> CLIMA · {weather?.airport||snapshot.profile?.base||'—'}</p>
          <strong>{weather?Math.round(weather.temperature)+'°C':'—'}</strong>
          <span>{weather?.label||'Condição confirmada indisponível'}</span>
        </div><WeatherArtwork label={weather?.label}/>
      </article>}

      <article className="home-context-card next-context-card">
        <p className="eyebrow"><Route/> CONTEXTO</p>
        {program?<><h2>{program.flights.length} {program.flights.length===1?'etapa':'etapas'} nesta jornada</h2><p>{fullRoute}</p>
          <small>Selecione a jornada para abrir cada voo, solo, horários e detalhes permitidos.</small></>:<><h2>Sem próxima jornada publicada</h2><p>O painel continua útil com clima, mudanças e próximo pernoite.</p></>}
      </article>

      {upcomingStay&&<article className="home-context-card stay-context-card">
        <p className="eyebrow"><BedDouble/> PRÓXIMO PERNOITE</p>
        <h2>{visitorAirportLabel(upcomingStay.destination||upcomingStay.origin,visitor)}</h2>
        <p>{time(upcomingStay.startAt)} → {time(upcomingStay.endAt)}</p>
        <small>Hospedagem e quarto só aparecem quando confirmados e autorizados.</small>
      </article>}

      {prefs.traffic&&extended.mobility&&snapshot.audience!=='visitor'&&<UberHandoff mobility={extended.mobility}/>}
      {visitor&&<article className="home-context-card visitor-home-card"><p className="eyebrow"><Info/> MODO VISITANTE</p><h2>Informação em linguagem simples</h2><p>Códigos de aeroportos são acompanhados da cidade e dados sensíveis permanecem ocultos.</p></article>}
    </aside>
  </section>;
}
