import { useEffect, useRef, useState } from 'react';
import { consultPublicationChange } from '@/lib/rosterPublicationRuntime';
import type { Change } from '@/lib/rosterPublicationReview';
const labels: Record<string,string> = {kind:'Atividade',date:'Data publicada',code:'Código',origin:'Origem',destination:'Destino',presentation:'Apresentação',departure:'Partida',arrival:'Chegada',start:'Início da atividade',end:'Fim da atividade',nextDay:'Virada de dia',workType:'Tipo de trabalho',dayType:'Tipo do dia',pairing:'Pairing',hotel:'Hotel publicado'};
export function PublicationChangeDetail({ change, owner }: {change:Change;owner:string}) {
  const [status,setStatus] = useState('');
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (change.seen) return;
    let active = true, visible = false, pending = false;
    const consult = async () => {
      if (!active || !visible || pending || document.visibilityState !== 'visible') return;
      pending = true;
      const saved = await consultPublicationChange(owner, change.id, change.version);
      if (active) setStatus(saved ? 'Leitura salva.' : 'Não foi possível salvar a leitura. A alteração continua pendente.');
    };
    const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5); if (visible) requestAnimationFrame(() => { void consult(); }); }, { threshold: 0.5 });
    if (ref.current) observer.observe(ref.current);
    document.addEventListener('visibilitychange', consult);
    return () => { active = false; observer.disconnect(); document.removeEventListener('visibilitychange', consult); };
  }, [owner, change.id, change.version, change.seen]);
  const fields = Object.keys(labels).filter(key=>change.before?.[key] !== change.after?.[key] && (change.before?.[key] || change.after?.[key]));
  return <section ref={ref} className="cc-publication-change" aria-label={`Alteração ${change.id}, versão local ${change.version}`}>
    <h3>{change.kind === 'removed' ? 'Programação removida' : change.kind === 'added' ? 'Programação incluída' : 'O que mudou'} · versão local {change.version}</h3>
    <dl>{fields.map(key=><div key={key}><dt>{labels[key]}</dt><dd><span>Antes: {change.before?.[key] || 'Não informado'}</span><span>Agora: <u>{change.after?.[key] || 'Não informado'}</u></span></dd></div>)}</dl>
    <p>Leitura pessoal desta alteração. Não representa aceite da companhia.</p>
    {change.seen ? <strong>Alteração vista</strong> : <span>Leitura registrada ao consultar este detalhe.</span>}
    <span role="status">{status}</span>
  </section>;
}
