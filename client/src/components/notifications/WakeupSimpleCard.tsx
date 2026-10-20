import type {ReactNode} from 'react';
import {BellOff,RefreshCw} from 'lucide-react';
import {wakeDateFields, wakeNextConfirmed} from '../../../../shared/wakeupPlan.mjs';
import './wakeup-simple.css';

type Props={
  automatic:boolean; day:string; time:string; onEdit:(patch:{automatic?:boolean;day?:string;time?:string})=>void;
  planned:Date|null; jobs:any[]; jobsState:string; now:number; reason:string; busy:boolean;
  onActivate:()=>void; onRefresh:()=>void; children:ReactNode; channelSelection?:ReactNode;
};
const names:Record<string,string>={'telegram':'Mensagem Telegram','telegram-call':'Ligação Telegram','phone-call':'Ligação telefônica'};
export function WakeupSimpleCard(props:Props) {
  const status=wakeNextConfirmed(props.jobs,props.jobsState,props.now);
  const dateLabel=(value:number)=>new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(value);
  const timeLabel=(value:number)=>new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(value);
  const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
  const titles:Record<string,string>={loading:'Consultando o servidor…',unavailable:'Estado não confirmado',scheduled:'Agendado no servidor',sending:'Envio em andamento',uncertain:'Resultado não confirmado',overdue:'Horário passou; envio não confirmado',none:'Nenhum próximo toque confirmado'};
  const fields=props.automatic?wakeDateFields(props.planned):{day:props.day,time:props.time};
  return <>
    <section className="cc-wake-next" aria-label="Próximo toque" aria-live="polite" data-state={status.kind}>
      <p className="cc-wake-eyebrow">Próximo toque · estado do servidor</p>
      <h2>{titles[status.kind]}</h2>
      {status.next && <><strong className="cc-wake-clock">{timeLabel(status.next.at)}</strong><p>{dateLabel(status.next.at)}</p><p>{status.next.channel.split('+').map((channel:string)=>names[channel]||'Canal não confirmado').join(' + ')}</p></>}
      <p>{status.kind==='scheduled'?'Entrega não confirmada.':status.kind==='none'?'Escolha o canal e agende abaixo.':'Atualize o estado antes de tentar novamente.'}</p>
    </section>
    <section className="cc-wake-editor" aria-label="Configurar despertador">
      <h2>Horário e dia</h2>
      <p className="cc-wake-fuso"><BellOff size={16} aria-hidden="true"/> Toque no celular indisponível nesta versão.</p>
      <label className="cc-wake-auto"><input type="checkbox" checked={props.automatic} disabled={props.busy} onChange={event=>props.onEdit({automatic:event.target.checked})}/><span>Usar horário da escala</span></label>
      <div className="cc-wake-fields">
        <label>Horário<input type="time" value={fields.time} disabled={props.automatic||props.busy} onChange={event=>props.onEdit({time:event.target.value})}/></label>
        <label>Dia<input type="date" value={fields.day} disabled={props.automatic||props.busy} onChange={event=>props.onEdit({day:event.target.value})}/></label>
      </div>
      <p className="cc-wake-fuso">{timezone} · uma vez na data escolhida</p>
      {props.channelSelection}
      <p className="cc-wake-draft" role="status">{props.reason || (props.planned?'Pronto · ainda não agendado.':'Confira o horário e o dia.')}</p>
      <button type="button" className="primary cc-wakeup-primary" disabled={props.busy||Boolean(props.reason)} onClick={props.onActivate}>{props.busy?'Confirmando…':'Agendar mensagem Telegram'}</button>
      <button type="button" onClick={props.onRefresh} disabled={props.busy || props.jobsState==='loading'}><RefreshCw size={16} aria-hidden="true"/> Atualizar estado</button>
    </section>
    <details className="cc-wake-more"><summary>Mais opções</summary><p>Editar preferências não altera alarmes já salvos.</p>{props.children}</details>
  </>;
}
