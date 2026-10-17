/** App-wide, not editor-owned. Invalidating roster/consent never auto-rearms. */
export const STAY_AUTHORITY_INVALIDATIONS=Object.freeze(['crewcheck:roster-updated','crewcheck:roster-cleared','crewcheck:roster-choice-start','crewcheck:planned-roster-updated','crewcheck:stay-editor-saved']);
export function attachStayAlarmLifecycle(target,runtime){
 if(!target?.addEventListener||!runtime)return()=>{};
 const invalidate=()=>{void runtime.revoke();};
 for(const name of STAY_AUTHORITY_INVALIDATIONS)target.addEventListener(name,invalidate);
 return()=>{for(const name of STAY_AUTHORITY_INVALIDATIONS)target.removeEventListener(name,invalidate);};
}
