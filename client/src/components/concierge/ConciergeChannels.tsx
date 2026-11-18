import {openNotificationSettings} from '@/lib/notificationNavigation';
import './concierge-channels.css';

// Navigation only. Linking, status and consent keep their existing owner.
export function ConciergeChannels(){
  return <section id="cc-concierge-channels" className="cc-concierge-channels" aria-labelledby="cc-concierge-channels-title">
    <h2 id="cc-concierge-channels-title">WhatsApp e Telegram</h2>
    <p>Vincule seus canais ou confira uma ligação existente. Os códigos, o status e as preferências continuam na mesma central.</p>
    <button type="button" onClick={()=>openNotificationSettings('channels')}>Abrir vínculos de WhatsApp e Telegram</button>
    <ol>
      <li>Abra os vínculos e confira o status do canal desejado.</li>
      <li>Se já estiver vinculado, não é necessário gerar outro código.</li>
      <li>Se precisar vincular e a opção estiver disponível, gere o código e siga as instruções no seu WhatsApp ou Telegram. Depois confira o status novamente.</li>
    </ol>
    <p className="cc-concierge-channels-note">Vincular não ativa avisos nem confirma entrega. Um canal indisponível pode ser consultado novamente quando estiver liberado.</p>
  </section>;
}
