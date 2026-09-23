import React, { useMemo, useState } from 'react';
import { CloudSun, Gauge, MapPin, Newspaper, Plane, Users, WalletCards, BedDouble, Languages, Image as ImageIcon } from 'lucide-react';

export type TvPreset='operacional'|'equilibrado'|'visitante'|'minimalista';
export type TvDisplayPreferences={
  gate:boolean;
  traffic:boolean;
  weather:boolean;
  week:boolean;
  changes:boolean;
  news:boolean;
  finance:boolean;
  crew:boolean;
  hotel:boolean;
  visitorExplanations:boolean;
  airlinePhoto:boolean;
};
const KEY='crewcheck-tv-display-preferences-v1';
export const DEFAULT_TV_DISPLAY_PREFERENCES:TvDisplayPreferences={
  gate:true,traffic:true,weather:true,week:true,changes:true,news:false,
  finance:false,crew:false,hotel:true,visitorExplanations:true,airlinePhoto:true,
};

function load():TvDisplayPreferences{
  try{
    const parsed=JSON.parse(localStorage.getItem(KEY)||'{}');
    return{...DEFAULT_TV_DISPLAY_PREFERENCES,...Object.fromEntries(Object.keys(DEFAULT_TV_DISPLAY_PREFERENCES).map(key=>[key,typeof parsed?.[key]==='boolean'?parsed[key]:(DEFAULT_TV_DISPLAY_PREFERENCES as any)[key]]))} as TvDisplayPreferences;
  }catch{return DEFAULT_TV_DISPLAY_PREFERENCES;}
}
function save(value:TvDisplayPreferences){try{localStorage.setItem(KEY,JSON.stringify(value));}catch{}}

const PRESETS:Record<TvPreset,TvDisplayPreferences>={
  operacional:{...DEFAULT_TV_DISPLAY_PREFERENCES,gate:true,traffic:true,weather:true,week:true,changes:true,news:false,finance:false,crew:false,hotel:true,visitorExplanations:false,airlinePhoto:true},
  equilibrado:{...DEFAULT_TV_DISPLAY_PREFERENCES},
  visitante:{...DEFAULT_TV_DISPLAY_PREFERENCES,gate:false,traffic:false,weather:true,week:true,changes:false,news:false,finance:false,crew:false,hotel:false,visitorExplanations:true,airlinePhoto:true},
  minimalista:{...DEFAULT_TV_DISPLAY_PREFERENCES,gate:true,traffic:true,weather:false,week:false,changes:false,news:false,finance:false,crew:false,hotel:false,visitorExplanations:false,airlinePhoto:true},
};
export function useTvDisplayPreferences(){
  const [value,setValue]=useState<TvDisplayPreferences>(load);
  const api=useMemo(()=>({
    value,
    set:(key:keyof TvDisplayPreferences,next:boolean)=>setValue(current=>{const updated={...current,[key]:next};save(updated);return updated;}),
    applyPreset:(preset:TvPreset)=>{const next={...PRESETS[preset]};save(next);setValue(next);},
    reset:()=>{save(DEFAULT_TV_DISPLAY_PREFERENCES);setValue(DEFAULT_TV_DISPLAY_PREFERENCES);},
  }),[value]);
  return api;
}
export type TvDisplayPreferencesApi=ReturnType<typeof useTvDisplayPreferences>;

const rows:Array<[keyof TvDisplayPreferences,string,string,React.ReactNode,boolean?]>=[
  ['gate','Portão','Exibir portão/embarque quando a fonte estiver válida.',<MapPin/>],
  ['traffic','Trânsito','Priorizar duração de trajeto e atrasos na tela Agora.',<Gauge/>],
  ['weather','Meteorologia','Clima da base, origem e próximo pernoite quando disponível.',<CloudSun/>],
  ['week','Resumo da semana','Voos, jornadas e pernoites no painel inicial.',<Plane/>],
  ['changes','Mudanças','Mostrar alterações confirmadas da escala.',<Plane/>],
  ['news','Notícias','Conteúdo editorial; nunca interfere na operação.',<Newspaper/>],
  ['hotel','Pernoite','Mostrar contexto de hotel quando autorizado.',<BedDouble/>],
  ['crew','Tripulação','Só aparece se o compartilhamento sensível tiver sido autorizado no celular.',<Users/>,true],
  ['finance','Financeiro','Só aparece se o compartilhamento sensível tiver sido autorizado no celular.',<WalletCards/>,true],
  ['visitorExplanations','Explicar códigos','Traduz IATA/siglas para linguagem simples; sempre forçado no modo visitante.',<Languages/>],
  ['airlinePhoto','Foto da companhia','Usar fotografia real somente quando houver asset oficial/licenciado.',<ImageIcon/>],
];

export function TvDisplaySettings({prefs}:{prefs:TvDisplayPreferencesApi}){
  return <article className="tv-display-settings"><h2>O que importa para você</h2><p>Escolha o que merece espaço na TV. Campos sensíveis e o modo visitante real continuam dependendo da autorização do CrewCheck no celular.</p>
    <div className="display-preset-row" aria-label="Perfis de exibição">
      <button type="button" onClick={()=>prefs.applyPreset('operacional')}>Operacional</button>
      <button type="button" onClick={()=>prefs.applyPreset('equilibrado')}>Equilibrado</button>
      <button type="button" onClick={()=>prefs.applyPreset('visitante')}>Explicativo</button>
      <button type="button" onClick={()=>prefs.applyPreset('minimalista')}>Minimalista</button>
    </div>
    <div className="display-pref-grid">{rows.map(([key,title,detail,icon,sensitive])=><button key={key} type="button" aria-pressed={prefs.value[key]} onClick={()=>prefs.set(key,!prefs.value[key])}>
      <span className="display-pref-icon">{icon}</span><span><b>{title}</b><small>{detail}</small>{sensitive&&<em>Autorização no celular</em>}</span><i>{prefs.value[key]?'ON':'OFF'}</i>
    </button>)}</div>
    <button className="display-pref-reset" type="button" onClick={prefs.reset}>Restaurar padrão</button>
  </article>;
}
