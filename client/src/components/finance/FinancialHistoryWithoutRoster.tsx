import { useState } from 'react';
import { financialRange } from '@/lib/financialHistoryPeriods';
import PersistentFinancialHistory from './PersistentFinancialHistory';
import { FinancialPrivacyToggle } from './FinancialPrivacy';

// No roster, calculation engine, local financial cache or write operation.
export default function FinancialHistoryWithoutRoster({mode,onImport,rosterUnavailable=false}:{mode:'allowance'|'salary';onImport?:()=>void;rosterUnavailable?:boolean}) {
  const [month,setMonth]=useState(()=>{const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date());return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`;});
  const [view,setView]=useState<'statement'|'charts'>('statement');
  return <section className="cc-per-diem-content cc-persisted-finance-only" aria-label="Financeiro sem escala">
    <h1>{mode==='allowance'?'Diárias':'Salário'} · registros salvos</h1>
    <p role="status">{rosterUnavailable?'Escalas indisponíveis nesta consulta.':'Sem escala carregada.'} Os registros salvos são consultados separadamente.</p>
    {onImport&&<button type="button" onClick={onImport}>Importar escala para novas previsões</button>}
    <label>Competência dos registros<input type="month" aria-label="Competência dos registros salvos" value={month} onChange={event=>setMonth(event.target.value)}/></label>
    <nav className="cc-financial-screen-links" aria-label="Registros financeiros"><button type="button" onClick={()=>setView(view==='statement'?'charts':'statement')}>{view==='statement'?'Gráficos salvos':'Extrato salvo'}</button><FinancialPrivacyToggle/></nav>
    <PersistentFinancialHistory key={mode} mode={mode} view={view} range={financialRange('month',month,'','','')}/>
  </section>;
}
