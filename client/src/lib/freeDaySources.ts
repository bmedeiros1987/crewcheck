import type { CrewRoster } from './pdfParser';
export type VoluntaryReceipt = {identityDigest:string;period:string;documentHash:string;starts:{date:string;clock:string|null;offset:number|null;literal:boolean}[]};
const digest = async (data:BufferSource) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
export const metadataDigest = (value:unknown) => digest(new TextEncoder().encode(JSON.stringify(value)));
export async function minimalVoluntaryReceipt(roster:CrewRoster,bytes:ArrayBuffer):Promise<VoluntaryReceipt> {
  if (!roster.crewId || !roster.base || !Number.isInteger(roster.year) || !Number.isInteger(roster.month) || roster.month<1 || roster.month>12) throw Error('Identidade e período pendentes no PDF.');
  const period=`${roster.year}-${String(roster.month).padStart(2,'0')}`;
  const starts=roster.days.filter(d=>/^(DO|DOF|DOP|DOPR|DR|OFF)$/.test(String(d.pairingCode || d.type).toUpperCase()) && !d.legs?.length).map(d=>{
    const date=d.date.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/,'$3-$2-$1');
    const e=d.freeDayStartEvidence;
    const tokens=String(e?.tokenExcerpt || '').trim().split(/\s+/);
    const clock=/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(tokens[1] || '')?tokens[1].padStart(5,'0'):null;
    const literal=Boolean(e && e.date.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/,'$3-$2-$1')===date && tokens[0]===e.code && tokens[0]===String(d.pairingCode || d.type).toUpperCase() && clock && clock===e.clock && e.clockSource==='published' && e.timeZoneSource==='published' && Number.isInteger(e.utcOffsetMinutes) && Math.abs(e.utcOffsetMinutes!)<=840 && e.origin==='AIMS published rest tokens');
    return {date,clock:literal?clock:null,offset:literal?e!.utcOffsetMinutes:null,literal};
  });
  return {identityDigest:await metadataDigest([String(roster.crewId),String(roster.base)]),period,documentHash:await digest(bytes),starts};
}
