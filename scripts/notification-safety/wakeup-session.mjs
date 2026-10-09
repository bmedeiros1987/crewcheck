// Applied after the historical generators: guard every host callback, not just
// the readiness child. This transform is intentionally confined to WakeupView.
export function guardWakeupSession(wake) {
  if (wake.includes('const wakeSession = useRef')) return wake;
  wake = wake.replace('  const admin = isAdmin();', `  const [jobsState, setJobsState] = useState('loading');
  const wakeSession = useRef(0);
  const jobsRequest = useRef(0);
  const sameWakeSession = (version: number, owner: string) => wakeSession.current === version && getToken() === owner;
  const admin = isAdmin();`);
  const start = wake.indexOf('  async function refreshScheduledJobs()');
  const end = wake.indexOf('  function savePrefs()', start);
  if (start < 0 || end < 0) throw new Error('Wakeup session: generated host boundary missing');
  wake = wake.slice(0, start) + `  async function refreshScheduledJobs() {
    const version = wakeSession.current, owner = getToken(), request = ++jobsRequest.current;
    setScheduledJobs([]); setJobsState('loading');
    if (!owner) { setJobsState('unavailable'); return; }
    try {
      const payload = await authFetch<any>('/api/alarm/scheduled', { cache: 'no-store' });
      if (!sameWakeSession(version, owner) || jobsRequest.current !== request) return;
      if (!payload?.ok || !Array.isArray(payload.jobs)) throw new Error('Invalid job list');
      setScheduledJobs(payload.jobs); setJobsState('ready');
    } catch {
      if (!sameWakeSession(version, owner) || jobsRequest.current !== request) return;
      setScheduledJobs([]); setJobsState('unavailable');
    }
  }

  useEffect(() => {
    const refresh = () => {
      const version = ++wakeSession.current, owner = getToken();
      setScheduledJobs([]); setHealth(null); setScheduleBusy(false); setActiveTest('');
      setChatId(storage.get('crewcheck_telegram_chat_id', '')); setPhone(storage.get('crewcheck_wakeup_phone', ''));
      void refreshScheduledJobs();
      if (!owner) return;
      Promise.all([
        fetch('/api/alarm/health', { cache: 'no-store' }).then((r) => r.json()),
        getPlatformBilling().catch(() => null),
      ]).then(([alarm, billing]) => {
        if (sameWakeSession(version, owner)) setHealth({ ...(alarm || {}), usage: billing?.usage || null });
      }).catch(() => {
        if (sameWakeSession(version, owner)) setHealth({ ok: false, message: 'Despertador aguardando conexão.' });
      });
    };
    const onStorage = (event: StorageEvent) => { if (['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key || '')) refresh(); };
    refresh();
    for (const name of ['crewcheck:auth-changed', 'crewcheck:auth-expired', 'online']) window.addEventListener(name, refresh);
    window.addEventListener('storage', onStorage);
    window.addEventListener('crewcheck:notification-jobs-changed', refreshScheduledJobs);
    return () => {
      wakeSession.current++; jobsRequest.current++;
      for (const name of ['crewcheck:auth-changed', 'crewcheck:auth-expired', 'online']) window.removeEventListener(name, refresh);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('crewcheck:notification-jobs-changed', refreshScheduledJobs);
    };
  }, []);

` + wake.slice(end);
  for (const name of ['activateServerAlarm', 'cancelScheduledJob', 'testAlarm', 'activateServerReminder', 'snoozeTelegram']) {
    const begin = wake.indexOf('  async function ' + name + '(');
    if (begin < 0) continue;
    const finish = wake.indexOf('\n  }', begin) + 4;
    let body = wake.slice(begin, finish);
    body = body.replace(/(async function [^\n]+\{\n)/, '$1    const version = wakeSession.current, owner = getToken();\n    if (!owner) return;\n');
    body = body.replace(/(      (?:const payload = )?await postCrewCheckJson\([\s\S]*?\n      \}\);)/g, '$1\n      if (!sameWakeSession(version, owner)) return;');
    body = body.replace('      await refreshScheduledJobs();', '      await refreshScheduledJobs();\n      if (!sameWakeSession(version, owner)) return;');
    body = body.replace('    } catch (error) {', '    } catch (error) {\n      if (!sameWakeSession(version, owner)) return;');
    body = body.replace('      setScheduleBusy(false);', '      if (sameWakeSession(version, owner)) setScheduleBusy(false);');
    body = body.replace("      setActiveTest('');", "      if (sameWakeSession(version, owner)) setActiveTest('');");
    wake = wake.slice(0, begin) + body + wake.slice(finish);
  }
  wake = wake.replace('{scheduledJobs.length ?', "{jobsState === 'loading' ? <p role=\"status\">Consultando despertadores no servidor…</p> : jobsState === 'unavailable' ? <p role=\"alert\">Não foi possível consultar os despertadores. Reconecte e tente novamente.</p> : scheduledJobs.length ?");
  return wake;
}
