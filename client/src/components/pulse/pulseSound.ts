/** Optional, foreground-only audio. Device notification channels retain their own tones. */
export const NOTIFICATION_SOUND_KEY = 'crewcheck_notification_sound_v1';
export const A320_INTERPHONE_URL = '/assets/sounds/a320-interphone-cc0.mp3';
export type NotificationSound = 'off' | 'a320-interphone';
export type SoundPreviewState = 'idle' | 'playing' | 'error';

type Playback = { audio: HTMLAudioElement; preview: boolean; cleanup: () => void };
let playback: Playback | null = null;
let previewState: SoundPreviewState = 'idle';
const previewListeners = new Set<(state: SoundPreviewState) => void>();
const recentNotices = new Map<string, number>();
let lastNoticeAt = -Infinity;

export function getCrewCheckNotificationSound(): NotificationSound {
  try { return localStorage.getItem(NOTIFICATION_SOUND_KEY) === 'a320-interphone' ? 'a320-interphone' : 'off'; }
  catch { return 'off'; }
}

function updatePreview(state: SoundPreviewState): void {
  previewState = state;
  for (const listener of previewListeners) listener(state);
}

export function subscribeSoundPreview(listener: (state: SoundPreviewState) => void): () => void {
  previewListeners.add(listener);
  listener(previewState);
  return () => { previewListeners.delete(listener); };
}

export function stopCrewCheckNotificationSound(previewOnly = false): void {
  if (!playback || (previewOnly && !playback.preview)) return;
  const stopped = playback;
  playback = null;
  stopped.cleanup();
  try { stopped.audio.pause(); stopped.audio.removeAttribute('src'); stopped.audio.load(); } catch {}
  if (stopped.preview) updatePreview('idle');
}

export function setCrewCheckNotificationSound(sound: NotificationSound): boolean {
  stopCrewCheckNotificationSound();
  updatePreview('idle');
  try {
    localStorage.setItem(NOTIFICATION_SOUND_KEY, sound === 'a320-interphone' ? sound : 'off');
    return true;
  } catch { return false; }
}

function foreground(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
}

async function play(preview: boolean): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined' || !foreground()
    || getCrewCheckNotificationSound() !== 'a320-interphone') return false;
  stopCrewCheckNotificationSound();
  const audio = new Audio(A320_INTERPHONE_URL);
  audio.preload = 'none';
  audio.volume = 0.35;
  audio.loop = false;
  const stop = () => stopCrewCheckNotificationSound();
  const onVisibility = () => { if (!foreground()) stop(); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === NOTIFICATION_SOUND_KEY || event.key === 'crewcheck_pulse_enabled') stop();
  };
  const timeout = window.setTimeout(stop, 6_000);
  const current: Playback = { audio, preview, cleanup: () => {
    window.clearTimeout(timeout);
    audio.onended = null;
    audio.onerror = null;
    window.removeEventListener('pagehide', stop);
    window.removeEventListener('popstate', stop);
    window.removeEventListener('blur', stop);
    window.removeEventListener('crewcheck:set-view', stop);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisibility);
  } };
  playback = current;
  window.addEventListener('pagehide', stop);
  window.addEventListener('popstate', stop);
  window.addEventListener('blur', stop);
  window.addEventListener('crewcheck:set-view', stop);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  audio.onended = stop;
  audio.onerror = () => {
    if (playback !== current) return;
    stop();
    if (preview) updatePreview('error');
  };
  if (preview) updatePreview('playing');
  try {
    // Called by the preview button or an opted-in notice, never by a render/effect.
    await audio.play();
    if (playback !== current) { audio.pause(); return false; }
    return true;
  } catch {
    if (playback === current) {
      stop();
      if (preview) updatePreview('error');
    }
    return false;
  }
}

export function previewCrewCheckNotificationSound(): Promise<boolean> { return play(true); }

export function playCrewCheckNoticeSound(key: string): void {
  if (!foreground() || getCrewCheckNotificationSound() === 'off' || playback?.preview) return;
  const now = Date.now();
  // No burst when notices arrive together; repeated context stays quiet for five minutes.
  if (now - lastNoticeAt < 8_000 || now - (recentNotices.get(key) ?? -Infinity) < 300_000) return;
  try { if (localStorage.getItem('crewcheck_pulse_enabled') === '0') return; } catch { return; }
  lastNoticeAt = now;
  for (const [seenKey, at] of recentNotices) if (now - at >= 300_000) recentNotices.delete(seenKey);
  recentNotices.set(key, now);
  if (recentNotices.size > 60) recentNotices.delete(recentNotices.keys().next().value!);
  void play(false);
}
