import type {PayrollPage} from './privatePayrollExtraction';
type Rubric='breakfast'|'lunch'|'dinner'|'supper'|'taxi';
const aliases:Record<string,Rubric>={CAFE:'breakfast',ALMOCO:'lunch',JANTAR:'dinner',CEIA:'supper',TAXI:'taxi'};
const validDay=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export type AllowanceReconciliation={state:'balanced'|'mismatch'|'unavailable'|'conflict';datedRowsComplete:boolean;sumMinor:number|null;depositedMinor:number|null;counts:Partial<Record<Rubric,number>>;rows:Array<{page:number;line:number;dateLine:number;iso:string;rubric:Rubric;amountMinor:number}>;issues:string[]};
/** Private preview only. Each dated occurrence is counted, not a unit-rate
 * guess or a 24-hour total. Identical coffee/taxi never deduplicate each other.
 * Footer deposits are supplied separately after existing payment-date checks. */
export function reconcileAllowanceOccurrences(pages:readonly PayrollPage[],from:string,through:string,depositedMinor:number|null):AllowanceReconciliation{
 const result:AllowanceReconciliation={state:'unavailable',datedRowsComplete:false,sumMinor:null,depositedMinor,counts:{},rows:[],issues:[]};
 if(!validDay(from)||!validDay(through)||from>through)return {...result,issues:['Período das ocorrências não comprovado.']};
 let unresolved=false,invalid=false;
 for(const page of pages){let date='',dateLine=0;
  page.text.split(/\r?\n/).forEach((text,index)=>{
   const line=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
   if(/ADIANTAMENTO|TOTAL\s+DEPOSITADO|PAGAMENTO/.test(line)){date='';dateLine=0;return;}
   const dates=[...line.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map(x=>x[1]);
   if(dates.length===1&&!/TOTAL\s+DEPOSITADO|PAGAMENTO|ADIANTAMENTO|\bDE\s+\d{4}-|PERIODO/.test(line)){date=validDay(dates[0])?dates[0]:'';dateLine=index+1;}
   const matches=[...line.matchAll(/\b(CAFE|ALMOCO|JANTAR|CEIA|TAXI)\b[^\n\r]{0,40}?R\$[^\S\n\r]*([^\s;:()]+)/g)];
   if(!matches.length)return;
   if(/\bTOTAL\b/.test(line)){unresolved=true;return;}
   if(!date){unresolved=true;return;}
   if(date<from||date>through)return; // Historical advances are not this period.
   for(const match of matches){
    const token=match[2];if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(token)){invalid=true;continue;}
    const amountMinor=Number(token.replace(/[.,]/g,''));if(!Number.isSafeInteger(amountMinor)){invalid=true;continue;}
    const rubric=aliases[match[1]];result.rows.push({page:page.page,line:index+1,dateLine,iso:date,rubric,amountMinor});result.counts[rubric]=(result.counts[rubric]||0)+1;
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
