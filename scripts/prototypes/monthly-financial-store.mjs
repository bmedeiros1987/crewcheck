/** ISOLATED PROTOTYPE. Not imported by the app. No activation or v1 migration.
 * Native IDB transaction owns values/revision/receipt. localStorage is read-only:
 * generation removal invalidates use, but does not delete stored IDB records.
 * IDB cleanup deletes logical rows; it does not prove physical media erasure.
 */
export class MonthlyFinancialStorePrototype {
  constructor({databaseName,markerKey,legacyKeys,monthlyLegacyKey,isSessionCurrent,preflight}) {
    this.databaseName=databaseName;this.markerKey=markerKey;this.legacyKeys=legacyKeys;
    this.monthlyLegacyKey=monthlyLegacyKey;this.isSessionCurrent=isSessionCurrent;this.preflight=preflight;
  }
  marker(){return localStorage.getItem(this.markerKey);}
  legacy(owner,month){return JSON.stringify(this.legacyKeys(owner,month).map(key=>[key,localStorage.getItem(key)]));}
  async digest(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
  open(){
    if(this.db)return Promise.resolve(this.db);
    if(this.opening)return this.opening;
    this.opening=new Promise((resolve,reject)=>{const r=indexedDB.open(this.databaseName,1);
      r.onupgradeneeded=()=>r.result.createObjectStore('months',{keyPath:'key'});
      r.onsuccess=()=>{const connection=r.result;this.db=connection;
        connection.onversionchange=()=>{connection.close();if(this.db===connection)this.db=null;};
        this.opening=null;resolve(connection);};
      r.onerror=()=>{this.opening=null;reject(r.error);};});
    return this.opening;
  }
  monthlyLegacy(owner,month){return this.monthlyLegacyKey?localStorage.getItem(this.monthlyLegacyKey(owner,month)):undefined;}
  /** Diagnostic persisted-row inspection for tests, never an application reader. */
  async physicalRead(owner,month){const db=await this.open();return new Promise((resolve,reject)=>{const t=db.transaction('months','readonly'),r=t.objectStore('months').get(owner+':'+month);let value=null;r.onsuccess=()=>value=r.result||null;t.oncomplete=()=>resolve(value);t.onabort=()=>reject(t.error);});}
  async load({owner,month,session}){
    const generation=this.marker(),legacy=this.legacy(owner,month),row=await this.physicalRead(owner,month);
    const isCurrent=()=>Boolean(generation)&&this.marker()===generation&&this.legacy(owner,month)===legacy&&this.isSessionCurrent(owner,session);
    if(!isCurrent())return {usable:false,reason:'generation_or_session_invalid',isCurrent};
    const legacyMonthlyRaw=this.monthlyLegacy(owner,month);
    if(legacyMonthlyRaw!==null)return {usable:false,reason:legacyMonthlyRaw===undefined?'legacy_adapter_required':'legacy_review_required',legacyMonthlyRaw:legacyMonthlyRaw??null,row:null,isCurrent};
    if(row&&(row.generation!==generation||row.legacyDigest!==await this.digest(legacy)))return {usable:false,reason:'legacy_or_generation_conflict',isCurrent:()=>false};
    if(!isCurrent())return {usable:false,reason:'generation_or_session_invalid',isCurrent};
    return {usable:true,row:structuredClone(row),generation,legacySnapshot:legacy,isCurrent};
  }
  /** Preflight (auth and PDF validation) finishes BEFORE opening readwrite tx. */
  async edit(input){
    const args=structuredClone(input),verified=await this.preflight(args.owner,args.session);
    if(!verified||!this.isSessionCurrent(args.owner,args.session))return {saved:false,reason:'preflight_or_session'};
    if(!args.owner||!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)||!args.operationId||!Number.isSafeInteger(args.expectedRevision)||args.expectedRevision<0||args.expectedRevision>=Number.MAX_SAFE_INTEGER)return {saved:false,reason:'invalid_context'};
    if(!args.generation||this.marker()!==args.generation||this.legacy(args.owner,args.month)!==args.legacySnapshot)return {saved:false,reason:'generation_or_legacy_conflict'};
    if(this.monthlyLegacy(args.owner,args.month)!==null)return {saved:false,reason:'legacy_review_required'};
    const digest=await this.digest(args.legacySnapshot),db=await this.open();
    const valid=()=>this.marker()===args.generation&&this.legacy(args.owner,args.month)===args.legacySnapshot&&this.isSessionCurrent(args.owner,args.session);
    return new Promise(resolve=>{
      const tx=db.transaction('months','readwrite'),store=tx.objectStore('months');let reason='aborted',next=null;
      const abort=why=>{reason=why;tx.abort();};
      const request=store.get(args.owner+':'+args.month);
      request.onsuccess=()=>{
        if(!valid())return abort('generation_or_session_changed');
        if(this.monthlyLegacy(args.owner,args.month)!==null)return abort('legacy_review_required');
        const current=request.result;
        if(current&&(current.generation!==args.generation||current.legacyDigest!==digest))return abort('legacy_or_generation_conflict');
        if((current?.revision||0)!==args.expectedRevision||current?.closed)return abort('revision_or_closed_conflict');
        const values=structuredClone(current?.values||{}),before={};
        if(args.undoOf){
          if(!current||current.operationId!==args.undoOf||current.receipt?.operationId!==args.undoOf||current.receipt.kind!=='edit')return abort('undo_identity_conflict');
          for(const [field,prior] of Object.entries(current.receipt.before)){
            if(JSON.stringify(values[field]??null)!==JSON.stringify(current.receipt.applied[field]??null))return abort('undo_values_conflict');
            if(prior.present)values[field]=structuredClone(prior.value);else delete values[field];
          }
        }else{
          if(!args.changes||!Object.keys(args.changes).length)return abort('empty_edit');
          for(const [field,value] of Object.entries(args.changes)){
            if(!/^(inss|irrf|other_deductions)$/.test(field)||!Number.isSafeInteger(value.amountMinor)||value.amountMinor<0||value.currency!=='BRL'||value.recurrence!=='once')return abort('invalid_value');
            before[field]={present:Object.hasOwn(values,field),value:values[field]??null};values[field]=structuredClone(value);
          }
        }
        next={key:args.owner+':'+args.month,owner:args.owner,month:args.month,generation:args.generation,legacyDigest:digest,
          revision:args.expectedRevision+1,operationId:args.operationId,closed:false,values,
          receipt:args.undoOf?{kind:'undo',operationId:args.operationId,undoOf:args.undoOf}:{kind:'edit',operationId:args.operationId,before,applied:structuredClone(args.changes)}};
        const put=store.put(next);put.onsuccess=()=>{if(!valid())return abort('invalidated_before_commit');if(args.testAbortBeforeCommit)return abort('injected_abort');};
      };
      tx.onabort=()=>resolve({saved:false,reason});tx.onerror=()=>{reason='storage_failure';};
      tx.oncomplete=()=>resolve(valid()?{saved:true,committed:true,row:structuredClone(next)}:{saved:false,committed:true,reason:'committed_but_invalidated'});
    });
  }
  /** Generation invalidation must happen before this cleanup. No success until commit. */
  async cleanupInvalidated(owner,generation){
    if(!generation || this.marker()===generation)return {cleaned:false,reason:'invalidate_generation_first'};
    const db=await this.open();return new Promise(resolve=>{const t=db.transaction('months','readwrite'),s=t.objectStore('months'),r=s.openCursor();let count=0;r.onsuccess=()=>{const c=r.result;if(!c)return;if(c.value.owner===owner && c.value.generation===generation){c.delete();count++;}c.continue();};t.oncomplete=()=>resolve({cleaned:true,count});t.onabort=()=>resolve({cleaned:false,reason:'abort'});});
  }
}
