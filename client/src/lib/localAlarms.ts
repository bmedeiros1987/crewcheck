// Client side of the native grouped local alarms (LocalAlarmAndroid). Every answer is
// re-validated here; a missing bridge, a disabled build or an unexpected reply is
// reported as "not armed", never as success.
export const LOCAL_ALARM_PROTOCOL = 'crewcheck-local-alarm-v1';
export type LocalAlarmChannel = 'alarm' | 'vibrate' | 'default';
export type LocalAlarmJob = { id: string; at: number; channel: LocalAlarmChannel; title: string; body: string };
export type LocalAlarmArmed = { id: string; at: number; channel: LocalAlarmChannel };
export type LocalAlarmCapabilities = { available: boolean; enabled: boolean; permitted: boolean; exact: boolean };
export type LocalAlarmResult = { ok: boolean; reason: string; armed: LocalAlarmArmed[]; exact: boolean };
export type LocalAlarmHost = {
  localAlarmCapabilities?(): string;
  replaceLocalAlarms?(payload: string): string;
  cancelLocalAlarms?(group: string): string;
  localAlarmGroup?(group: string): string;
};

function nativeHost(): LocalAlarmHost | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { AndroidCrewCheckNative?: LocalAlarmHost }).AndroidCrewCheckNative;
}
function read(text: unknown): Record<string, unknown> | null {
  try {
    const value = typeof text === 'string' ? JSON.parse(text) : null;
    return value && typeof value === 'object' && !Array.isArray(value) && value.protocol === LOCAL_ALARM_PROTOCOL ? value : null;
  } catch { return null; }
}
const CHANNELS: readonly string[] = ['alarm', 'vibrate', 'default'];
function armedList(value: unknown): LocalAlarmArmed[] | null {
  if (!Array.isArray(value)) return null;
  const out: LocalAlarmArmed[] = [];
  for (const item of value) {
    if (!item || typeof item.id !== 'string' || !Number.isSafeInteger(item.at) || !CHANNELS.includes(item.channel)) return null;
    out.push({ id: item.id, at: item.at, channel: item.channel });
  }
  return out;
}
const failed = (reason: string): LocalAlarmResult => ({ ok: false, reason, armed: [], exact: false });

export function localAlarmCapabilities(host = nativeHost()): LocalAlarmCapabilities {
  const none = { available: false, enabled: false, permitted: false, exact: false };
  if (typeof host?.localAlarmCapabilities !== 'function') return none;
  let value: Record<string, unknown> | null = null;
  try { value = read(host.localAlarmCapabilities()); } catch { return none; }
  if (!value) return none;
  const enabled = value.enabled === true;
  return { available: true, enabled, permitted: enabled && value.permitted === true, exact: enabled && value.exact === true };
}

function result(text: unknown, expected: LocalAlarmJob[]): LocalAlarmResult {
  const value = read(text);
  if (!value || typeof value.ok !== 'boolean' || typeof value.reason !== 'string') return failed('invalid-response');
  if (!value.ok) return failed(value.reason);
  const armed = armedList(value.armed);
  // Success must account for exactly the requested jobs; anything else is not trusted as armed.
  const same = armed && armed.length === expected.length && expected.every((job) => armed.some((item) => item.id === job.id && item.at === job.at && item.channel === job.channel));
  return same ? { ok: true, reason: value.reason, armed: armed!, exact: value.exact === true } : failed('unconfirmed-response');
}

export function replaceLocalAlarms(group: string, jobs: LocalAlarmJob[], host = nativeHost()): LocalAlarmResult {
  if (typeof host?.replaceLocalAlarms !== 'function') return failed('unavailable');
  try { return result(host.replaceLocalAlarms(JSON.stringify({ protocol: LOCAL_ALARM_PROTOCOL, group, jobs })), jobs); }
  catch { return failed('bridge-error'); }
}

export function cancelLocalAlarms(group: string, host = nativeHost()): LocalAlarmResult {
  if (typeof host?.cancelLocalAlarms !== 'function') return failed('unavailable');
  try { return result(host.cancelLocalAlarms(group), []); } catch { return failed('bridge-error'); }
}

/** What the device reports as still armed for the group (nothing after a reboot or account change). */
export function readLocalAlarmGroup(group: string, host = nativeHost()): LocalAlarmArmed[] | null {
  if (typeof host?.localAlarmGroup !== 'function') return null;
  try {
    const value = read(host.localAlarmGroup(group));
    return value && value.ok === true ? armedList(value.jobs) : null;
  } catch { return null; }
}
