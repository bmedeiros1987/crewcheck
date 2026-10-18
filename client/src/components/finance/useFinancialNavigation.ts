import { useEffect, useRef, useState } from 'react';
import type { FinancialScreenName } from './FinancialScreen';
import { validFinancialDay, type FinancialRange } from '@/lib/financialHistoryPeriods';

type Context = { screen: FinancialScreenName; kind: FinancialRange['kind']; month: string; day: string; from: string; to: string; currency: string; comparison: 'month'|'week' };
const fields = ['screen','kind','month','day','from','to','currency','comparison'] as const;
function focusKey(element:HTMLElement|null):string|null {
  if(!element)return null;
  const label=element.getAttribute('aria-label');
  if(label)return 'aria:'+label;
  if(element.id)return 'id:'+element.id;
  // Only static navigation labels enter history state, never money/roster text.
  if(element.tagName==='BUTTON'&&element.closest('.cc-financial-screen-links,.cc-financial-screen-head,.cc-financial-actions'))return 'nav:'+element.textContent?.trim();
  return null;
}
function read(mode: string, month: string): Context {
  const p = new URLSearchParams(location.search), active = p.get('fmode') === mode;
  const get = (key: string) => active ? p.get('f'+key) : null;
  const date = (key: string) => validFinancialDay(get(key)||'') ? get(key)! : month+'-01';
  return { screen: (['overview','payment','statement','charts'].includes(get('screen')||'') ? get('screen') : 'overview') as FinancialScreenName,
    kind: (['month','week','year','custom'].includes(get('kind')||'') ? get('kind') : 'month') as FinancialRange['kind'],
    month: validFinancialDay((get('month')||'')+'-01') ? get('month')! : month,
    day: date('day'), from: date('from'), to: date('to'), currency: /^[A-Z]{3}$/.test(get('currency')||'') ? get('currency')! : 'BRL',
    comparison: get('comparison') === 'week' ? 'week' : 'month' };
}

/** URL contains filters only. No amounts, roster identity, credentials or cached financial records. */
export default function useFinancialNavigation(mode: 'salary'|'allowance', month: string, identity: string) {
  const [context,setContext] = useState(() => read(mode,month));
  const current = useRef(context), restoring = useRef(Boolean(history.state?.ccFinancialPosition)), previousIdentity = useRef({identity,month});
  const backFilters=useRef<Context|null>(null);
  current.current = context;
  const write = (next: Context, push = false) => {
    const url = new URL(location.href);
    url.searchParams.set('view',mode === 'allowance' ? 'perdiem' : 'salary');
    url.searchParams.set('fmode',mode);
    for (const key of fields) url.searchParams.set('f'+key,next[key]);
    const state = { ...history.state, ...(push?{ccFinancialPosition:undefined}:{}), ccFinancial: { mode, depth: push ? (history.state?.ccFinancial?.depth||0)+1 : history.state?.ccFinancial?.depth||0 } };
    history[push ? 'pushState' : 'replaceState'](state,'',url);
  };
  function update<K extends keyof Context>(key: K, value: Context[K]) {
    const next = { ...current.current, [key]: value };
    current.current = next; setContext(next); write(next);
  }
  function savePosition() {
    const root=document.querySelector<HTMLElement>('.cc-financial-route:not([hidden]) .cc-payment-overview');
    if (!root) return;
    history.replaceState({...history.state,ccFinancialPosition:{x:scrollX,y:scrollY,focusKey:focusKey(root.contains(document.activeElement)?document.activeElement as HTMLElement:null)}},'');
  }
  function navigate(screen: FinancialScreenName) {
    if (screen === current.current.screen) return;
    savePosition();
    const next = { ...current.current,screen };
    write(next,true); current.current = next; setContext(next);
  }
  function back() {
    if (history.state?.ccFinancial?.mode === mode && history.state.ccFinancial.depth > 0) {backFilters.current=current.current;history.back();}
    else navigate('overview');
  }
  useEffect(() => {
    const previousScrollRestoration=history.scrollRestoration;history.scrollRestoration='manual';
    const restore = () => {
      const params=new URLSearchParams(location.search);
      if (params.get('view') !== (mode==='allowance'?'perdiem':'salary')) return;
      restoring.current = true;
      const linked=read(mode,month),next=backFilters.current?{...backFilters.current,screen:linked.screen}:linked;
      if(backFilters.current){backFilters.current=null;write(next);}
      current.current = next; setContext(next);
    };
    window.addEventListener('popstate',restore);
    window.addEventListener('crewcheck:financial-navigation-leave',savePosition);
    return () => {history.scrollRestoration=previousScrollRestoration;window.removeEventListener('popstate',restore);window.removeEventListener('crewcheck:financial-navigation-leave',savePosition);};
  },[mode,month]);
  useEffect(() => {
    if (previousIdentity.current.identity !== identity || previousIdentity.current.month !== month) {
      const sameOwner=previousIdentity.current.identity===identity;
      previousIdentity.current = {identity,month};
      const next = { ...read('',month),...(sameOwner?{screen:current.current.screen,currency:current.current.currency,kind:current.current.kind,comparison:current.current.comparison}:{screen:'overview' as const}) };
      current.current = next; setContext(next); write(next);
    }
  },[identity,month]);
  useEffect(() => {
    const restore = restoring.current; restoring.current = false;
    const frame = requestAnimationFrame(() => {
      const root = document.querySelector<HTMLElement>('.cc-financial-route:not([hidden]) .cc-payment-overview');
      if (!root) return;
      const position = restore ? history.state?.ccFinancialPosition : null;
      const target = (position?.focusKey ? Array.from(root.querySelectorAll<HTMLElement>('button,select,input,summary')).find(element=>element.getClientRects().length>0&&focusKey(element)===position.focusKey) : null) || root.querySelector<HTMLElement>('[data-financial-screen-heading]');
      target?.focus({preventScroll:true});
      if (position) window.scrollTo({left:position.x,top:position.y,behavior:'instant'});
      else root.scrollIntoView({block:'start',behavior:'instant'});
    });
    return () => cancelAnimationFrame(frame);
  },[context.screen]);
  return { context,update,navigate,back };
}
