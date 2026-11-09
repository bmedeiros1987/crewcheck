import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, type ReactNode, type ReactElement } from 'react';
import { availableBottomMenu, isHeaderNavigationSuppressed } from './headerMenuAccess';

/** Header and Pulse follow normal document flow; only the footer needs clearance. */
export function InternalHeaderFrame({ children }: { children: ReactNode }) {
  const header = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    let observedFooter: Element | null = null;
    let pendingFrame = 0;
    let disposed = false;
    const scheduleUpdate = () => {
      if (disposed || pendingFrame) return;
      pendingFrame = requestAnimationFrame(() => { pendingFrame = 0; update(); });
    };
    const setHeight = (name: string, value: string) => {
      if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
    };
    const update = () => {
      const headerRect = header.current?.getBoundingClientRect();
      setHeight('--cc-fixed-header-height', `${headerRect?.height || 0}px`);
      const footer = document.querySelector('body > nav.cz-bottom-nav');
      if (footer !== observedFooter) {
        if (observedFooter) observer.unobserve(observedFooter);
        observedFooter = footer;
        if (footer) observer.observe(footer);
      }
      const rect = footer?.getBoundingClientRect();
      if (!rect || rect.height <= 0) setHeight('--cc-fixed-footer-height', '0px');
      else setHeight('--cc-fixed-footer-height', `${rect.height + Math.max(0, window.innerHeight - rect.bottom)}px`);
      const menu = availableBottomMenu(document);
      const headerMenu = header.current?.querySelector<HTMLButtonElement>('[data-header-navigation="menu"]');
      const suppressed = isHeaderNavigationSuppressed(headerMenu ?? null);
      // Clear on desktop so crossing into mobile cannot hide a focused header
      // through the media query before the confirmed focus handoff runs.
      let canReplace = Boolean(menu) && window.innerWidth <= 639;
      // If the footer mounts while keyboard focus is on its redundant twin,
      // transfer focus before mobile CSS hides that twin.
      if (menu && !suppressed && window.innerWidth <= 639 && document.activeElement === headerMenu) {
        try { menu.focus({ preventScroll: true }); } catch { /* Retain the focused fallback. */ }
        canReplace = document.activeElement === menu;
      }
      if (header.current) {
        header.current.dataset.bottomMenuAvailable = canReplace ? 'true' : 'false';
        header.current.dataset.headerNavigationSuppressed = suppressed ? 'true' : 'false';
      }
    };
    const observer = new ResizeObserver(scheduleUpdate);
    if (header.current) observer.observe(header.current);
    const portalObserver = new MutationObserver(scheduleUpdate);
    // Observe existing overlays and ancestors as well as newly portaled footers.
    // Our data markers are excluded; height writes are conditional, so this
    // coalesces real invalidations without creating a self-sustaining RAF loop.
    portalObserver.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden', 'aria-disabled', 'aria-modal', 'disabled', 'open', 'role'] });
    update();
    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);
    document.addEventListener('transitionend', scheduleUpdate, true);
    document.addEventListener('animationend', scheduleUpdate, true);
    return () => {
      disposed = true;
      observer.disconnect();
      portalObserver.disconnect();
      cancelAnimationFrame(pendingFrame);
      window.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
      document.removeEventListener('transitionend', scheduleUpdate, true);
      document.removeEventListener('animationend', scheduleUpdate, true);
      root.style.removeProperty('--cc-fixed-footer-height');
      root.style.removeProperty('--cc-fixed-header-height');
    };
  }, []);
  return <><div ref={header} className="cz-global-header" data-global-internal-header="true">{Children.map(children, child => isValidElement(child) && typeof child.type !== 'string' ? cloneElement(child as ReactElement<any>, { global: true, pulse: true }) : child)}</div><div className="cc-integrated-header-space" aria-hidden="true"/></>;
}
