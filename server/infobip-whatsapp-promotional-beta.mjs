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
  createAdmission:linkHashKey=>createPromotionalConciergeAdmission(p,{now,resolveTrustedContext:createPromotionalCreditSqlResolver({programId:p.programId,approvalId:p.approvalId,ownerAccountKey:p.ownerAccountKey,sender:p.sender,recipient:p.recipient,linkHashKey,expectedGrantManifest,expectedValidFrom:p.validFrom,expectedValidUntil:p.validUntil,now})}),
  allowsProposal:proposal=>proposal?.sender===p.sender&&proposal.recipient===p.recipient&&typeof proposal.text==='string'&&proposal.text.length<=4000,
  command:text=>{
   if(typeof text!=='string'||text.length>600)return {reply:'Não entendi. Escreva “menu” para ver as consultas disponíveis.'};
   const value=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
   if(/^(?:opcao\s+)?(?:12|13|14)[.)]?$/.test(value))return {reply:'Consulte academias, farmácias e hospitais no app CrewCheck. Este beta não faz buscas externas pela conversa.'};
   if(/^(?:oi|ola|bom dia|boa tarde|boa noite|menu|ajuda|comandos|inicio)[!.?]*$/.test(value)||/^(?:opcao\s+)?(?:[1-9]|1[0-7])[.)]?$/.test(value))return {text};
   if(/^\/(?:hoje|amanha|proximo|escala|historico_pernoites)$/.test(value))return {text:value};
   if(/^(?:o que tenho|qual (?:a )?minha programacao|minha escala|programacao)(?: para)? (hoje|amanha)[?.!]*$/.test(value))return {text:/amanha/.test(value)?'/amanha':'/hoje'};
   const q=operationalQuestion(text);if(q?.kind==='schedule'||q?.kind==='logistics-question')return {text:q.rewrite||text};
   return {reply:'Neste beta, consulte sua escala e pernoites ou escreva “menu”. Não faço alterações, buscas externas, ligações ou novos envios.'};
  },
 });
}
export function validateInfobipPromotionalPolicy(policy){
 if(policy?.version!==1||policy.mode!=='promotional-beta-v1'||usdMicro(policy.maxCostUsd)!==policy.admission?.maxCreditMicroUsd)fail();
 createInfobipPromotionalBetaScope(policy.configuration,policy.admission);return policy;
}
