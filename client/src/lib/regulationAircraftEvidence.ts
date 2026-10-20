// Closed, per-leg display catalog. No airline/route/month/profile fallback.
// Model/designator: FAA Aircraft Information Appendix A; family: manufacturers.
export const REGULATION_AIRCRAFT_CATALOG_VERSION = 'aircraft-display-2026-10-20.1';
const faa = 'https://www.faa.gov/air_traffic/publications/atpubs/atc/AppdxA.html';
const airbus = 'https://www.airbus.com/en/products-services/commercial-aircraft/passenger-aircraft/a320-family';
const boeing = 'https://www.boeing.com/commercial/787/by-design';
const catalog: Record<string,{model:string;group:'NB'|'WB';familySource:string}> = {
 A318:{model:'Airbus A318',group:'NB',familySource:airbus},
 A319:{model:'Airbus A319',group:'NB',familySource:airbus},
 A320:{model:'Airbus A320',group:'NB',familySource:airbus},
 A321:{model:'Airbus A321',group:'NB',familySource:airbus},
 B788:{model:'Boeing 787-8',group:'WB',familySource:boeing},
 B789:{model:'Boeing 787-9',group:'WB',familySource:boeing},
};
export function regulationAircraftEvidence(legs:ReadonlyArray<{aircraftType?:unknown}>){
 const rows=legs.map<{code:string;model:string|null;group:'NB'|'WB'|'unknown';source:{designator:string;family:string}|null}>(leg=>{const code=typeof leg.aircraftType==='string'?leg.aircraftType.trim().toUpperCase():'';const known=Object.hasOwn(catalog,code)?catalog[code]:undefined;return {code,model:known?.model||null,group:known?.group||'unknown',source:known?{designator:faa,family:known.familySource}:null};});
 const groups=new Set(rows.map(row=>row.group));
 const group=!rows.length||groups.has('unknown')?'unknown':groups.size>1?'mixed':rows[0].group;
 return {version:REGULATION_AIRCRAFT_CATALOG_VERSION,group,rows};
}
