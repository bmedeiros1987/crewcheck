import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/authClient';
import { readRosterLayout, readRosterZoom, rosterLayoutKey, saveRosterLayout, type RosterLayout, type RosterZoom } from '@/lib/rosterLayoutPreference';

function accountId() {
  try { return getStoredUser()?.id || null; } catch { return null; }
}
function load(owner: string | null) {
  try { return { layout: readRosterLayout(window.localStorage, owner), zoom: readRosterZoom(window.localStorage, owner) }; } catch { return { layout: 'cards' as RosterLayout, zoom: 'month' as RosterZoom }; }
}

export function useRosterLayout() {
  const owner = accountId();
  const [selection, setSelection] = useState(() => ({ owner, ...load(owner) }));
  const [message, setMessage] = useState('');
  const { layout, zoom } = selection.owner === owner ? selection : load(owner);
  useEffect(() => {
    const refresh = () => {
      const nextOwner = accountId();
      setSelection({ owner: nextOwner, ...load(nextOwner) });
      setMessage('');
    };
    const onStorage = (event: StorageEvent) => {
      const nextOwner = accountId();
      const preferenceKey = rosterLayoutKey(nextOwner);
      // Other tabs update unrelated caches too. Keep the in-memory selection
      // unless the account, its preference, or the whole storage was reset.
      if (nextOwner !== owner || event.key === null || (preferenceKey !== null && event.key === preferenceKey)) refresh();
    };
    refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener('crewcheck:auth-expired', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('crewcheck:auth-expired', refresh);
    };
  }, [owner]);
  function choose(next: RosterLayout, nextZoom: RosterZoom = zoom) {
    const currentOwner = accountId();
    let saved = false;
    try { saved = saveRosterLayout(window.localStorage, currentOwner, next, nextZoom); } catch {}
    setSelection({ owner: currentOwner, layout: next, zoom: nextZoom });
    setMessage(saved ? 'Visualização salva nesta conta, neste dispositivo.' : 'Visualização aplicada nesta sessão. Não foi possível salvar.');
  }
  return { layout, zoom, choose, chooseZoom: (next: RosterZoom) => choose(layout, next), message: selection.owner === owner ? message : '' };
}
