// Inactive bridge for an injected EXISTING platform query/connect adapter.
// No import of platform state, environment, native pool getter, connection URL or API.
import assert from 'node:assert/strict';
import {createMysqlJournal} from './mysql_journal.mjs';
import {createJournalProtocol} from './journal_protocol.mjs';

function platformQuery(adapter){
  return async(sql,args=[])=>{
    // Journal SQL is owned/fixed by mysql_journal; convert its ? binds to the
    // platform's $n contract. Passing ? directly silently loses params there.
    let index=0;
    const statement=sql.replace(/\?/g,()=>`$${++index}`);
    assert.equal(index,args.length,'Journal/platform bind count mismatch');
    const result=await adapter.query(statement,args);
    assert(result && Array.isArray(result.rows)&&Number.isSafeInteger(result.rowCount));
    return /^\s*SELECT\b/i.test(sql)?[result.rows]:[{affectedRows:result.rowCount}];
  };
}
export function createPlatformJournal(db,capabilities={}){
  assert.equal(db?.dialect,'mysql');
  assert.equal(typeof db.query,'function');assert.equal(typeof db.connect,'function');
  const bridge={query:platformQuery(db),async getConnection(){
    const connection=await db.connect();
    // Refuse adapter.connect fallback or a connection without uncertain-write
    // disposal. An unknown commit must never release a reusable connection.
    if(connection===db||typeof connection?.release!=='function'||typeof connection?.discard!=='function'){
      if(connection!==db)connection?.release?.();
      throw Error('Owned disposable platform transaction connection required');
    }
    const query=platformQuery(connection);
    return {query,beginTransaction:()=>query('BEGIN'),commit:()=>query('COMMIT'),rollback:()=>query('ROLLBACK'),release:()=>connection.release(),destroy:()=>connection.discard()};
  }};
  return createMysqlJournal(bridge,capabilities);
}

// Composition for the already-owned application adapter, not a new connection.
// No runtime caller/endpoint supplies these capabilities; publication stays OFF.
export function createPlatformReleaseProtocol({db,binding,authorize,lifecycle,journalCapabilities={}}){
  return createJournalProtocol({journal:createPlatformJournal(db,journalCapabilities),binding,authorize,lifecycle});
}
