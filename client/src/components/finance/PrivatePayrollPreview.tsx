import type { PayrollField, PayrollSource, PrivatePayrollExtraction } from '@/lib/privatePayrollExtraction';
import { useFinancialPrivacy } from './FinancialPrivacy';

const stateLabels = { absent: 'Não informado', zero: 'Zero explícito', candidate: 'Conferir', conflict: 'Conflito — não escolher automaticamente' };
const directions = { credit: 'Provento', debit: 'Desconto', unknown: 'Sentido não confirmado' };
const natures = { advance: 'Adiantamento', vacation: 'Férias', thirteenth: '13º salário', proportional: 'Proporcional' };
function locations(sources: PayrollSource[]) {
  return sources.map(source => `${source.origin === 'pdf-physical' ? 'Página PDF' : 'Página lógica'} ${source.page}, linha ${source.line}`).join('; ');
}

/** Ephemeral extraction only. No storage, network, adoption or monthly inference. */
export default function PrivatePayrollPreview({ extraction }: { extraction: PrivatePayrollExtraction }) {
  const privacy = useFinancialPrivacy();
  const money = (value: number) => privacy.amount(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value));
  function field<T extends string | number>(value: PayrollField<T>, monetary = false) {
    return <div><strong>{stateLabels[value.state]}</strong>
      {value.candidates.map((candidate, index) => <div key={index}>
        <span>{monetary ? money(Number(candidate.value)) : String(candidate.value)}</span>
        <small> · {locations(candidate.sources)}</small>
      </div>)}
      {value.unresolvedSources.length > 0 && <small>Origem pendente: {locations(value.unresolvedSources)}</small>}
    </div>;
  }
  return <section className="private-payroll-preview" aria-label="Prévia privada do holerite">
    <h4>Prévia privada do holerite</h4>
    <p>Leitura local para revisão. Rubricas, descontos e totais não são aplicados por esta prévia. A base mensal explícita é diferente do salário proporcional pago. Nenhum valor se torna recorrente por aparecer no documento.</p>
    <dl>
      <dt>Competência do documento</dt><dd>{field(extraction.competence)}</dd>
      <dt>Base mensal explícita</dt><dd>{field(extraction.monthlyBase, true)}</dd>
      <dt>Data de crédito indicada</dt><dd>{field(extraction.creditDate)}</dd>
    </dl>
    <p>Data impressa não confirma recebimento bancário.</p>
    <div className="finance-learning-table-wrap"><table><caption>Rubricas extraídas — todas exigem revisão</caption>
      <thead><tr><th>Rubrica</th><th>Tipo</th><th>Competência</th><th>Valor e origem</th></tr></thead>
      <tbody>{extraction.items.map((item, index) => <tr key={index}>
        <td>{privacy.text(item.label)}</td>
        <td>{directions[item.direction]}{item.nature ? ` · ${natures[item.nature]}` : ''}</td>
        <td>{item.competence || 'Não informada'}</td><td>{field(item.amount, true)}</td>
      </tr>)}</tbody>
    </table></div>
    {!extraction.items.length && <p>Nenhuma rubrica extraída com estrutura suficiente.</p>}
    <dl>
      <dt>Total de proventos impresso</dt><dd>{field(extraction.totals.gross, true)}</dd>
      <dt>Total de descontos impresso</dt><dd>{field(extraction.totals.deductions, true)}</dd>
      <dt>Líquido impresso</dt><dd>{field(extraction.totals.net, true)}</dd>
    </dl>
    <p role="status">{extraction.reconciliation === 'balanced' ? 'Totais impressos conciliados aritmeticamente; rubricas e competência ainda exigem revisão.' : extraction.reconciliation === 'mismatch' ? 'Totais impressos divergentes — aplicação bloqueada.' : 'Conciliação indisponível — não presumir totais ou campos ausentes.'}</p>
    {extraction.incomplete && <p>Extração incompleta. Confira as páginas e os campos pendentes no PDF.</p>}
    {extraction.unresolvedSources.length > 0 && <p>Campos ou linhas pendentes: {locations(extraction.unresolvedSources)}</p>}
    <p>Somente base e tarifas impressas elegíveis entram na confirmação abaixo, após revisão da conta e do ciclo. Fixos permanecem na competência do holerite; variáveis só seguem o ciclo empresarial confirmado. Não há aplicação em outros meses por recorrência presumida.</p>
  </section>;
}
