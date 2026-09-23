export type TvDisplayPreferences={
  homeTraffic:boolean; homeGate:boolean; homeWeather:boolean; homeStay:boolean;
  showNews:boolean; showFinance:boolean; showCrew:boolean; showWeatherDetail:boolean;
  visitorMode:boolean;
};
export const DEFAULT_TV_DISPLAY:TvDisplayPreferences={
  homeTraffic:true,homeGate:true,homeWeather:true,homeStay:true,
  showNews:true,showFinance:false,showCrew:false,showWeatherDetail:true,visitorMode:false,
};
const KEY='crewcheck-tv-display-v1';
export function readTvDisplay(storage:Pick<Storage,'getItem'>):TvDisplayPreferences{
  try{return {...DEFAULT_TV_DISPLAY,...JSON.parse(storage.getItem(KEY)||'{}')};}catch{return {...DEFAULT_TV_DISPLAY};}
}
export function writeTvDisplay(storage:Pick<Storage,'setItem'>,value:TvDisplayPreferences){storage.setItem(KEY,JSON.stringify(value));}
