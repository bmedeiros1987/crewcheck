// Narrow HTTP adapter on the existing service. Compiled default OFF, no env switch.
import assert from 'node:assert/strict';
import {canonical} from '../../scripts/android-play/reconcile_journal.mjs';
import {validatePlan,validatePlannedRecord} from '../../scripts/android-play/planned_lifecycle.mjs';
import {createPlatformJournal,createPlatformReleaseProtocol} from '../../scripts/android-play/platform_journal.mjs';
import {createOidcVerifier} from './oidc.mjs';
import {createApprovalStore,createGitHubApprovalBinder,OPERATIONS} from './approval.mjs';
export const PATH='/api/platform/release-journal';
const exact=(v,keys)=>{assert(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Object.keys(v).sort(),[...keys].sort());};
const send=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(typeof value==='string'?value:JSON.stringify(value));};
async function readFrame(req){let size=0;const chunks=[];for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;assert(size<=65536);chunks.push(bytes);}const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));const f=JSON.parse(raw);assert.equal(canonical(f),raw,'Canonical frame required');exact(f,['schema','id','operation','binding','revision','input']);assert.equal(f.schema,2);assert(typeof f.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(f.id));assert(OPERATIONS.includes(f.operation));assert(Number.isSafeInteger(f.revision)&&f.revision>=0);exact(f.binding,['schema','generation','plan']);assert.equal(f.binding.schema,2);assert(Number.isSafeInteger(f.binding.generation)&&f.binding.generation>0);validatePlan(f.binding.plan);return {frame:f,raw};}
export function createReleaseJournalHandler({enabled=false,allowedOperations=OPERATIONS,poolProvider,verifyToken,verifyIngress,githubReviewProvider,proofCapabilities={},lifecycle={},now=()=>Math.floor(Date.now()/1000)}={}){
 assert.equal(typeof enabled,'boolean');
 assert(Array.isArray(allowedOperations)&&allowedOperations.length>0&&new Set(allowedOperations).size===allowedOperations.length&&allowedOperations.every(operation=>OPERATIONS.includes(operation)));
 const scope=Object.freeze([...allowedOperations]);
 // No caller can inject commit/Play callbacks into the Render side.
 const allowedProof=['verifyInventory','verifyArtifacts','verifyStage','verifyReconciliation','approveRollover'];assert(Object.keys(proofCapabilities).every(k=>allowedProof.includes(k)));
 const allowedLifecycle=['readCompleteState','verifyReviewProof','approveNextBinding'];assert(Object.keys(lifecycle).every(k=>allowedLifecycle.includes(k)));
 const pinnedProof=Object.freeze({...proofCapabilities}),pinnedLifecycle=Object.freeze({...lifecycle});
 const authenticate=verifyToken??createOidcVerifier({now});
 return async(req,res,url)=>{
  if(url.pathname!==PATH)return false;
  if(req.method!=='POST'){send(res,405,{ok:false,code:'RELEASE_JOURNAL_METHOD'});return true;}
  if(!enabled){send(res,503,{ok:false,code:'RELEASE_JOURNAL_OFF'});return true;}
  try{
   assert.equal(url.search,'');assert.equal(req.headers['content-type'],'application/json');
   // TLS/proxy provenance must be independently wired; a caller's forwarded header is insufficient.
   assert.equal(typeof verifyIngress,'function');assert.equal(await verifyIngress(req),true);
   const auth=req.headers.authorization;assert(typeof auth==='string'&&/^Bearer [A-Za-z0-9_.-]+$/.test(auth));
   const claims=await authenticate(auth.slice(7));const {frame,raw}=await readFrame(req);
   assert(scope.includes(frame.operation),'Operation outside compiled receiver scope');
   assert.equal(typeof githubReviewProvider?.verify,'function');
   const proof=await githubReviewProvider.verify(claims,frame);
   assert.equal(githubReviewProvider.isVerified(proof),true);
   assert.equal(typeof poolProvider,'function');const db=await poolProvider();assert(db);
   const binder=createGitHubApprovalBinder({db,proofProvider:githubReviewProvider});
   if(proof.state==='revoked'){await binder.revoke(proof);assert.equal(frame.operation,'observe','GitHub approval revoked');}
   else{assert.equal(githubReviewProvider.isFresh(proof),true);await binder.register(proof);}
   const approvals=createApprovalStore(db,{now});const receipt=await approvals.read(claims,frame);
   const capabilities={...pinnedProof,approvePlan:async p=>canonical(p)===canonical(receipt.approval.binding.plan),authorizeTransition:async(connection,context)=>{assert.equal(githubReviewProvider.isFresh(proof),true);return approvals.transitionAdmission(claims,frame,()=>githubReviewProvider.isFresh(proof))(connection,context);}};
   if(frame.operation==='probe'){
    assert.equal(frame.revision,0);exact(frame.input,[]);await createPlatformJournal(db).verifyExistingSchema();
    await approvals.read(claims,frame);assert.equal(githubReviewProvider.isFresh(proof),true);
    send(res,200,{schema:2,id:frame.id,status:'ok',namespace:'com.crewcheck.app',connectionVerified:true,retryAllowed:false,storeMutationAllowed:false});return true;
   }
   if(frame.operation==='observe'){
    // Explicit bounded recovery: no admission mutation, no receipt success projection.
    const journal=createPlatformJournal(db);const first=await journal.read(frame.binding.plan.package);assert(first);validatePlannedRecord(first);assert.deepEqual(first.plan,frame.binding.plan);assert.equal(first.generation,frame.binding.generation);assert.deepEqual(await journal.read(first.package),first);
    await approvals.read(claims,frame);
    send(res,200,{schema:2,id:frame.id,status:'ok',record:first,retryAllowed:false,resumeAllowed:false,storeMutationAllowed:false,rolloverAllowed:false,storeAvailability:'unknown'});return true;
   }
   const protocol=createPlatformReleaseProtocol({db,binding:frame.binding,authorize:async()=>{await approvals.read(claims,frame);return true;},journalCapabilities:capabilities,lifecycle:pinnedLifecycle});
   const response=await protocol(raw);send(res,JSON.parse(response).status==='ok'?200:409,response);return true;
  }catch{send(res,403,{ok:false,code:'RELEASE_JOURNAL_DENIED'});return true;}
 };
}
