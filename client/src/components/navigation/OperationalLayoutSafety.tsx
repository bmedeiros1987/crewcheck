import { useEffect } from 'react';

/** Reserve the actual portal footer height, including its bottom safe-area gap. */
export function OperationalLayoutSafety() {
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.cz-bottom-nav');
    if (!nav) return;
    const root = document.documentElement;
    const measure = () => {
      const rect = nav.getBoundingClientRect();
      const clearance = Math.ceil(rect.height + Math.max(0, window.innerHeight - rect.bottom));
      root.style.setProperty('--cc-operational-nav-clearance', `${clearance}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--cc-operational-nav-clearance');
    };
  }, []);
  return null;
}
