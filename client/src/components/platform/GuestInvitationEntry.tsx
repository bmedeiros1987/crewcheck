import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Navigation only; both entries use the existing invitation and permissions. */
export default function GuestInvitationEntry({ children, busy }: { children: ReactNode; busy: boolean }) {
  const [entry, setEntry] = useState<'family' | 'colleague' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const familyButton = useRef<HTMLButtonElement>(null);
  const colleagueButton = useRef<HTMLButtonElement>(null);
  const lastEntry = useRef<'family' | 'colleague'>('family');
  const focusRequested = useRef(false);
  useEffect(() => {
    if (!focusRequested.current) return;
    focusRequested.current = false;
    (entry ? heading.current : lastEntry.current === 'family' ? familyButton.current : colleagueButton.current)?.focus();
  }, [entry]);
  function open(next: 'family' | 'colleague') {
    lastEntry.current = next;
    focusRequested.current = true;
    setEntry(next);
  }
  function back() {
    focusRequested.current = true;
    setEntry(null);
  }
  return <section aria-labelledby="guest-entry-title">
    <h2 id="guest-entry-title">Convidados</h2>
    {entry === null ? <div className="cp-actions">
      <button ref={familyButton} type="button" onClick={() => open('family')} disabled={busy}>Familiar</button>
      <button ref={colleagueButton} type="button" onClick={() => open('colleague')} disabled={busy}>Colega</button>
    </div> : <>
      <button type="button" onClick={back} disabled={busy}>Voltar aos convidados</button>
      <h3 ref={heading} tabIndex={-1}>{entry === 'family' ? 'Convidar familiar' : 'Convidar colega'}</h3>
      <p>Revise as permissões abaixo antes de enviar o convite. Os dois acessos seguem os mesmos limites do seu plano.</p>
      {children}
    </>}
  </section>;
}
