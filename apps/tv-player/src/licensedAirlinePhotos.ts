export type PackagedAirlinePhoto={url:string;credit:string;license:string;source:string};

function key(value:unknown){
  const text=String(value||'').trim().toUpperCase();
  if (/LATAM|\bLA\b|\bJJ\b|TAM|LAN/.test(text)) return 'LATAM';
  if (/\bGOL\b|\bG3\b/.test(text)) return 'GOL';
  if (/\bAZUL\b|\bAD\b/.test(text)) return 'AZUL';
  return '';
}

const PHOTOS:Record<string,PackagedAirlinePhoto>={
  LATAM:{
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/LATAM_AIRLINES_Airbus_A_320_NEO_F-WWBN_msn_7864_LFBO_-_TLS_nov_2017.jpg',
    credit:'gimbellet · Wikimedia Commons',
    license:'CC BY 2.0',
    source:'https://commons.wikimedia.org/wiki/File:LATAM_AIRLINES_Airbus_A_320_NEO_F-WWBN_msn_7864_LFBO_-_TLS_nov_2017.jpg',
  },
  GOL:{
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Golrightside737.jpg',
    credit:'Wikimedia Commons',
    license:'Public domain',
    source:'https://commons.wikimedia.org/wiki/File:Golrightside737.jpg',
  },
  AZUL:{
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Airbus_A320-251N_Azul_Linhas_A%C3%A9reas_Brasileiras.jpg',
    credit:'Alexandro Dias · Wikimedia Commons',
    license:'CC BY-SA 4.0',
    source:'https://commons.wikimedia.org/wiki/File:Airbus_A320-251N_Azul_Linhas_A%C3%A9reas_Brasileiras.jpg',
  },
};

export function packagedAirlinePhoto(airline:unknown):PackagedAirlinePhoto|null{
  return PHOTOS[key(airline)]||null;
}
