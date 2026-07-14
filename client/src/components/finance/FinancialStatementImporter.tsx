import { useMemo, useRef, useState } from 'react';
import { Check, FileSearch, History, ShieldCheck, Upload, X } from 'lucide-react';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  learnFinancialStatement,
  mergeConfirmedRates,
  type LearnedRate,
  type StatementLearningResult,
} from '@/lib/financialStatementLearning';

const STORAGE_KEY = 'crewcheck_financial_learned_rates_v1';

function readRates(): LearnedRate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

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
  const [rates, setRates] = useState<LearnedRate[]>(readRates);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const visibleRates = useMemo(() => rates.filter((item) => mode === 'per_diem' ? item.key.startsWith('per_diem.') : item.key.startsWith('salary.')), [rates, mode]);

  async function importFile(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    try {
      const learned = learnFinancialStatement(await extractPdfText(file), file.name);
      if (learned.kind !== mode) throw new Error(mode === 'per_diem' ? 'Escolha um demonstrativo de diárias.' : 'Escolha um demonstrativo de pagamento.');
      setResult(learned);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível analisar este documento.');
    } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  function confirm() {
    if (!result) return;
    const confirmed = result.rates.map((item) => ({ ...item, confirmed: true }));
    const next = mergeConfirmedRates(rates, confirmed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setRates(next); setResult(null);
  }

  return <section className="zero-panel finance-learning-panel" aria-label="Importar demonstrativo financeiro">
    <div className="zero-section-heading">
      <div>
        <span className="zero-eyebrow"><FileSearch size={15}/> Valores reais por competência</span>
        <h2>Importar demonstrativo</h2>
        <p>O CrewCheck compara as tarifas encontradas e só aprende depois da sua confirmação.</p>
      </div>
      <button className="zero-primary-button" type="button" onClick={() => input.current?.click()} disabled={busy}>
        <Upload size={17}/>{busy ? 'Analisando…' : 'Selecionar PDF'}
      </button>
      <input ref={input} hidden type="file" accept="application/pdf,.pdf" onChange={(event) => importFile(event.target.files?.[0])}/>
    </div>

    <div className="zero-notice success"><ShieldCheck size={17}/> O texto integral, dados bancários e identificadores do documento não são guardados.</div>
    {error && <div className="zero-notice danger"><X size={17}/>{error}</div>}

    {result && <div className="finance-learning-review">
      <div className="zero-section-heading"><div><span className="zero-eyebrow">Revisão obrigatória</span><h3>{result.competence || 'Competência não identificada'}</h3></div></div>
      {result.warnings.map((warning) => <div className="zero-notice warning" key={warning}>{warning}</div>)}
      <div className="zero-table-wrap"><table className="zero-table"><thead><tr><th>Rubrica</th><th>Valor encontrado</th><th>Vigência</th><th>Confiança</th></tr></thead><tbody>
        {result.rates.map((item) => <tr key={`${item.key}-${item.effectiveFrom}`}><td>{item.label}</td><td>{money(item.value, item.currency)} / {item.unit}</td><td>{item.effectiveFrom || 'Revisar'}</td><td>{item.confidence === 'high' ? 'Alta' : item.confidence === 'medium' ? 'Conferir' : 'Revisar'}</td></tr>)}
      </tbody></table></div>
      <div className="zero-actions"><button type="button" className="zero-secondary-button" onClick={() => setResult(null)}><X size={16}/>Descartar</button><button type="button" className="zero-primary-button" disabled={!result.rates.length || result.warnings.some((item) => item.includes('obrigatória'))} onClick={confirm}><Check size={16}/>Confirmar valores</button></div>
    </div>}

    <details className="zero-details" open={visibleRates.length > 0}>
      <summary><History size={16}/> Histórico aprendido ({visibleRates.length})</summary>
      {visibleRates.length ? <div className="zero-table-wrap"><table className="zero-table"><thead><tr><th>Rubrica</th><th>Valor</th><th>Desde</th><th>Origem</th></tr></thead><tbody>
        {visibleRates.map((item) => <tr key={`${item.key}-${item.effectiveFrom}-${item.sourceFingerprint}`}><td>{item.label}</td><td>{money(item.value, item.currency)}</td><td>{item.effectiveFrom}</td><td>{item.sourceDocument}</td></tr>)}
      </tbody></table></div> : <p>Nenhum valor confirmado neste dispositivo.</p>}
    </details>
  </section>;
}
