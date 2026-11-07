import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp } from 'lucide-react';
import './back-to-top.css';

// One in-flow action at the end of long app pages: never floats over cards or navigation.
// Only document/app-ancestor scrolling qualifies; a table or modal scroll cannot claim it.
export default function BackToTop() {
  const button = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<{ header: HTMLElement; scroller: Element } | null>(null);
  const keepOwnButtonAtEnd = () => {
    const node = button.current;
    const host = document.querySelector('.cz-app > .cz-global-header')?.closest('.cz-app');
    if (node?.isConnected && host && node.parentElement === host && host.lastElementChild !== node) {
      const focused = node === document.activeElement;
      host.appendChild(node);
      if (focused) node.focus({ preventScroll: true });
    }
  };
  useLayoutEffect(keepOwnButtonAtEnd);
  useEffect(() => {
    let frame = 0;
    let scroller: Element | null = null;
    const update = () => {
      frame = 0;
      const header = document.querySelector<HTMLElement>('.cz-app > .cz-global-header');
      const root = document.scrollingElement;
      const blocked = document.querySelector('dialog[open], [aria-modal="true"], .cz-menu-overlay, .cz-busy');
      if (!header || !root || blocked) { setState(null); return; }
      if (!scroller?.isConnected || (scroller !== root && !scroller.contains(header))) scroller = root;
      const height = scroller === root ? innerHeight : scroller.clientHeight;
      const show = scroller.scrollTop > height && scroller.scrollHeight > height * 2;
      const activeScroller = scroller;
      setState(previous => show ? previous?.header === header && previous.scroller === activeScroller ? previous : { header, scroller: activeScroller } : null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onScroll = (event: Event) => {
      const target = event.target;
      const header = document.querySelector('.cz-app > .cz-global-header');
      if (target === document) scroller = document.scrollingElement;
      else if (target instanceof Element && header && target.contains(header)) scroller = target;
      else return;
      schedule();
    };
    // React may reinsert a sibling after this portal without rerendering it.
    // Repair only our own connected node, before the next layout, without remounting.
    const observer = new MutationObserver(() => { keepOwnButtonAtEnd(); schedule(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal', 'data-view'] });
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', schedule);
    schedule();
    return () => { observer.disconnect(); document.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame); };
  }, []);
  const host = state?.header.closest('.cz-app');
  if (!state || !host) return null;
  return createPortal(<button ref={button} type="button" className="cc-back-to-top" aria-label="Voltar ao topo" onClick={() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.scroller.scrollTo({ top: 0, behavior: reduce ? 'instant' : 'smooth' });
    state.header.querySelector<HTMLElement>('.cz-brand-row button')?.focus({ preventScroll: true });
  }}><ArrowUp aria-hidden="true"/></button>, host);
}
