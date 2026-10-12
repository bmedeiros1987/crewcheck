import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileSearch, History, ShieldCheck, Upload, X } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  learnFinancialStatement,
  financialRateOwner,
  financialRateSession,
  applyReviewedPayrollCycle,
  mergeConfirmedRates,
  readConfirmedFinancialRates,
  saveConfirmedFinancialRates,
  type LearnedRate,
  type StatementLearningResult,
} from '@/lib/financialStatementLearning';

export async function extractPdfText(file: File): Promise<string> {
  const module: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfjs = module.default || module;
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => String(item.str || '')).join(' '));
  }
  return pages.join('\n');
}

function money(value: number, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, maximumFractionDigits: 6 }).format(value);
}

export default function FinancialStatementImporter({ mode }: { mode: 'per_diem' | 'payroll' }) {
  const input = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  const reviewSession = useRef<string | null>(null);
  const [cycleConfirmed, setCycleConfirmed] = useState(false);
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [authRevision, setAuthRevision] = useState(0);
  useEffect(() => {
    const reset = () => { epoch.current++; reviewSession.current = null; setResult(null); setRates(readConfirmedFinancialRates()); setBusy(false); setError(''); setCycleConfirmed(false); setSourceConfirmed(false); setAuthRevision(value => value + 1); };
    const storage = (event: StorageEvent) => { if (['crewcheck_auth_user', 'crewcheck_auth_token'].includes(event.key || '')) reset(); };
    window.addEventListener('crewcheck:auth-changed', reset); window.addEventListener('crewcheck:auth-expired', reset); window.addEventListener('storage', storage);
    return () => { epoch.current++; window.removeEventListener('crewcheck:auth-changed', reset); window.removeEventListener('crewcheck:auth-expired', reset); window.removeEventListener('storage', storage); };
  }, []);
  const [result, setResult] = useState<StatementLearningResult | null>(null);
  const [rates, setRates] = useState<LearnedRate[]>(readConfirmedFinancialRates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visibleRates = useMemo(
    () => rates.filter((item) => mode === 'per_diem' ? item.key.startsWith('per_diem.') : item.key.startsWith('salary.')),
    [rates, mode, authRevision]
  );
  const reviewRates = result ? (mode === 'payroll' && cycleConfirmed ? applyReviewedPayrollCycle(result) : result.rates) : [];
  const label = mode === 'per_diem' ? 'demonstrativo de diárias' : 'demonstrativo de pagamento';

  async function importFile(file?: File) {
    const identity = financialRateSession(), version = ++epoch.current;
    if (!file || !identity) return;
    reviewSession.current = identity;
    setCycleConfirmed(false);
    setSourceConfirmed(false);
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const learned = learnFinancialStatement(await extractPdfText(file), file.name);
      if (learned.kind !== mode) {
        throw new Error(mode === 'per_diem' ? 'Escolha um demonstrativo de diárias.' : 'Escolha um demonstrativo de pagamento.');
      }
      if (version === epoch.current && identity === financialRateSession()) setResult(learned);
    } catch (cause) {
      if (version === epoch.current && identity === financialRateSession()) setError(cause instanceof Error ? cause.message : 'Não foi possível analisar este documento.');
    } finally {
      if (version === epoch.current) setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function confirm() {
    if (!result || !sourceConfirmed || !reviewSession.current || reviewSession.current !== financialRateSession() || (mode === 'payroll' && !cycleConfirmed)) return;
    const reviewed = mode === 'payroll' ? applyReviewedPayrollCycle(result) : result.rates;
    const confirmed = reviewed.filter(item => item.valueOrigin !== 'derived').map((item) => ({ ...item, confirmed: true }));
    if (!confirmed.length) { setError('Nenhuma tarifa impressa e revisada está disponível. Valores derivados não são aplicados.'); return; }
    const next = mergeConfirmedRates(readConfirmedFinancialRates(), confirmed);
    if (!saveConfirmedFinancialRates(next, reviewSession.current)) { setError('Não foi possível salvar nesta conta. Confirme owner, período completo e origem; nenhum valor foi alterado.'); return; }
    setRates(next);
    setResult(null);
    window.dispatchEvent(new CustomEvent('crewcheck:finance-calibrated', { detail: { mode, count: confirmed.length } }));
  }

  if (!financialRateOwner()) return <p>Entre na conta proprietária para revisar tarifas. Visitantes não têm acesso financeiro.</p>;
  return <section className="cz-toolbox finance-learning-panel" aria-label={'Importar ' + label}>
    <header className="finance-learning-heading">
      <div>
        <span className="finance-learning-eyebrow"><FileSearch size={16}/> Calibração por competência</span>
        <h3>{mode === 'per_diem' ? 'Diárias' : 'Salário e variáveis'}</h3>
        <p>Leia o PDF, revise as rubricas e confirme antes de alterar a previsão.</p>
      </div>
      <button className="finance-learning-upload" type="button" onClick={() => input.current?.click()} disabled={busy}>
        <Upload size={18}/>{busy ? 'Analisando…' : 'Selecionar PDF'}
      </button>
      <input ref={input} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => importFile(event.target.files?.[0])}/>
    </header>

    <div className="finance-learning-notice success"><ShieldCheck size={17}/><span>O PDF e seu texto integral não são armazenados. A referência conserva o nome do arquivo, uma impressão digital e as tarifas revisadas.</span></div>
    {error && <div className="finance-learning-notice danger" role="alert"><X size={17}/><span>{error}</span></div>}

    {result && <div className="finance-learning-review" aria-live="polite">
      <header><div><small>Revisão obrigatória</small><h3>{result.competence || 'Competência não identificada'}</h3></div></header>
      {result.warnings.map((warning) => <div className="finance-learning-notice warning" key={warning}>{warning}</div>)}
      <div className="finance-learning-table-wrap"><table><thead><tr><th>Rubrica</th><th>Valor encontrado</th><th>Vigência</th><th>Confiança</th></tr></thead><tbody>
        {reviewRates.map((item) => <tr key={item.key + '-' + item.effectiveFrom}><td>{item.label}</td><td>{money(item.value, item.currency)} / {item.unit}</td><td>{item.effectiveFrom || 'Revisar'} até {item.effectiveTo || 'Revisar'}</td><td>{item.valueOrigin === 'derived' ? 'Derivado — não aplicado' : item.confidence === 'high' ? 'Alta' : item.confidence === 'medium' ? 'Conferir' : 'Revisar'}</td></tr>)}
      </tbody></table></div>
      <label><input type="checkbox" checked={sourceConfirmed} onChange={event => setSourceConfirmed(event.target.checked)}/> Conferi que o documento pertence a esta conta e que as tarifas e o período estão corretos.</label>
      {mode === 'payroll' && <label><input type="checkbox" checked={cycleConfirmed} onChange={event => setCycleConfirmed(event.target.checked)}/> Confirmo para esta conta: fixos do mês da folha, variáveis do mês anterior e crédito esperado no mês seguinte. Orientação empresarial fornecida pelo usuário; a data exata depende do calendário/documento.</label>}
      <p>Confirmar tarifa não confirma recebimento bancário. A aplicação fica limitada ao período do documento nesta conta.</p>
      <div className="finance-learning-actions"><button type="button" onClick={() => setResult(null)}><X size={16}/>Descartar</button><button type="button" className="primary" disabled={!sourceConfirmed || (mode === 'payroll' && !cycleConfirmed) || !result.rates.length || result.warnings.some((item) => item.includes('obrigatória'))} onClick={confirm}><Check size={16}/>Confirmar valores</button></div>
    </div>}

    <details className="finance-learning-history" open={visibleRates.length > 0}>
      <summary><History size={16}/> Histórico de tarifas revisadas ({visibleRates.length})</summary>
      {visibleRates.length ? <div className="finance-learning-table-wrap"><table><thead><tr><th>Rubrica</th><th>Valor</th><th>Período</th><th>Origem</th></tr></thead><tbody>
        {visibleRates.map((item) => <tr key={item.key + '-' + item.effectiveFrom + '-' + item.sourceFingerprint}><td>{item.label}</td><td>{money(item.value, item.currency)}</td><td>{item.effectiveFrom} até {item.effectiveTo} · revisão {item.revision || 1}</td><td>{item.sourceDocument}</td></tr>)}
      </tbody></table></div> : <p>Nenhuma tarifa revisada nesta conta. Valores legados sem owner não são aplicados.</p>}
    </details>
  </section>;
}
