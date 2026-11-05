import type {PayrollPage,PayrollGeometryRow,PayrollField,PayrollSource,PrivatePayrollExtraction,PayrollItem} from './privatePayrollExtraction';
// Ephemeral column reader. Labels identify the schema; only measured PDF cells
// associate values. No whitespace column guessing, rate inference or persistence.
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim().replace(/\s+/g,' ');
const empty=<T>():PayrollField<T>=>({state:'absent',candidates:[],unresolvedSources:[]});
function refresh<T>(f:PayrollField<T>){f.state=f.unresolvedSources.length||f.candidates.length>1?'conflict':!f.candidates.length?'absent':f.candidates[0].value===0?'zero':'candidate';}
function put<T>(f:PayrollField<T>,v:T,s:PayrollSource){const c=f.candidates.find(c=>c.value===v);if(c)c.sources.push(s);else f.candidates.push({value:v,sources:[s],confidence:'review'});refresh(f);}
const money=(s:string)=>{if(!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{2}$/.test(s))return null;const v=Number(s.replace(/[.,]/g,''));return Number.isSafeInteger(v)&&Math.round(v/100*100)===v?v/100:null;};
function date(s:string){const m=/^(\d{2})[./](\d{2})[./](\d{4})$/.exec(s);if(!m)return null;const iso=`${m[3]}-${m[2]}-${m[1]}`,v=Date.parse(iso+'T00:00:00Z');return Number.isFinite(v)&&new Date(v).toISOString().slice(0,10)===iso?iso:null;}
const ready=(f:PayrollField<unknown>)=>f.state==='candidate'||f.state==='zero';
const columns=['RUBRICA','QTDE','RAZAO','DESCRICAO','PROVENTOS','DESCONTOS'];
const header=(s:string)=>norm(s).replace(/\.$/,'');
export function extractPositionedPayroll(pages:readonly PayrollPage[]):PrivatePayrollExtraction|null{
 if(!pages.some(p=>p.geometry?.version===1&&Array.isArray(p.geometry.rows)&&p.geometry.rows.some(r=>columns.every(name=>r.cells.some(c=>header(c.text)===name)))))return null;
 const result:PrivatePayrollExtraction={version:1,competence:empty(),creditDate:empty(),monthlyBase:empty(),items:[],totals:{gross:empty(),deductions:empty(),net:empty()},layout:'positioned-table',incomplete:false,unresolvedSources:[],reconciliation:'unavailable',itemReconciliation:'unavailable',requiresReview:true,warnings:[]};
 const fail=(s:PayrollSource,message:string)=>{result.incomplete=true;result.unresolvedSources.push(s);result.warnings.push(message);};
 const conflict=<T>(f:PayrollField<T>,s:PayrollSource,message:string)=>{f.unresolvedSources.push(s);refresh(f);fail(s,message);};
 const readNumber=(f:PayrollField<number>,raw:string,s:PayrollSource,kind:'money'|'quantity'|'rate'='money')=>{
  if(!raw){conflict(f,s,'Campo tabular ausente; revisão obrigatória.');return;}
  const v=kind==='money'?money(raw):kind==='quantity'?(/^\d+(?:,\d+)?$|^\d{1,3}(?:\.\d{3})+,\d+$/.test(raw)?Number(raw.replaceAll('.','').replace(',','.')):null):/^\d+(?:\.\d{1,8})?$/.test(raw)?Number(raw):null;
  if(v===null||!Number.isFinite(v)){conflict(f,s,'Número tabular não interpretável; revisão obrigatória.');return;}put(f,v,s);if(v<0)fail(s,'Valor negativo preservado; convenção exige revisão.');
 };
 for(const page of pages){
  const rows=page.geometry?.version===1?page.geometry.rows:null;
  const source=(r:PayrollGeometryRow,field:string):PayrollSource=>({page:page.page,origin:page.origin??'document-logical',line:r.line,field,text:r.cells.map(c=>c.text).join(' ')});
  if(!rows||page.origin!=='pdf-physical'){fail({page:page.page,origin:page.origin??'document-logical',line:1,field:'layout',text:''},'Página sem geometria PDF comprovada.');continue;}
  let bounds:number[]|null=null,footer=false,recognized=false,afterTotals=false;
  function group(row:PayrollGeometryRow,xs:number[]){
   const values=xs.map(()=>[] as string[]);let valid=true;
   for(const c of row.cells){const n=xs.findLastIndex(x=>c.x>=x-0.5);if(n<0||c.width===null||!Number.isFinite(c.x)||!Number.isFinite(c.width)||c.width<0||n+1<xs.length&&c.x+c.width>xs[n+1]+0.5){valid=false;continue;}values[n].push(c.text.trim());}
   return {values:values.map(v=>v.join(' ').trim()),valid};
  }
  for(let i=0;i<rows.length;i++){
   const row=rows[i],text=norm(row.cells.map(c=>c.text).join(' ')),ref=(field:string)=>source(row,field);
   if(/^BASE(?:S)? DE CALCULOS?\b|^PARCELAS NAO DESCONTADAS\b/.test(text)){footer=true;bounds=null;}
   if(footer){recognized=true;const labels=row.cells.map(c=>header(c.text));if(columns.every(name=>labels.includes(name))||labels.includes('COMPETENCIA')||labels.includes('LIQUIDO'))fail(ref('layout'),'Novo cabeçalho financeiro após rodapé; conteúdo não descartado como completo.');continue;}
   const headingCells=row.cells.map(c=>({...c,text:header(c.text)}));
   // A second text-only baseline at the same X completes a wrapped header.
   const next=rows[i+1];let headerRows=1;
   if(next&&next.cells.every(c=>!/[\d]/.test(c.text)&&row.cells.some(h=>Math.abs(h.x-c.x)<=0.5))){for(const c of next.cells){const h=headingCells.find(h=>Math.abs(h.x-c.x)<=0.5)!;h.text=header(h.text+' '+c.text);}headerRows=2;}
   const meta=headingCells.filter(c=>['COMPETENCIA','SALARIO BASE','DATA DO DEPOSITO','LIQUIDO'].includes(c.text));
   if(meta.length&&!bounds){
    recognized=true;
    const valuesRow=rows[i+headerRows];bounds=null;
    if(!valuesRow){fail(ref('layout'),'Cabeçalho sem linha de valores.');continue;}
    const xs=headingCells.map(c=>c.x);const grouped=group(valuesRow,xs);
    for(const h of meta){const raw=grouped.values[headingCells.indexOf(h)],s=source(valuesRow,h.text);
     if(!grouped.valid){fail(s,'Células atravessam colunas; vínculo indisponível.');continue;}
     if(h.text==='COMPETENCIA'){const m=/^(\d{2})[/.](\d{4})$/.exec(raw);if(m&&+m[1]>=1&&+m[1]<=12)put(result.competence,`${m[2]}-${m[1]}`,s);else conflict(result.competence,s,'Competência tabular inválida ou ausente.');}
     else if(h.text==='SALARIO BASE')readNumber(result.monthlyBase,raw,s);
     else if(h.text==='DATA DO DEPOSITO'){const v=date(raw);if(v)put(result.creditDate,v,s);else conflict(result.creditDate,s,'Data de depósito inválida ou ausente.');}
     else readNumber(result.totals.net,raw,s);
    }
    i+=headerRows;continue;
   }
   if(columns.every(name=>headingCells.some(c=>c.text===name))){
    recognized=true;
    const sorted=columns.map(name=>headingCells.filter(c=>c.text===name));
    if(sorted.some(c=>c.length!==1)||sorted.some((c,j)=>j>0&&c[0].x<=sorted[j-1][0].x)){fail(ref('layout'),'Cabeçalhos duplicados ou fora de ordem.');bounds=null;}else bounds=sorted.map(c=>c[0].x);
    continue;
   }
   if(!bounds){if(afterTotals&&/\d+[.,]\d+/.test(text))fail(ref('layout'),'Conteúdo monetário não associado após os totais.');continue;}
   const grouped=group(row,bounds),[code,quantity,ratio,label,credit,debit]=grouped.values;
   if(/\bTOTAIS\b/.test(text)){
    if(!grouped.valid)fail(ref('totals'),'Totais atravessam colunas.');
    else{readNumber(result.totals.gross,credit,ref('gross'));readNumber(result.totals.deductions,debit,ref('deductions'));}bounds=null;afterTotals=true;continue;
   }
   if(!grouped.valid||!/^\d{1,8}$/.test(code)||!label){fail(ref('item'),'Rubrica sem vínculo geométrico completo.');continue;}
   const direction=credit&&!debit?'credit':debit&&!credit?'debit':'unknown';
   const nature=/PROPORCIONAL/.test(norm(label))?'proportional':/FERIAS/.test(norm(label))?'vacation':/DECIMO TERCEIRO|13[ºO°]? SALARIO/.test(norm(label))?'thirteenth':/ADIANTAMENTO/.test(norm(label))?'advance':undefined;
   const item:PayrollItem={code,label,direction,kind:direction==='debit'?'deduction':nature??'earning',nature,recurring:'unconfirmed',amount:empty(),quantity:empty(),printedRate:empty()};
   if(result.items.some(old=>old.code===code)){conflict(item.amount,ref('item'),'Rubrica repetida; não somar ou deduplicar automaticamente.');}
   if(direction==='unknown')conflict(item.amount,ref('amount'),'Proventos/descontos simultâneos ou ausentes; revisão obrigatória.');else readNumber(item.amount,credit||debit,ref('amount'));
   if(quantity)readNumber(item.quantity!,quantity,ref('quantity'),'quantity');if(ratio)readNumber(item.printedRate!,ratio,ref('printedRate'),'rate');
   result.items.push(item);
  }
  if(!recognized)fail({page:page.page,origin:page.origin??'document-logical',line:1,field:'layout',text:''},'Página adicional sem estrutura reconhecida; revisão obrigatória.');
 }
 for(const item of result.items)if(ready(result.competence))item.competence=result.competence.candidates[0].value;
 const fields=[result.competence,result.creditDate,result.monthlyBase,...Object.values(result.totals)];
 if(fields.some(f=>!ready(f))){result.incomplete=true;result.warnings.push('Metadados/totais ausentes ou conflitantes; revisão obrigatória.');}
 if(!result.incomplete&&result.items.every(i=>ready(i.amount)&&i.direction!=='unknown')){
  const cents=(n:number)=>Math.round(n*100),sum=(direction:string)=>result.items.filter(i=>i.direction===direction).reduce((sum,i)=>sum+cents(i.amount.candidates[0].value),0);
  const gross=cents(result.totals.gross.candidates[0].value),deductions=cents(result.totals.deductions.candidates[0].value),net=cents(result.totals.net.candidates[0].value);
  if(![sum('credit'),sum('debit'),gross-deductions].every(Number.isSafeInteger)){result.incomplete=true;result.warnings.push('Soma fora da precisão inteira segura; revisão obrigatória.');return result;}
  result.itemReconciliation=sum('credit')===gross&&sum('debit')===deductions?'balanced':'mismatch';
  result.reconciliation=gross-deductions===net&&result.itemReconciliation==='balanced'?'balanced':'mismatch';
  if(result.reconciliation==='mismatch'){result.incomplete=true;result.warnings.push('Rubricas ou totais tabulares divergentes; aplicação bloqueada.');}
 }
 return result;
}
