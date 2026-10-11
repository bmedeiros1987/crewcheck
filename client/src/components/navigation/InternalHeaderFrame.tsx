import { useLayoutEffect, useRef, type ReactNode } from 'react';
import CrewCheckPulse from '../pulse/CrewCheckPulse';

/** Pin navigation only; notices and expanded details belong to the document. */
export function InternalHeaderFrame({ children }: { children: ReactNode }) {
  const header = useRef<HTMLDivElement>(null);
  const spacer = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const update = () => {
      if (!header.current || !spacer.current) return;
      const height = header.current.getBoundingClientRect().height;
      spacer.current.style.height = `${height + (parseFloat(getComputedStyle(header.current).top) || 0) + 18}px`;
      document.documentElement.style.setProperty('--cc-fixed-header-height', `${height}px`);
      const footer=document.querySelector('body > nav.cz-bottom-nav');
      if(footer){const rect=footer.getBoundingClientRect();document.documentElement.style.setProperty('--cc-fixed-footer-height',`${rect.height + Math.max(0,window.innerHeight-rect.bottom)}px`);}
    };
    update();
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    if (header.current) observer.observe(header.current);
    const footer=document.querySelector('body > nav.cz-bottom-nav');if(footer)observer.observe(footer);
    const frame=requestAnimationFrame(update);
    window.visualViewport?.addEventListener('resize',update);
    return () => { window.removeEventListener('resize', update); observer.disconnect();cancelAnimationFrame(frame);window.visualViewport?.removeEventListener('resize',update);document.documentElement.style.removeProperty('--cc-fixed-footer-height'); document.documentElement.style.removeProperty('--cc-fixed-header-height'); };
  }, []);
  return <><div ref={header} className="cz-global-header" data-global-internal-header="true">{children}</div><div ref={spacer} className="cc-fixed-header-space" aria-hidden="true"/><div className="cc-header-notice"><CrewCheckPulse compact/></div></>;
}
