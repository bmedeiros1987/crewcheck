import { attachStayAlarmLifecycle } from '@shared/stay-alarm-lifecycle.mjs';
import { createStayHostRuntime } from '@shared/stay-alarm-host-runtime.mjs';
import { getToken } from './authClient';
import { stayEditorAccount } from './stayEditorStore';
let runtime: any = null;
/** MainActivity exposes the origin/frame-scoped port only in a future approved
 * physical-test build. Every production build currently returns null here. */
export function preparedStayAlarmAdapter() {
  if (runtime) return runtime;
  const port = (window as any).CrewCheckStayHost;
  if (!port?.postMessage || window.top !== window || window.location.origin !== 'https://crewcheck.online') return null;
  runtime = createStayHostRuntime({ port, readAccount: stayEditorAccount, readToken: getToken, onState: () => window.dispatchEvent(new Event('crewcheck:stay-host-state')) });
  const reauthenticate = () => { void runtime.authenticate().finally(() => window.dispatchEvent(new Event('crewcheck:stay-host-state'))); };
  window.addEventListener('crewcheck:auth-changed', reauthenticate);
  window.addEventListener('crewcheck:auth-expired', () => { void runtime.revoke(); });
  window.addEventListener('storage', event => { if (['crewcheck_auth_token', 'crewcheck_auth_user'].includes(event.key || '')) reauthenticate(); });
  window.addEventListener('pagehide', () => { void runtime.revoke(); });
  attachStayAlarmLifecycle(window, runtime);
  reauthenticate();
  return runtime;
}

// Main app startup installs lifecycle even when the editor has never mounted.
if (typeof window !== 'undefined') preparedStayAlarmAdapter();
