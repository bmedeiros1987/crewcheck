import type { PrivatePayrollExtraction, PayrollPage, PayrollField } from './privatePayrollExtraction';
import { payrollCompetences, payrollMonthBounds, PAYROLL_CYCLE_SOURCE, ACT_PAYROLL_VALIDITY } from './financialPayrollPeriods';

export type PayrollDsrEvidence = {
  schema: 1; ownerId: string; payrollMonth: string; operationalMonth: string;
  sourceFingerprint: string; regime: 'NB'|'WB'; derivation: 'reconciled_paid_dsr';
  basisMinor: {production:number;reserve:number;standby:number}; reportedDsrMinor:number;
  sources: Array<{page:number;line:number;origin:'pdf-physical'|'document-logical'}>;
};
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const minor=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function withinAct(month:string) {const bounds=payrollMonthBounds(month);return !!bounds&&bounds.start>=ACT_PAYROLL_VALIDITY.start&&bounds.end<=ACT_PAYROLL_VALIDITY.end;}
function field<T>(value:PayrollField<T>):T|null {
  return value&&['candidate','zero'].includes(value.state)&&value.candidates.length===1&&!value.unresolvedSources.length?value.candidates[0].value:null;
}
function cents(value:unknown):number|null {
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)return null;
  const rounded=Math.round(value*100);
  return minor(rounded)&&Math.abs(value*100-rounded)<0.000001?rounded:null;
}
function total(values:number[]):number|null {
  const amount=values.reduce((sum,value)=>sum+BigInt(value),0n);
  return amount<=BigInt(Number.MAX_SAFE_INTEGER)?Number(amount):null;
}
const roundedDsr=(basis:number,regime:'NB'|'WB')=>{
 const numerator=BigInt(basis)*BigInt(regime==='NB'?8:9),divisor=BigInt(regime==='NB'?22:21);
 const amount=(2n*numerator+divisor)/(2n*divisor);
 return amount<=BigInt(Number.MAX_SAFE_INTEGER)?Number(amount):null;
};

/** An ephemeral draft from the existing extraction. No storage, rate adoption,
 * future-fleet inference or new confirmation. Complete rubric inventory must
 * reconcile to printed totals, not only gross-minus-deductions. */
