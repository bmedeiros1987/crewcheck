import { useEffect } from 'react';
import { myCrewCareBindingKey } from '../../../../shared/myCrewCareController.mjs';
import type { MyCrewCareContext, MyCrewCarePersistedStay } from '../../../../shared/myCrewCareLogistics.mjs';
import { useMyCrewCareV3 } from '@/hooks/useMyCrewCareV3';

type Props = {
  context: MyCrewCareContext | null;
  stays: readonly MyCrewCarePersistedStay[];
};

const STATUS_TEXT: Record<string, string> = {
  connected: 'Atualizado nesta abertura do app.',
  cached: 'Mostrando dados salvos neste aparelho. Podem estar desatualizados.',
  'offline-cache': 'Sem atualização agora. Mostrando o último dado salvo.',
  'reconnect-required': 'Sessão expirada ou não confirmada. Entre novamente no MyCrewCare (SSO/MFA) para atualizar.',
  'ambiguous-data': 'Os dados recebidos não puderam ser associados com segurança a uma estadia. Nada foi alterado.',
  'sync-error': 'Não foi possível atualizar. Tente novamente com o app aberto.',
  'storage-error': 'Não foi possível ler ou salvar o cache protegido deste aparelho.',
  'cleanup-error': 'A limpeza dos dados não foi concluída. Tente desconectar novamente.',
  'invalid-context': 'Escala ainda não disponível para associar hotel e pickup.',
  syncing: 'Atualizando…',
  off: 'Desligado. Hotel e pickup continuam podendo ser informados manualmente.',
  disconnected: 'Desconectado.',
};

function age(ms: number | null) {
  if (ms === null) return null;
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `há ${hours} h` : `há ${Math.round(hours / 24)} dias`;
}

/**
 * Disabled-by-default MyCrewCare panel. It renders nothing unless the interface key and
 * the native release flag are both on (see shared/myCrewCareController.mjs). It is not
 * mounted anywhere yet: the mount in Home belongs to a separately reviewed change.
 */
export default function MyCrewCareV3Panel({ context, stays }: Props) {
  const { controller, snapshot } = useMyCrewCareV3();

  // Bind on identity changes only: a new array or object literal on every parent
  // render must not re-read the encrypted cache or re-bind the same account.
  const bindKey = myCrewCareBindingKey(context, stays);
  useEffect(() => {
    void controller.bind(context, stays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, bindKey]);

  if (snapshot.capability !== 'available') return null;
  // React renders incoming props before the binding effect. Never expose the old scope.
  if (!controller.isBoundTo(context, stays)) return null;

  const stayIds = stays.map(stay => stay.id);
  const message = STATUS_TEXT[snapshot.status] ?? STATUS_TEXT['sync-error'];
  const updated = age(snapshot.dataAgeMs);

  return <section className="cz-toolbox cc-mycrewcare" aria-labelledby="cc-mycrewcare-title">
    <h3 id="cc-mycrewcare-title">MyCrewCare</h3>
    <p role="status">{message}{updated && snapshot.hasCachedData ? ` Última atualização ${updated}.` : ''}</p>
    <p>A atualização acontece somente com o app aberto e pode exigir que você entre novamente no portal. O CrewCheck não guarda sua senha nem faz consultas em segundo plano.</p>
    {snapshot.refreshSuggested && !snapshot.busy && <p>Há dados possivelmente desatualizados. Toque em atualizar quando quiser.</p>}
    <label>
      <input
        type="checkbox"
        checked={snapshot.automatic}
        disabled={snapshot.busy || !context}
        onChange={event => controller.setAutomatic(event.target.checked)}
      /> Usar MyCrewCare para hotel e pickup
    </label>
    {snapshot.automatic && <button type="button" disabled={snapshot.busy} onClick={() => { void controller.refresh({ userInitiated: true }); }}>
      {snapshot.requiresInteraction ? 'Entrar e atualizar' : 'Atualizar agora'}
    </button>}
    {stayIds.map(id => {
      const hotel = controller.hotel(id);
      const pickup = controller.pickup(id);
      if (!hotel && !pickup) return null;
      return <article key={id} aria-label="Logística da estadia">
        {hotel && <p>Hotel: {hotel.hotelName}{hotel.dataState === 'cached' ? ' (dado salvo)' : ''}</p>}
        {pickup && <p>Pickup: {new Date(pickup.pickupAt).toLocaleString('pt-BR', { timeZone: pickup.timeZone })}{pickup.dataState === 'cached' ? ' (dado salvo)' : ''}</p>}
        <small>Fonte: MyCrewCare · observado em {new Date((pickup ?? hotel)!.observedAt).toLocaleString('pt-BR')}</small>
      </article>;
    })}
    {(snapshot.hasCachedData || snapshot.automatic || snapshot.canRetryCleanup) && <button type="button" disabled={snapshot.busy} onClick={() => { void controller.disconnect({ forgetData: true }).catch(() => undefined); }}>
      {snapshot.canRetryCleanup ? 'Tentar desconectar novamente' : 'Desconectar e apagar dados deste aparelho'}
    </button>}
  </section>;
}
