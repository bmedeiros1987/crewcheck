import React from 'react';
import { Plane, ArrowRight, CalendarDays, Clock3, Car, BedDouble, MapPin, ShieldCheck, CloudSun, Radar, Hotel, Info, ChevronRight, Gauge } from 'lucide-react';
import { currentFact, freshness, type TvSnapshot, type TvActivity } from '../../../packages/tv-core/src/index';
import { WeatherArtwork } from './TvVisuals';
import { formatTvTime as time, formatMonth, activityLabel } from './presentation';
import { countdown, upcomingStay, isCiriumSource, type QuickView } from './broadcastPolicy';
import { visitorAirportLabel, isVisitorPresentation } from './programming';
import { UberHandoff } from './UberHandoff';
import { airlineTheme, weatherFor } from './premiumContext';
import { packagedAirlinePhoto } from './licensedAirlinePhotos';
import type { TvDisplayPreferences } from './displayPreferences';
import './broadcast.css';

const asset=(name:string)=>'./brand/'+name;
export function OfficialTvBrand() {
  return <div className="official-brand" aria-label="CrewCheck TV · We Do Care About US">
    <img className="official-brand-night" src={asset('crewcheck-horizontal-night.png')} alt="CrewCheck · We Do Care About US"/>
    <img className="official-brand-light" src={asset('crewcheck-horizontal-light.png')} alt="CrewCheck · We Do Care About US"/>
    <span className="official-tv-tag">TV</span>
  </div>;
}
export function ProviderCredit({provider,active=false,demo=false}:{provider:'crewtopia'|'cirium';active?:boolean;demo?:boolean}) {
  const label=provider==='crewtopia'?'Crewtopia':'Cirium';
  return <div className={'provider-credit provider-'+provider}>
    <span>{active||demo?'Powered by':'Integração prevista'}</span>
    <img src={asset(provider+'.png')} alt={label}/>
    {provider==='crewtopia'&&<b>Crewtopia</b>}
    {!active&&!demo&&<small>Fonte não conectada nesta tela</small>}
  </div>;
}
export function CreatorCredit() {
  return <div className="creator-credit"><span>Desenvolvido por</span><img src={asset('bruno-medeiros.png')} alt="Bruno Medeiros Tecnologia"/></div>;
}
function Eyebrow({children}:{children:React.ReactNode}) {return <p className="broadcast-eyebrow">{children}</p>;}
function FactStatus({snapshot}:{snapshot:TvSnapshot}) {
  const state=freshness(snapshot);
  return <p className="broadcast-freshness"><ShieldCheck/>{state==='current'?'Escala sincronizada':'Última informação · confira no celular'}<span>{time(snapshot.generatedAt)}</span></p>;
}
function Timings({snapshot}:{snapshot:TvSnapshot}) {
  const leave=currentFact(snapshot.leaveAt), report=snapshot.next?.presentation;
  return <div className="broadcast-times"><article className="broadcast-time leave"><label><Car/> SAIR DE CASA</label><strong>{leave||'—'}</strong><small>{leave?'Recomendação recebida do CrewCheck':'Recomendação ainda indisponível'}</small></article><article className="broadcast-time report"><label><Clock3/> APRESENTAÇÃO</label><strong>{report||'—'}</strong><small>{report?'Horário publicado na escala':'Não informada na escala'}</small></article></div>;
}
function Route({activity,visitor=false}:{activity:TvActivity|null;visitor?:boolean}) {
  return <h1 className="broadcast-route">{activity?.origin?<>{visitorAirportLabel(activity.origin,visitor)}<ArrowRight/>{visitorAirportLabel(activity.destination,visitor)}</>:activity?'Sua próxima atividade':'Seu tempo, no seu ritmo.'}</h1>;
}
function Title({title,kicker,icon}:{title:string;kicker:string;icon:React.ReactNode}) {
  return <div className="broadcast-title"><div><Eyebrow>{icon}{kicker}</Eyebrow><h1>{title}</h1></div><span className="broadcast-mode">CONSULTA RÁPIDA</span></div>;
}
function trustedAirlinePhoto(snapshot:TvSnapshot,prefs:TvDisplayPreferences):{url:string;credit:string}|null{
  if(!prefs.airlinePhoto)return null;
  const visual=snapshot.profile?.airlineVisual;
  if(visual?.licensed && visual.imageUrl && visual.source){
    try{
      const url=new URL(visual.imageUrl);
      if(url.protocol==='https:')return{url:url.toString(),credit:visual.attribution||visual.source};
    }catch{}
  }
  const packaged=packagedAirlinePhoto(snapshot.profile?.airline);
  return packaged?{url:packaged.url,credit:`${packaged.credit} · ${packaged.license}`}:null;
}
type WeatherDisplay={airport:string;city?:string|null;temperature:number;label:string;wind?:number|null;rainChance?:number|null;observedAt?:string;expiresAt?:string};
function WeatherLocation({title,weather,empty}:{title:string;weather:WeatherDisplay|null;empty:string}) {
  return <article className={'broadcast-card weather-location '+(weather?'weather-ready':'weather-empty')}>
    <div className="weather-location-art"><WeatherArtwork label={weather?.label}/></div>
    <div className="weather-location-copy"><Eyebrow><MapPin/> {title}</Eyebrow><h2>{weather?.city||weather?.airport||empty}</h2>
      <div className="weather-location-value">{weather?<>{Math.round(weather.temperature)}<small>°C</small></>:'—'}</div>
      <p>{weather?.label||'Aguardando condição confirmada'}</p>
      {weather&&<div className="weather-metrics"><span>Vento <b>{Number.isFinite(weather.wind)?Math.round(Number(weather.wind))+' km/h':'—'}</b></span><span>Chuva <b>{Number.isFinite(weather.rainChance)?Math.round(Number(weather.rainChance))+'%':'—'}</b></span></div>}
    </div>
  </article>;
}
export function BroadcastPanel({view,snapshot,demo,clock,openDay,openView,prefs}:{view:QuickView;snapshot:TvSnapshot;demo:boolean;clock:Date;openDay:(date:string)=>void;openView:(view:'Mês'|'Mudanças')=>void;prefs:TvDisplayPreferences}) {
  const next=snapshot.next, weather=currentFact(snapshot.weather), gate=currentFact(snapshot.gate), traffic=currentFact(snapshot.traffic||null);
  const stay=upcomingStay(snapshot,clock.getTime()), now=clock.getTime();
  const legacyWeather=weather&&Number.isFinite(weather.temperature)?{...weather,city:null,wind:null,rainChance:null,observedAt:snapshot.weather?.observedAt,expiresAt:snapshot.weather?.expiresAt}:null;
  const baseWeather=weatherFor(snapshot,'base',now)||legacyWeather;
  const stayWeather=weatherFor(snapshot,'stay',now);
  const airline=airlineTheme(snapshot.profile?.airline);
  const airlinePhoto=trustedAirlinePhoto(snapshot,prefs);
  const visitor=isVisitorPresentation(snapshot);
  const mobility=(snapshot as any).mobility||null;
  if(view==='Agora') return <section className="broadcast-panel broadcast-overview">
    <article className={'broadcast-card broadcast-hero airline-'+airline+(airlinePhoto?' has-real-airline-photo':'')}><div className="flight-art" aria-hidden="true" style={airlinePhoto?{backgroundImage:`url("${airlinePhoto.url}")`}:undefined}/><div className="flight-art-shade"/>
      <div className="hero-copy"><Eyebrow><Plane/> {visitor?'ACOMPANHANDO A ROTINA':next?'PRÓXIMA ATIVIDADE':'BEM-VINDO A BORDO'}</Eyebrow><div className="broadcast-flight">{next?activityLabel(next):'CrewCheck'}</div><Route activity={next} visitor={visitor}/><span className="image-notice">{airlinePhoto?`Foto oficial/licenciada · ${airlinePhoto.credit}`:snapshot.profile?.airline?'Visual adaptado à '+snapshot.profile.airline+' · imagem ilustrativa':'Arte CrewCheck · imagem ilustrativa'}</span></div>
      <div className="hero-bottom-panel"><Timings snapshot={snapshot}/><div className="broadcast-hero-foot"><FactStatus snapshot={snapshot}/><button className="primary-button" disabled={!next} onClick={()=>next&&openDay(next.date)}>Ver jornada <ChevronRight/></button></div></div>
    </article>
    <aside className="broadcast-column">
      <article className="broadcast-card presentation-essentials-card"><Eyebrow>{!next&&prefs.weather&&baseWeather?<><CloudSun/> AGORA NA SUA BASE</>:<><ShieldCheck/> O QUE IMPORTA PARA APRESENTAR</>}</Eyebrow>
        {!next&&prefs.weather&&baseWeather&&<div className="offday-base-context"><strong>{Math.round(baseWeather.temperature)}°C</strong><span>{baseWeather.city||baseWeather.airport} · {baseWeather.label}</span></div>}
        <div className="essential-grid">
          <div><Clock3/><small>Apresentação</small><b>{next?.presentation||'Não informada'}</b></div>
          {prefs.gate&&<div><MapPin/><small>Portão</small><b>{gate?.label||'Não confirmado'}</b>{gate?.remoteStand===true&&<em>REMOTA</em>}</div>}
          {prefs.traffic&&<div><Gauge/><small>Trânsito</small><b>{traffic?.durationText||traffic?.delayText||'Sem leitura'}</b><span>{traffic?.delayText||traffic?.status||'Aguardando rota confirmada'}</span></div>}
          <div><Clock3/><small>Próxima atividade</small><b>{next?countdown(next,now):'—'}</b><span>{next?'Até o início publicado':'Nenhuma atividade futura'}</span></div>
        </div>
        {prefs.traffic&&mobility&&<UberHandoff mobility={mobility} compact/>}
      </article>
      {prefs.week&&<article className="broadcast-card overview-summary"><Eyebrow><CalendarDays/> {formatMonth(snapshot.summary.month)}</Eyebrow><div className="summary-pair"><div><b>{snapshot.summary.flights}</b><span>voos publicados</span></div><div><b>{snapshot.summary.stays}</b><span>pernoites</span></div></div>{prefs.weather&&baseWeather&&<div className="overview-weather"><CloudSun/><b>{Math.round(baseWeather.temperature)}°</b><span>{baseWeather.airport} · {baseWeather.label}</span></div>}<button onClick={()=>openView('Mês')}>Ver escala completa <ArrowRight/></button></article>}
      {(prefs.changes||prefs.weather)&&<article className="broadcast-card overview-note"><Eyebrow><Info/> {prefs.weather&&stayWeather?'PRÓXIMO PERNOITE':'O QUE IMPORTA AGORA'}</Eyebrow>{prefs.weather&&stayWeather?<p><b>{stayWeather.airport} · {Math.round(stayWeather.temperature)}°C</b><br/>{stayWeather.label}{Number.isFinite(stayWeather.rainChance)?' · chuva '+Math.round(Number(stayWeather.rainChance))+'%':''}</p>:<p>{prefs.changes?(snapshot.changes[0]||'Nenhuma mudança confirmada.'): 'Acompanhe os dados operacionais acima.'}</p>}{prefs.changes&&snapshot.changes.length>0&&<button onClick={()=>openView('Mudanças')}>Ver mudanças <ArrowRight/></button>}</article>}
    </aside>
  </section>;
  if(view==='Apresentação') return <section className="broadcast-panel broadcast-presentation"><Title title="Uma jornada sem pressa." kicker="APRESENTAÇÃO INTELIGENTE" icon={<Car/>}/><div className="broadcast-split"><article className="broadcast-card presentation-main"><Route activity={next} visitor={visitor}/><p className="broadcast-subtitle">{next?activityLabel(next):'Próxima atividade não informada'}</p><Timings snapshot={snapshot}/><div className="journey-line" aria-hidden="true"><Car/><i/><Plane/><i/><MapPin/></div><FactStatus snapshot={snapshot}/></article><aside className="broadcast-card presentation-side"><Eyebrow><MapPin/> ACESSO AO EMBARQUE</Eyebrow><strong className="broadcast-large-value">{prefs.gate?(gate?.label||'—'):'Oculto'}</strong><h2>{prefs.gate?(gate?.remoteStand===true?'Embarque remoto':'Portão'):'Portão oculto por preferência'}</h2><p>{prefs.gate?(gate?'Informação recebida com validade. Confirme no aeroporto.':'Sem portão confirmado nesta tela.'):'Você pode reativar este dado em Configurações.'}</p>{prefs.traffic&&<div className="presentation-traffic"><Gauge/><div><small>TRÂNSITO</small><b>{traffic?.durationText||traffic?.delayText||'Sem leitura confirmada'}</b><span>{traffic?.delayText||traffic?.status||'Aguardando rota'}</span></div></div>}{prefs.traffic&&mobility&&<UberHandoff mobility={mobility} compact/>}<div className="broadcast-divider"/><Eyebrow><ShieldCheck/> CADA HORÁRIO TEM SUA FONTE</Eyebrow><p>Apresentação vem da escala. A saída aparece apenas quando há uma recomendação válida.</p><small>Não usamos decolagem como apresentação nem estimamos saída sem dados.</small></aside></div></section>;
  if(view==='Meteorologia'&&!prefs.weather) return <section className="broadcast-panel"><Title title="Meteorologia oculta." kicker="PERSONALIZAÇÃO" icon={<CloudSun/>}/><article className="broadcast-card disabled-surface"><h2>Você escolheu não exibir clima na TV.</h2><p>Reative em Configurações quando quiser.</p></article></section>;
  if(view==='Meteorologia') return <section className="broadcast-panel"><Title title="O tempo onde sua rotina acontece." kicker="METEOROLOGIA" icon={<CloudSun/>}/><div className="weather-duo"><WeatherLocation title="SUA BASE" weather={baseWeather} empty={snapshot.profile?.base||'Base não informada'}/><WeatherLocation title="PRÓXIMO PERNOITE" weather={stayWeather} empty={stay?'Pernoite sem clima disponível':'Nenhum próximo pernoite'}/></div><div className="weather-source-line"><ShieldCheck/><span>{baseWeather||stayWeather?(demo?'Clima de demonstração':'Condições recebidas pelo CrewCheck'):'Nenhuma condição foi inventada para preencher a tela.'}</span><small>Atualização contextual · não substitui briefing meteorológico oficial.</small></div></section>;
  if(view==='Radar') return <section className="broadcast-panel"><Title title="Seu voo, em contexto." kicker="RADAR OPERACIONAL" icon={<Radar/>}/><div className="broadcast-split"><article className="broadcast-card radar-stage"><div className="radar-disc" aria-hidden="true"><i className="radar-ring r1"/><i className="radar-ring r2"/><i className="radar-ring r3"/><i className="radar-axis axis-x"/><i className="radar-axis axis-y"/><i className="radar-sweep"/></div><div className="radar-copy"><Eyebrow>VISUAL ILUSTRATIVO · SEM POSIÇÕES AO VIVO</Eyebrow><Route activity={next} visitor={visitor}/><p>{next?activityLabel(next):'Nenhum voo informado'}</p><h2>Aguardando rastreamento confirmado</h2></div></article><aside className="broadcast-card radar-context"><Eyebrow><Plane/> DADOS CONFIRMADOS</Eyebrow><dl><dt>Portão</dt><dd>{gate?.label||'Não informado'}</dd><dt>Embarque remoto</dt><dd>{gate?.remoteStand===true?'Remota':gate?.remoteStand===false?'Não':'Não confirmado'}</dd><dt>Posição / altitude</dt><dd>Indisponível</dd></dl><div className="broadcast-divider"/><p>Não desenhamos aviões em posições fictícias nem tratamos uma rota planejada como rastreamento real.</p><ProviderCredit provider="cirium" active={Boolean(gate&&isCiriumSource(snapshot.gate?.source))} demo={demo}/></aside></div></section>;
  return <section className="broadcast-panel"><Title title="Seu próximo lugar de descanso." kicker="PRÓXIMO PERNOITE" icon={<BedDouble/>}/><div className="broadcast-split"><article className="broadcast-card stay-stage"><div className="hotel-silhouette" aria-hidden="true"><Hotel/></div><div className="stay-copy"><Eyebrow><MapPin/> {snapshot.privacy==='family'?'MODO FAMÍLIA':stay?.origin||stay?.destination||'LOCAL NÃO INFORMADO'}</Eyebrow><h1>{stay?'Pernoite publicado':'Sem próximo pernoite informado'}</h1><p>{stay?stay.date.split('-').reverse().join('/'):'Nenhum pernoite futuro foi recebido na escala ativa.'}</p>{stay&&<div className="stay-window"><span>Início <b>{time(stay.startAt)}</b></span><span>Fim <b>{time(stay.endAt)}</b></span></div>}<small>Ilustração genérica. Não representa hotel reservado.</small></div></article><aside className="broadcast-card stay-details"><Eyebrow><BedDouble/> CONCIERGE</Eyebrow><dl><dt>Hotel</dt><dd>Não informado</dd><dt>Transporte</dt><dd>Não confirmado</dd><dt>Quarto</dt><dd>{snapshot.privacy==='family'?'Oculto no modo família':'Não informado'}</dd></dl><div className="broadcast-divider"/>{stayWeather&&<div className="stay-weather"><CloudSun/><div><b>{stayWeather.airport} · {Math.round(stayWeather.temperature)}°C</b><span>{stayWeather.label}</span></div></div>}<p>Dados de hotel, transporte e quarto serão exibidos somente após confirmação nas fontes do CrewCheck.</p>{stay&&<button onClick={()=>openDay(stay.date)}>Ver dia do pernoite <ArrowRight/></button>}</aside></div></section>;
}
