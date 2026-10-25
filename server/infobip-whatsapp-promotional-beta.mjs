import {WHATSAPP_TEXT_MENU} from './concierge/whatsapp-text-menu.mjs';
import {stayMenuIntent} from './concierge/stay-menu.mjs';
import {sharedCreditKey,boundedQuoteReservation} from './concierge-shared-credit-candidate.mjs';
import {createHash} from 'node:crypto';
import {createPromotionalConciergeAdmission} from './concierge-promotional-admission.mjs';
import {createPromotionalCreditSqlResolver,promotionalGrantManifest} from './concierge-promotional-credit-sql.mjs';
import {operationalQuestion} from './concierge/operational-question.mjs';
export const CONCIERGE_GLOBAL_BUDGET_PROGRAM='crewcheck-concierge-shared-budget-v1';
const hash=s=>createHash('sha256').update(s).digest('hex');
const fail=()=>{throw Error('INFOBIP_PROMOTIONAL_POLICY');};
function usdMicro(value){if(typeof value!=='string'||!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))fail();const [whole,fraction='']=value.split('.');const n=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));if(n<1n||n>20000000n)fail();return Number(n);}
export function createInfobipPromotionalBetaScope(configuration,admission,{now=Date.now}={}){
 const p=structuredClone(admission);
 if(configuration?.promotionalBeta!==true||configuration.singleMessageTest===true||configuration.operationalPilot===true||configuration.canonicalLinkHandshake===true||configuration.canonicalLinkHandshakeOnly===true||configuration.sender!==p?.sender||p?.enabled!==true||p.programId!==CONCIERGE_GLOBAL_BUDGET_PROGRAM||p.monthlyBudgetMicroUsd!==20000000||!Number.isSafeInteger(p.maxCreditMicroUsd)||p.maxCreditMicroUsd<1||p.maxCreditMicroUsd>20000000)fail();
 createPromotionalConciergeAdmission(p,{now,resolveTrustedContext:async()=>null});
 const grant={...p,amountMicroUsd:p.maxCreditMicroUsd};const expectedGrantManifest=promotionalGrantManifest(grant);
 const allowsOwner=id=>typeof id==='string'&&hash(id)===p.ownerAccountKey;
 const acceptEvent=e=>Number.isSafeInteger(e?.receivedAt)&&e.sender===p.sender&&e.recipient===p.recipient&&e.receivedAt>=p.validFrom&&e.receivedAt<=now()&&now()>=p.validFrom&&now()<p.validUntil&&now()-e.receivedAt<=15*60000&&typeof e.text==='string'&&e.text.length>0&&e.text.length<=600&&!/^\d{6}$/.test(e.text);
 return Object.freeze({allowsOwner,acceptEvent,
  createAdmission:linkHashKey=>{
   const resolve=createPromotionalCreditSqlResolver({programId:p.programId,approvalId:p.approvalId,ownerAccountKey:p.ownerAccountKey,sender:p.sender,recipient:p.recipient,linkHashKey,expectedGrantManifest,expectedValidFrom:p.validFrom,expectedValidUntil:p.validUntil,now});
   const admission=createPromotionalConciergeAdmission(p,{now,resolveTrustedContext:resolve});
   return Object.freeze({...admission,async checkSend(c,j){
    if(!admission.allows(j))return false;const context=await resolve(c,j);if(!context)return false;
    const read=async k=>{const [rows]=await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE',[k]);try{return rows.length===1?(typeof rows[0].payload==='string'?JSON.parse(rows[0].payload):rows[0].payload):null;}catch{return null;}};
    const currentPeriod=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(now());
    const global=await read(sharedCreditKey('global',[p.programId,currentPeriod]));
    const reserved=await read(sharedCreditKey('request',[p.programId,j.eventKey]));
    const at=now(),amount=boundedQuoteReservation(context.quote,'whatsapp',at);
    return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(at)===currentPeriod&&admission.allows(j)&&!c.signal?.aborted&&global?.v===1&&global.kind==='global-credit'&&global.period===currentPeriod&&global.budgetMicroUsd===p.monthlyBudgetMicroUsd&&global.reconciled===true&&Number.isSafeInteger(global.reconciledAt)&&at>=global.reconciledAt&&at-global.reconciledAt<=900000&&Number.isSafeInteger(global.knownSpentMicroUsd)&&global.knownSpentMicroUsd>=0&&Number.isSafeInteger(global.reservedMicroUsd)&&global.reservedMicroUsd>=0&&global.knownSpentMicroUsd+global.reservedMicroUsd<=global.budgetMicroUsd&&reserved?.kind==='credit-request'&&reserved.state==='reserved'&&reserved.period===currentPeriod&&reserved.accountKey===p.ownerAccountKey&&reserved.channel==='whatsapp'&&Number.isSafeInteger(reserved.amountMicroUsd)&&amount!==null&&amount<=reserved.amountMicroUsd;
   }});
  },
  allowsProposal:proposal=>proposal?.sender===p.sender&&proposal.recipient===p.recipient&&typeof proposal.text==='string'&&proposal.text.length<=4000,
  command:text=>{
   if(typeof text!=='string'||text.length>600)return {reply:'Não entendi. Escreva “menu” para ver as consultas disponíveis.'};
   const value=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
   if(/^(?:\/(?:start|menu|ajuda|help|comandos)|oi|ola|bom dia|boa tarde|boa noite|menu|ajuda|comandos|inicio)[!.?]*$/.test(value))return {reply:WHATSAPP_TEXT_MENU.replace('“METAR SBGR”','“qual minha próxima jornada?”')+'\nNeste beta, as opções 9–14 são consultadas somente no app.'};
   const handoff=/^(?:opcao\s+)?(9|10|11|12|13|14)[.)]?$/.exec(value)?.[1];
   if(handoff){const topic={'9':'Radar e portão de voo','10':'METAR','11':'TAF','12':'academias / Wellhub','13':'farmácias','14':'hospitais'}[handoff];return {reply:`Para consultar ${topic}, abra o app CrewCheck. A disponibilidade depende dos dados e da fonte no app. Este beta não faz essa busca pela conversa.`};}
   if(/^(?:oi|ola|bom dia|boa tarde|boa noite|menu|ajuda|comandos|inicio)[!.?]*$/.test(value)||/^(?:opcao\s+)?(?:[1-9]|1[0-7])[.)]?$/.test(value))return {text};
   const history=stayMenuIntent(value);if(history?.kind==='history')return {text:'/historico_pernoites '+history.page};
   if(/^\/(?:hoje|amanha|proximo|escala|historico_pernoites)$/.test(value))return {text:value};
   if(/^(?:o que tenho|qual (?:a )?minha programacao|minha escala|programacao)(?: para)? (hoje|amanha)[?.!]*$/.test(value))return {text:/amanha/.test(value)?'/amanha':'/hoje'};
   if(/^\/(?:start|menu|ajuda|help|comandos)$/.test(value))return {text:'menu'};
   const q=operationalQuestion(text);if(q?.kind==='schedule')return {text:q.rewrite||'que horas me apresento?'};if(q?.kind==='logistics-question')return {text};
   return {reply:'Neste beta, consulte sua escala e pernoites ou escreva “menu”. Não faço alterações, buscas externas, ligações ou novos envios.'};
  },
 });
}
export function validateInfobipPromotionalPolicy(policy){
 if(policy?.version!==1||policy.mode!=='promotional-beta-v1'||usdMicro(policy.maxCostUsd)!==policy.admission?.maxCreditMicroUsd)fail();
 createInfobipPromotionalBetaScope(policy.configuration,policy.admission);return policy;
}
