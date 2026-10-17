import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, type ReactNode, type ReactElement } from 'react';

/** Header and Pulse follow normal document flow; only the footer needs clearance. */
export function InternalHeaderFrame({ children }: { children: ReactNode }) {
  const header = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    let observedFooter: Element | null = null;
    const update = () => {
      const headerRect = header.current?.getBoundingClientRect();
      root.style.setProperty('--cc-fixed-header-height', `${headerRect?.height || 0}px`);
      const footer = document.querySelector('body > nav.cz-bottom-nav');
      if (footer !== observedFooter) {
        if (observedFooter) observer.unobserve(observedFooter);
        observedFooter = footer;
        if (footer) observer.observe(footer);
      }
      const rect = footer?.getBoundingClientRect();
      if (!rect) root.style.setProperty('--cc-fixed-footer-height', '0px');
      else if (rect.height > 0) root.style.setProperty('--cc-fixed-footer-height', `${rect.height + Math.max(0, window.innerHeight - rect.bottom)}px`);
    };
    const observer = new ResizeObserver(update);
    if (header.current) observer.observe(header.current);
    const portalObserver = new MutationObserver(update);
    portalObserver.observe(document.body, { childList: true });
    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      portalObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      root.style.removeProperty('--cc-fixed-footer-height');
      root.style.removeProperty('--cc-fixed-header-height');
    };
  }, []);
  return <><div ref={header} className="cz-global-header" data-global-internal-header="true">{Children.map(children, child => isValidElement(child) && typeof child.type !== 'string' ? cloneElement(child as ReactElement<any>, { global: true, pulse: true }) : child)}</div><div className="cc-integrated-header-space" aria-hidden="true"/></>;
}
