import { useEffect, useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { isAuthenticated } from '../lib/authClient';
import { acceptCurrentTerms, getCurrentTerms, type CrewCheckTerms } from '../lib/termsClient';

export default function TermsGate({ children }: { children: ReactNode }) {
  const [terms, setTerms] = useState<CrewCheckTerms | null>(null);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) { setReady(true); return; }
    getCurrentTerms()
      .then((current) => {
        if (current && !current.accepted) setTerms(current);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  async function accept() {
    if (!terms || !checked) return;
    setBusy(true);
    try {
      await acceptCurrentTerms(terms);
      setTerms(null);
      toast.success('Termos aceitos. Obrigado por cuidar do CrewCheck com a gente.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar o aceite.');
      getCurrentTerms().then((current) => current && setTerms(current)).catch(() => undefined);
    } finally { setBusy(false); }
  }

  if (!ready) return null;
  return <>{children}{terms && <div className="cc-terms-gate" role="dialog" aria-modal="true" aria-labelledby="cc-terms-title">
    <section className="cc-terms-dialog">
      <header><ShieldCheck/><h1 id="cc-terms-title">{terms.title}</h1><p>Versão {terms.version}. Alterações materiais pedem um novo aceite.</p></header>
      <div className="cc-terms-copy">{terms.body}</div>
      <footer><label><input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)}/><span>Li e aceito os Termos de Uso e a Política de Privacidade desta versão.</span></label><button disabled={!checked || busy} onClick={accept}>{busy ? 'Registrando aceite...' : 'Aceitar e continuar'}</button></footer>
    </section>
  </div>}</>;
}
