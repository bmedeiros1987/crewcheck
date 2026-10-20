import HomeFinancialEstimate from './HomeFinancialEstimate';
import './persistent-history.css';
import { BriefcaseBusiness, ChevronRight, Wallet } from 'lucide-react';
import './payment-preview.css';

// Navigation only: payment amounts and eligibility remain in the financial read model.
export default function HomeFinancialCard({ onNavigate }: { onNavigate: (view: 'perdiem' | 'salary') => void }) {
  return <section className="cc-home-finance" aria-label="Seu financeiro">
    <header><span>SEU FINANCEIRO</span><h2>Próximo pagamento</h2><p>Confira o ciclo, a composição e o que falta revisar.</p></header>
    <HomeFinancialEstimate/>
    <div className="cc-home-finance-links">
      <button type="button" onClick={() => onNavigate('perdiem')}><BriefcaseBusiness aria-hidden="true"/><span>Diárias<small>Previsão por moeda</small></span><ChevronRight aria-hidden="true"/></button>
      <button type="button" onClick={() => onNavigate('salary')}><Wallet aria-hidden="true"/><span>Salário<small>Estimativa antes dos descontos</small></span><ChevronRight aria-hidden="true"/></button>
    </div>
  </section>;
}
