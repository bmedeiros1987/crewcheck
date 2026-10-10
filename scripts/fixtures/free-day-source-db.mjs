export function syntheticSourceDatabase() {
  const state={owner:'synthetic-owner',roster:{crewId:'900001',base:'BSB'},rows:new Map(),jobs:new Map(),created:Date.parse('2020-01-01T00:00Z')};let tail=Promise.resolve();
  return {state,async getConnection(){const prior=tail;let release;tail=new Promise(r=>release=r);await prior;let snapshot;
    return {async beginTransaction(){snapshot=structuredClone({rows:state.rows,jobs:state.jobs});},async commit(){},async rollback(){state.rows=snapshot.rows;state.jobs=snapshot.jobs;},release,
      async query(sql,args){if(sql.startsWith('SELECT public_id'))return [[{public_id:state.owner,created_epoch:state.created}]];
        if(sql.startsWith('SELECT payload'))return [[...(state.rows.has(args[0])?[{payload:state.rows.get(args[0])}]:[])]];
        if(sql.startsWith('SELECT roster'))return [[{roster:JSON.stringify(state.roster)}]];
        if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){state.rows.set(args[0],args[1]);return [{affectedRows:1}];}
        if(sql.startsWith('UPDATE crewcheck_notification_jobs') && sql.includes("LEFT(job_key,16)")){let n=0;for(const job of state.jobs.values()){if(job.email===args[0] && job.job_key.startsWith('free-day:source:') && ['held','pending','processing'].includes(job.status)){job.status='cancelled';n++;}}return [{affectedRows:n}];}
        if(sql.startsWith('DELETE FROM crewcheck_telegram_state')){let n=0;for(const [key,value] of state.rows){const row=JSON.parse(value);if(key.startsWith('notification-free-day-source-job:') && row.email===args[0] && row.ownerId===args[1]){state.rows.delete(key);n++;}}return [{affectedRows:n}];}
        if(sql.startsWith('SELECT id,status FROM crewcheck_notification_jobs')){const job=state.jobs.get(args[1]);return [[...(job && job.email===args[0]?[{id:job.id,status:job.status}]:[])]];}
        if(sql.startsWith('INSERT INTO crewcheck_notification_jobs')){if(!state.jobs.has(args[1]))state.jobs.set(args[1],{id:state.jobs.size+1,email:args[0],job_key:args[1],message:args[3],status:'held',chat_id:null,telegram_username:null,phone:null});return [{affectedRows:1}];}
        throw Error('Unexpected SQL '+sql);
      }};
  }};
}
