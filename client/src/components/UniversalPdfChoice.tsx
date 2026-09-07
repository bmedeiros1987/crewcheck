import { useEffect, useRef } from 'react';
import type { PdfDestination } from '@/lib/universalPdfIntake';

export default function UniversalPdfChoice({ file, onChoose }: {
  file: File; onChoose: (destination: Exclude<PdfDestination, 'choose'> | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="cc-pdf-choice" aria-labelledby="pdf-choice-title" onCancel={(event) => { event.preventDefault(); onChoose(null); }}>
    <h2 id="pdf-choice-title">Onde importar este PDF?</h2>
    <p>{file.name}</p>
    <p>Não foi possível identificar o destino com segurança. Escolha para revisar o documento.</p>
    <button onClick={() => onChoose('roster')}>CrewCheck Roster Import — Escala</button>
    <button onClick={() => onChoose('wallet')}>Crew Wallet — Documentos</button>
    <button autoFocus onClick={() => onChoose(null)}>Cancelar</button>
  </dialog>;
}