export function draftPayrollDsrEvidence(args:{ownerId:string;sourceFingerprint:string;sourceText:string;extraction:PrivatePayrollExtraction;pages:readonly PayrollPage[]}):PayrollDsrEvidence|null {
 const x=args.extraction,month=field(x.competence);
 if(!args.ownerId?.trim()||!/^fnv1a-[a-f0-9]{8}$/.test(args.sourceFingerprint)||typeof month!=='string'||x.incomplete||x.layout!=='lines'||x.reconciliation!=='balanced'||x.unresolvedSources.length)return null;
 const cycle=payrollCompetences(month,PAYROLL_CYCLE_SOURCE);if(!cycle||!withinAct(cycle.operationalVariableMonth))return null;
 if(args.pages.map(page=>page.text).join('\f').replace(/\s+/g,' ').trim()!==args.sourceText.replace(/\s+/g,' ').trim())return null;
 const document=args.pages.map(page=>normalize(page.text)).join('\n');
 // Company and professional scope must be in this document, not inferred from
 // an airport, one aircraft, or another account's global profile settings.
 if(!/(?:^|\n)\s*(?:(?:EMPRESA|EMPREGADOR|RAZAO SOCIAL)\s*:?\s*)?TAM LINHAS AEREAS\b/m.test(document)
   ||!/(?:^|\n)[^\n]*(?:CARGO|FUNCAO)\s*:?\s*COMISSARI[OA](?:\(A\))?\b/m.test(document))return null;
 const employers=[...document.matchAll(/(?:^|\n)\s*(?:EMPRESA|EMPREGADOR|RAZAO SOCIAL)\b\s*:?\s*/g)];
 if(employers.some(match=>!/^TAM LINHAS AEREAS\b/.test(document.slice(match.index!+match[0].length))))return null;
 const roles=[...document.matchAll(/\b(?:CARGO|FUNCAO)\b\s*:?\s*/g)];
 if(roles.some(match=>!/^COMISSARI[OA](?:\(A\))?\b/.test(document.slice(match.index!+match[0].length))))return null;
 const basis={production:[] as number[],reserve:[] as number[],standby:[] as number[]},credits:number[]=[],debits:number[]=[],dsr:number[]=[],seen=new Set<string>();
 const sources:PayrollDsrEvidence['sources']=[];
 for(const item of x.items){
  if(item.competence!==month||!['earning','deduction','advance','vacation','thirteenth','proportional'].includes(item.kind)||!['credit','debit'].includes(item.direction))return null;
  const amount=cents(field(item.amount));if(amount===null)return null;
  const label=normalize(item.label);
  // R001 is an informational CO base, already included in fixed pay.
  if(/^R001\b/.test(label)&&/\bBASE\b|COMPENSACAO ORGANICA/.test(label)){if(item.direction!=='credit')return null;continue;}
  (item.direction==='credit'?credits:debits).push(amount);
  const code=label.match(/^(132[0-5])\b/)?.[1];
  const isDsr=/^(?:\d+\s+)*(?:DSR|DESCANSO SEMANAL REMUNERADO)(?:\s*-?\s*CMS)?\s*$/.test(label);
  if(!code&&!isDsr) {
   if(!(/^1037\b/.test(label)&&/CHEF/.test(label))&&/\bKM\b|QUILOMETR|\bRESERVA\b|\bSOBRE\s*AVISO\b|\bHSBE?\b/.test(label))return null;
   continue;
  }
  if(item.nature||item.direction!=='credit'||/DIFERENCA|AJUSTE|COMPLEMENTO|ESTORNO/.test(label))return null;
  if(code){
   if(seen.has(code))return null;seen.add(code);
   const key=/\bKM\b/.test(label)?'production':/\bRESERVA\b/.test(label)?'reserve':/\bSOBRE\s*AVISO\b|\bHSB\b/.test(label)?'standby':null;
   if(!key)return null;basis[key].push(amount);
  }else dsr.push(amount);
  for(const reference of item.amount.candidates[0].sources){
   if(!Number.isInteger(reference.page)||reference.page<1||!Number.isInteger(reference.line)||reference.line<1||!['pdf-physical','document-logical'].includes(reference.origin))return null;
   sources.push({page:reference.page,line:reference.line,origin:reference.origin});
  }
 }
 const gross=cents(field(x.totals.gross)),deductions=cents(field(x.totals.deductions)),net=cents(field(x.totals.net));
 if(gross===null||deductions===null||net===null||total(credits)!==gross||total(debits)!==deductions||gross-deductions!==net||dsr.length!==1||!seen.size||!sources.length)return null;
 // Only a fully reconciled inventory proves an absent paid basis rubric zero.
 const production=total(basis.production),reserve=total(basis.reserve),standby=total(basis.standby);
 if(production===null||reserve===null||standby===null)return null;
 const basisTotal=total([production,reserve,standby]);if(basisTotal===null||basisTotal===0)return null;
 const matches=(['NB','WB'] as const).filter(regime=>roundedDsr(basisTotal,regime)===dsr[0]);
 if(matches.length!==1)return null;
 const explicitNb=/\bNARROW BODY\b|\b(?:FROTA|REGIME)\s+NB\b/.test(document),explicitWb=/\bWIDE BODY\b|\b(?:FROTA|REGIME)\s+WB\b/.test(document);
 if(explicitNb&&explicitWb||explicitNb&&matches[0]!=='NB'||explicitWb&&matches[0]!=='WB')return null;
 return {schema:1,ownerId:args.ownerId,payrollMonth:month,operationalMonth:cycle.operationalVariableMonth,sourceFingerprint:args.sourceFingerprint,
  regime:matches[0],derivation:'reconciled_paid_dsr',basisMinor:{production,reserve,standby},reportedDsrMinor:dsr[0],sources};
}

