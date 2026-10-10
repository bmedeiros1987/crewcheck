import { useState } from 'react';
import { DEFAULT_ALERT_DAYS, normalizeAlertDays, validateEntries, validityLabel, type ValidityEntry, type ValidityDate } from '@/lib/crewlockerValidity';

export function CrewValidityEditor({ initial, initialDays = DEFAULT_ALERT_DAYS, onSave, onCancel }: {
  initial: ValidityEntry[]; initialDays?: number[]; onSave(entries: ValidityEntry[], days: number[]): Promise<void>; onCancel(): void;
}) {
  const [entries,setEntries] = useState(initial);
  const [category,setCategory] = useState<ValidityEntry['category']>('rating');
  const [label,setLabel] = useState('');
  const [precision,setPrecision] = useState<ValidityDate['kind']>('unknown');
  const [date,setDate] = useState('');
  const [replacement,setReplacement] = useState('');
  const [confirmed,setConfirmed] = useState(false);
  const [days,setDays] = useState(initialDays.join(', '));
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const active = entries.filter(e=>!e.supersededBy);
  function add() {
    try {
      const expiry: ValidityDate = precision === 'exact' || precision === 'month' ? {kind:precision,value:date} : {kind:precision};
      const entry: ValidityEntry = {id:crypto.randomUUID(),revision:1,category,label:label.trim(),expiry,confirmed,origin:'manual',sourceCheck:'pending',signatureCheck:'unknown',fitnessCheck:'not_assessed'};
      const next = [...entries.map(e=>e.id === replacement ? {...e,supersededBy:entry.id} : e),entry];
      validateEntries(next); setEntries(next); setLabel(''); setDate(''); setConfirmed(false); setReplacement(''); setError('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Revise os campos.'); }
  }
  async function save() {
    setBusy(true); setError('');
    try { validateEntries(entries); await onSave(entries,normalizeAlertDays(days.split(',').map(d=> d.trim() === '' ? NaN : Number(d.trim())))); }
    catch(e) { setError(e instanceof Error ? e.message : 'Falha ao salvar.'); } finally { setBusy(false); }
  }
  return <section className="cc-validity-editor" aria-label="Revisão de validades">
    <h3>Revisar registros deste arquivo</h3>
    <p>Cadastre separadamente licença, habilitações e classes de CMA. Não há extração automática de PDF. Confira cada dado no documento; confirmar a transcrição não verifica fonte, assinatura ou aptidão.</p>
    <p>Não informe números de documentos nem restrições médicas nos nomes dos registros.</p>
    <ul>{entries.map(e=><li key={e.id}><strong>{e.label}</strong> · {validityLabel(e.expiry)} · {e.supersededBy ? 'Substituído por renovação' : e.confirmed ? 'Transcrição confirmada' : 'Aguardando confirmação'}
      {!e.supersededBy && <button type="button" disabled={busy} onClick={()=>setEntries(entries.map(item=>item.id === e.id ? {...item,confirmed:!item.confirmed,revision:item.revision+1} : item))}>{e.confirmed ? 'Retirar confirmação' : 'Confirmar transcrição'}</button>}
    </li>)}</ul>
    <fieldset disabled={busy}><legend>Adicionar ou renovar um registro</legend><div className="cc-locker-form">
      <label><span>Categoria</span><select value={category} onChange={e=>{setCategory(e.target.value as ValidityEntry['category']);if(precision==='permanent')setPrecision('unknown');}}><option value="rating">Habilitação</option><option value="license">Licença</option><option value="medical">CMA</option><option value="other">Outro</option></select></label>
      <label><span>Nome / tipo / classe</span><input maxLength={100} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Ex.: habilitação tipo B"/></label>
      <label><span>Precisão da validade</span><select value={precision} onChange={e=>{setPrecision(e.target.value as ValidityDate['kind']);setDate('');}}><option value="unknown">Não informada</option><option value="exact">Dia exato informado</option><option value="month">Somente mês e ano</option>{category==='license' && <option value="permanent">Licença permanente</option>}</select></label>
      {(precision==='exact' || precision==='month') && <label><span>{precision==='month' ? 'Mês e ano (sem inventar dia)' : 'Data exata'}</span><input type={precision==='month'?'month':'date'} value={date} onChange={e=>setDate(e.target.value)}/></label>}
      <label><span>Renovação de</span><select value={replacement} onChange={e=>setReplacement(e.target.value)}><option value="">Novo registro independente</option>{active.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
      <label className="cc-validity-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>Conferi esta transcrição no documento</span></label>
    </div><button type="button" onClick={add} disabled={!label.trim()}>Adicionar registro revisado</button></fieldset>
    <label className="cc-validity-days"><span>Avisos antecipados em dias, separados por vírgula (0 a 730)</span><input value={days} onChange={e=>setDays(e.target.value)} disabled={busy}/></label>
    <p>Para mês/ano, os marcos usam o início do mês como planejamento conservador. Esse marco não é a data oficial de vencimento.</p>
    {error && <p role="alert">{error}</p>}
    <div className="actions"><button type="button" className="primary" disabled={busy} onClick={save}>Salvar revisão</button><button type="button" disabled={busy} onClick={onCancel}>Cancelar</button></div>
  </section>;
}
