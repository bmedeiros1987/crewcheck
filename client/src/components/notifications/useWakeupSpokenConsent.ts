import {useEffect,useRef,useState} from 'react';
import {captureAuthSession} from '@/lib/authClient';

// Local, ephemeral consent only. Never persists roster content or authorization.
function sourceSnapshot() {
  try {
    return JSON.stringify([
      sessionStorage.getItem('crewcheck_roster'),
      ...['crewcheck_latest_roster_bundle','crewcheck_roster_sync_latest_v108134',
        'crewcheck_last_roster','crewcheck_platform_stays_cache_v1'].map(key=>localStorage.getItem(key)),
    ]);
  } catch { return null; }
}

export function useWakeupSpokenConsent(context:string,allowed:boolean) {
  const [,render]=useState(0);
  const state=useRef<{context:string;source:string|null;session:ReturnType<typeof captureAuthSession>|null}>({context,source:sourceSnapshot(),session:null});
  const source=sourceSnapshot();
  // Destroy the old choice; A→B→A must not resurrect it. Render invalidation is
  // conservative, including abandoned renders, and does not schedule state work.
  if(state.current.context!==context||state.current.source!==source||!allowed) {
    state.current={context,source,session:null};
  }
  const invalidate=()=>{state.current.session=null;render(value=>value+1);};
  useEffect(()=>{
    const names=['crewcheck:auth-will-change','crewcheck:auth-changed','crewcheck:auth-expired',
      'crewcheck:roster-updated','crewcheck:roster-history-updated','crewcheck:roster-cleared',
      'crewcheck:roster-choice-start','crewcheck:roster-choice-finished','crewcheck:planned-roster-updated',
      'crewcheck:stay-editor-saved','crewcheck:stay-host-state','crewcheck:notification-preferences-changed'];
    const reset=()=>invalidate();
    const storage=(event:StorageEvent)=>{if(event.key===null||/auth|roster|stay/i.test(event.key))reset();};
    for(const name of names)window.addEventListener(name,reset);
    window.addEventListener('storage',storage);
    return()=>{for(const name of names)window.removeEventListener(name,reset);window.removeEventListener('storage',storage);};
  },[]);
  const selectedNow=()=>allowed&&state.current.context===context&&state.current.source!==null&&
    state.current.source===sourceSnapshot()&&Boolean(state.current.session?.isCurrent());
  return {selected:selectedNow(),selectedNow,invalidate,choose(value:boolean){
    state.current={context,source:sourceSnapshot(),session:value&&allowed?captureAuthSession():null};
    render(version=>version+1);
  }};
}
