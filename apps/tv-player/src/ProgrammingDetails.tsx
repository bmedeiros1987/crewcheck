import React from 'react';
import {
  Plane, BedDouble, Moon, Clock3, MapPin, ChevronRight, ChevronLeft,
  ShieldCheck, Users, WalletCards, CloudSun, Gauge, Hotel, Languages,
  LockKeyhole, Route, Info
} from 'lucide-react';
import { currentFact, type TvSnapshot } from '../../../packages/tv-core/src/index';
import { WeatherArtwork } from './TvVisuals';
import { formatTvTime as time, activityLabel } from './presentation';
import {
  programsForDay, programForKey, programKicker, programPresentation,
  programRouteCodes, programTitle, simpleCodeExplanation, visitorAirportLabel,
  isVisitorPresentation, type TvProgram,
} from './programming';
import type { TvDisplayPreferences } from './displayPreferences';
import { UberHandoff, type TvMobilityHandoff } from './UberHandoff';
import './programming-details.css';

type ExtensionSnapshot=TvSnapshot & {
  traffic?: {
    value?: {durationText?:string;delayText?:string;status?:string;incidents?:number;};
    source?:string;observedAt?:string;expiresAt?:string;
  }|null;
  audience?:'owner'|'family'|'visitor';
  sharePermissions?:{
    crew?:boolean;finance?:boolean;weather?:boolean;hotel?:boolean;
    operational?:boolean;mobility?:boolean;
  };
  journeyDetails?:Record<string,{
    crew?:Array<{role?:string;name?:string;position?:string}>;
    finance?:{currency?:string;estimated?:number;perDiem?:number;production?:number;note?:string};
    hotel?:{name?:string;room?:string;transport?:string};
    weather?:Array<{airport?:string;temperature?:number;label?:string;wind?:number;rainChance?:number}>;
  }>;
  mobility?:TvMobilityHandoff|null;
};

function routeText(program:TvProgram,visitor:boolean){
  const codes=programRouteCodes(program);
  return codes.length?codes.map(code=>visitorAirportLabel(code,visitor)).join(' → '):programTitle(program,visitor);
}
function programIcon(program:TvProgram){
  if(program.kind==='stay')return <BedDouble/>;
  if(program.kind==='rest')return <Moon/>;
  return <Plane/>;
}
function fullProgramTime(program:TvProgram){
  return `${time(program.first.startAt)} — ${time(program.last.endAt)}`;
}

export function DayProgrammingView({snapshot,date,onBack,onOpenProgram}:{snapshot:TvSnapshot;date:string;onBack:()=>void;onOpenProgram:(key:string)=>void}){
  const selected=snapshot.days.find(day=>day.date===date);
  const programs=programsForDay(selected?.activities||[]);
  const visitor=isVisitorPresentation(snapshot);
  return <section className="program-day detail">
    <button className="back-button" onClick={onBack}><ChevronLeft/> Voltar</button>
    <div className="program-day-title"><div><p className="eyebrow">PROGRAMAÇÃO DO DIA</p><h1>{date.split('-').reverse().join('/')}</h1></div><span>{programs.length} {programs.length===1?'programação':'programações'}</span></div>
    <div className="program-card-grid">
      {programs.length?programs.map(program=><button key={program.key} className={'program-card program-'+program.kind} onClick={()=>onOpenProgram(program.key)}>
        <span className="program-card-icon">{programIcon(program)}</span>
        <div className="program-card-copy"><small>{programKicker(program)}</small><h2>{programTitle(program,visitor)}</h2>
          {program.kind==='journey'&&<div className="program-route-mini">{programRouteCodes(program).map((code,index)=><React.Fragment key={code+'-'+index}><b>{visitorAirportLabel(code,visitor)}</b>{index<programRouteCodes(program).length-1&&<i/>}</React.Fragment>)}</div>}
          {program.kind==='stay'&&<p>Descanso publicado · visual separado de voo</p>}
          <div className="program-card-meta"><span><Clock3/>{fullProgramTime(program)}</span>{programPresentation(program)&&<span><ShieldCheck/>Apresentação {programPresentation(program)}</span>}</div>
        </div>
        <ChevronRight className="program-card-open"/>
      </button>):<article className="empty-card">Nenhuma programação publicada para este dia.</article>}
    </div>
  </section>;
}

