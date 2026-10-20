import { useEffect, useRef, useState } from 'react';
import './native-play-update-notice.css';
import PwaUpdateNotice from './PwaUpdateNotice';

const STORE_URL = 'https://play.google.com/store/apps/details?id=com.crewcheck.app';
const SNOOZE_KEY = 'crewcheck_play_update_snooze';
const DAY = 24 * 60 * 60 * 1000;
const FRESH_MS = 5 * 60 * 1000;
type Offer = { version: number; checkedAt: number };
type Snooze = { version: number; until: number };
type NativeWindow = Window & {
  AndroidCrewCheckNative?: unknown;
  __crewcheckNativeUpdateStatus?: unknown;
};

function readOffer(value: unknown): Offer | null {
  if (!value || typeof value !== 'object') return null;
  const status = value as Record<string, unknown>;
  const version = status.availableVersionCode;
  const checkedAt = status.checkedAt;
  if (status.state !== 'available' || typeof version !== 'number' || !Number.isSafeInteger(version) || version <= 0
      || typeof checkedAt !== 'number' || !Number.isFinite(checkedAt)
      || checkedAt > Date.now() || Date.now() - checkedAt >= FRESH_MS) return null;
  return { version, checkedAt };
}

/** Android package availability comes exclusively from the existing Play bridge.
 * Never infer it from release.json, the PWA cache, URL flags or a public version.
 */
function NativePlayOffer() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const snooze = useRef<Snooze | null>(null);
  useEffect(() => {
    const host = window as NativeWindow;
    if (!host.AndroidCrewCheckNative) return;
    try {
      const saved = JSON.parse(localStorage.getItem(SNOOZE_KEY) || 'null');
      if (Number.isSafeInteger(saved?.version) && Number.isFinite(saved?.until)
          && saved.until > Date.now() && saved.until <= Date.now() + DAY) snooze.current = saved;
    } catch { /* Storage is optional; in-memory dismissal still works. */ }
    const accept = (value: unknown) => {
      const next = navigator.onLine === false ? null : readOffer(value);
      setOffer(next && !(snooze.current?.version === next.version && snooze.current.until > Date.now()) ? next : null);
    };
    const update = (event: Event) => accept((event as CustomEvent).detail);
    const clear = () => setOffer(null);
    window.addEventListener('crewcheck:native-update-status', update);
    window.addEventListener('blur', clear);
    window.addEventListener('offline', clear);
    // The existing native coordinator can finish before React mounts.
    accept(host.__crewcheckNativeUpdateStatus);
    return () => {
      window.removeEventListener('crewcheck:native-update-status', update);
      window.removeEventListener('blur', clear);
      window.removeEventListener('offline', clear);
    };
  }, []);
  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(() => setOffer(null), Math.max(0, offer.checkedAt + FRESH_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [offer]);

  const defer = () => {
    if (!offer) return;
    snooze.current = { version: offer.version, until: Date.now() + DAY };
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(snooze.current)); } catch {}
    setOffer(null);
  };
  const openPlay = () => {
    if (!offer || navigator.onLine === false || Date.now() - offer.checkedAt >= FRESH_MS) { setOffer(null); return; }
    defer();
    // MainActivity routes this external HTTPS URL to the official store/browser.
    // No install flow, web reload or automatic installation is initiated here.
    window.location.assign(STORE_URL);
  };
  if (!offer) return null;
  return <aside className="cc-play-update-notice" aria-label="Atualização Android disponível">
    <div role="status"><strong>Atualização disponível</strong><p>Há uma atualização do app Android para você na Play Store.</p></div>
    <div className="cc-play-update-actions"><button type="button" onClick={defer}>Depois</button><button type="button" onClick={openPlay}>Atualizar agora</button></div>
  </aside>;
}
export default function NativePlayUpdateNotice(){return <><PwaUpdateNotice/><NativePlayOffer/></>;}
