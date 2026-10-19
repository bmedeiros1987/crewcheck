// Projection of existing one-shot server jobs. No storage, scheduler or transport.
const active = new Set(['pending', 'processing', 'dispatching', 'uncertain', 'partial']);
const states=new Set(['pending','processing','dispatching','uncertain','partial','sent','failed','expired','cancelled','held']);
const channels = new Set(['telegram', 'telegram-call', 'phone-call', 'telegram+phone-call', 'telegram+telegram-call', 'telegram-call+phone-call', 'telegram+telegram-call+phone-call']);
export function wakeDateFields(value) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return {day:'', time:''};
  const pad=n=>String(n).padStart(2,'0');
  return {day:`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`, time:`${pad(value.getHours())}:${pad(value.getMinutes())}`};
}
export function wakeCivilDate(day, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '') || !/^\d{2}:\d{2}$/.test(time || '')) return null;
  const [year,month,date]=day.split('-').map(Number), [hour,minute]=time.split(':').map(Number);
  if (year<2000 || year>2100 || hour>23 || minute>59) return null;
  const result=new Date(year,month-1,date,hour,minute,0,0), fields=wakeDateFields(result);
  if (fields.day!==day || fields.time!==time) return null; // Includes skipped DST civil times.
  // An ambiguous repeated civil minute needs an explicit operational instant instead.
  for (const offset of [-120,-90,-60,-30,30,60,90,120]) {
    const other=wakeDateFields(new Date(result.getTime()+offset*60000));
    if (other.day===day && other.time===time) return null;
  }
  return result;
}
function epoch(value) {
  if(typeof value!=='string')return NaN;
  const parts=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if(!parts)return NaN;
  const [year,month,day,hour,minute,second]=parts.slice(1).map(Number);
  if(year<2000||month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()||hour>23||minute>59||second>59)return NaN;
  return Number.isFinite(Date.parse(value))?Date.parse(value):NaN;
}
export function wakeJob(job) {
  if (!job || typeof job!=='object' || typeof job.jobKey!=='string' || !job.jobKey.startsWith('wakeup:') || !channels.has(job.channel) || !Number.isFinite(epoch(job.scheduledAt)) || !states.has(job.status)) return null;
  return {...job, at:epoch(job.scheduledAt)};
}
export function wakePlanConflict(jobs, prefix) {
  return Array.isArray(jobs) && typeof prefix==='string' && jobs.some(job=>typeof job?.jobKey==='string' && job.jobKey.startsWith(prefix) && active.has(job.status));
}
export function wakeNextConfirmed(jobs, state, now=Date.now()) {
  if (state==='loading') return {kind:'loading', next:null};
  if (state!=='ready' || !Array.isArray(jobs) || jobs.length>=100 || !Number.isFinite(now)) return {kind:'unavailable', next:null};
  const scoped=jobs.filter(job=>typeof job?.jobKey==='string' && job.jobKey.startsWith('wakeup:'));
  if (scoped.some(job=>!wakeJob(job))) return {kind:'unavailable', next:null};
  const records=scoped.map(wakeJob).sort((a,b)=>a.at-b.at);
  const next=records.find(job=>job.status==='pending' && job.at>now);
  if (next) return {kind:'scheduled', next};
  const sending=records.find(job=>['processing','dispatching'].includes(job.status));
  if (sending) return {kind:'sending', next:sending};
  const unknown=records.find(job=>['uncertain','partial'].includes(job.status));
  if (unknown) return {kind:'uncertain', next:unknown};
  const overdue=records.find(job=>job.status==='pending');
  if (overdue) return {kind:'overdue', next:overdue};
  return {kind:'none', next:null};
}
export function wakeReceiptConfirmed(request, receipt, jobs) {
  if (!receipt || receipt.ok!==true || receipt.jobKey!==request.jobKey || receipt.channel!==request.channel || epoch(receipt.scheduledAt)!==epoch(request.scheduledAt) || !Number.isFinite(epoch(request.scheduledAt)) || !Array.isArray(jobs)) return false;
  return jobs.some(value=>{
    const job=wakeJob(value);
    return job && job.jobKey===request.jobKey && job.channel===request.channel && job.at===epoch(request.scheduledAt) && job.status===receipt.status;
  });
}
