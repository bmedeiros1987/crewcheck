// Scope: banking attendance, Sao Paulo capital, 2026 only. No generic city/base
// calendar and no inference from government optional office closures.
export const SP_BANK_CALENDAR_SOURCE='https://portal.febraban.org.br/noticia/4413/pt-br/';
export const SP_BANK_LOCAL_SOURCE='https://feriadosbancarios.febraban.org.br/';
const holidays=new Set(['2026-01-01','2026-01-25','2026-02-16','2026-02-17','2026-04-03','2026-04-21','2026-05-01','2026-06-04','2026-07-09','2026-09-07','2026-10-12','2026-11-02','2026-11-15','2026-11-20','2026-12-25']);
export function spBankDay(iso){
 if(iso==='2025-12-31'||iso==='2026-12-31')return {state:'closed_nonholiday',source:SP_BANK_CALENDAR_SOURCE};
 if(typeof iso!=='string'||!/^2026-\d{2}-\d{2}$/.test(iso)||!Number.isFinite(Date.parse(iso+'T12:00:00Z'))||new Date(iso+'T12:00:00Z').toISOString().slice(0,10)!==iso)return {state:'unknown',source:SP_BANK_CALENDAR_SOURCE};
 if(holidays.has(iso))return {state:'holiday',source:iso==='2026-07-09'||iso==='2026-01-25'?SP_BANK_LOCAL_SOURCE:SP_BANK_CALENDAR_SOURCE};
 if([0,6].includes(new Date(iso+'T12:00:00Z').getUTCDay()))return {state:'weekend',source:SP_BANK_CALENDAR_SOURCE};
 if(iso==='2026-02-18')return {state:'partial',source:SP_BANK_CALENDAR_SOURCE};
 return {state:'open',source:SP_BANK_CALENDAR_SOURCE};
}
