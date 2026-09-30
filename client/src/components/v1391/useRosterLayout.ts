import { useEffect, useState } from 'react';
import { getStoredUser } from '@/lib/authClient';
import { readRosterLayout, saveRosterLayout, type RosterLayout } from '@/lib/rosterLayoutPreference';

function accountId() {
  try { return getStoredUser()?.id || null; } catch { return null; }
}
function load(owner: string | null): RosterLayout {
  try { return readRosterLayout(window.localStorage, owner); } catch { return 'cards'; }
}

export function useRosterLayout() {
  const owner = accountId();
  const [selection, setSelection] = useState(() => ({ owner, layout: load(owner) }));
  const [message, setMessage] = useState('');
  const layout = selection.owner === owner ? selection.layout : load(owner);
  useEffect(() => {
    const refresh = () => {
      const nextOwner = accountId();
      setSelection({ owner: nextOwner, layout: load(nextOwner) });
      setMessage('');
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('crewcheck:auth-expired', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('crewcheck:auth-expired', refresh);
    };
  }, [owner]);
  function choose(next: RosterLayout) {
    const currentOwner = accountId();
    let saved = false;
    try { saved = saveRosterLayout(window.localStorage, currentOwner, next); } catch {}
    setSelection({ owner: currentOwner, layout: next });
    setMessage(saved ? 'Visualização salva nesta conta, neste dispositivo.' : 'Visualização aplicada nesta sessão. Não foi possível salvar.');
  }
  return { layout, choose, message: selection.owner === owner ? message : '' };
}
