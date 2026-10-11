// TEST ONLY: deterministic SQL fixture, no connection or authority.
import assert from 'node:assert/strict';
// Transaction-serial fixture models PK exclusivity and commit-response loss.
// This is not a real InnoDB integration test or evidence of production access.
export function database(){
  const rows=new Map();let tail=Promise.resolve(),loseNextCommit=false;
  const db={rows,calls:[],engine:'InnoDB',primary:['state_key'],payloadType:'json',lose(){loseNextCommit=true;},
    async query(sql,args){db.calls.push(sql);
      if(sql.includes('information_schema.tables'))return [[{engine:db.engine}]];
      if(sql.includes('information_schema.statistics'))return [db.primary.map(column_name=>({column_name}))];
      if(sql.includes('information_schema.columns'))return [[{data_type:db.payloadType}]];
      assert(sql.startsWith('SELECT payload'));return [[...(rows.has(args[0])?[{payload:rows.get(args[0])}]:[])]];},
    async getConnection(){let unlock;const previous=tail;tail=new Promise(resolve=>unlock=resolve);await previous;let snapshot,committed=false,unlocked=false;
      const finish=()=>{if(!unlocked){unlocked=true;unlock();}};
      return {async beginTransaction(){snapshot=structuredClone(rows);},async query(sql,args){db.calls.push(sql);
        if(sql.startsWith('SELECT payload'))return [[...(rows.has(args[0])?[{payload:rows.get(args[0])}]:[])]];
        if(sql.startsWith('INSERT INTO')){assert(!rows.has(args[0]));rows.set(args[0],args[1]);return [{affectedRows:1}];}
        if(sql.startsWith('UPDATE')){assert(rows.has(args[1]));rows.set(args[1],args[0]);return [{affectedRows:1}];}
        assert.fail('Unexpected SQL');},
        async commit(){committed=true;if(loseNextCommit){loseNextCommit=false;throw Error('synthetic secret DB diagnostic');}},
        async rollback(){assert(!committed);rows.clear();for(const [key,value] of snapshot)rows.set(key,value);},release:finish,destroy:finish};}
  };return db;
}
