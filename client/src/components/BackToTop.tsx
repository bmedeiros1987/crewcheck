import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp } from 'lucide-react';
import './back-to-top.css';

// One small page action after a short scroll, outside document flow and above navigation.
// Only document/app-ancestor scrolling qualifies; a table or modal scroll cannot claim it.
export default function BackToTop() {
  const button = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<{ header: HTMLElement; scroller: Element; bottom: number } | null>(null);
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
    let watchedNavigation: Element | null = null;
    const update = () => {
      frame = 0;
      const header = document.querySelector<HTMLElement>('.cz-app > .cz-global-header');
      const root = document.scrollingElement;
      const blocked = document.querySelector('dialog[open], [aria-modal="true"], .cz-menu-overlay, .cz-busy');
      const editing = document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
      if (!header || !root || blocked || editing) { setState(null); return; }
      if (!scroller?.isConnected || (scroller !== root && !scroller.contains(header))) scroller = root;
      for (let ancestor = header.parentElement; ancestor && ancestor !== root; ancestor = ancestor.parentElement) {
        if (/(auto|scroll)/.test(getComputedStyle(ancestor).overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 64) { scroller = ancestor; break; }
      }
      const height = scroller === root ? innerHeight : scroller.clientHeight;
      const show = scroller.scrollTop > 64 && scroller.scrollHeight > height + 64;
      const navigationElement = header.closest('.cz-app')?.querySelector('.cz-bottom-nav') || null;
      if (navigationElement !== watchedNavigation) {
        if (watchedNavigation) resizeObserver?.unobserve(watchedNavigation);
        watchedNavigation = navigationElement;
        if (watchedNavigation) resizeObserver?.observe(watchedNavigation);
      }
      const navigation = navigationElement?.getBoundingClientRect();
      const viewportBottom = Math.min(innerHeight, window.visualViewport ? window.visualViewport.offsetTop + window.visualViewport.height : innerHeight);
      const containerBottom = scroller === root ? viewportBottom : Math.min(viewportBottom, scroller.getBoundingClientRect().bottom);
      const usableBottom = navigation && navigation.height > 0 && navigation.top < containerBottom ? navigation.top : containerBottom;
      const bottom = Math.max(12, innerHeight - usableBottom + 12);
      const activeScroller = scroller;
      setState(previous => show ? previous?.header === header && previous.scroller === activeScroller && previous.bottom === bottom ? previous : { header, scroller: activeScroller, bottom } : null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
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
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal', 'data-view', 'class', 'style'] });
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    schedule();
    return () => { observer.disconnect(); resizeObserver?.disconnect(); document.removeEventListener('scroll', onScroll, true); document.removeEventListener('focusin', schedule); document.removeEventListener('focusout', schedule); window.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('resize', schedule); window.visualViewport?.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); };
  }, []);
  const host = state?.header.closest('.cz-app');
  if (!state || !host) return null;
  return createPortal(<button ref={button} type="button" className="cc-back-to-top" style={{ bottom: `max(${state.bottom}px, env(safe-area-inset-bottom, 0px))` }} aria-label="Voltar ao topo" onClick={() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    state.scroller.scrollTo({ top: 0, behavior: reduce ? 'instant' : 'smooth' });
    state.header.querySelector<HTMLElement>('.cz-brand-row button')?.focus({ preventScroll: true });
  }}><ArrowUp aria-hidden="true"/></button>, host);
}
