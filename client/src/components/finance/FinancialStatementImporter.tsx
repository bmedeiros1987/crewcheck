import { useMemo, useRef, useState } from 'react';
import { Check, FileSearch, History, ShieldCheck, Upload, X } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  learnFinancialStatement,
  mergeConfirmedRates,
  readConfirmedFinancialRates,
  saveConfirmedFinancialRates,
  type LearnedRate,
  type StatementLearningResult,
} from '@/lib/financialStatementLearning';

async function extractPdfText(file: File): Promise<string> {
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
  const [result, setResult] = useState<StatementLearningResult | null>(null);
  const [rates, setRates] = useState<LearnedRate[]>(readConfirmedFinancialRates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visibleRates = useMemo(
    () => rates.filter((item) => mode === 'per_diem' ? item.key.startsWith('per_diem.') : item.key.startsWith('salary.')),
    [rates, mode]
  );
  const label = mode === 'per_diem' ? 'demonstrativo de diárias' : 'demonstrativo de pagamento';

  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const learned = learnFinancialStatement(await extractPdfText(file), file.name);
      if (learned.kind !== mode) {
        throw new Error(mode === 'per_diem' ? 'Escolha um demonstrativo de diárias.' : 'Escolha um demonstrativo de pagamento.');
      }
      setResult(learned);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível analisar este documento.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function confirm() {
    if (!result) return;
    const confirmed = result.rates.map((item) => ({ ...item, confirmed: true }));
    const next = mergeConfirmedRates(rates, confirmed);
    saveConfirmedFinancialRates(next);
    setRates(next);
    setResult(null);
    window.dispatchEvent(new CustomEvent('crewcheck:finance-calibrated', { detail: { mode, count: confirmed.length } }));
  }

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

    <div className="finance-learning-notice success"><ShieldCheck size={17}/><span>O texto integral, dados bancários e identificadores do documento não são armazenados.</span></div>
    {error && <div className="finance-learning-notice danger" role="alert"><X size={17}/><span>{error}</span></div>}

    {result && <div className="finance-learning-review" aria-live="polite">
      <header><div><small>Revisão obrigatória</small><h3>{result.competence || 'Competência não identificada'}</h3></div></header>
      {result.warnings.map((warning) => <div className="finance-learning-notice warning" key={warning}>{warning}</div>)}
      <div className="finance-learning-table-wrap"><table><thead><tr><th>Rubrica</th><th>Valor encontrado</th><th>Vigência</th><th>Confiança</th></tr></thead><tbody>
        {result.rates.map((item) => <tr key={item.key + '-' + item.effectiveFrom}><td>{item.label}</td><td>{money(item.value, item.currency)} / {item.unit}</td><td>{item.effectiveFrom || 'Revisar'}</td><td>{item.confidence === 'high' ? 'Alta' : item.confidence === 'medium' ? 'Conferir' : 'Revisar'}</td></tr>)}
      </tbody></table></div>
      <div className="finance-learning-actions"><button type="button" onClick={() => setResult(null)}><X size={16}/>Descartar</button><button type="button" className="primary" disabled={!result.rates.length || result.warnings.some((item) => item.includes('obrigatória'))} onClick={confirm}><Check size={16}/>Confirmar valores</button></div>
    </div>}

    <details className="finance-learning-history" open={visibleRates.length > 0}>
      <summary><History size={16}/> Histórico confirmado ({visibleRates.length})</summary>
      {visibleRates.length ? <div className="finance-learning-table-wrap"><table><thead><tr><th>Rubrica</th><th>Valor</th><th>Desde</th><th>Origem</th></tr></thead><tbody>
        {visibleRates.map((item) => <tr key={item.key + '-' + item.effectiveFrom + '-' + item.sourceFingerprint}><td>{item.label}</td><td>{money(item.value, item.currency)}</td><td>{item.effectiveFrom}</td><td>{item.sourceDocument}</td></tr>)}
      </tbody></table></div> : <p>Nenhum valor confirmado neste dispositivo.</p>}
    </details>
  </section>;
}
