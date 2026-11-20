import {withTelegramBindingClosureTransaction,TelegramBindingError}from'./telegram-binding-state.mjs';
import {mysqlAdapter}from'./mysql-platform-adapter.mjs';
import {preserveAccountDocumentRemovalQueue}from'./account-document-erasure.mjs';
// Isolated preparation only. The raw connection comes exclusively from the
// verified closure transaction, never a body-supplied pool/client or attestor.
export async function prepareTelegramClosureDocumentQueue(pool,input){
 const captured=structuredClone(input);
 return withTelegramBindingClosureTransaction(pool,captured,async raw=>{
  let active=true;const adapted=mysqlAdapter(raw);
  const assertActive=()=>{if(!active)throw new TelegramBindingError('LINK_CLOSURE_TRANSACTION_ENDED');};
  const client={async query(sql,params){assertActive();return adapted.query(sql,params);}};
  try{return await preserveAccountDocumentRemovalQueue(client,captured.email,{assertTransaction:async candidate=>{assertActive();if(candidate!==client)throw new TelegramBindingError('LINK_CLOSURE_TRANSACTION_REQUIRED');}});}
  finally{active=false;}
 });
}
