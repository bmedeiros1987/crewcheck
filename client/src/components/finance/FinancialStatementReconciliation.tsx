import { useEffect, useRef, useState } from 'react';
import { getStoredUser, getToken } from '@/lib/authClient';
import { learnFinancialStatement, type StatementLearningResult } from '@/lib/financialStatementLearning';
import { financialMonths, financialRowsInRange, validFinancialDay, type FinancialRange } from '@/lib/financialHistoryPeriods';
import { summarizeForecastRows } from '@/lib/financialForecastPeriods';
import { extractPdfText } from './FinancialStatementImporter';

type Row = { iso:string; label:string; value:number; currency:string; convertedBRL:number|null; source:string; eventId?:string; rateSource?:string; rateVersion?:string; exchangeRate?:number|null; calculationStart?:string; calculationEnd?:string };
const owner = ()=>`${getStoredUser()?.id || getStoredUser()?.email || ''}:${getToken() || ''}`;
const money = (value:number,currency='BRL')=>new Intl.NumberFormat('pt-BR',{style:'currency',currency}).format(value);
export default function FinancialStatementReconciliation({ rows, unclassified, coveredMonths, requestRange }: { rows: Row[]; unclassified: Array<{iso:string;airport:string}>; coveredMonths: string[]; requestRange: (range:FinancialRange)=>void }) {
  const [document,setDocument]=useState<{owner:string; result:StatementLearningResult}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const identityNow=owner(), epoch=useRef(0);
  useEffect(()=>{epoch.current++;setDocument(null);setBusy(false);setError('');return()=>{epoch.current++;};},[identityNow]);
  async function read(file?:File) {
    if(!file)return; const identity=owner(), version=++epoch.current;setBusy(true);setError('');setDocument(null);
    try {const text=await extractPdfText(file);if(owner()===identity&&version===epoch.current){const result=learnFinancialStatement(text,file.name);if(result.kind!=='per_diem')throw new Error('wrong document');setDocument({owner:identity,result});};}
    catch {if(owner()===identity&&version===epoch.current)setError('Não foi possível ler o demonstrativo. Nenhum valor foi alterado.');}
    finally {if(owner()===identity&&version===epoch.current)setBusy(false);}
  }
  const result=document?.owner===owner()?document.result:null;
  const valid=result?.periodStart&&result.periodEnd&&validFinancialDay(result.periodStart)&&validFinancialDay(result.periodEnd)&&result.periodStart<=result.periodEnd;
  const range={start:result?.periodStart||'',end:result?.periodEnd||'',valid:Boolean(valid),kind:'custom' as const};
  const items=financialRowsInRange(rows,range),pending=financialRowsInRange(unclassified,range),forecast=summarizeForecastRows(items,pending);
  useEffect(()=>{if(valid)requestRange(range);},[result?.periodStart,result?.periodEnd]);
  const missingMonths=financialMonths(range).filter(month=>!coveredMonths.includes(month));
  const completeCoverage=Boolean(valid)&&missingMonths.length===0;
  const reported=result?.totals.deposited;
  return <details className="cz-toolbox cc-financial-reconciliation"><summary>Conferir previsão com demonstrativo</summary>
    <p>Leitura privada neste aparelho, apenas durante esta consulta. Não salva o documento, não altera tarifas e não confirma pagamento bancário.</p>
    <label>Demonstrativo de diárias<input type="file" accept="application/pdf,.pdf" disabled={busy} onChange={event=>{void read(event.target.files?.[0]);event.target.value='';}}/></label>
    {busy&&<p role="status">Lendo demonstrativo…</p>}{error&&<p role="alert">{error}</p>}
    {result&&<section aria-label="Conciliação de diárias"><p>Trabalho declarado: {result.periodStart || 'não identificado'} até {result.periodEnd || 'não identificado'}. Data de pagamento declarada: {result.paymentDate || 'não identificada'}.</p>
      <p>Total informado pelo documento: {Number.isFinite(reported)?money(reported!):'Indisponível'}. Previsão dos itens disponíveis no mesmo intervalo: {!completeCoverage||forecast.convertedTotalBRL===null?'Não calculável':money(forecast.convertedTotalBRL)}.</p>
      {completeCoverage&&Number.isFinite(reported)&&forecast.convertedTotalBRL!==null&&<p>Diferença a conferir: {money(reported!-forecast.convertedTotalBRL)}. Não há ajuste automático ou abatimento de adiantamentos.</p>}
      {!completeCoverage&&<p role="status">Cobertura incompleta do demonstrativo: {missingMonths.join(', ') || 'período inválido'}. Diferença indisponível; os itens presentes são parciais.</p>}
      <p>Conciliação ainda depende de verificar escala executada, revisões e todos os itens do documento. Igualdade de totais não comprova igualdade de itens nem recebimento.</p>
      {result.warnings.map(warning=><p key={warning}>{warning}</p>)}
      <h3>Tarifas observadas no documento</h3>{result.rates.map(rate=><p key={rate.key}>{rate.label}: {money(rate.value,rate.currency)} · {rate.effectiveFrom} até {rate.effectiveTo || 'fim não informado'} · sem alteração da previsão</p>)}
      <h3>Itens usados pela previsão ({items.length})</h3>{items.map((row,index)=><article className="cc-financial-audit-item" key={row.eventId+'-'+row.iso+'-'+row.label+'-'+index}><strong>{row.iso} · {row.label} · {money(row.value,row.currency)}</strong><p>{row.source}</p><p>Fonte da tarifa: {row.rateSource || 'não informada'} · versão {row.rateVersion || 'não informada'}. Instantes usados pelo app (UTC): {row.calculationStart || 'não informado'} até {row.calculationEnd || 'não informado'}. Cotação configurada: {row.exchangeRate ?? 'pendente'}; não é cotação histórica oficial.</p><small>Origem operacional: {row.eventId || 'não informada'}. Conversão: {row.convertedBRL===null?'câmbio pendente':money(row.convertedBRL)}.</small></article>)}
      {!items.length&&<p>Nenhum item da escala está disponível no intervalo declarado.</p>}
    </section>}
  </details>;
}