function FlightTimeline({program,visitor}:{program:TvProgram;visitor:boolean}){
  return <div className="flight-timeline">
    {program.flights.map((leg,index)=><article key={leg.id} className="flight-leg-row">
      <span className="flight-leg-index">{index+1}</span>
      <div className="flight-leg-main"><small>{leg.flight||`Etapa ${index+1}`}</small><h3>{visitorAirportLabel(leg.origin,visitor)} <span>→</span> {visitorAirportLabel(leg.destination,visitor)}</h3>
        <div><span><b>{time(leg.startAt)}</b> partida</span><i/><span><b>{time(leg.endAt)}</b> chegada</span></div>
      </div>
      {leg.groundBeforeMinutes!==null&&leg.groundBeforeMinutes>0&&<span className="ground-chip">{leg.groundBeforeMinutes} min solo</span>}
    </article>)}
  </div>;
}

export function ProgramOverview({snapshot,programKey,onBack,onDetails}:{snapshot:TvSnapshot;programKey:string;onBack:()=>void;onDetails:()=>void}){
  const program=programForKey(snapshot,programKey);
  if(!program)return <section className="detail"><button className="back-button" onClick={onBack}><ChevronLeft/> Voltar</button><article className="empty-card">Programação não encontrada na escala ativa.</article></section>;
  const visitor=isVisitorPresentation(snapshot);
  const presentation=programPresentation(program);
  return <section className={'program-overview program-'+program.kind+' detail'}>
    <button className="back-button" onClick={onBack}><ChevronLeft/> Voltar ao dia</button>
    <div className="program-overview-head"><div><p className="eyebrow">{programKicker(program)}</p><h1>{programTitle(program,visitor)}</h1><p>{fullProgramTime(program)}</p></div><span className="program-hero-icon">{programIcon(program)}</span></div>

    {program.kind==='journey'&&<article className="program-route-card"><div className="program-route-heading"><Route/><div><small>ROTA COMPLETA</small><strong>{routeText(program,visitor)}</strong></div></div><FlightTimeline program={program} visitor={visitor}/></article>}

    {program.kind==='stay'&&<article className="stay-exclusive-card"><div className="stay-moon" aria-hidden="true"><Moon/></div><div><small>PERNOITE / DESCANSO</small><h2>{visitorAirportLabel(program.first.destination||program.first.origin,visitor)}</h2><p>Este card é tratado como estadia, não como voo. Hotel, transporte e quarto só aparecem quando confirmados e autorizados.</p><div className="stay-window"><span><small>Início</small><b>{time(program.first.startAt)}</b></span><span><small>Fim</small><b>{time(program.last.endAt)}</b></span></div></div><BedDouble/></article>}

    <div className="program-key-facts">
      <article><small>Apresentação</small><strong>{presentation||'Não informada'}</strong><span>{presentation?'Publicada na escala':'Sem fallback para partida'}</span></article>
      <article><small>Duração</small><strong>{fullProgramTime(program)}</strong><span>Janela da programação</span></article>
      <article><small>Confiança</small><strong>{program.activities.some(item=>item.confidence==='low')?'Revisar':'Canônica'}</strong><span>Origem: escala ativa</span></article>
    </div>

    <button className="program-details-button" onClick={onDetails}>Ver detalhes e contexto <ChevronRight/></button>
  </section>;
}

function LockedSection({title}:{title:string}){return <div className="sensitive-locked"><LockKeyhole/><div><b>{title}</b><span>Ative este compartilhamento no CrewCheck do celular.</span></div></div>;}

