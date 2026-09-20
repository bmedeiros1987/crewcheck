const AIRPORTS = {
  BSB:{lat:-15.8711,lon:-47.9186,city:'Brasília'}, GRU:{lat:-23.4356,lon:-46.4731,city:'Guarulhos'}, CGH:{lat:-23.6261,lon:-46.6564,city:'São Paulo'}, VCP:{lat:-23.0074,lon:-47.1345,city:'Campinas'},
  SDU:{lat:-22.9105,lon:-43.1631,city:'Rio de Janeiro'}, GIG:{lat:-22.8099,lon:-43.2506,city:'Rio de Janeiro'}, CNF:{lat:-19.6244,lon:-43.9719,city:'Belo Horizonte'}, CWB:{lat:-25.5317,lon:-49.1761,city:'Curitiba'},
  POA:{lat:-29.9944,lon:-51.1714,city:'Porto Alegre'}, FLN:{lat:-27.6705,lon:-48.5525,city:'Florianópolis'}, SSA:{lat:-12.9086,lon:-38.3225,city:'Salvador'}, REC:{lat:-8.1265,lon:-34.9236,city:'Recife'},
  FOR:{lat:-3.7763,lon:-38.5326,city:'Fortaleza'}, BEL:{lat:-1.3793,lon:-48.4763,city:'Belém'}, MAO:{lat:-3.0386,lon:-60.0497,city:'Manaus'}, SLZ:{lat:-2.5854,lon:-44.2341,city:'São Luís'},
  NAT:{lat:-5.7681,lon:-35.3761,city:'Natal'}, MCZ:{lat:-9.5108,lon:-35.7917,city:'Maceió'}, AJU:{lat:-10.9840,lon:-37.0703,city:'Aracaju'}, VIX:{lat:-20.2581,lon:-40.2864,city:'Vitória'},
  BVB:{lat:2.8463,lon:-60.6901,city:'Boa Vista'}, MCP:{lat:0.0507,lon:-51.0722,city:'Macapá'}, PMW:{lat:-10.2915,lon:-48.3569,city:'Palmas'}, THE:{lat:-5.0599,lon:-42.8235,city:'Teresina'},
  GYN:{lat:-16.6320,lon:-49.2207,city:'Goiânia'}, CGB:{lat:-15.6529,lon:-56.1167,city:'Cuiabá'}, CGR:{lat:-20.4687,lon:-54.6725,city:'Campo Grande'}, PVH:{lat:-8.7093,lon:-63.9023,city:'Porto Velho'},
  RBR:{lat:-9.8689,lon:-67.8981,city:'Rio Branco'}, JPA:{lat:-7.1458,lon:-34.9486,city:'João Pessoa'}, IOS:{lat:-14.8159,lon:-39.0332,city:'Ilhéus'}
};

function weatherMeta(code) {
  const value=Number(code);
  if(value===0)return{kind:'clear',label:'Céu claro'};
  if([1,2].includes(value))return{kind:'partly-cloudy',label:'Parcialmente nublado'};
  if(value===3)return{kind:'cloudy',label:'Nublado'};
  if([45,48].includes(value))return{kind:'fog',label:'Névoa'};
  if([51,53,55,56,57].includes(value))return{kind:'rain',label:'Garoa'};
  if([61,63,65,66,67,80,81,82].includes(value))return{kind:'rain',label:'Chuva'};
  if([71,73,75,77,85,86].includes(value))return{kind:'snow',label:'Neve'};
  if([95,96,99].includes(value))return{kind:'storm',label:'Trovoada'};
  return{kind:'unknown',label:'Condição local'};
}
function number(value){
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:null;
}
function withOffset(value,offsetSeconds=0){
  const text=String(value||'').trim();
  if(!text||/[zZ]$|[+-]\d{2}:\d{2}$/.test(text))return text;
  const total=Math.trunc(Number(offsetSeconds)||0);
  const sign=total<0?'-':'+';
  const abs=Math.abs(total);
  const hours=String(Math.floor(abs/3600)).padStart(2,'0');
  const minutes=String(Math.floor((abs%3600)/60)).padStart(2,'0');
  return text+sign+hours+':'+minutes;
}
function airportCode(value){
  const code=String(value||'').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code)?code:'';
}
function nextStayAirport(snapshot,now){
  const rows=(snapshot?.days||[]).flatMap(day=>day.activities||[])
    .filter(item=>item?.kind==='stay' && Date.parse(item.endAt)>now)
    .sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
  const stay=rows[0];
  return airportCode(stay?.destination)||airportCode(stay?.origin);
}

