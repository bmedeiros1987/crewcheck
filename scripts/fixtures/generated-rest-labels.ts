import { completeContinuityDays } from '../../client/src/lib/rosterContinuity';
import { classifyScheduleActivity } from '../../client/src/lib/scheduleActivityClassification';
export function generatedRestLabelFixtures() {
  const records: any[] = [];
  for (const location of ['BSB', 'GRU']) for (const next of [11,12,13]) {
    const days = [10,next].map(n => ({date:`${n}/10/2032`,dayNumber:n,month:10,year:2032,type:'VOO',base:'BSB',pairingCode:`QA${n}`,dutyReport:'08:00',dutyDebrief:'16:00',legs:[{flightNumber:`QA${n}`,origin:location,destination:location,departureTime:'09:00',arrivalTime:'15:00'}]}));
    const roster: any = {base:'BSB',year:2032,month:10,days};
    const source = JSON.stringify(roster);
    const completed = completeContinuityDays(days as any,roster);
    if (JSON.stringify(roster)!==source) throw new Error('Source mutation');
    completed.filter((d:any)=>d.continuityInferred).forEach((day:any,index:number)=> {
      const event:any = {id:`${location}-${next}-${index}`,kind:location==='BSB'?'duty':'stay',title:day.type,day,origin:location,destination:location,departure:day.dutyReport,arrival:day.dutyDebrief,canonical:{date:day.date,publishedDay:day,kind:location==='BSB'?'rest':'stay'}};
      records.push({event,expected:location==='BSB'?'Descanso':'Pernoite',category:classifyScheduleActivity(event),pairing:day.pairingCode});
    });
  }
  return records;
}
