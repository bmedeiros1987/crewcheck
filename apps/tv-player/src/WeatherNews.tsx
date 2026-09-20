import React from 'react';
import {
  CloudSun, Droplets, Gauge, MapPin, Newspaper, ShieldCheck,
  Thermometer, Wind, Zap, CloudRain, Sun, Moon, Cloud, CloudFog
} from 'lucide-react';
import type { TvSnapshot, TvWeatherContext } from '../../../packages/tv-core/src/index';
import { weatherFor } from './premiumContext';
import type { TvDisplayPreferences } from './displayPreferences';
import './weather-news.css';

export type TvNewsItem={
  id:string;
  title:string;
  url?:string;
  source?:string;
  sourceId?:string;
  sourceKind?:string;
  category?:'airline'|'airport'|'regulation'|'weather'|'industry'|'safety'|string;
  publishedAt?:string;
  freshness?:string;
};

function finite(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value);}
function kindFor(weather:TvWeatherContext|null):string{
  if(weather?.kind)return weather.kind;
  const label=String(weather?.label||'').toLowerCase();
  if(/trovo|tempest|storm/.test(label))return'storm';
  if(/chuva|garoa|rain/.test(label))return'rain';
  if(/nevo|névo|fog/.test(label))return'fog';
  if(/nublado|cloud/.test(label))return /parcial|partly/.test(label)?'partly-cloudy':'cloudy';
  if(/claro|limpo|sol|clear|sun/.test(label))return'clear';
  return'unknown';
}
function WeatherGlyph({weather}:{weather:TvWeatherContext|null}){
  const kind=kindFor(weather);
  if(kind==='storm')return <Zap/>;
  if(kind==='rain')return <CloudRain/>;
  if(kind==='fog')return <CloudFog/>;
  if(kind==='cloudy')return <Cloud/>;
  if(kind==='clear')return weather?.isDay===false?<Moon/>:<Sun/>;
  return <CloudSun/>;
}
function WeatherScene({weather}:{weather:TvWeatherContext|null}){
  const kind=kindFor(weather),night=weather?.isDay===false;
  return <div className={'premium-weather-scene wx-'+kind+(night?' wx-night':' wx-day')} aria-hidden="true">
    <div className="wx-glow"/>
    <div className="wx-cloud wx-cloud-one"/>
    <div className="wx-cloud wx-cloud-two"/>
    {(kind==='rain'||kind==='storm')&&<><div className="wx-rain wx-rain-one"/><div className="wx-rain wx-rain-two"/></>}
    {kind==='fog'&&<><div className="wx-fog wx-fog-one"/><div className="wx-fog wx-fog-two"/></>}
    {kind==='storm'&&<div className="wx-lightning"/>}
  </div>;
}
function updateTime(weather:TvWeatherContext|null){
  if(!weather?.observedAt)return'Atualização indisponível';
  const parsed=new Date(weather.observedAt);
  if(Number.isNaN(parsed.getTime()))return'Atualização confirmada';
  return'Atualizado '+parsed.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}
function metric(value:unknown,suffix:string){
  return finite(value)?Math.round(value)+suffix:'—';
}

export function WeatherMini({weather,title='CLIMA'}:{weather:TvWeatherContext|null;title?:string}){
  return <article className={'premium-weather-mini '+(weather?'is-ready':'is-empty')}>
    <WeatherScene weather={weather}/>
    <div className="premium-weather-copy">
      <p className="eyebrow"><CloudSun/> {title} · {weather?.airport||'—'}</p>
      <div className="premium-weather-primary"><strong>{weather?Math.round(weather.temperature):'—'}<small>{weather?'°C':''}</small></strong><span><WeatherGlyph weather={weather}/>{weather?.label||'Dados indisponíveis'}</span></div>
      {weather&&<div className="premium-weather-mini-metrics">
        <span><CloudRain/> Chuva <b>{metric(weather.rainChance,'%')}</b></span>
        <span><Wind/> Vento <b>{metric(weather.wind,' km/h')}</b></span>
      </div>}
      <small>{updateTime(weather)}</small>
    </div>
  </article>;
}

