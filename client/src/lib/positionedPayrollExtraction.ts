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
const metadataCaption=(s:string)=>header(s).replace(/\./g,'').replace(/\s+/g,' ').trim();
const metadataColumns=new Set(['COMPETENCIA','TIPO DE PAGAMENTO','SALARIO BASE','CARGA HRS MES','DEP SF','DEP IR','BANCO','AGENCIA','CONTA CORRENTE','DATA DE ADMISSAO','DATA DO DEPOSITO','FGTS','LIQUIDO']);
type Cell=PayrollGeometryRow['cells'][number];
const headingPhrases=['TIPO DE PAGAMENTO','SALARIO BASE','DATA DO DEPOSITO','DATA DE ADMISSAO','CONTA CORRENTE','CARGA HRS MES','DEP SF','DEP IR'];
// Coalesce only a known heading phrase on the same measured baseline. Never
// treat its individual words as independent column boundaries.
function headingCellsFor(row:PayrollGeometryRow):Cell[]{
 const cells=row.cells.map(c=>({...c,text:header(c.text)})),out:Cell[]=[];
 for(let i=0;i<cells.length;i++){
  let chosen=i;
  for(let end=i+1;end<cells.length&&end<=i+4;end++){
   const part=cells.slice(i,end+1);
   if(part.some((c,j)=>c.width===null||j>0&&(c.x<part[j-1].x+part[j-1].width!-0.5||c.x-(part[j-1].x+part[j-1].width!)>12)))break;
   if(headingPhrases.includes(part.map(c=>c.text.replace(/\.$/,'')).join(' ')))chosen=end;
  }
  const first=cells[i],last=cells[chosen];out.push(chosen===i?first:{x:first.x,width:last.width===null?null:last.x+last.width-first.x,text:cells.slice(i,chosen+1).map(c=>c.text.replace(/\.$/,'')).join(' ')});i=chosen;
 }
 return out;
}
export function extractPositionedPayroll(pages:readonly PayrollPage[]):PrivatePayrollExtraction|null{
 if(!pages.some(p=>p.geometry?.version===1&&Array.isArray(p.geometry.rows)&&p.geometry.rows.some(r=>columns.every(name=>r.cells.some(c=>header(c.text)===name)))))return null;
 let monthlyPaymentTypeSeen=false;
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
  let bounds:number[]|null=null,footer=false,recognized=false,tableSeen=false;
  function group(row:PayrollGeometryRow,xs:number[]){
   const values=xs.map(()=>[] as string[]);let valid=true;
   for(const c of row.cells){const n=xs.findLastIndex(x=>c.x>=x-0.5);if(n<0||c.width===null||!Number.isFinite(c.x)||!Number.isFinite(c.width)||c.width<0||n+1<xs.length&&c.x+c.width>xs[n+1]+0.5){valid=false;continue;}values[n].push(c.text.trim());}
   return {values:values.map(v=>v.join(' ').trim()),valid};
  }
  function metadataGroup(row:PayrollGeometryRow,heads:Cell[]){
   const left=group(row,heads.map(h=>h.x));
   // The supported FGTS/net footer can use right-aligned labels AND values.
   // Accept that alignment only with an exact, unique measured right-edge match;
   // never reinterpret other metadata or an arbitrary out-of-column number.
   if(heads.length!==2||heads[0].text!=='FGTS'||heads[1].text!=='LIQUIDO')return left;
   if(heads.some((h,j)=>h.width===null||h.width<0||j>0&&h.x<heads[j-1].x+heads[j-1].width!))return {values:heads.map(()=>''),valid:false};
   const right=group(row,[-Infinity,(heads[0].x+heads[0].width!+heads[1].x)/2]);
   const proven=right.valid&&right.values.every(Boolean)&&row.cells.length===heads.length&&row.cells.every((c,j)=>c.width!==null&&Math.abs(c.x+c.width-(heads[j].x+heads[j].width!))<=0.5);
   if(proven){if(left.valid&&left.values.every(Boolean)&&left.values.some((v,j)=>v!==right.values[j]))return {values:heads.map(()=>''),valid:false};return right;}
   return left;
  }
  for(let i=0;i<rows.length;i++){
   const row=rows[i],text=norm(row.cells.map(c=>c.text).join(' ')),ref=(field:string)=>source(row,field);
   if(/^BASE(?:S)? DE CALCULOS?\b|^PARCELAS NAO DESCONTADAS\b/.test(text)){footer=true;bounds=null;}
   if(footer){recognized=true;const labels=row.cells.map(c=>header(c.text));if(columns.every(name=>labels.includes(name))||labels.includes('COMPETENCIA')||labels.includes('LIQUIDO'))fail(ref('layout'),'Novo cabeçalho financeiro após rodapé; conteúdo não descartado como completo.');continue;}
   const headingCells=headingCellsFor(row);
   if(!tableSeen&&!bounds&&['EMPRESA','CNPJ','CARGO'].every(label=>headingCells.some(h=>h.text===label))){
    recognized=true;const valuesRow=rows[i+1],schema=['EMPRESA','CNPJ','CARGO'];
    const frame=headingCells.length===3&&headingCells.every((h,j)=>h.text===schema[j]&&h.width!==null&&Number.isFinite(h.width)&&h.width>=0&&(j===0||h.x>=headingCells[j-1].x+headingCells[j-1].width!));
    const company=frame&&valuesRow?group(valuesRow,headingCells.map(h=>h.x)):null;
    const unexpected=/R\$|\d+[.,]\d+|\b(?:PROVENTOS?|DESCONTOS?|INSS|IRRF|TOTAIS|SALARIO|LIQUIDO)\b/;
    // A corporate identifier is metadata only when the exact three-column
    // heading binds the next physical row. This does not validate legal identity
    // or authorize ignoring any other preamble/page/financial content.
    if(!company?.valid||!company.values.every(Boolean)||!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(company.values[1])||[company.values[0],company.values[2]].some(value=>unexpected.test(norm(value)))){
     fail(valuesRow?source(valuesRow,'companyMetadata'):ref('companyMetadata'),'Cabeçalho empresarial sem vínculo geométrico completo ou com conteúdo financeiro inesperado; revisão obrigatória.');
    }
    if(valuesRow)i++;continue;
   }

   // A second text-only baseline at the same X completes a wrapped header.
   const next=rows[i+1];let headerRows=1;
   if(next&&next.cells.every(c=>!/[\d]/.test(c.text)&&headingCells.some(h=>Math.abs(h.x-c.x)<=0.5))){for(const c of next.cells){const h=headingCells.find(h=>Math.abs(h.x-c.x)<=0.5);if(!h){fail(ref('layout'),'Fragmento vertical sem cabeçalho correspondente; revisão obrigatória.');continue;}h.text=header(h.text+' '+c.text);}headerRows=2;}
   const meta=headingCells.filter(c=>['COMPETENCIA','TIPO DE PAGAMENTO','SALARIO BASE','DATA DO DEPOSITO','LIQUIDO'].includes(c.text));
   if(meta.length&&!bounds){
    recognized=true;
    const valuesRow=rows[i+headerRows];bounds=null;
    if(!valuesRow){fail(ref('layout'),'Cabeçalho sem linha de valores.');continue;}
    const captions=headingCells.map(h=>metadataCaption(h.text));
    if(captions.some(c=>!metadataColumns.has(c))||new Set(captions).size!==captions.length)fail(source(valuesRow,'metadataSchema'),'Coluna de metadados desconhecida ou repetida; conteúdo não descartado como completo.');
    const grouped=metadataGroup(valuesRow,headingCells);
    for(const h of meta){const raw=grouped.values[headingCells.indexOf(h)],s=source(valuesRow,h.text);
     if(!grouped.valid){fail(s,'Células atravessam colunas; vínculo indisponível.');continue;}
     if(h.text==='COMPETENCIA'){const m=/^(\d{2})[/.](\d{4})$/.exec(raw);if(m&&+m[1]>=1&&+m[1]<=12)put(result.competence,`${m[2]}-${m[1]}`,s);else conflict(result.competence,s,'Competência tabular inválida ou ausente.');}
     else if(h.text==='TIPO DE PAGAMENTO'){if(['MENSAL','FOLHA MENSAL'].includes(norm(raw)))monthlyPaymentTypeSeen=true;else fail(s,'Tipo de pagamento não comprova folha mensal; benefício, adiantamento ou ausência exigem revisão separada.');}
     else if(h.text==='SALARIO BASE')readNumber(result.monthlyBase,raw,s);
     else if(h.text==='DATA DO DEPOSITO'){const v=date(raw);if(v)put(result.creditDate,v,s);else conflict(result.creditDate,s,'Data de depósito inválida ou ausente.');}
     else readNumber(result.totals.net,raw,s);
    }
    i+=headerRows;continue;
   }
   if(columns.every(name=>headingCells.some(c=>c.text===name))){
    recognized=true;tableSeen=true;
    const sorted=columns.map(name=>headingCells.filter(c=>c.text===name));
    if(sorted.some(c=>c.length!==1)||sorted.some((c,j)=>j>0&&c[0].x<=sorted[j-1][0].x)){fail(ref('layout'),'Cabeçalhos duplicados ou fora de ordem.');bounds=null;}else bounds=sorted.map(c=>c[0].x);
    continue;
   }
   // Only a labelled, exact CNPJ line in the preamble is non-financial metadata.
   // Unknown money/rubric content, including anything after the table, stays blocking.
   if(!tableSeen&&!bounds&&/^[A-Z &().'\-]*CNPJ\s*:?\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(text))continue;
   if(!bounds){if(/\d+[.,]\d+|R\$|REDACT|REDIG|OCULTO|\*{2,}|\b(?:PROVENTOS?|DESCONTOS?|INSS|IRRF|TOTAIS)\b/.test(text))fail(ref('layout'),'Conteúdo financeiro sem cabeçalho de colunas; revisão obrigatória.');continue;}
   const grouped=group(row,bounds),[code,quantity,ratio,label,credit,debit]=grouped.values;
   if(/\bTOTAIS\b/.test(text)){
    if(!grouped.valid)fail(ref('totals'),'Totais atravessam colunas.');
    else{readNumber(result.totals.gross,credit,ref('gross'));readNumber(result.totals.deductions,debit,ref('deductions'));}bounds=null;continue;
   }
   if(!grouped.valid||!/^(?:[A-Za-z0-9]{1,8}|\/[A-Za-z0-9]{1,8})$/.test(code)||!label){fail(ref('item'),'Rubrica sem vínculo geométrico completo.');continue;}
   const direction=credit&&!debit?'credit':debit&&!credit?'debit':'unknown';
   const nature=/PROPORCIONAL/.test(norm(label))?'proportional':/FERIAS/.test(norm(label))?'vacation':/DECIMO TERCEIRO|13[ºO°]? SALARIO/.test(norm(label))?'thirteenth':/ADIANTAMENTO/.test(norm(label))?'advance':undefined;
   const item:PayrollItem={code,label,direction,kind:direction==='debit'?'deduction':nature??'earning',nature,recurring:'unconfirmed',amount:empty(),quantity:empty(),printedRate:empty()};
   if(result.items.some(old=>old.code===code)){conflict(item.amount,ref('item'),'Rubrica repetida; não somar ou deduplicar automaticamente.');}
   if(direction==='unknown')conflict(item.amount,ref('amount'),'Proventos/descontos simultâneos ou ausentes; revisão obrigatória.');else readNumber(item.amount,credit||debit,ref('amount'));
   if(quantity)readNumber(item.quantity!,quantity,ref('quantity'),'quantity');if(ratio)readNumber(item.printedRate!,ratio,ref('printedRate'),'rate');
   result.items.push(item);
  }
  // This supported layout requires a complete column header on every PDF page.
  // Metadata alone cannot certify an unknown continuation as fully read.
  if(!recognized||!tableSeen)fail({page:page.page,origin:page.origin??'document-logical',line:1,field:'layout',text:''},'Página adicional sem estrutura reconhecida; revisão obrigatória.');
 }
 if(!monthlyPaymentTypeSeen)fail({page:pages[0]?.page??1,origin:pages[0]?.origin??'document-logical',line:1,field:'paymentType',text:''},'Tipo de pagamento mensal não identificado; não promover base mensal.');
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
