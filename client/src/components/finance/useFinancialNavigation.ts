import { useEffect, useRef, useState } from 'react';
import type { FinancialScreenName } from './FinancialScreen';
import { validFinancialDay, type FinancialRange } from '@/lib/financialHistoryPeriods';
import { clearFinancialEntryScopes, financialEntryScope } from './financialEntryState';

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
  const scope=financialEntryScope(identity);
  const [context,setContext] = useState(() => read(mode,month));
  const current = useRef(context), restoring = useRef(history.state?.ccFinancialPosition?.scope===scope), previousIdentity = useRef({identity,month});
  const [restoreRevision,setRestoreRevision]=useState(0),stopRestoration=useRef<(()=>void)|null>(null);
  const backFilters=useRef<Context|null>(null);
  current.current = context;
  const write = (next: Context, push = false) => {
    const url = new URL(location.href);
    url.searchParams.set('view',mode === 'allowance' ? 'perdiem' : 'salary');
    url.searchParams.set('fmode',mode);
    for (const key of fields) url.searchParams.set('f'+key,next[key]);
    const state = { ...history.state, ccFinancialScope:scope, ...(push?{ccFinancialPosition:undefined}:{}), ccFinancial: { mode, depth: push ? (history.state?.ccFinancial?.depth||0)+1 : history.state?.ccFinancial?.depth||0 } };
    history[push ? 'pushState' : 'replaceState'](state,'',url);
  };
  function update<K extends keyof Context>(key: K, value: Context[K]) {
    stopRestoration.current?.();
    const next = { ...current.current, [key]: value };
    current.current = next; setContext(next); write(next);
  }
  function savePosition() {
    stopRestoration.current?.();
    const root=document.querySelector<HTMLElement>('.cc-financial-route:not([hidden]) .cc-payment-overview');
    if (!root) return;
    const anchor=Array.from(root.querySelectorAll<HTMLElement>('[data-financial-row-key]')).find(element=>{const box=element.getBoundingClientRect();return box.bottom>0&&box.top<innerHeight;});
    history.replaceState({...history.state,ccFinancialScope:scope,ccFinancialPosition:{scope,query:JSON.stringify(current.current),x:scrollX,y:scrollY,anchor:anchor?{key:anchor.dataset.financialRowKey,offset:anchor.getBoundingClientRect().top}:null,focusKey:focusKey(root.contains(document.activeElement)?document.activeElement as HTMLElement:null)}},'');
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
      stopRestoration.current?.();
      const params=new URLSearchParams(location.search);
      if (params.get('view') !== (mode==='allowance'?'perdiem':'salary')) return;
      const linked=read(mode,month);
      const visible=document.querySelector<HTMLElement>('.cc-financial-route:not([hidden]) .cc-payment-overview');
      // Overlay close owns its own scroll restoration; it is not a financial
      // route transition when the same screen and filters remain visible.
      if(!backFilters.current&&visible?.getClientRects().length&&JSON.stringify(linked)===JSON.stringify(current.current))return;
      restoring.current = true;
      const next=backFilters.current?{...backFilters.current,screen:linked.screen}:linked;
      if(backFilters.current){backFilters.current=null;write(next);}
      current.current = next; setContext(next);
      setRestoreRevision(value=>value+1);
    };
    const invalidate=()=>{stopRestoration.current?.();clearFinancialEntryScopes();restoring.current=false;};
    const storage=(event:StorageEvent)=>{if(event.key===null||['crewcheck_auth_user','crewcheck_auth_token'].includes(event.key))invalidate();};
    for(const name of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.addEventListener(name,invalidate);
    window.addEventListener('popstate',restore);
    window.addEventListener('crewcheck:financial-navigation-leave',savePosition);
    window.addEventListener('storage',storage);
    return () => {history.scrollRestoration=previousScrollRestoration;window.removeEventListener('popstate',restore);window.removeEventListener('crewcheck:financial-navigation-leave',savePosition);window.removeEventListener('storage',storage);for(const name of ['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired'])window.removeEventListener(name,invalidate);};
  },[mode,month,scope]);
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
    const saved=restore?history.state?.ccFinancialPosition:null;
    const position=saved?.scope===scope&&saved.query===JSON.stringify(current.current)?saved:null;
    let stopped=false,frame=0,timer=0;
    let mutations:MutationObserver|undefined,resizes:ResizeObserver|undefined;
    const cancel=()=>{stopped=true;cancelAnimationFrame(frame);clearTimeout(timer);mutations?.disconnect();resizes?.disconnect();for(const name of ['wheel','touchstart','pointerdown','keydown'])window.removeEventListener(name,cancel,true);};
    stopRestoration.current=cancel;
    const apply=(force=false)=>{
      if(stopped||financialEntryScope(identity)!==scope){cancel();return;}
      const root = document.querySelector<HTMLElement>('.cc-financial-route:not([hidden]) .cc-payment-overview');
      if (!root) {if(force)cancel();return;}
      if(position&&!force&&Array.from(root.querySelectorAll<HTMLElement>('[data-financial-content-ready="false"]')).some(element=>element.getClientRects().length))return;
      const anchor=position?.anchor?Array.from(root.querySelectorAll<HTMLElement>('[data-financial-row-key]')).find(element=>element.getClientRects().length&&element.dataset.financialRowKey===position.anchor.key):null;
      const top=position?(anchor?scrollY+anchor.getBoundingClientRect().top-position.anchor.offset:position.y):0;
      if(position&&!force&&document.documentElement.scrollHeight-innerHeight+2<top)return;
      const target = (position?.focusKey ? Array.from(root.querySelectorAll<HTMLElement>('button,select,input,summary')).find(element=>element.getClientRects().length>0&&focusKey(element)===position.focusKey) : null) || root.querySelector<HTMLElement>('[data-financial-screen-heading]');
      target?.focus({preventScroll:true});
      if (position) window.scrollTo({left:position.x,top,behavior:'instant'});
      else root.scrollIntoView({block:'start',behavior:'instant'});
      cancel();
    };
    const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>apply());};
    if(position){
      mutations=new MutationObserver(schedule);mutations.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','data-financial-content-ready','data-financial-load-state']});
      resizes=new ResizeObserver(schedule);resizes.observe(document.body);
      for(const name of ['wheel','touchstart','pointerdown','keydown'])window.addEventListener(name,cancel,true);
      timer=window.setTimeout(()=>apply(true),10000);
    }
    schedule();
    return cancel;
  },[context.screen,identity,scope,restoreRevision]);
  return { context,update,navigate,back,scope };
}
