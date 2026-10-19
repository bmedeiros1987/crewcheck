import {WAKE_CLOCK_AVAILABILITY,wakeCycleLabels} from '../../../../shared/wakeupCycle.mjs';

export function WakeClockOptions({messageSelected,messageAvailable,onMessageChange,busy,planned,cycle}:{messageSelected:boolean;messageAvailable:boolean;onMessageChange:(selected:boolean)=>void;busy:boolean;planned:Date|null;cycle?:any}) {
  // These capabilities remain hard OFF until the APK and server adapters are independently reviewed.
  const capabilities=WAKE_CLOCK_AVAILABILITY;
  const deadline=planned&&Number.isFinite(planned.getTime())?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(planned.getTime()+300000)):'horário ainda não definido';
  const labels=cycle?wakeCycleLabels(cycle):null;
  return <section className="cc-wake-clock-options" aria-label="Como despertar">
    <h2>Como despertar</h2>
    <label><input type="checkbox" checked={false} disabled={!capabilities.localAlarm} readOnly/>Tocar no celular</label>
    <p>Precisa da integração de alarme em uma atualização do app Android. Ainda não disponível nesta versão.</p>
    <fieldset><legend>Se eu não confirmar que acordei</legend>
      <label><input type="checkbox" checked={false} disabled={!capabilities.fallbackCall} readOnly/>Ligar se não recebermos sua confirmação até {deadline}</label>
      <p>Prévia de uma janela de 5 minutos; fallback automático ainda não habilitado. Uma confirmação feita offline precisa chegar ao servidor; dispensar o alarme não confirma que você acordou.</p>
    </fieldset>
    <fieldset><legend>Direto no horário</legend>
      <label><input type="checkbox" checked={false} disabled={!capabilities.directCall} readOnly/>Ligar no horário</label>
      <p>O teste manual de ligação é separado. O agendamento automático de ligação ainda não está liberado nesta tela.</p>
      <label><input type="checkbox" checked={messageSelected} disabled={!messageAvailable||busy} onChange={event=>onMessageChange(event.target.checked)}/>Mandar mensagem no horário</label>
      <p>Mensagem Telegram, conforme o canal confirmado abaixo. Marcar não agenda nem envia nada.</p>
    </fieldset>
    <details><summary>Quando o alarme tocar</summary>
      <p>Soneca adia o toque. Dispensar silencia este toque. Já acordei é uma confirmação explícita separada.</p>
      <div className="cz-tool-actions"><button type="button" disabled={!capabilities.localAlarm}>Soneca</button><button type="button" disabled={!capabilities.localAlarm}>Dispensar</button><button type="button" disabled={!capabilities.awakeConfirmation}>Já acordei</button></div>
      <p>Ações do alarme local ainda indisponíveis nesta versão. Nenhuma confirmação é gerada só por abrir a tela ou fechar o alarme de outro app.</p>
    </details>
    {labels&&<p role="status">{labels.awake==='confirmed'?'Confirmação recebida pelo servidor.':labels.awake==='local_pending_server'?'Já acordei registrado neste aparelho; confirmação pendente no servidor.':'Sem confirmação de acordado.'}{cycle.effects.fallbackCall.status==='dispatching'?' A ligação já pode estar em andamento; uma confirmação tardia não a recolhe.':''}</p>}
  </section>;
}
