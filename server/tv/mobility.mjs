const AIRPORTS = Object.freeze({
  BSB:{lat:-15.8711,lon:-47.9186,label:'Aeroporto de Brasília'},
  GRU:{lat:-23.4356,lon:-46.4731,label:'Aeroporto de Guarulhos'},
  CGH:{lat:-23.6261,lon:-46.6564,label:'Aeroporto de Congonhas'},
  VCP:{lat:-23.0074,lon:-47.1345,label:'Aeroporto de Viracopos'},
  SDU:{lat:-22.9105,lon:-43.1631,label:'Aeroporto Santos Dumont'},
  GIG:{lat:-22.8099,lon:-43.2506,label:'Aeroporto do Galeão'},
  CNF:{lat:-19.6244,lon:-43.9719,label:'Aeroporto de Confins'},
  CWB:{lat:-25.5317,lon:-49.1761,label:'Aeroporto de Curitiba'},
  POA:{lat:-29.9944,lon:-51.1714,label:'Aeroporto de Porto Alegre'},
  FLN:{lat:-27.6705,lon:-48.5525,label:'Aeroporto de Florianópolis'},
  SSA:{lat:-12.9086,lon:-38.3225,label:'Aeroporto de Salvador'},
  REC:{lat:-8.1265,lon:-34.9236,label:'Aeroporto do Recife'},
  FOR:{lat:-3.7763,lon:-38.5326,label:'Aeroporto de Fortaleza'},
  BEL:{lat:-1.3793,lon:-48.4763,label:'Aeroporto de Belém'},
  MAO:{lat:-3.0386,lon:-60.0497,label:'Aeroporto de Manaus'},
  SLZ:{lat:-2.5854,lon:-44.2341,label:'Aeroporto de São Luís'},
  NAT:{lat:-5.7681,lon:-35.3761,label:'Aeroporto de Natal'},
  MCZ:{lat:-9.5108,lon:-35.7917,label:'Aeroporto de Maceió'},
  AJU:{lat:-10.9840,lon:-37.0703,label:'Aeroporto de Aracaju'},
  PMW:{lat:-10.2915,lon:-48.3569,label:'Aeroporto de Palmas'},
  THE:{lat:-5.0599,lon:-42.8235,label:'Aeroporto de Teresina'},
  VIX:{lat:-20.2581,lon:-40.2864,label:'Aeroporto de Vitória'},
  GYN:{lat:-16.6320,lon:-49.2207,label:'Aeroporto de Goiânia'},
  CGB:{lat:-15.6529,lon:-56.1167,label:'Aeroporto de Cuiabá'},
  CGR:{lat:-20.4687,lon:-54.6725,label:'Aeroporto de Campo Grande'},
  RAO:{lat:-21.1364,lon:-47.7767,label:'Aeroporto de Ribeirão Preto'},
  CXJ:{lat:-29.1971,lon:-51.1875,label:'Aeroporto de Caxias do Sul'},
  IGU:{lat:-25.6003,lon:-54.4852,label:'Aeroporto de Foz do Iguaçu'},
  NVT:{lat:-26.8799,lon:-48.6514,label:'Aeroporto de Navegantes'},
  JPA:{lat:-7.1458,lon:-34.9486,label:'Aeroporto de João Pessoa'},
});

export function tvAirportMobilityPoint(code='') {
  const key=String(code||'').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(AIRPORTS,key)?{code:key,...AIRPORTS[key]}:null;
}

export function buildUberPhoneHandoff({clientId,airport,audience='owner',allowed=false}={}) {
  if (!allowed || audience!=='owner') return null;
  const id=String(clientId||'').trim();
  const point=tvAirportMobilityPoint(airport);
  if (!id || !point) return null;
  const url=new URL('https://m.uber.com/looking');
  url.searchParams.set('client_id',id);
  url.searchParams.set('pickup','my_location');
  url.searchParams.set('drop[0]',JSON.stringify({
    latitude:point.lat,
    longitude:point.lon,
    addressLine1:point.label,
    addressLine2:point.code,
  }));
  return {
    provider:'uber',
    deepLink:url.toString(),
    pickupLabel:'Minha localização no celular',
    destinationLabel:`${point.label} (${point.code})`,
  };
}