export function createTvWeatherProvider({fetchImpl=fetch,now=Date.now}={}){
  const cache=new Map();
  const ttl=10*60*1000;
  return async function read(airport){
    const code=airportCode(airport);
    const point=AIRPORTS[code];
    if(!point)return null;
    const cached=cache.get(code);
    if(cached && now()-cached.cachedAt<ttl)return cached.value;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),4500);
    try{
      const url=new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude',String(point.lat));
      url.searchParams.set('longitude',String(point.lon));
      url.searchParams.set('current','temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day');
      url.searchParams.set('hourly','temperature_2m,precipitation_probability,weather_code');
      url.searchParams.set('daily','temperature_2m_max,temperature_2m_min,precipitation_probability_max');
      url.searchParams.set('forecast_days','2');
      url.searchParams.set('timezone','auto');
      const response=await fetchImpl(url,{headers:{accept:'application/json'},signal:controller.signal});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload)return cached?.value||null;
      const current=payload.current||{};
      const meta=weatherMeta(current.weather_code);
      const localObservedAt=String(current.time||'');
      const offsetSeconds=Number(payload.utc_offset_seconds)||0;
      const observedAt=localObservedAt?withOffset(localObservedAt,offsetSeconds):new Date(now()).toISOString();
      const hourlyTimes=Array.isArray(payload.hourly?.time)?payload.hourly.time:[];
      const currentIndex=Math.max(0,hourlyTimes.findIndex(value=>String(value)>=localObservedAt.slice(0,13)));
      const hourly=hourlyTimes.slice(currentIndex,currentIndex+8).map((at,index)=>{
        const sourceIndex=currentIndex+index;
        const hourMeta=weatherMeta(payload.hourly?.weather_code?.[sourceIndex]);
        return{
          at:withOffset(at,offsetSeconds),
          temperature:number(payload.hourly?.temperature_2m?.[sourceIndex]),
          rainChance:number(payload.hourly?.precipitation_probability?.[sourceIndex]),
          kind:hourMeta.kind,
          label:hourMeta.label,
        };
      }).filter(item=>item.temperature!==null);
      const value={
        airport:code,
        city:point.city,
        temperature:number(current.temperature_2m),
        feelsLike:number(current.apparent_temperature),
        humidity:number(current.relative_humidity_2m),
        wind:number(current.wind_speed_10m),
        windGust:number(current.wind_gusts_10m),
        rainChance:number(payload.daily?.precipitation_probability_max?.[0]),
        minTemperature:number(payload.daily?.temperature_2m_min?.[0]),
        maxTemperature:number(payload.daily?.temperature_2m_max?.[0]),
        kind:meta.kind,
        label:meta.label,
        isDay:Number(current.is_day)===1,
        hourly,
        source:'open-meteo',
        observedAt,
        expiresAt:new Date(now()+30*60*1000).toISOString(),
      };
      if(value.temperature===null)return cached?.value||null;
      cache.set(code,{cachedAt:now(),value});
      return value;
    }catch{
      return cached?.value||null;
    }finally{
      clearTimeout(timer);
    }
  };
}

export async function enrichTvSnapshotWeather(snapshot,readWeather,{now=Date.now()}={}){
  if(!snapshot || snapshot.privacy!=='private' || typeof readWeather!=='function')return snapshot;
  const base=airportCode(snapshot.profile?.base);
  const stay=nextStayAirport(snapshot,now);
  const contexts=[];
  if(base){
    const value=await readWeather(base);
    if(value)contexts.push({...value,role:'base'});
  }
  if(stay && stay!==base){
    const value=await readWeather(stay);
    if(value)contexts.push({...value,role:'stay'});
  }
  const baseWeather=contexts.find(item=>item.role==='base')||contexts[0]||null;
  return{
    ...snapshot,
    weatherContexts:contexts,
    weather:baseWeather?{
      value:{airport:baseWeather.airport,temperature:baseWeather.temperature,label:baseWeather.label},
      source:baseWeather.source,
      observedAt:baseWeather.observedAt,
      expiresAt:baseWeather.expiresAt,
    }:snapshot.weather,
  };
}
