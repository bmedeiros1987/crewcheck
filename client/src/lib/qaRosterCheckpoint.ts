import type {CrewRoster} from './pdfParser';

// Test-build checkpoint only. It is not an account backup, cloud rollback,
// credential or a source of authenticated/operational authority.
export type CheckpointEntry={origin:'displayed'|'local-history';id?:string;createdAt?:string;source:string;roster:CrewRoster};
export type CheckpointBody={version:1;owner:string;periods:string[];createdAt:string;build:string;entries:CheckpointEntry[]};
export type RosterCheckpoint={body:CheckpointBody;sha256:string};
type StorageReader=Pick<Storage,'getItem'>;
type Fence={owner:string;token:string|null;isCurrent():boolean};
const maximum=8*1024*1024;
const period=(r:Pick<CrewRoster,'year'|'month'>)=>Number.isInteger(r.year)&&r.year>=2000&&r.year<=2200&&Number.isInteger(r.month)&&r.month>=1&&r.month<=12?`${r.year}-${String(r.month).padStart(2,'0')}`:'';
function account(value:string){if(!/^[a-z0-9_-]{1,80}$/.test(value))throw Error('Identidade local não verificável para esta cópia.');return value;}
function cleanJson(value:unknown):void{
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)){value.forEach(cleanJson);return;}
 if(value&&typeof value==='object'&&Object.getPrototypeOf(value)===Object.prototype){for(const [key,item]of Object.entries(value)){if(/^(?:__proto__|constructor|prototype|password|authorization|cookie|cookies|token|(?:access|refresh|id|bearer)[_-]*token|api[_-]*key|client[_-]*secret|jwt|secret)$/i.test(key))throw Error('A cópia contém um campo não permitido.');if(item!==undefined)cleanJson(item);}return;}
 throw Error('A escala contém dados não serializáveis.');
}
function clone<T>(value:T):T{cleanJson(value);return JSON.parse(JSON.stringify(value));}
function validateBody(body:CheckpointBody,owner:string){
 if(body?.version!==1||body.owner!==account(owner)||!Array.isArray(body.periods)||!body.periods.length||body.periods.length>24||new Set(body.periods).size!==body.periods.length||!Array.isArray(body.entries)||!body.entries.length||body.entries.length>200)throw Error('Cópia incompatível com a conta ou competências selecionadas.');
 cleanJson(body);
 for(const entry of body.entries){if(!['displayed','local-history'].includes(entry.origin)||!entry.roster?.days?.length||!body.periods.includes(period(entry.roster))||typeof entry.source!=='string')throw Error('Registro de escala inválido na cópia.');}
 for(const p of body.periods)if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(p)||!body.entries.some(e=>period(e.roster)===p))throw Error('Uma competência selecionada não possui cópia local.');
}
async function digest(body:CheckpointBody){const bytes=new TextEncoder().encode(JSON.stringify(body));if(bytes.length>maximum)throw Error('Cópia maior que o limite local de8MB.');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function captureQaRosterCheckpoint(input:{session:Fence;storage:StorageReader;periods:string[];displayed:{roster:CrewRoster;source:string};build:string}):Promise<RosterCheckpoint>{
 const {session}=input,owner=account(session.owner);if(!session.token||!session.isCurrent())throw Error('A sessão mudou. Abra novamente esta tela.');
 const periods=[...new Set(input.periods)].sort();const entries:CheckpointEntry[]=[];
 if(periods.includes(period(input.displayed.roster)))entries.push({origin:'displayed',source:input.displayed.source,roster:clone(input.displayed.roster)});
 // Exact current-owner key only; no enumeration, legacy/anonymous fallback,
 // token/profile export, API call or write to application storage.
 const raw=input.storage.getItem('crewcheck_local_history_v11_'+owner);
 if(raw){const history:unknown=JSON.parse(raw);if(!Array.isArray(history))throw Error('Histórico local inválido.');for(const item of history){const roster=item?.roster;if(!roster||!periods.includes(period(roster)))continue;entries.push({origin:'local-history',...(typeof item.id==='string'?{id:item.id}:{}),...(typeof item.createdAt==='string'?{createdAt:item.createdAt}:{}),source:String(item.sourceFileName||'Histórico local'),roster:clone(roster)});}}
 const body:CheckpointBody={version:1,owner,periods,createdAt:new Date().toISOString(),build:input.build,entries};validateBody(body,owner);const sha256=await digest(body);if(!session.isCurrent())throw Error('A sessão mudou durante a cópia.');return {body,sha256};
}
export async function verifyQaRosterCheckpoint(text:string,owner:string):Promise<RosterCheckpoint>{
 if(new TextEncoder().encode(text).length>maximum*2)throw Error('Arquivo maior que o limite local.');const snapshot=JSON.parse(text);validateBody(snapshot?.body,owner);if(typeof snapshot.sha256!=='string'||snapshot.sha256!==await digest(snapshot.body))throw Error('A cópia falhou na verificação de integridade.');return clone(snapshot);
}
// Restores into disposable memory only. No storage, network, scheduler, account,
// import endpoint or entitlement is touched by this rehearsal backend.
export async function rehearseQaRosterCheckpoint(text:string,owner:string){
 const snapshot=await verifyQaRosterCheckpoint(text,owner);const store=new Map<string,CheckpointEntry[]>();for(const p of snapshot.body.periods)store.set(p,clone(snapshot.body.entries.filter(e=>period(e.roster)===p)));
 return {owner:snapshot.body.owner,periods:[...store.keys()],read:(p:string)=>clone(store.get(p)||[])};
}
