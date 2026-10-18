type Host = { setNotificationCancellationScope?(hint: string): boolean };
type Environment = { target: EventTarget; identity(): string; host(): Host | undefined };
/** A hint can only invalidate pending reminders. It never authenticates native authority. */
export function installNativeNotificationCancellation(env: Environment) {
  let current: string | undefined;
  const synchronize = (hint: string) => {
    try {
      const host = env.host();
      if (!host?.setNotificationCancellationScope) return;
      const confirmed = host.setNotificationCancellationScope(hint) === true;
      if (confirmed) current = hint;
      else current = undefined;
      env.target.dispatchEvent(new CustomEvent('crewcheck:native-reminder-fence', { detail: { confirmed } }));
    } catch { current = undefined; }
  };
  const revoke = () => synchronize('');
  const changed = () => { const next = env.identity(); if (next !== current) synchronize(next); };
  const storage = (event: Event) => { const key = (event as StorageEvent).key; if (key === null || ['crewcheck_auth_user', 'crewcheck_auth_token'].includes(key)) changed(); };
  env.target.addEventListener('crewcheck:auth-will-change', revoke);
  env.target.addEventListener('crewcheck:auth-expired', revoke);
  env.target.addEventListener('crewcheck:auth-changed', changed);
  env.target.addEventListener('storage', storage);
  env.target.addEventListener('crewcheck:native-ready', changed);
  env.target.addEventListener('focus', changed);
  env.target.addEventListener('pagehide', changed);
  changed();
  return () => {
    env.target.removeEventListener('crewcheck:auth-will-change', revoke);
    env.target.removeEventListener('crewcheck:auth-expired', revoke);
    env.target.removeEventListener('crewcheck:auth-changed', changed);
    env.target.removeEventListener('storage', storage);
    env.target.removeEventListener('crewcheck:native-ready', changed);
    env.target.removeEventListener('focus', changed);
    env.target.removeEventListener('pagehide', changed);
  };
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') installNativeNotificationCancellation({ target: window,
  identity: () => { try { return localStorage.getItem('crewcheck_auth_token') ? String(JSON.parse(localStorage.getItem('crewcheck_auth_user') || '{}').id || '') : ''; } catch { return ''; } },
  host: () => (window as unknown as { AndroidCrewCheckNative?: Host }).AndroidCrewCheckNative,
});