function HourlyStrip({weather}:{weather:TvWeatherContext}){
  const hourly=Array.isArray(weather.hourly)?weather.hourly.slice(0,7):[];
  if(!hourly.length)return null;
  return <div className="weather-hourly" aria-label="Próximas horas">
    {hourly.map((hour,index)=><div key={hour.at||String(index)}>
      <small>{String(hour.at||'').slice(11,16)||'—'}</small>
      <WeatherGlyph weather={{...weather,kind:hour.kind as any,label:hour.label,temperature:finite(hour.temperature)?hour.temperature:weather.temperature}}/>
      <b>{finite(hour.temperature)?Math.round(hour.temperature)+'°':'—'}</b>
      <span>{finite(hour.rainChance)?Math.round(hour.rainChance)+'%':'—'}</span>
    </div>)}
  </div>;
}
function WeatherLocation({weather,title,empty}:{weather:TvWeatherContext|null;title:string;empty:string}){
  return <article className={'weather-center-card '+(weather?'weather-ready':'weather-empty')}>
    <WeatherScene weather={weather}/>
    <div className="weather-center-head">
      <div><p className="eyebrow"><MapPin/> {title}</p><h2>{weather?.city||weather?.airport||empty}</h2><small>{weather?weather.airport+' · '+updateTime(weather):'Sem condição confirmada'}</small></div>
      <WeatherGlyph weather={weather}/>
    </div>
    <div className="weather-center-main">
      <strong>{weather?Math.round(weather.temperature):'—'}<small>{weather?'°C':''}</small></strong>
      <div><b>{weather?.label||'Aguardando condição confirmada'}</b>
      {weather&&<span>Sensação {metric(weather.feelsLike,'°')} · Máx {metric(weather.maxTemperature,'°')} · Mín {metric(weather.minTemperature,'°')}</span>}</div>
    </div>
    {weather&&<div className="weather-center-metrics">
      <span><CloudRain/><small>Chuva</small><b>{metric(weather.rainChance,'%')}</b></span>
      <span><Wind/><small>Vento</small><b>{metric(weather.wind,' km/h')}</b></span>
      <span><Gauge/><small>Rajadas</small><b>{metric(weather.windGust,' km/h')}</b></span>
      <span><Droplets/><small>Umidade</small><b>{metric(weather.humidity,'%')}</b></span>
    </div>}
    {weather&&<HourlyStrip weather={weather}/>}
  </article>;
}
export function WeatherCenter({snapshot,now=Date.now()}:{snapshot:TvSnapshot;now?:number}){
  const base=weatherFor(snapshot,'base',now);
  const stay=weatherFor(snapshot,'stay',now);
  return <section className="detail weather-center">
    <div className="weather-center-title"><div><p className="eyebrow"><CloudSun/> CREWCHECK WEATHER</p><h1>O tempo onde sua rotina acontece.</h1></div><span><ShieldCheck/> Dados confirmados · sem preenchimento fictício</span></div>
    <div className="weather-center-grid">
      <WeatherLocation weather={base} title="SUA BASE" empty={snapshot.profile?.base||'Base não informada'}/>
      <WeatherLocation weather={stay} title="PRÓXIMO PERNOITE" empty="Nenhum próximo pernoite com clima"/>
    </div>
    <p className="note">Meteorologia contextual para planejamento pessoal. Briefing operacional oficial continua sendo a referência para a operação.</p>
  </section>;
}

export function weatherInsight(snapshot:TvSnapshot,now=Date.now()):string|null{
  const weather=weatherFor(snapshot,'base',now);
  if(!weather)return null;
  if(finite(weather.rainChance)&&weather.rainChance>=60)return'Chuva provável na sua base · '+Math.round(weather.rainChance)+'%';
  if(finite(weather.windGust)&&weather.windGust>=35)return'Rajadas de até '+Math.round(weather.windGust)+' km/h na sua base';
  if(finite(weather.feelsLike)&&weather.feelsLike<=12)return'Sensação térmica de '+Math.round(weather.feelsLike)+'°C na sua base';
  if(kindFor(weather)==='storm')return'Trovoadas na sua base · acompanhe as condições';
  return null;
}

