import type {RosterDay,CrewMember} from './pdfParser';
type RecordRow={date?:string;flightNumber:string;crew:CrewMember[]};
export type CrewAssociation='matched'|'ambiguous'|'date_missing'|'date_mismatch'|'unmatched';
const flight=(value:string)=>String(value||'').toUpperCase().replace(/\s/g,'');
function civil(value:string|undefined){
 const m=value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return false;
 const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1];
}
const signature=(row:RecordRow)=>JSON.stringify(row.crew.map(m=>[m.role,m.name.normalize('NFC').replace(/\s+/g,' ').trim()]));
/** Display association only. No crew composition, identity or payroll authority. */
export function associateCrewOccurrences(days:RosterDay[],records:RecordRow[]):RosterDay[]{
 const occurrences=new Map<string,number>();
 for(const day of days)for(const leg of day.legs||[]){const k=day.date+'|'+flight(leg.flightNumber);occurrences.set(k,(occurrences.get(k)||0)+1);}
 return days.map(day=>({...day,legs:(day.legs||[]).map(leg=>{
  const related=records.filter(r=>flight(r.flightNumber)===flight(leg.flightNumber));
  const exact=related.filter(r=>civil(r.date)&&r.date===day.date);
  const variants=new Map(exact.map(r=>[signature(r),r]));
  let state:CrewAssociation=variants.size?'matched':related.some(r=>!civil(r.date))?'date_missing':related.length?'date_mismatch':'unmatched';
  if(variants.size>1||(variants.size&&occurrences.get(day.date+'|'+flight(leg.flightNumber))!==1))state='ambiguous';
  const sourceDate=leg.aimsSourceDate?.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
  if(exact.length&&sourceDate&&sourceDate!==day.date)state='date_mismatch';
  const next={...leg};
  // Only replace a prior display association, never erase independent CCM evidence.
  if(next.crewAssociation)delete next.crew;
  if(state==='matched')next.crew=[...variants.values()][0].crew.map((m,index)=>({...m,order:index}));
  return {...next,crewAssociation:state};
 })}));
}
