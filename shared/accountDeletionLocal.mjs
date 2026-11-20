// Known local stores only. Never scan/delete other accounts or claim IndexedDB,
// CacheStorage, remote devices or every legacy store has been erased.
export function clearKnownDeletedAccountStores({ownerId,local,session,isCurrent}){
 if(typeof isCurrent!=='function'||!isCurrent())return{ok:false,reason:'session_changed',completeErasureNotAttested:true};
 if(typeof ownerId!=='string'||!(/^[a-zA-Z0-9_-]{1,80}$/).test(ownerId))return{ok:false,reason:'owner_scope_unconfirmed',completeErasureNotAttested:true};
 const scope=ownerId.toLowerCase();const localKeys=[`crewcheck_local_history_v11_${scope}`,`crewcheck_offline_queue_v11_${scope}`,`crewcheck_saved_checksums_v11_${scope}`,`crewcheck_active_roster_snapshot_${scope}`,`crewcheck_latest_roster_bundle_${scope}`,`crewcheck_roster_sync_latest_v11_${scope}`];
 try{
  for(const key of localKeys){if(!isCurrent())return{ok:false,reason:'session_changed',completeErasureNotAttested:true};local.removeItem(key);}
  for(const key of['crewcheck_roster','crewcheck_compliance','crewcheck_gym','crewcheck_source_file']){if(!isCurrent())return{ok:false,reason:'session_changed',completeErasureNotAttested:true};session.removeItem(key);}
 }catch{return{ok:false,reason:'local_cleanup_unconfirmed',completeErasureNotAttested:true};}
 return{ok:true,knownStoresOnly:true,completeErasureNotAttested:true};
}