function ageLabel(value?:string){
  const time=Date.parse(String(value||''));
  if(!Number.isFinite(time))return'horário não informado';
  const minutes=Math.max(0,Math.round((Date.now()-time)/60000));
  if(minutes<60)return'há '+Math.max(1,minutes)+' min';
  const hours=Math.round(minutes/60);
  return hours<24?'há '+hours+'h':'há '+Math.round(hours/24)+'d';
}
function validNews(items:TvNewsItem[]){
  const now=Date.now();
  return (Array.isArray(items)?items:[]).filter(item=>{
    const date=Date.parse(String(item?.publishedAt||''));
    return item&&typeof item.title==='string'&&item.title.trim()&&typeof item.source==='string'&&item.source.trim()&&Number.isFinite(date)&&date<=now&&now-date<=3*86400000;
  });
}
function contextTokens(snapshot:TvSnapshot){
  const values=[
    snapshot.profile?.airline,snapshot.profile?.base,snapshot.next?.origin,snapshot.next?.destination,
    ...(snapshot.weatherContexts||[]).map(item=>item.airport),
  ];
  return [...new Set(values.map(value=>String(value||'').trim().toUpperCase()).filter(Boolean))];
}
function newsScore(item:TvNewsItem,snapshot:TvSnapshot,prefs:TvDisplayPreferences){
  const text=(String(item.title)+' '+String(item.source)).toUpperCase();
  let score=0;
  const airline=String(snapshot.profile?.airline||'').trim().toUpperCase();
  if(prefs.newsAirline&&airline&&text.includes(airline))score+=90;
  if(prefs.newsAirports){
    for(const token of contextTokens(snapshot))if(token.length>=3&&text.includes(token))score+=45;
  }
  if(item.category==='weather')score+=20;
  if(item.category==='regulation'||item.category==='safety')score+=15;
  const age=Date.now()-Date.parse(String(item.publishedAt||''));
  score+=Math.max(0,36-Math.floor(age/3600000));
  return score;
}
export function rankedNews(items:TvNewsItem[],snapshot:TvSnapshot,prefs:TvDisplayPreferences){
  return validNews(items).slice().sort((a,b)=>newsScore(b,snapshot,prefs)-newsScore(a,snapshot,prefs));
}
function categoryLabel(category?:string){
  if(category==='weather')return'METEOROLOGIA';
  if(category==='regulation')return'REGULAÇÃO';
  if(category==='safety')return'SEGURANÇA';
  if(category==='airport')return'AEROPORTOS';
  if(category==='airline')return'COMPANHIAS';
  return'AVIAÇÃO';
}
export function NewsPanel({items,snapshot,prefs}:{items:TvNewsItem[];snapshot:TvSnapshot;prefs:TvDisplayPreferences}){
  const rows=rankedNews(items,snapshot,prefs).slice(0,2);
  return <article className="premium-news-panel">
    <p className="eyebrow"><Newspaper/> CREWCHECK NEWS</p>
    {rows.length?rows.map(item=><div className="premium-news-row" key={item.id}>
      <small>{categoryLabel(item.category)}</small><b>{item.title}</b><span>{item.source} · {ageLabel(item.publishedAt)}</span>
    </div>):<div className="premium-news-empty"><b>Informativo em atualização</b><span>A escala continua funcionando normalmente.</span></div>}
    <small className="news-editorial-note">Conteúdo editorial · não substitui avisos operacionais.</small>
  </article>;
}
export function NewsCenter({items,snapshot,prefs}:{items:TvNewsItem[];snapshot:TvSnapshot;prefs:TvDisplayPreferences}){
  const rows=rankedNews(items,snapshot,prefs);
  return <section className="detail premium-news-center">
    <div className="news-center-title"><div><p className="eyebrow"><Newspaper/> CREWCHECK NEWS</p><h1>Aviação em contexto.</h1></div><span>Prioridade: sua companhia · seus aeroportos · atualidade</span></div>
    {rows.length?<div className="news-center-grid">{rows.map(item=><article className="news-center-card" key={item.id}>
      <small>{categoryLabel(item.category)}</small><h2>{item.title}</h2><p>{item.source} · {ageLabel(item.publishedAt)}</p>
      <span>{item.sourceKind==='official'?'Fonte oficial':'Feed editorial sindicado'}</span>
    </article>)}</div>:<article className="empty-card"><Newspaper/><h2>Nenhuma manchete recente disponível.</h2><p>O feed editorial falhou ou não possui notícias recentes. Nenhuma manchete foi inventada para preencher a tela.</p></article>}
    <p className="note">As notícias são editoriais e ficam separadas de portão, apresentação, trânsito, meteorologia e demais fatos operacionais.</p>
  </section>;
}
