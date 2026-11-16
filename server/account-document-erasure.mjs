import {createHash}from'node:crypto';
const fail=()=>Object.assign(new Error('DOCUMENT_ERASURE_REVIEW_REQUIRED'),{code:'DOCUMENT_ERASURE_REVIEW_REQUIRED'});
// Unwired preparation. Preserves pending provider work in the caller's existing
// authenticated transaction. No provider, retry worker, new retention or DDL.
export async function preserveAccountDocumentRemovalQueue(client,email,{assertTransaction}={}){
 // Current base lacks the billing branch's transaction-client capability.
 // Require an explicit trusted internal attestor; do not accept a pool by default.
 if(typeof assertTransaction!=='function')throw Object.assign(new Error('DOCUMENT_ERASURE_TRANSACTION_REQUIRED'),{code:'DOCUMENT_ERASURE_TRANSACTION_REQUIRED'});
 await assertTransaction(client);
 if(typeof email!=='string'||email!==email.trim().toLowerCase()||email.length>254||!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/).test(email))throw fail();
 const documents=(await client.query("SELECT id,storage_public_id FROM crewcheck_platform_documents WHERE owner_email=$1 AND storage_provider='cloudinary' AND status='active' FOR UPDATE",[email])).rows;
 for(const doc of documents){
  if(typeof doc.id!=='string'||!doc.id||typeof doc.storage_public_id!=='string'||!doc.storage_public_id||doc.storage_public_id.length>500)throw fail();
  const existing=(await client.query('SELECT id,document_id,owner_email,storage_public_id,completed_at FROM crewcheck_platform_document_deletion_queue WHERE owner_email=$1 AND document_id=$2 FOR UPDATE',[email,doc.id])).rows;
  if(existing.length){if(existing.some(x=>x.owner_email!==email||x.document_id!==doc.id||x.storage_public_id!==doc.storage_public_id||x.completed_at!==null))throw fail();continue;}
  const id=createHash('sha256').update(JSON.stringify(['account-document-erasure-v1',email,doc.id,doc.storage_public_id])).digest('hex');
  await client.query("INSERT INTO crewcheck_platform_document_deletion_queue(id,document_id,owner_email,storage_public_id,last_error) VALUES($1,$2,$3,$4,'provider_pending')",[id,doc.id,email,doc.storage_public_id]);
 }
 // Never delete/rearm existing queue rows or claim that provider objects vanished.
 return{queuePreserved:true,providerDeletionNotAttested:true,accountDeletionNotAttested:true};
}
