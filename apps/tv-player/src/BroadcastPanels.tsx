import React from 'react';
import { Plane, ArrowRight, CalendarDays, Clock3, Car, BedDouble, MapPin, ShieldCheck, CloudSun, Radar, Hotel, Info, ChevronRight } from 'lucide-react';
import { currentFact, freshness, type TvSnapshot, type TvActivity } from '../../../packages/tv-core/src/index';
import { WeatherArtwork } from './TvVisuals';
import { formatTvTime as time, formatMonth, activityLabel } from './presentation';
import { countdown, upcomingStay, isCiriumSource, type QuickView } from './broadcastPolicy';
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
function Route({activity}:{activity:TvActivity|null}) {
  return <h1 className="broadcast-route">{activity?.origin?<>{activity.origin}<ArrowRight/>{activity.destination||'—'}</>:activity?'Sua próxima atividade':'Seu tempo, no seu ritmo.'}</h1>;
}
function Title({title,kicker,icon}:{title:string;kicker:string;icon:React.ReactNode}) {
  return <div className="broadcast-title"><div><Eyebrow>{icon}{kicker}</Eyebrow><h1>{title}</h1></div><span className="broadcast-mode">CONSULTA RÁPIDA</span></div>;
}
export function BroadcastPanel({view,snapshot,demo,clock,openDay,openView}:{view:QuickView;snapshot:TvSnapshot;demo:boolean;clock:Date;openDay:(date:string)=>void;openView:(view:'Mês'|'Mudanças')=>void}) {
  const next=snapshot.next, weather=currentFact(snapshot.weather), gate=currentFact(snapshot.gate);
  const stay=upcomingStay(snapshot,clock.getTime());
  const safeWeather=weather&&Number.isFinite(weather.temperature)?weather:null;
  if(view==='Agora') return <section className="broadcast-panel broadcast-overview">
    <article className="broadcast-card broadcast-hero"><div className="flight-art" aria-hidden="true"/><div className="flight-art-shade"/>
      <div className="hero-copy"><Eyebrow><Plane/> {next?'PRÓXIMA ATIVIDADE':'BEM-VINDO A BORDO'}</Eyebrow><div className="broadcast-flight">{next?activityLabel(next):'CrewCheck'}</div><Route activity={next}/><span className="image-notice">Arte ilustrativa · não identifica a aeronave</span></div>
      <div className="hero-bottom-panel"><Timings snapshot={snapshot}/><div className="broadcast-hero-foot"><FactStatus snapshot={snapshot}/><button className="primary-button" disabled={!next} onClick={()=>next&&openDay(next.date)}>Ver jornada <ChevronRight/></button></div></div>
    </article>
    <aside className="broadcast-column"><article className="broadcast-card countdown-card"><Eyebrow><Clock3/> PRÓXIMA ATIVIDADE EM</Eyebrow><strong>{countdown(next,clock.getTime())}</strong><p>{next?next.date.split('-').reverse().join('/'):'Nenhuma atividade futura informada'}</p><small>Horário de início da atividade · não é previsão de decolagem.</small></article>
      <article className="broadcast-card overview-summary"><Eyebrow><CalendarDays/> {formatMonth(snapshot.summary.month)}</Eyebrow><div className="summary-pair"><div><b>{snapshot.summary.flights}</b><span>voos publicados</span></div><div><b>{snapshot.summary.stays}</b><span>pernoites</span></div></div><button onClick={()=>openView('Mês')}>Ver escala completa <ArrowRight/></button></article>
      <article className="broadcast-card overview-note"><Eyebrow><Info/> O QUE IMPORTA AGORA</Eyebrow><p>{snapshot.changes[0]||'Confira a escala e as comunicações oficiais antes da jornada.'}</p>{snapshot.changes.length>0&&<button onClick={()=>openView('Mudanças')}>Ver mudanças <ArrowRight/></button>}</article>
    </aside>
  </section>;
  if(view==='Apresentação') return <section className="broadcast-panel broadcast-presentation"><Title title="Uma jornada sem pressa." kicker="APRESENTAÇÃO INTELIGENTE" icon={<Car/>}/><div className="broadcast-split"><article className="broadcast-card presentation-main"><Route activity={next}/><p className="broadcast-subtitle">{next?activityLabel(next):'Próxima atividade não informada'}</p><Timings snapshot={snapshot}/><div className="journey-line" aria-hidden="true"><Car/><i/><Plane/><i/><MapPin/></div><FactStatus snapshot={snapshot}/></article><aside className="broadcast-card presentation-side"><Eyebrow><MapPin/> ACESSO AO EMBARQUE</Eyebrow><strong className="broadcast-large-value">{gate?.label||'—'}</strong><h2>{gate?.remoteStand===true?'Embarque remoto':'Portão'}</h2><p>{gate?'Informação recebida com validade. Confirme no aeroporto.':'Sem portão confirmado nesta tela.'}</p><div className="broadcast-divider"/><Eyebrow><ShieldCheck/> CADA HORÁRIO TEM SUA FONTE</Eyebrow><p>Apresentação vem da escala. A saída aparece apenas quando há uma recomendação válida.</p><small>Não usamos decolagem como apresentação nem estimamos saída sem dados.</small></aside></div></section>;
  if(view==='Meteorologia') return <section className="broadcast-panel"><Title title="O tempo no seu caminho." kicker="METEOROLOGIA" icon={<CloudSun/>}/><div className="broadcast-split"><article className="broadcast-card weather-stage"><div className="weather-halo" aria-hidden="true"/><div className="weather-big-art"><WeatherArtwork label={safeWeather?.label}/></div><div className="weather-stage-copy"><Eyebrow><MapPin/> {safeWeather?.airport||'LOCAL NÃO INFORMADO'}</Eyebrow><strong>{safeWeather?Math.round(safeWeather.temperature):'—'}{safeWeather&&<small>°C</small>}</strong><h2>{safeWeather?.label||'Aguardando dados confirmados'}</h2></div></article><aside className="broadcast-card weather-context"><Eyebrow><ShieldCheck/> INFORMAÇÃO COM ORIGEM</Eyebrow><h2>{safeWeather?(demo?'Clima de demonstração':'Condição recebida'):'Serviço ainda indisponível'}</h2><p>{safeWeather?'A condição exibida respeita a validade da fonte.':'O visual está pronto. Nenhuma temperatura ou previsão é inventada para preencher esta tela.'}</p><dl><dt>Observação</dt><dd>{safeWeather&&snapshot.weather?time(snapshot.weather.observedAt):'—'}</dd><dt>Válida até</dt><dd>{safeWeather&&snapshot.weather?time(snapshot.weather.expiresAt):'—'}</dd></dl><div className="broadcast-divider"/><p>Vento, visibilidade e previsões detalhadas só aparecerão quando estiverem integrados.</p><small>Consulta de contexto. Não substitui briefing meteorológico oficial.</small></aside></div></section>;
  if(view==='Radar') return <section className="broadcast-panel"><Title title="Seu voo, em contexto." kicker="RADAR OPERACIONAL" icon={<Radar/>}/><div className="broadcast-split"><article className="broadcast-card radar-stage"><div className="radar-disc" aria-hidden="true"><i className="radar-ring r1"/><i className="radar-ring r2"/><i className="radar-ring r3"/><i className="radar-axis axis-x"/><i className="radar-axis axis-y"/><i className="radar-sweep"/></div><div className="radar-copy"><Eyebrow>VISUAL ILUSTRATIVO · SEM POSIÇÕES AO VIVO</Eyebrow><Route activity={next}/><p>{next?activityLabel(next):'Nenhum voo informado'}</p><h2>Aguardando rastreamento confirmado</h2></div></article><aside className="broadcast-card radar-context"><Eyebrow><Plane/> DADOS CONFIRMADOS</Eyebrow><dl><dt>Portão</dt><dd>{gate?.label||'Não informado'}</dd><dt>Embarque remoto</dt><dd>{gate?.remoteStand===true?'Remota':gate?.remoteStand===false?'Não':'Não confirmado'}</dd><dt>Posição / altitude</dt><dd>Indisponível</dd></dl><div className="broadcast-divider"/><p>Não desenhamos aviões em posições fictícias nem tratamos uma rota planejada como rastreamento real.</p><ProviderCredit provider="cirium" active={Boolean(gate&&isCiriumSource(snapshot.gate?.source))} demo={demo}/></aside></div></section>;
  return <section className="broadcast-panel"><Title title="Seu próximo lugar de descanso." kicker="PRÓXIMO PERNOITE" icon={<BedDouble/>}/><div className="broadcast-split"><article className="broadcast-card stay-stage"><div className="hotel-silhouette" aria-hidden="true"><Hotel/></div><div className="stay-copy"><Eyebrow><MapPin/> {snapshot.privacy==='family'?'MODO FAMÍLIA':stay?.origin||stay?.destination||'LOCAL NÃO INFORMADO'}</Eyebrow><h1>{stay?'Pernoite publicado':'Sem próximo pernoite informado'}</h1><p>{stay?stay.date.split('-').reverse().join('/'):'Nenhum pernoite futuro foi recebido na escala ativa.'}</p>{stay&&<div className="stay-window"><span>Início <b>{time(stay.startAt)}</b></span><span>Fim <b>{time(stay.endAt)}</b></span></div>}<small>Ilustração genérica. Não representa hotel reservado.</small></div></article><aside className="broadcast-card stay-details"><Eyebrow><BedDouble/> CONCIERGE</Eyebrow><dl><dt>Hotel</dt><dd>Não informado</dd><dt>Transporte</dt><dd>Não confirmado</dd><dt>Quarto</dt><dd>{snapshot.privacy==='family'?'Oculto no modo família':'Não informado'}</dd></dl><div className="broadcast-divider"/><p>Dados de hotel, transporte e quarto serão exibidos somente após confirmação nas fontes do CrewCheck.</p>{stay&&<button onClick={()=>openDay(stay.date)}>Ver dia do pernoite <ArrowRight/></button>}</aside></div></section>;
}
