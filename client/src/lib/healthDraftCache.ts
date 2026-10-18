import type { AuthUser } from './authClient';
export const LEGACY_HEALTH_FORM_KEY = 'crewcheck:guardian:form:v1';
const PREFIX = 'crewcheck:guardian:form:v2:';
export type HealthDraftSession = { owner: string; user: AuthUser; isCurrent(): boolean };
export type HealthDraft = {
 displayName:string; crewId:string; bloodType:string; allergies:string; medications:string;
 conditions:string; criticalNotes:string; contactName:string; contactRelationship:string; contactPhone:string; validHours:number;
};
const bounds = {displayName:120,crewId:40,bloodType:8,allergies:600,medications:600,conditions:600,criticalNotes:1000,contactName:120,contactRelationship:80,contactPhone:40} as const;
export function emptyHealthDraft(user?:AuthUser):HealthDraft {
 return {displayName:String(user?.name||'Tripulante').slice(0,120),crewId:String(user?.id||'').slice(0,40),bloodType:'',allergies:'',medications:'',conditions:'',criticalNotes:'',contactName:'',contactRelationship:'',contactPhone:'',validHours:72};
}
function sanitize(value:unknown,fallback:HealthDraft):HealthDraft {
 const clean={...fallback},input=value as Record<string,unknown>;
 for(const key of Object.keys(bounds) as (keyof typeof bounds)[]){if(typeof input?.[key]==='string')clean[key]=(input[key] as string).slice(0,bounds[key]);}
 if([24,72,168,720].includes(Number(input?.validHours)))clean.validHours=Number(input.validHours);
 return clean;
}
export function healthDraftKey(owner:string){return PREFIX+encodeURIComponent(owner);}
export function readHealthDraft(session:HealthDraftSession):HealthDraft {
 const fallback=emptyHealthDraft(session.user);
 if(!session.owner||!session.isCurrent())return fallback;
 // The unattributed v1 entry is deliberately never read, migrated or deleted.
 try{const entry=JSON.parse(localStorage.getItem(healthDraftKey(session.owner))||'null');if(entry?.schema===2&&entry.owner===session.owner&&session.isCurrent())return sanitize(entry.form,fallback);}catch{}
 return fallback;
}
export function persistHealthDraft(session:HealthDraftSession,form:HealthDraft):boolean {
 if(!session.owner||!session.isCurrent())return false;
 try{const value={schema:2,owner:session.owner,form:sanitize(form,emptyHealthDraft(session.user))};if(!session.isCurrent())return false;localStorage.setItem(healthDraftKey(session.owner),JSON.stringify(value));return true;}catch{return false;}
}
