import { useState } from 'react';
// Deliberately unmounted: local proposal, no fetch, persistence or permission writes.
const categories = [['monthlySalary', 'Salário mensal'], ['dailyAllowances', 'Diárias'], ['periodSummary', 'Resumo apenas das categorias selecionadas']] as const;
export default function VisitorGrantPreview({ visitorLabel = 'Visitante fictício' }: { visitorLabel?: string }) {
 const [financial,setFinancial]=useState(false),[selected,setSelected]=useState<string[]>([]),[emergency,setEmergency]=useState(false);
 const [periodStart,setPeriodStart]=useState(''),[periodEnd,setPeriodEnd]=useState('');
 return <section aria-label="Prévia de permissões do visitante"><h1>O que compartilhar com {visitorLabel}?</h1><p>Prévia local. Nenhuma permissão será aplicada.</p>
 <label><input type="checkbox" checked={financial} onChange={e=>{setFinancial(e.target.checked);setSelected([]);}}/>Compartilhar financeiro · somente leitura</label>
 {financial&&<fieldset><legend>Escolha as categorias e o período</legend>{categories.map(([key,label])=><label key={key}><input type="checkbox" checked={selected.includes(key)} disabled={key==='periodSummary'&&!selected.some(v=>v!=='periodSummary')} onChange={e=>setSelected(previous=>{const next=e.target.checked?[...previous,key]:previous.filter(v=>v!==key);return next.some(v=>v!=='periodSummary')?next:[];})}/>{label}</label>)}<label>De<input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)}/></label><label>Até<input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}/></label></fieldset>}
 <label><input type="checkbox" checked={emergency} onChange={e=>setEmergency(e.target.checked)}/>Designar como contato de emergência</label><p>Emergência não libera financeiro, localização, quarto ou dados de saúde.</p>
 <output aria-live="polite">{financial?(selected.some(v=>v!=='periodSummary')&&periodStart&&periodEnd&&periodStart<=periodEnd?'Prévia pronta para revisão; acesso continua fechado.':'Selecione categorias e um período válido.'):'Financeiro não compartilhado.'}</output>
 <p>Antes de confirmar: revisar destinatário, campos, prazo, limite atual do plano e como revogar. A confirmação real depende da implementação revisada do servidor.</p><button type="button" disabled>Compartilhamento indisponível nesta prévia</button></section>;
}
