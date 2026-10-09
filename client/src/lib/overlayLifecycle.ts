let sequence = 0;
const bodyOwners = new Set<number>();
let previousOverflow = '';
let previousHistoryRestoration: ScrollRestoration = 'auto';
let ownsHistoryRestoration = false;

/** Own only this overlay's lock/history entry; closing a nested overlay keeps its parent locked. */
export function acquireOverlayLifecycle(dismiss: () => void, restoreScroll: () => boolean = () => true, originalScrollY?: number, originalFocus?: HTMLElement | null): () => void {
  const id = ++sequence;
  const token = `${id}-${Math.random().toString(36).slice(2)}`;
  const y = originalScrollY ?? window.scrollY;
  if (!bodyOwners.size) {
    previousOverflow = document.body.style.overflow;
    if (!ownsHistoryRestoration) previousHistoryRestoration = window.history.scrollRestoration;
    ownsHistoryRestoration = true;
    window.history.scrollRestoration = 'manual';
  }
  bodyOwners.add(id);
  document.body.style.overflow = 'hidden';
  let ownsHistory = false;
  let released = false;
  try {
    const state = window.history.state;
    window.history.pushState({ ...(state && typeof state === 'object' ? state : {}), crewcheckOverlay: token }, '', window.location.href);
    ownsHistory = true;
  } catch { /* Escape, backdrop and cancel remain usable when history is unavailable. */ }
  const onBack = () => {
    if (window.history.state?.crewcheckOverlay !== token) dismiss();
  };
  const onPageHide = () => dismiss();
  window.addEventListener('popstate', onBack);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    if (released) return;
    released = true;
    window.removeEventListener('popstate', onBack);
    window.removeEventListener('pagehide', onPageHide);
    bodyOwners.delete(id);
    const restorePosition = () => {
      if (!bodyOwners.size) requestAnimationFrame(() => {
        if (bodyOwners.size) return;
        if (restoreScroll()) {
          window.scrollTo({ top: y, left: 0, behavior: 'instant' });
          if (originalFocus?.isConnected) originalFocus.focus({ preventScroll: true });
        }
        window.history.scrollRestoration = previousHistoryRestoration;
        ownsHistoryRestoration = false;
      });
    };
    if (!bodyOwners.size) {
      document.body.style.overflow = previousOverflow;
    }
    if (ownsHistory && window.history.state?.crewcheckOverlay === token) {
      // Browser history restoration happens after popstate; restore our content position after it.
      let timeout = 0;
      const afterBack = () => { window.clearTimeout(timeout); window.removeEventListener('popstate', afterBack); restorePosition(); };
      window.addEventListener('popstate', afterBack, { once: true });
      window.history.back();
      timeout = window.setTimeout(() => { window.removeEventListener('popstate', afterBack); restorePosition(); }, 150);
    } else restorePosition();
  };
}
