export function syntheticSourceDatabase() {
  const state={owner:'synthetic-owner',roster:{crewId:'900001',base:'BSB'},rows:new Map()};let tail=Promise.resolve();
  return {state,async getConnection(){const prior=tail;let release;tail=new Promise(r=>release=r);await prior;let snapshot;
    return {async beginTransaction(){snapshot=structuredClone(state.rows);},async commit(){},async rollback(){state.rows=snapshot;},release,
      async query(sql,args){if(sql.startsWith('SELECT public_id'))return [[{public_id:state.owner}]];
        if(sql.startsWith('SELECT payload'))return [[...(state.rows.has(args[0])?[{payload:state.rows.get(args[0])}]:[])]];
        if(sql.startsWith('SELECT roster'))return [[{roster:JSON.stringify(state.roster)}]];
        if(sql.startsWith('INSERT INTO crewcheck_telegram_state')){state.rows.set(args[0],args[1]);return [{affectedRows:1}];}
        throw Error('Unexpected SQL '+sql);
      }};
  }};
}
