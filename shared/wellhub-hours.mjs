import { wellhubSnapshotFreshness } from './wellhub-access.mjs';
const DAYS = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const clean = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function daySet(text) {
  const days = new Set();
  for (const item of clean(text).split(/[,/&]/)) {
    const range = item.trim().split(/\s*-\s*/);
    if (range.length > 2 || range.some(d => !(d in DAYS))) return null;
    let day = DAYS[range[0]], end = DAYS[range[1] || range[0]];
    for (let i = 0; i < 7; i++, day = (day + 1) % 7) { days.add(day); if (day === end) break; }
  }
  return days;
}
function minutes(text) {
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [h, m] = text.split(':').map(Number);
  return h < 24 && m < 60 ? h * 60 + m : null;
}
function schedule(partner) {
  if (!Array.isArray(partner.openingHours) || !partner.openingHours.length) return null;
  const result = [];
  for (const line of partner.openingHours) {
    const match = String(line).match(/^([^\d]+?)\s+(\d.*)$/);
    const days = match && daySet(match[1]);
    if (!days?.size) return null;
    for (const interval of match[2].split(/\s*[,;]\s*/)) {
      const time = interval.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
      const start = time && minutes(time[1]), end = time && minutes(time[2]);
      if (start === null || end === null || !time || start === end) return null;
      result.push({ days, start, end });
    }
  }
  return result;
}
function nationalHoliday(iso) {
  const md = iso.slice(5);
  if (['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'].includes(md)) return true;
  // Good Friday; Carnival/Corpus Christi can have local exceptions as well.
  const y = Number(iso.slice(0, 4)), a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=(h+l-7*m+114)%31+1;
  const easter = Date.UTC(y,month-1,day);
  return [-48,-47,-2,0,60].some(offset => new Date(easter+offset*86400000).toISOString().slice(0,10) === iso);
}
export function wellhubOpeningStatus(partner, now = new Date()) {
  const unknown = reason => ({ status: 'unknown', label: '🟡 Horário cadastrado incerto', reason, timeZone: partner?.timeZone || '' });
  if (wellhubSnapshotFreshness(partner || {}, now).snapshotStatus !== 'valid') return unknown('cadastro desatualizado ou data inválida');
  if (!partner?.timeZone || !String(partner.timeZone).includes('/')) return unknown('fuso da unidade não confirmado');
  let parts;
  try { parts = new Intl.DateTimeFormat('en-CA', { timeZone: partner.timeZone, year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).formatToParts(now); } catch { return unknown('fuso ou instante inválido'); }
  const get = type => parts.find(p => p.type === type)?.value;
  const iso = `${get('year')}-${get('month')}-${get('day')}`;
  if (partner.holidayHoursUncertain || nationalHoliday(iso)) return unknown('horário de feriado ou exceção não confirmado');
  const intervals = schedule(partner);
  if (!intervals) return unknown('horário ausente ou malformado');
  if (partner.is24Hours) {
    const coveredDays = new Set(intervals.flatMap(({ days }) => [...days]));
    if (coveredDays.size !== 7 || intervals.some(({start,end}) => start !== 0 || end !== 1439)) return unknown('horário 24h conflitante');
  }
  const weekday = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[get('weekday')];
  const current = Number(get('hour'))*60+Number(get('minute'));
  // A carried interval belongs to the previous local calendar date. Its
  // holiday uncertainty survives midnight; do not reopen it by changing day.
  const previousDate = new Date(`${iso}T12:00:00Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  if (nationalHoliday(previousDate.toISOString().slice(0,10)) && intervals.some(({days,start,end}) => end < start && days.has((weekday+6)%7) && current < end)) return unknown('intervalo herdado de feriado não confirmado');
  if (!partner.is24Hours && !intervals.some(({days,start,end}) => days.has(weekday) || end < start && days.has((weekday+6)%7) && current < end)) return unknown('dia sem horário cadastrado');
  const open = partner.is24Hours === true || intervals.some(({days,start,end}) => end > start
    ? days.has(weekday) && current >= start && current < end
    : days.has(weekday) && current >= start || days.has((weekday+6)%7) && current < end);
  return { status: open ? 'open' : 'closed', label: open ? '🟢 Aberta pelo horário cadastrado' : '🔴 Fechada pelo horário cadastrado', reason: 'não é confirmação em tempo real', timeZone: partner.timeZone };
}
export function prioritizeWellhubOpening(partners, now = new Date()) {
  const rank = { open: 0, unknown: 1, closed: 2 };
  return partners.map((partner, index) => ({ partner: { ...partner, openingStatus: wellhubOpeningStatus(partner, now) }, index }))
    .sort((a,b) => rank[a.partner.openingStatus.status]-rank[b.partner.openingStatus.status] || a.index-b.index).map(x => x.partner);
}
