import { useEffect, useId, useState } from 'react';
import {
  getCrewCheckNotificationSound, NOTIFICATION_SOUND_KEY, previewCrewCheckNotificationSound,
  setCrewCheckNotificationSound, stopCrewCheckNotificationSound, subscribeSoundPreview,
  type NotificationSound, type SoundPreviewState,
} from './pulseSound';
import './notification-sound.css';

export default function NotificationSoundSetting() {
  const id = useId();
  const [sound, setSound] = useState(getCrewCheckNotificationSound);
  const [state, setState] = useState<SoundPreviewState>('idle');
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    const unsubscribe = subscribeSoundPreview(setState);
    const sync = (event: StorageEvent) => {
      if (event.key === NOTIFICATION_SOUND_KEY || event.key === null) setSound(getCrewCheckNotificationSound());
    };
    window.addEventListener('storage', sync);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', sync);
      stopCrewCheckNotificationSound(true);
    };
  }, []);
  function change(value: NotificationSound) {
    const saved = setCrewCheckNotificationSound(value);
    setSaveError(!saved);
    setSound(getCrewCheckNotificationSound());
  }
  return <section className="cz-toolbox cc-notification-sound" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Som dos avisos no app</h3>
    <p id={`${id}-detail`}>Opcional neste navegador, com o app aberto e em foco. O som das notificações do aparelho continua sendo definido pelo sistema.</p>
    <div className="cz-tool-actions cc-notification-sound-controls">
      <label htmlFor={`${id}-select`}>Som de notificação
        <select id={`${id}-select`} value={sound} aria-describedby={`${id}-detail`} onChange={(event) => change(event.target.value as NotificationSound)}>
          <option value="off">Sem som adicional (padrão)</option>
          <option value="a320-interphone">Interfone A320 · gravação CC0</option>
        </select>
      </label>
      <button type="button" disabled={sound === 'off'} onClick={() => state === 'playing' ? stopCrewCheckNotificationSound(true) : void previewCrewCheckNotificationSound()}>
        {state === 'playing' ? 'Parar prévia' : 'Ouvir prévia'}
      </button>
    </div>
    <p className="cc-notification-sound-status" role="status" aria-live="polite">
      {saveError ? 'Não foi possível salvar a preferência neste navegador.' : state === 'error' ? 'Não foi possível tocar o som. Tente a prévia novamente e confira o áudio do navegador.' : state === 'playing' ? 'Reproduzindo a prévia. Você pode parar a qualquer momento.' : sound === 'off' ? 'Som adicional desativado.' : 'Seleção salva. Use a prévia para testar o áudio; o navegador pode limitar a reprodução.'}
    </p>
    {sound === 'a320-interphone' && <small>Gravação de interfone descrita pelo autor, Shamrock132. Inclui o clique final do telefone. <a href="https://freesound.org/people/Shamrock132/sounds/245851/" target="_blank" rel="noopener noreferrer">Fonte</a> · <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer">CC0 1.0</a>. Sem vínculo com o fabricante. Evite usar durante operações.</small>}
  </section>;
}
