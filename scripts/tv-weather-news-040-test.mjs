import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { createTvWeatherProvider, enrichTvSnapshotWeather } from '../server/tv/weather.mjs';
import { createNewsGateway } from '../server/tv/news.mjs';
import { fetchRssItems } from '../server/tv/rss.mjs';

const fixedNow=Date.parse('2026-09-20T12:00:00Z');

const weatherPayload={
  utc_offset_seconds:-10800,
  current:{
    time:'2026-09-20T08:55',
    temperature_2m:24.4,
    apparent_temperature:23.8,
    relative_humidity_2m:61,
    weather_code:61,
    wind_speed_10m:17.2,
    wind_gusts_10m:36.8,
    is_day:1,
  },
  hourly:{
    time:['2026-09-20T08:00','2026-09-20T09:00','2026-09-20T10:00','2026-09-20T11:00'],
    temperature_2m:[23,24,25,26],
    precipitation_probability:[55,68,72,40],
    weather_code:[3,61,61,2],
  },
  daily:{
    temperature_2m_max:[29],
    temperature_2m_min:[18],
    precipitation_probability_max:[72],
  },
};
const weatherFetch=async()=>new Response(JSON.stringify(weatherPayload),{
  status:200,
  headers:{'content-type':'application/json'},
});
const readWeather=createTvWeatherProvider({fetchImpl:weatherFetch,now:()=>fixedNow});
const bsb=await readWeather('BSB');
assert.equal(bsb?.airport,'BSB');
assert.equal(bsb?.city,'Brasília');
assert.equal(bsb?.kind,'rain');
assert.equal(bsb?.temperature,24.4);
assert.equal(bsb?.feelsLike,23.8);
assert.equal(bsb?.humidity,61);
assert.equal(bsb?.windGust,36.8);
assert.equal(bsb?.rainChance,72);
assert.equal(bsb?.minTemperature,18);
assert.equal(bsb?.maxTemperature,29);
assert.equal(bsb?.hourly?.length,4);
assert.match(String(bsb?.observedAt),/-03:00$/,'weather timestamp must carry airport-local offset');
assert.match(String(bsb?.hourly?.[0]?.at),/-03:00$/,'hourly timestamp must carry airport-local offset');
assert.equal(await readWeather('XXX'),null,'unknown airport must fail closed');

const baseSnapshot={
  schemaVersion:1,
  deviceId:'device',
  privacy:'private',
  profile:{base:'BSB',airline:'LATAM'},
  weather:null,
  weatherContexts:[],
  days:[{date:'2026-09-20',activities:[{
    id:'stay-1',journeyId:'j1',kind:'stay',date:'2026-09-20',
    startAt:'2026-09-20T18:00:00Z',endAt:'2026-09-21T10:00:00Z',
    presentation:null,flight:null,origin:'REC',destination:'REC',
    groundBeforeMinutes:null,confidence:'high',
  }]}],
};
const readTwoAirports=async airport=>({
  ...(await readWeather('BSB')),
  airport,
  city:airport==='REC'?'Recife':'Brasília',
});
const enriched=await enrichTvSnapshotWeather(baseSnapshot,readTwoAirports,{now:fixedNow});
assert.deepEqual(enriched.weatherContexts.map(item=>item.role),['base','stay']);
assert.equal(enriched.weatherContexts[0].airport,'BSB');
assert.equal(enriched.weatherContexts[1].airport,'REC');
assert.equal(enriched.weather.value.airport,'BSB');

const family={...baseSnapshot,privacy:'family'};
const redacted=await enrichTvSnapshotWeather(family,async()=>{throw new Error('must not call')},{now:fixedNow});
assert.equal(redacted,family,'family/visitor projection must not be enriched with private weather');

const newsNow=fixedNow;
const news=createNewsGateway({
  now:()=>newsNow,
  sources:[{
    id:'test',label:'Fonte Teste',kind:'syndicated',
    url:'https://example.com/feed',hosts:['example.com'],maxArticleAgeMs:3*86400000,
  }],
  fetchItems:async()=>[
    {title:'ANAC publica atualização para aeroportos',url:'https://example.com/anac',publishedAt:new Date(newsNow-3600000).toISOString()},
    {title:'Matéria antiga',url:'https://example.com/old',publishedAt:new Date(newsNow-5*86400000).toISOString()},
    {title:'Host inválido',url:'https://evil.example.net/item',publishedAt:new Date(newsNow-1800000).toISOString()},
  ],
});
const feed=await news({});
assert.equal(feed.items.length,1);
assert.equal(feed.items[0].source,'Fonte Teste');
assert.equal(feed.items[0].sourceKind,'syndicated');
assert.equal(feed.items[0].category,'regulation');
assert.equal(feed.items[0].freshness,'current');

const originalFetch=globalThis.fetch;
try{
  globalThis.fetch=async()=>new Response(
    '<?xml version="1.0"?><rss><channel><item><title><![CDATA[Notícia de aviação]]></title><link>https://example.com/item</link><pubDate>Sun, 20 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>',
    {status:200,headers:{'content-type':'application/rss+xml'}},
  );
  const rss=await fetchRssItems({url:'https://example.com/feed'});
  assert.equal(rss.length,1);
  assert.equal(rss[0].title,'Notícia de aviação');
  assert.equal(rss[0].url,'https://example.com/item');
} finally {
  globalThis.fetch=originalFetch;
}

await mkdir('dist/tv-weather-news-040',{recursive:true});
await build({
  entryPoints:['apps/tv-player/src/WeatherNews.tsx'],
  bundle:true,
  platform:'browser',
  format:'esm',
  loader:{'.css':'empty'},
  outfile:'dist/tv-weather-news-040/weather-news.js',
});

const main=await readFile('apps/tv-player/src/main.tsx','utf8');
const ui=await readFile('apps/tv-player/src/WeatherNews.tsx','utf8');
const css=await readFile('apps/tv-player/src/weather-news.css','utf8');
const prefs=await readFile('apps/tv-player/src/displayPreferences.tsx','utf8');
const http=await readFile('server/tv/http.mjs','utf8');

assert.match(main,/WeatherCenter/);
assert.match(main,/NewsCenter/);
assert.match(main,/WeatherMini/);
assert.match(main,/weatherInsight/);
assert.match(main,/navigationViews/);
assert.match(ui,/PRÓXIMO PERNOITE/);
assert.match(ui,/Sensação/);
assert.match(ui,/Rajadas/);
assert.match(ui,/Umidade/);
assert.match(ui,/CREWCHECK NEWS/);
assert.match(ui,/rankedNews/);
assert.match(ui,/Conteúdo editorial/);
assert.match(css,/prefers-reduced-motion/);
assert.match(css,/wx-rain/);
assert.match(css,/wx-cloud/);
assert.match(css,/wx-lightning/);
assert.doesNotMatch(css,/backdrop-filter|WebGL|video/i);
assert.match(prefs,/news:true/,'news must be enabled in the balanced default');
assert.match(prefs,/newsAirline:true/);
assert.match(prefs,/newsAirports:true/);
assert.match(http,/enrichTvSnapshotWeather/);
assert.match(http,/createNewsGateway/);
assert.match(http,/aeroflap/);
assert.match(http,/aeroin/,'a second Brazilian aviation feed must remain available as editorial redundancy');
assert.doesNotMatch(http,/items:\s*\[\]\s*,?\s*\}\),/,'production TV gateway must not be hard-wired to an empty feed');

console.log('PASS: CrewCheck TV 0.4 Weather & News normalizes rich weather, keeps private enrichment fail-closed, filters fresh editorial news, renders TV-safe animated weather and enables contextual news.');
