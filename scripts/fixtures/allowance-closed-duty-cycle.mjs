// Entirely fictional crew, flights, dates and routes; causal clock boundaries only.
export function closedDutyCycleFixture(){
 const stamp=n=>String(n).padStart(2,'0')+'/10/2026';let seq=9100;
 const duty=(n,apz,finish,legs)=>({date:stamp(n),type:'FLIGHT',pairingCode:'SYN-DUTY-'+n,base:'GRU',dutyReport:apz,dutyDebrief:finish,dutyReportSource:'published',dutyDebriefSource:'published',legs:legs.map(([origin,destination,departureTime,arrivalTime],i)=>({flightNumber:'LA'+(++seq),origin,destination,departureTime,arrivalTime,workType:'OP',...(i===0?{presentationTime:apz}:{})}))});
 const fixture={year:2026,month:10,crewId:'SYNTHETIC-ONLY',crewName:'SYNTHETIC',rank:'CC',base:'GRU',airline:'LA',days:[
 duty(13,'13:55','00:52',[['GRU','VIX','15:14','17:21'],['VIX','NAT','18:06','19:52'],['NAT','GIG','20:44','00:22']]),
 duty(14,'16:05','01:37',[['GIG','EZE','18:34','21:35'],['EZE','GIG','22:30','00:52']]),
 duty(15,'15:10','21:43',[['GIG','SSA','16:25','18:21'],['SSA','GIG','19:15','21:13']]),
 duty(16,'11:35','14:20',[['SDU','GRU','12:05','13:50']]),
 ...[17,18].map(n=>({date:stamp(n),type:'DR',pairingCode:'DR',base:'GRU',dutyReport:'02:20',dutyDebrief:'02:19',dutyReportSource:'published',dutyDebriefSource:'published',legs:[]})),
 duty(19,'08:05','19:15',[['GRU','CWB','09:07','10:58'],['CWB','GIG','11:43','13:47'],['GIG','POA','15:40','18:45']]),
 duty(20,'12:20','23:50',[['POA','SDU','12:50','16:15'],['SDU','GRU','18:15','20:05'],['GRU','REC','21:45','23:20']])
 ]};

 return fixture;
}
