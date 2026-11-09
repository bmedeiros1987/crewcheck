import type {PayrollPage} from './privatePayrollExtraction';
type Rubric='breakfast'|'lunch'|'dinner'|'supper'|'taxi';
const aliases:Record<string,Rubric>={CAFE:'breakfast',ALMOCO:'lunch',JANTAR:'dinner',CEIA:'supper',TAXI:'taxi'};
const validDay=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export type AllowanceReconciliation={state:'balanced'|'mismatch'|'unavailable'|'conflict';datedRowsComplete:boolean;sumMinor:number|null;depositedMinor:number|null;counts:Partial<Record<Rubric,number>>;unitCandidates:Array<{page:number;origin:NonNullable<PayrollPage['origin']>;line:number;rubric:Rubric;amountMinor:number}>;rows:Array<{page:number;origin:NonNullable<PayrollPage['origin']>;line:number;dateLine:number;iso:string;rubric:Rubric;amountMinor:number}>;issues:string[]};
/** Private preview only. Each dated occurrence is counted, not a unit-rate
 * guess or a 24-hour total. Identical coffee/taxi never deduplicate each other.
 * Footer deposits are supplied separately after existing payment-date checks. */
export function reconcileAllowanceOccurrences(pages:readonly PayrollPage[],from:string,through:string,depositedMinor:number|null):AllowanceReconciliation{
 const result:AllowanceReconciliation={state:'unavailable',datedRowsComplete:false,sumMinor:null,depositedMinor,counts:{},unitCandidates:[],rows:[],issues:[]};
 if(!validDay(from)||!validDay(through)||from>through)return {...result,issues:['Período das ocorrências não comprovado.']};
 if(depositedMinor!==null&&(!Number.isSafeInteger(depositedMinor)||depositedMinor<0))return {...result,state:'conflict',issues:['Depósito inválido.']};
 let unresolved=false,invalid=false;
 // Section ambiguity survives a physical page break. A repeated report/period
 // header is not evidence that an advance section ended. Dates themselves do
 // not carry across pages: a new dated row retains its own page/line origin.
 let historical=false,ambiguous=false;
 for(const page of pages){let date='',dateLine=0;
  page.text.split(/\r?\n/).forEach((text,index)=>{
   const line=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
   if(/ADIANTAMENTO/.test(line)){date='';dateLine=0;historical=true;return;}
   if(/TOTAL\s+DEPOSITADO|PAGAMENTO/.test(line)){date='';dateLine=0;return;}
   const dates=[...line.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(x=>x[1]);
   if(dates.length>1){date='';dateLine=0;const period=/\bDE\s+\d{4}-/.test(line)&&/ATE/.test(line);if(!period)ambiguous=true;else if(dates[0]!==from||dates[1]!==through)historical=true;}
   if(dates.length===1&&!/\bDE\s+\d{4}-|PERIODO/.test(line)){
    const candidate=validDay(dates[0])?dates[0]:'';
    const within=Boolean(candidate&&candidate>=from&&candidate<=through);
    const occurrence=/\b[A-Z]{2,3}\s?\d{2,5}\b.*\b[A-Z]{3}\s+(?:[→>-]\s*)?[A-Z]{3}\b/.test(line);
    if(!candidate){date='';dateLine=0;ambiguous=true;}
    else if(!within){date=candidate;dateLine=index+1;historical=true;}
    else if(!(historical||ambiguous)||occurrence){date=candidate;dateLine=index+1;historical=false;ambiguous=false;}
    else {date='';dateLine=0;}
   }
   const matches=[...line.matchAll(/\b(CAFE|ALMOCO|JANTAR|CEIA|TAXI)\b[^\n\r]{0,40}?R\$[^\S\n\r]*([^\s;:()]+)/g)];
   if(!matches.length)return;
   if(dates.length>1){invalid=true;return;}
   if((line.match(/\b(CAFE|ALMOCO|JANTAR|CEIA|TAXI)\b/g)||[]).length!==matches.length){invalid=true;return;}
   if(/\bTOTAL\b/.test(line)){unresolved=true;ambiguous=true;return;}
   // Closed unit-line contract: optional date/flight/route prefix, explicit
   // rubric-price pairs, and separators only. Unknown residual tokens before,
   // between or after prices may be quantities/subtotals, not unit evidence.
   const prefix=line.slice(0,matches[0].index);
   const prefixValid=/^\s*(?:\d{4}-\d{2}-\d{2}\s+)?(?:[A-Z]{2,3}\s?\d{2,5}\s+[A-Z]{3}(?:\s+|\s*[→>\-]\s*)[A-Z]{3}\s+)?$/.test(prefix);
   const separator=(value:string)=>/^\s*(?:BRL\s*)?(?:[;|·]\s*)?$/.test(value);
   let cursor=matches[0].index||0,unitsValid=prefixValid;
   for(const match of matches){const at=match.index||0;unitsValid=unitsValid&&separator(line.slice(cursor,at))&&/^\s*[:·\-]?\s*(?:BRL\s*)?$/.test(match[0].slice(match[1].length,match[0].indexOf('R$')));cursor=at+match[0].length;}
   if(!unitsValid||!separator(line.slice(cursor))||(line.match(/R\$/g)||[]).length!==matches.length){invalid=true;return;}
   if(ambiguous){unresolved=true;invalid=true;return;}
   if(dates.length===1&&!validDay(dates[0])){date='';unresolved=true;return;}
   if(historical)return; // Historical advances are not current unit evidence.
   if(!date)unresolved=true;
   for(const match of matches){
    const token=match[2];if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(token)){invalid=true;continue;}
    const amountMinor=Number(token.replace(/[.,]/g,''));if(!Number.isSafeInteger(amountMinor)){invalid=true;continue;}
    const rubric=aliases[match[1]];result.unitCandidates.push({page:page.page,origin:page.origin||'document-logical',line:index+1,rubric,amountMinor});
    if(date){result.rows.push({page:page.page,origin:page.origin||'document-logical',line:index+1,dateLine,iso:date,rubric,amountMinor});result.counts[rubric]=(result.counts[rubric]||0)+1;}
   }
  });
 }
 const sum=result.rows.reduce((total,row)=>total+BigInt(row.amountMinor),0n);
 if(result.rows.length&&sum<=BigInt(Number.MAX_SAFE_INTEGER))result.sumMinor=Number(sum);
 result.datedRowsComplete=!unresolved&&!invalid&&result.sumMinor!==null;
 if(invalid||sum>BigInt(Number.MAX_SAFE_INTEGER)){result.state='conflict';result.issues.push('Valor ou soma de ocorrências inválido.');}
 else if(unresolved||result.sumMinor===null||depositedMinor===null){result.issues.push('Ocorrências, datas ou depósito sem evidência suficiente para conciliação completa.');}
 else result.state=result.sumMinor===depositedMinor?'balanced':'mismatch';
 if(result.state==='mismatch')result.issues.push('Soma das ocorrências diverge do depósito impresso; revisão obrigatória.');
 return result;
}
