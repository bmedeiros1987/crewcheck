import type {RosterDay,CrewMember} from './pdfParser';
type RecordRow={date?:string;flightNumber:string;crew:CrewMember[];sourceAmbiguous?:boolean};
type TableRow={page:number;key:number;text:string;items:{str:string;x:number;y:number;width?:number}[]};
type TableRecord={date?:string;flightNumber:string;crewText:string;sourceAmbiguous?:boolean};
export type CrewAssociation='matched'|'ambiguous'|'date_missing'|'date_mismatch'|'unmatched';
const flight=(value:string)=>String(value||'').toUpperCase().replace(/\s/g,'');
function civil(value:string|undefined){
 const m=value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return false;
 const d=new Date(Date.UTC(+m[3],+m[2]-1,+m[1]));return d.getUTCFullYear()===+m[3]&&d.getUTCMonth()===+m[2]-1&&d.getUTCDate()===+m[1];
}
const signature=(row:RecordRow)=>JSON.stringify(row.crew.map(m=>[m.role,m.name.normalize('NFC').replace(/\s+/g,' ').trim()]));
/** Narrow horizontal CrewTopia table reader. It never assigns by nearest flight.
 * Crew paragraphs must have visible gaps and enclose exactly one date/flight
 * anchor in a separate left column. Uncertain geometry withholds that page.
 * null leaves the existing date-first text contract unchanged.
 */
export function leadingCrewVisualRecords(rows:TableRow[]|undefined,year:number):{records:TableRecord[];handledPages:number[]}|null{
 if(!rows?.length)return null;
 const heading=(s:string)=>/^(?:Tripula(?:ç|c)[oõ]es|Tripula(?:ç|c)[aã]o|Crew\s+(?:List|Complement|Members))$/i.test(s.trim());
 const role=(s:string)=>/^(?:CP|FO|CCM|CC|CM)(?:\s|$)/.test(s.trim());
 const result:TableRecord[]=[];const handledPages:number[]=[];let used=false;
 for(const page of new Set(rows.map(r=>r.page))){
  const ordered=rows.filter(r=>r.page===page).sort((a,b)=>b.key-a.key);
  const start=ordered.findIndex(r=>heading(r.text));if(start<0)continue;
  const body:TableRow[]=[];
  for(const r of ordered.slice(start+1)){if(heading(r.text)||/^(?:Confira|Timezone|Time zone|Fuso|Página|Page\s)/i.test(r.text.trim()))break;body.push(r);}
  const roleItems=body.flatMap(r=>r.items).filter(i=>role(i.str)&&Number.isFinite(i.x));if(!roleItems.length)continue;
  const crewX=Math.min(...roleItems.map(i=>i.x));
  const anchors:{y:number;date?:string;flightNumber:string;invalid:boolean}[]=[];
  const lines:{y:number;text:string}[]=[];
  let badGeometry=false;
  for(const r of body){
   if(!Number.isFinite(r.key)||r.items.some(i=>!Number.isFinite(i.x)||!Number.isFinite(i.y)||Math.abs(i.y-r.key)>4))badGeometry=true;
   const left=r.items.filter(i=>i.x<crewX-4).sort((a,b)=>a.x-b.x);
   const label=left.map(i=>i.str.trim()).join(' ').replace(/\s+/g,' ').trim();
   const flights=[...label.matchAll(/\bLA\s*(\d{3,4})\b/g)];
   if(flights.length){
    const m=label.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\s+LA\s*(\d{3,4})$/);
    let date:string|undefined;
    if(m){let y=m[3]?Number(m[3]):year;if(y<100)y+=2000;date=`${String(+m[1]).padStart(2,'0')}/${String(+m[2]).padStart(2,'0')}/${y}`;}
    const overlap=left.some(i=>i.x+(i.width||0)>crewX-4);
    for(const f of flights)anchors.push({y:r.key,date,flightNumber:'LA'+f[1],invalid:!m||flights.length!==1||overlap});
   }
   const text=r.items.filter(i=>i.x>=crewX-4).sort((a,b)=>a.x-b.x).map(i=>i.str.trim()).join(' ').replace(/\s+/g,' ').trim();
   if(text)lines.push({y:r.key,text});
  }
  if(!anchors.length||!lines.length)continue;
  const leading=lines[0].y>Math.max(...anchors.map(a=>a.y))+4;
  if(!leading&&!anchors.some(a=>a.invalid))continue;
  used=true;handledPages.push(page);
  const gaps=lines.slice(1).map((line,i)=>lines[i].y-line.y).filter(g=>g>4);
  const spacing=gaps.length?Math.min(...gaps):0;
  const groups:(typeof lines)[]=[];
  // Centered table cells may have paragraph gaps just below two line heights.
  // Require a visible separation from normal line spacing; exact anchor
  // enclosure/uniqueness below still decides whether any names can be used.
  const paragraphGap=spacing+Math.max(4,spacing/2);
  for(const line of lines){const last=groups[groups.length-1];if(!last||last[last.length-1].y-line.y>paragraphGap)groups.push([line]);else last.push(line);}
  const members=groups.map(g=>anchors.filter(a=>a.y<=g[0].y+4&&a.y>=g[g.length-1].y-4));
  const ambiguous=badGeometry||!spacing||body.length>500||anchors.some(a=>a.invalid)||members.some(a=>a.length!==1)||anchors.some(a=>members.filter(group=>group.includes(a)).length!==1)||groups.some(g=>!role(g[0].text));
  if(ambiguous){result.push(...anchors.map(a=>({date:a.date,flightNumber:a.flightNumber,crewText:'',sourceAmbiguous:true})));continue;}
  groups.forEach((g,i)=>result.push({date:members[i][0].date,flightNumber:members[i][0].flightNumber,crewText:g.map(l=>l.text).join(' ')}));
 }
 return used?{records:result,handledPages}:null;
}
/** Display association only. No crew composition, identity or payroll authority. */
export function associateCrewOccurrences(days:RosterDay[],records:RecordRow[]):RosterDay[]{
 const occurrences=new Map<string,number>();
 for(const day of days)for(const leg of day.legs||[]){const k=day.date+'|'+flight(leg.flightNumber);occurrences.set(k,(occurrences.get(k)||0)+1);}
 return days.map(day=>({...day,legs:(day.legs||[]).map(leg=>{
  const related=records.filter(r=>flight(r.flightNumber)===flight(leg.flightNumber));
  const exact=related.filter(r=>civil(r.date)&&r.date===day.date);
  const variants=new Map(exact.map(r=>[signature(r),r]));
  let state:CrewAssociation=variants.size?'matched':related.some(r=>!civil(r.date))?'date_missing':related.length?'date_mismatch':'unmatched';
  if(related.some(r=>r.sourceAmbiguous&&(!civil(r.date)||r.date===day.date)))state='ambiguous';
  if(variants.size>1||(variants.size&&occurrences.get(day.date+'|'+flight(leg.flightNumber))!==1))state='ambiguous';
  const sourceDate=leg.aimsSourceDate?.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1');
  if(exact.length&&sourceDate&&sourceDate!==day.date)state='date_mismatch';
  const next={...leg};
  // Only replace a prior display association, never erase independent CCM evidence.
  if(next.crewAssociation||state==='ambiguous')delete next.crew;
  if(state==='matched')next.crew=[...variants.values()][0].crew.map((m,index)=>({...m,order:index}));
  return {...next,crewAssociation:state};
 })}));
}
