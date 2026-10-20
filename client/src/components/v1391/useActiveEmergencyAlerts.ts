import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredUser, getToken } from '@/lib/authClient';
import { v139Api } from '@/components/v139/api';

export type ActiveEmergencyAlert = {
  alertId: string;
  kind: string;
  createdAt: string;
  sent: number;
  failed: number;
  recipients: Array<{ name: string; source: string; ok: boolean }>;
};

export function emergencyAccountScope() {
  const token = getToken();
  if (!token) return '';
  const user = getStoredUser();
  return JSON.stringify([token, user?.id, user?.email]);
}

export async function loadActiveEmergencyAlerts() {
  const token = getToken();
  if (!token) throw new Error('Entre novamente para carregar os alertas ativos.');
  const payload = await v139Api('/api/platform/emergency/active', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (payload?.ok !== true || !Array.isArray(payload.alerts)) throw new Error('Resposta de alertas indisponível.');
  return payload.alerts as ActiveEmergencyAlert[];
}

export function useActiveEmergencyAlerts() {
  const [revision, setRevision] = useState(0);
  const scope = emergencyAccountScope();
  const sequence = useRef(0);
  const [state, setState] = useState({ scope, alerts: [] as ActiveEmergencyAlert[], loading: true, error: '' });
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setState({ scope, alerts: [], loading: true, error: '' });
    try {
      const alerts = await loadActiveEmergencyAlerts();
      if (request === sequence.current && scope === emergencyAccountScope()) setState({ scope, alerts, loading: false, error: '' });
    } catch {
      if (request === sequence.current && scope === emergencyAccountScope()) setState({ scope, alerts: [], loading: false, error: 'Não consegui carregar os alertas ativos. Tente novamente.' });
    }
  }, [scope]);
  useEffect(() => {
    void refresh();
    const reset = () => { ++sequence.current; setState({ scope: '', alerts: [], loading: true, error: '' }); setRevision(value => value + 1); };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'crewcheck_auth_user' || event.key === 'crewcheck_auth_token') reset();
    };
    window.addEventListener('storage', storage);
    window.addEventListener('crewcheck:auth-expired', reset);
    window.addEventListener('focus', reset);
    return () => {
      ++sequence.current;
      window.removeEventListener('storage', storage);
      window.removeEventListener('crewcheck:auth-expired', reset);
      window.removeEventListener('focus', reset);
    };
  }, [refresh, revision]);
  const current = state.scope === scope;
  return { scope, alerts: current ? state.alerts : [], loading: !current || state.loading, error: current ? state.error : '', refresh };
}
