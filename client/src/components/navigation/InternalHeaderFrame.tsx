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
    };
    update();
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    if (header.current) observer.observe(header.current);
    return () => { window.removeEventListener('resize', update); observer.disconnect(); document.documentElement.style.removeProperty('--cc-fixed-header-height'); };
  }, []);
  return <><div ref={header} className="cz-global-header" data-global-internal-header="true">{children}</div><div ref={spacer} className="cc-fixed-header-space" aria-hidden="true"/><div className="cc-header-notice"><CrewCheckPulse compact/></div></>;
}
