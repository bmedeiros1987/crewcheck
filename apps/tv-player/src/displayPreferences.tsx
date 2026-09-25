import React, { useMemo, useState } from 'react';
import { CloudSun, Gauge, MapPin, Newspaper, Plane, Users, WalletCards, BedDouble, Languages, Image as ImageIcon } from 'lucide-react';

export type TvDisplayPreset='essential'|'operational'|'rest'|'complete'|'visitor';
export type TvDisplayPreferences={
  gate:boolean;
  traffic:boolean;
  mobility:boolean;
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
  gate:true,traffic:true,mobility:true,weather:true,week:true,changes:true,news:false,
  finance:false,crew:false,hotel:true,visitorExplanations:true,airlinePhoto:true,
};
export const TV_DISPLAY_PRESETS:Record<TvDisplayPreset,TvDisplayPreferences>={
  essential:{...DEFAULT_TV_DISPLAY_PREFERENCES,week:false,changes:true,news:false,finance:false,crew:false,hotel:true,mobility:true},
  operational:{...DEFAULT_TV_DISPLAY_PREFERENCES,gate:true,traffic:true,mobility:true,weather:true,week:true,changes:true,news:false,finance:false,crew:false,hotel:true},
  rest:{...DEFAULT_TV_DISPLAY_PREFERENCES,gate:false,traffic:false,mobility:false,weather:true,week:true,changes:false,news:false,finance:false,crew:false,hotel:true},
  complete:{...DEFAULT_TV_DISPLAY_PREFERENCES,gate:true,traffic:true,mobility:true,weather:true,week:true,changes:true,news:true,finance:true,crew:true,hotel:true},
  visitor:{...DEFAULT_TV_DISPLAY_PREFERENCES,gate:false,traffic:false,mobility:false,weather:true,week:true,changes:false,news:false,finance:false,crew:false,hotel:false,visitorExplanations:true,airlinePhoto:true},
};

function load():TvDisplayPreferences{
  try{
    const parsed=JSON.parse(localStorage.getItem(KEY)||'{}');
    const next={...DEFAULT_TV_DISPLAY_PREFERENCES} as TvDisplayPreferences;
    (Object.keys(DEFAULT_TV_DISPLAY_PREFERENCES) as Array<keyof TvDisplayPreferences>).forEach(key=>{
      if(typeof parsed?.[key]==='boolean') next[key]=parsed[key];
    });
    return next;
  }catch{return {...DEFAULT_TV_DISPLAY_PREFERENCES};}
}
function save(value:TvDisplayPreferences){try{localStorage.setItem(KEY,JSON.stringify(value));}catch{}}

export function useTvDisplayPreferences(){
  const [value,setValue]=useState<TvDisplayPreferences>(load);
  const api=useMemo(()=>({
    value,
    set:(key:keyof TvDisplayPreferences,next:boolean)=>setValue(current=>{const updated={...current,[key]:next};save(updated);return updated;}),
    reset:()=>{save(DEFAULT_TV_DISPLAY_PREFERENCES);setValue(DEFAULT_TV_DISPLAY_PREFERENCES);},
    preset:(name:TvDisplayPreset)=>{const next={...TV_DISPLAY_PRESETS[name]};save(next);setValue(next);},
  }),[value]);
  return api;
}
export type TvDisplayPreferencesApi=ReturnType<typeof useTvDisplayPreferences>;

const rows:Array<[keyof TvDisplayPreferences,string,string,React.ReactNode,boolean?]>=[
  ['gate','Portão','Exibir portão/embarque quando a fonte estiver válida.',<MapPin/>],
  ['traffic','Trânsito','Priorizar duração de trajeto e atrasos na tela Agora.',<Gauge/>],
  ['mobility','Uber / mobilidade','Mostrar handoff por QR para concluir a corrida no celular quando autorizado.',<Gauge/>],
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

const presets:Array<[TvDisplayPreset,string,string]>=[
  ['essential','Essencial','Apresentação, trânsito, portão, clima e pernoite.'],
  ['operational','Operacional','Mais contexto de voo, semana e mudanças.'],
  ['rest','Descanso','Clima, pernoite e escala com menos ruído operacional.'],
  ['complete','Completo','Tudo que estiver autorizado, inclusive notícias e dados sensíveis.'],
  ['visitor','Visitante','Linguagem simples e sem módulos sensíveis por padrão.'],
];

export function TvDisplaySettings({prefs}:{prefs:TvDisplayPreferencesApi}){
  return <article className="tv-display-settings"><h2>O que importa para você</h2><p>Escolha o que merece espaço na TV. Campos sensíveis continuam dependendo da autorização do CrewCheck no celular.</p>
    <div className="display-preset-row">{presets.map(([name,title,detail])=><button key={name} type="button" onClick={()=>prefs.preset(name)}><b>{title}</b><small>{detail}</small></button>)}</div>
    <div className="display-pref-grid">{rows.map(([key,title,detail,icon,sensitive])=><button key={key} type="button" aria-pressed={prefs.value[key]} onClick={()=>prefs.set(key,!prefs.value[key])}>
      <span className="display-pref-icon">{icon}</span><span><b>{title}</b><small>{detail}</small>{sensitive&&<em>Autorização no celular</em>}</span><i>{prefs.value[key]?'ON':'OFF'}</i>
    </button>)}</div>
    <button className="display-pref-reset" type="button" onClick={prefs.reset}>Restaurar padrão</button>
  </article>;
}