/** Whitelist shape: full document text/names cannot enter the saved metadata. */
export function validPayrollDsrEvidence(value:unknown):value is PayrollDsrEvidence {
 const x=value as PayrollDsrEvidence;if(!x||typeof x!=='object'||Array.isArray(x))return false;
 const allowed=['schema','ownerId','payrollMonth','operationalMonth','sourceFingerprint','regime','derivation','basisMinor','reportedDsrMinor','sources'];
 if(Object.keys(x).some(key=>!allowed.includes(key))||x.schema!==1||typeof x.ownerId!=='string'||!x.ownerId.trim()||typeof x.sourceFingerprint!=='string'||!/^fnv1a-[a-f0-9]{8}$/.test(x.sourceFingerprint)||!['NB','WB'].includes(x.regime)||x.derivation!=='reconciled_paid_dsr')return false;
 const cycle=payrollCompetences(x.payrollMonth,PAYROLL_CYCLE_SOURCE);
 if(!cycle||!withinAct(x.operationalMonth)||cycle.operationalVariableMonth!==x.operationalMonth||!x.basisMinor||Object.keys(x.basisMinor).sort().join(',')!=='production,reserve,standby'||!Object.values(x.basisMinor).every(minor)||!minor(x.reportedDsrMinor))return false;
 const basis=total(Object.values(x.basisMinor));
 if(basis===null||basis===0)return false;
 const matches=(['NB','WB'] as const).filter(regime=>roundedDsr(basis,regime)===x.reportedDsrMinor);
 if(matches.length!==1||matches[0]!==x.regime)return false;
 return Array.isArray(x.sources)&&x.sources.length>0&&x.sources.every(ref=>ref&&Object.keys(ref).sort().join(',')==='line,origin,page'&&Number.isInteger(ref.page)&&ref.page>0&&Number.isInteger(ref.line)&&ref.line>0&&['pdf-physical','document-logical'].includes(ref.origin));
}

/** Consume only records returned by the existing validated, owner-bound reader.
 * Never project a historic regime into another month. Conflicting documents
 * remain pending, even when a later import exists. */
export function payrollDsrContext(args:{ownerId:string;competence:string;rates:ReadonlyArray<{ownerId?:string;confirmed:boolean;valueOrigin?:string;sourceFingerprint:string;revision?:number;payrollCompetence?:string;cycleSource?:string;payrollDsrEvidence?:PayrollDsrEvidence}>}) {
 const bounds=payrollMonthBounds(args.competence);if(!bounds)return null;
 const records=args.rates.filter(rate=>rate.confirmed&&rate.ownerId===args.ownerId&&rate.valueOrigin==='printed'&&rate.cycleSource===PAYROLL_CYCLE_SOURCE&&validPayrollDsrEvidence(rate.payrollDsrEvidence)
  &&rate.payrollDsrEvidence!.ownerId===args.ownerId&&rate.payrollDsrEvidence!.sourceFingerprint===rate.sourceFingerprint&&rate.payrollDsrEvidence!.payrollMonth===rate.payrollCompetence&&rate.payrollDsrEvidence!.operationalMonth===args.competence);
 if(!records.length)return null;
 const signatures=new Set(records.map(rate=>JSON.stringify([rate.payrollDsrEvidence!.regime,rate.payrollDsrEvidence!.basisMinor,rate.payrollDsrEvidence!.reportedDsrMinor])));
 if(signatures.size!==1)return null;
 const rate=[...records].sort((a,b)=>(b.revision||1)-(a.revision||1))[0],evidence=rate.payrollDsrEvidence!;
 const source={ownerId:args.ownerId,competence:args.competence,sourceId:evidence.sourceFingerprint,revision:rate.revision||1,effectiveFrom:bounds.start,effectiveTo:bounds.end};
 return {profile:{...source,company:'TAM',role:'cabin',regime:evidence.regime,review:'confirmed',sourceKind:'employer_document'},
  basisReview:{...source,review:'confirmed'},reportedDsr:{...source,amountMinor:evidence.reportedDsrMinor,currency:'BRL',status:'confirmed'},
  sourcePayrollMonth:evidence.payrollMonth,sourceOperationalMonth:evidence.operationalMonth,derivation:evidence.derivation};
}
