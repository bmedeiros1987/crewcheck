import { useEffect, useRef, useState } from 'react';
import { parseStayScreenshot, type StayScreenshotValues } from '@shared/stay-screenshot-candidates.mjs';
import { startStayScreenshotOcr } from '@/lib/stayScreenshotOcr';

type Group = 'hotel' | 'apz' | 'transport';
const fields: Record<Group, (keyof StayScreenshotValues)[]> = {
  hotel: ['hotelName'], apz: ['apzTime', 'apzDate', 'apzTimeZone'],
  transport: ['transportProvider', 'transportLocation', 'pickupDate', 'pickupTime', 'pickupTimeZone'],
};
const labels: Record<keyof StayScreenshotValues, string> = {
  hotelName: 'Hotel no print', apzTime: 'APZ no print', apzDate: 'Data da APZ no print', apzTimeZone: 'Fuso IANA da APZ no print',
  transportProvider: 'Empresa de transporte no print', transportLocation: 'Local de pickup no print', pickupDate: 'Data de pickup no print', pickupTime: 'Horário de pickup no print', pickupTimeZone: 'Fuso IANA de pickup no print',
};
const empty = () => Object.fromEntries(Object.keys(labels).map(key => [key, ''])) as StayScreenshotValues;

/** All source pixels, text and evidence stay in this mounted review, never storage. */
export default function StayScreenshotReview({ targetLabel, currentValues, isCurrent, onApply }: {
  targetLabel: string; currentValues: StayScreenshotValues; isCurrent: () => boolean;
  onApply: (values: Partial<StayScreenshotValues>, baseline: StayScreenshotValues) => boolean;
}) {
  const [open, setOpen] = useState(false), [phase, setPhase] = useState<'idle' | 'reading' | 'review'>('idle');
  const [message, setMessage] = useState(''), [preview, setPreview] = useState('');
  const [values, setValues] = useState(empty), [chosen, setChosen] = useState<Record<Group, boolean>>({hotel:false,apz:false,transport:false});
  const [warnings, setWarnings] = useState<string[]>([]);
  const baseline = useRef(empty()), generation = useRef(0), alive = useRef(true);
  const operation = useRef<ReturnType<typeof startStayScreenshotOcr> | null>(null), url = useRef('');
  const current = useRef({isCurrent,currentValues}); current.current = {isCurrent,currentValues};
  const native = Boolean((window as any).AndroidCrewCheckNative || (window as any).CrewCheckNative || (window as any).Capacitor?.isNativePlatform?.());
  function release() {
    generation.current++; operation.current?.cancel(); operation.current = null;
    if (url.current) URL.revokeObjectURL(url.current); url.current = '';
  }
  function discard(close = true) {
    release(); setPreview(''); setValues(empty()); setChosen({hotel:false,apz:false,transport:false}); setWarnings([]); setPhase('idle'); setMessage('');
    if(close) setOpen(false);
  }
  useEffect(() => {
    alive.current = true;
    const clear = () => discard();
    const storage = (event: StorageEvent) => { if (!event.key || ['crewcheck_auth_token','crewcheck_auth_user'].includes(event.key)) clear(); };
    window.addEventListener('crewcheck:auth-changed',clear); window.addEventListener('crewcheck:auth-expired',clear); window.addEventListener('storage',storage); window.addEventListener('pagehide',clear);
    return () => { alive.current = false; release(); window.removeEventListener('crewcheck:auth-changed',clear); window.removeEventListener('crewcheck:auth-expired',clear); window.removeEventListener('storage',storage); window.removeEventListener('pagehide',clear); };
  }, []);
  async function choose(file?: File) {
    discard(false); if(!file || !current.current.isCurrent()) return;
    baseline.current = {...current.current.currentValues}; setPhase('reading');
    const id = generation.current;
    try {
      const job = startStayScreenshotOcr(file); operation.current = job;
      const result = await job.promise;
      if (!alive.current || generation.current !== id || !current.current.isCurrent()) return;
      // The engine has validated type, signature and decoded dimensions before this URL exists.
      url.current = URL.createObjectURL(file); setPreview(url.current);
      const parsed = parseStayScreenshot(result.text, result.confidence);
      setValues(parsed.values); setWarnings(parsed.warnings); setPhase('review');
    } catch {
      if(alive.current && generation.current === id && current.current.isCurrent()) { setPhase('idle'); setMessage('Não foi possível ler este print. Use PNG, JPEG ou WebP legível, até 10 MB e 12 milhões de pixels, ou preencha manualmente.'); }
    } finally { if(generation.current === id) { operation.current?.cancel(); operation.current = null; } }
  }
  const conflict = (group: Group) => fields[group].some(key => currentValues[key] !== baseline.current[key]);
  function apply() {
    if(phase !== 'review' || !current.current.isCurrent()) return discard();
    const selected: Partial<StayScreenshotValues> = {};
    for(const group of Object.keys(fields) as Group[]) if(chosen[group] && !conflict(group)) for(const key of fields[group]) selected[key] = values[key];
    if(!Object.keys(selected).length) return setMessage('Selecione os campos que deseja usar.');
    if(onApply(selected,{...baseline.current})) discard();
    else setMessage('Revise os campos selecionados. Horários e datas precisam ser válidos; o fuso deve ser IANA ou ficar vazio.');
  }
  if(native) return <p className="cc-stay-screenshot-availability">Importar print está disponível no navegador/PWA. O seletor do app Android ainda não aceita imagens.</p>;
  return <section className="cc-stay-screenshot" aria-label="Importação opcional de print">
    {!open ? <button type="button" onClick={() => { if(isCurrent()) setOpen(true); }}>Importar print</button> : <>
      <h3>Revisar print · {targetLabel}</h3>
      <p>Leitura no aparelho, sem upload. Revise antes de usar.</p>
      <p>Print não verificado pelo MyCrewCare. Escolha os campos; salve no editor.</p>
      <details><summary>Como funciona</summary>
        <p>Importar não salva, não programa despertador e não altera compartilhamento. O quarto continua manual.</p>
        <p>Campos incertos ficam vazios. Não completamos data, ano ou fuso automaticamente. Você pode cancelar sem importar.</p>
      </details>
      <label>Print de hotel ou transporte<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void choose(file); }}/></label>
      {phase === 'reading' && <p role="status">Lendo no aparelho… Na primeira vez, baixamos apenas o leitor e os modelos públicos (cerca de 7 MB). Você pode cancelar.</p>}
      {preview && <img src={preview} alt="Print selecionado para revisão local"/>}
      {phase === 'review' && <>
        {warnings.length > 0 && <p role="status">A leitura tem campos ausentes ou ambíguos. Revise a imagem e preencha somente o que conseguir confirmar.</p>}
        {(Object.keys(fields) as Group[]).map(group => <fieldset key={group}>
          <legend><label><input type="checkbox" checked={chosen[group] && !conflict(group)} disabled={conflict(group)} onChange={event => setChosen({...chosen,[group]:event.target.checked})}/>{group === 'hotel' ? 'Usar hotel' : group === 'apz' ? 'Usar APZ no hotel' : 'Usar transporte'}</label></legend>
          {conflict(group) && <p role="status">Você editou estes campos depois de escolher o print. Seus ajustes foram preservados; selecione o print de novo se quiser substituí-los.</p>}
          {fields[group].map(key => <label key={key}>{labels[key]}<input type={key.endsWith('Date') ? 'date' : key === 'apzTime' || key === 'pickupTime' ? 'time' : 'text'} value={values[key]} maxLength={key.includes('TimeZone') ? 80 : 160} onChange={event => setValues({...values,[key]:event.target.value})}/></label>)}
          {group === 'apz' && <p>APZ no hall, não pickup, check-in ou voo. Não confirmada: confirme no editor. Data/fuso vazios substituem os anteriores.</p>}
        </fieldset>)}
        <button type="button" onClick={apply}>Usar campos</button>
      </>}
      {message && <p role="alert">{message}</p>}
      <button type="button" onClick={() => discard()}>Cancelar importação</button>
    </>}
  </section>;
}
