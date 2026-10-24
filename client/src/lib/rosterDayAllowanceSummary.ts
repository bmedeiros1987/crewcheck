import { summarizeForecastRows, summarizeNativeForecastRows } from './financialForecastPeriods';

type Row = { iso:string; currency:string; value:number; convertedBRL:number|null };
type Pending = { iso:string; airport:string };
const validDay=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;

/** A different day's missing evidence cannot invalidate this day's known rows.
 * Unknown dates and callers lacking the pending inventory remain conservative. */
export function rosterDayAllowanceSummary(day:string,rows:readonly Row[],pending:readonly Pending[]|undefined,monthComplete?:boolean){
 const selected=rows.filter(row=>row.iso===day);
 const dayPending=(pending||[]).filter(item=>item.iso===day||!validDay(item.iso));
 const native=summarizeNativeForecastRows(selected,dayPending);
 const converted=summarizeForecastRows(selected,dayPending);
 const unknownScope=!validDay(day)||(pending===undefined&&monthComplete===false);
 return {...converted,convertedTotalBRL:!unknownScope&&native.complete?converted.convertedTotalBRL:null,complete:!unknownScope&&native.complete&&converted.convertedComplete};
}
