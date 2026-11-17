import {CalendarDays} from 'lucide-react';
const valid=(value:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export function rosterPeriodLabel(value:string){
 if(!valid(value))return 'Período indisponível';
 const [year,month]=value.split('-').map(Number);
 const text=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month-1,1)));
 return text.charAt(0).toUpperCase()+text.slice(1);
}
export default function RosterPeriodPicker({periods,value,onChange}:{periods:string[];value:string;onChange:(period:string)=>void}){
 const available=Array.from(new Set(periods.filter(valid))).sort();
 const years=Array.from(new Set(available.map(period=>period.slice(0,4))));
 const year=value.slice(0,4),month=value.slice(5,7);
 const chooseYear=(nextYear:string)=>{
  const sameMonth=`${nextYear}-${month}`;
  const next=available.includes(sameMonth)?sameMonth:available.find(period=>period.startsWith(nextYear+'-'));
  if(next)onChange(next);
 };
 return <><label><CalendarDays aria-hidden="true"/><span>Mês</span><select aria-label="Mês da escala" value={month} disabled={!available.length} onChange={event=>{const next=`${year}-${event.target.value}`;if(available.includes(next))onChange(next);}}>{available.filter(period=>period.startsWith(year+'-')).map(period=><option key={period} value={period.slice(5,7)}>{rosterPeriodLabel(period).split(' de ')[0]}</option>)}</select></label>
 <label><span>Ano</span><select aria-label="Ano da escala" value={year} disabled={!years.length} onChange={event=>chooseYear(event.target.value)}>{years.map(item=><option key={item} value={item}>{item}</option>)}</select></label>
 <span className="cc-roster-period-label" role="status">{rosterPeriodLabel(value)}</span></>;
}
