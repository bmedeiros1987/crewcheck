// Controlled SQL adapter for fast failure injection. Real InnoDB runs the same scenarios in CI.
export function createAsaasMemory() {
  let data = { receipts: {}, subscriptions: [], profiles: {}, legacy: {} }, tail = Promise.resolve();
  const clone = value => structuredClone(value);
  async function query(sql, p = []) {
    if (sql.startsWith('INSERT INTO crewcheck_asaas_webhook_inbox')) {
      if (!data.receipts[p[0]]) data.receipts[p[0]] = { event_id:p[0], payload_hash:p[1], event_name:p[2], subscription_ref:p[3], event_time:p[4], decision_payload:JSON.parse(p[5]), disposition:'received', reason:'received', attempts:0 };
      return { rows:[], rowCount:1 };
    }
    if (sql.startsWith('SELECT * FROM crewcheck_asaas_webhook_inbox')) return { rows:data.receipts[p[0]] ? [clone(data.receipts[p[0]])] : [] };
    if (sql.startsWith('SELECT 1 FROM crewcheck_platform_webhook_events')) return { rows:data.legacy[p[0]] ? [{}] : [] };
    if (sql.startsWith('SELECT * FROM crewcheck_platform_subscriptions')) return { rows:clone(data.subscriptions.filter(x=>x.provider.toLowerCase()==='asaas'&&x.provider_ref.toLowerCase()===p[0].toLowerCase()).slice(0,2)) };
    if (sql.startsWith('SELECT plan FROM crewcheck_platform_profiles')) return { rows:data.profiles[p[0]] ? [{plan:data.profiles[p[0]]}] : [] };
    if (sql.startsWith('UPDATE crewcheck_platform_subscriptions')) {
      const row = data.subscriptions.find(x=>x.email===p[0]&&x.provider==='asaas'&&x.provider_ref===p[1]);
      if (!row) return {rowCount:0,rows:[]};
      Object.assign(row,{status:p[2],current_period_end:p[3],metadata:JSON.parse(p[4])});return {rowCount:1,rows:[]};
    }
    if (sql.startsWith('UPDATE crewcheck_platform_profiles')) { data.profiles[p[0]]=p[1];return {rowCount:1,rows:[]}; }
    if (sql.startsWith('UPDATE crewcheck_asaas_webhook_inbox')) { Object.assign(data.receipts[p[0]],{disposition:p[1],reason:p[2],attempts:data.receipts[p[0]].attempts+1});return {rowCount:1,rows:[]}; }
    throw new Error('Unexpected synthetic SQL: '+sql);
  }
  return {
    db:{ query, async connect(){ const previous=tail;let unlock;tail=new Promise(r=>unlock=r);await previous;let backup;
      return { async query(sql,p){if(sql==='BEGIN'){backup=clone(data);return {rows:[]};}if(sql==='COMMIT')return {rows:[]};if(sql==='ROLLBACK'){data=backup;return {rows:[]};}return query(sql,p);},release(){unlock();} }; } },
    async reset(){data={receipts:{},subscriptions:[],profiles:{},legacy:{}};},
    async seed(row={}){const s={email:'fictional@example.test',plan:'premium_monthly',status:'pending',provider:'asaas',provider_ref:'sub_synthetic',metadata:{},current_period_end:null,...row};data.subscriptions.push(clone(s));if(!row.noProfile)data.profiles[s.email]=row.profilePlan||'free';},
    async legacy(id){data.legacy[id]=true;}, async state(){return clone(data);},
  };
}