export function ProgramDetails({snapshot,programKey,prefs,onBack}:{snapshot:TvSnapshot;programKey:string;prefs:TvDisplayPreferences;onBack:()=>void}){
  const program=programForKey(snapshot,programKey);
  if(!program)return <section className="detail"><button className="back-button" onClick={onBack}><ChevronLeft/> Voltar</button><article className="empty-card">Detalhes indisponíveis.</article></section>;
  const extended=snapshot as ExtensionSnapshot;
  const visitor=isVisitorPresentation(snapshot);
  const permissions=extended.sharePermissions||{};
  const details=extended.journeyDetails?.[program.journeyId||program.key]||{};
  const gate=currentFact(snapshot.gate);
  const weather=currentFact(snapshot.weather);
  const traffic=extended.traffic?.value||null;
  const codeExplanation=simpleCodeExplanation(program.first.publishedCode);

  return <section className="program-details detail">
    <button className="back-button" onClick={onBack}><ChevronLeft/> Voltar à programação</button>
    <div className="program-detail-title"><div><p className="eyebrow">DETALHES SOB DEMANDA</p><h1>{programTitle(program,visitor)}</h1><p>A TV é uma extensão: exibe contexto útil, mas alterações e autorizações continuam no CrewCheck principal.</p></div><ShieldCheck/></div>

    <div className="details-grid">
      <article className="detail-module operational-module"><header><Plane/><div><small>OPERAÇÃO</small><h2>O que importa para o voo</h2></div></header>
        <dl><dt>Apresentação</dt><dd>{programPresentation(program)||'Não informada'}</dd>
          {prefs.gate&&<><dt>Portão</dt><dd>{gate?.label||'Não confirmado'}</dd></>}
          {prefs.traffic&&<><dt>Trânsito</dt><dd>{traffic?.durationText||traffic?.delayText||'Sem leitura confirmada'}</dd></>}
        </dl>
      </article>

      {prefs.weather&&<article className="detail-module weather-module"><header><CloudSun/><div><small>METEOROLOGIA</small><h2>Condição disponível</h2></div></header>
        {weather?<div className="detail-weather"><WeatherArtwork label={weather.label}/><div><strong>{Math.round(weather.temperature)}°C</strong><span>{visitorAirportLabel(weather.airport,visitor)} · {weather.label}</span></div></div>:<p>Nenhuma condição confirmada para esta programação.</p>}
      </article>}

      {prefs.crew&&<article className="detail-module sensitive-module"><header><Users/><div><small>DADO SENSÍVEL</small><h2>Tripulação</h2></div></header>
        {permissions.crew&&Array.isArray(details.crew)?<ul>{details.crew.map((person,index)=><li key={index}><b>{person.role||person.position||'Tripulante'}</b><span>{person.name||'Nome não informado'}</span></li>)}</ul>:<LockedSection title="Tripulação"/>}
      </article>}

      {prefs.finance&&<article className="detail-module sensitive-module"><header><WalletCards/><div><small>DADO SENSÍVEL</small><h2>Financeiro</h2></div></header>
        {permissions.finance&&details.finance?<dl><dt>Estimativa</dt><dd>{Number.isFinite(details.finance.estimated)?new Intl.NumberFormat('pt-BR',{style:'currency',currency:details.finance.currency||'BRL'}).format(Number(details.finance.estimated)):'Não informada'}</dd><dt>Diárias</dt><dd>{Number.isFinite(details.finance.perDiem)?String(details.finance.perDiem):'—'}</dd><dt>Produção</dt><dd>{Number.isFinite(details.finance.production)?String(details.finance.production):'—'}</dd></dl>:<LockedSection title="Financeiro"/>}
      </article>}

      {prefs.hotel&&program.kind==='stay'&&<article className="detail-module stay-detail-module"><header><Hotel/><div><small>PERNOITE</small><h2>Hospedagem</h2></div></header>
        {permissions.hotel&&details.hotel?<dl><dt>Hotel</dt><dd>{details.hotel.name||'Não informado'}</dd><dt>Transporte</dt><dd>{details.hotel.transport||'Não confirmado'}</dd><dt>Quarto</dt><dd>{details.hotel.room||'Não informado'}</dd></dl>:<LockedSection title="Hotel / quarto"/>}
      </article>}

      {(visitor||prefs.visitorExplanations)&&<article className="detail-module visitor-module"><header><Languages/><div><small>MODO VISITANTE</small><h2>Em linguagem simples</h2></div></header>
        <p>{program.kind==='journey'?`Trajeto: ${routeText(program,true)}.`:programTitle(program,true)}</p>
        {codeExplanation&&<p><b>{program.first.publishedCode}</b> significa “{codeExplanation}”.</p>}
        <small>Códigos IATA aparecem acompanhados da cidade; siglas internas não ficam sem explicação.</small>
      </article>}
    </div>

    {prefs.traffic&&permissions.mobility!==false&&<UberHandoff mobility={extended.mobility}/>}
    <p className="detail-disclaimer"><Info/>Dados sensíveis só devem chegar à TV quando o proprietário autorizar. Revogar no celular deve interromper a próxima sincronização.</p>
  </section>;
}
