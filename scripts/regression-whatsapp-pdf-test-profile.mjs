import assert from 'node:assert/strict';
import { enqueuePdfJob, runPdfJobs } from '../server/concierge/whatsapp-pdf-queue.mjs';
import { sendWhatsAppText } from '../server/whatsapp.mjs';
import { importWhatsAppPdf } from '../server/concierge/whatsapp-pdf.mjs';
import { withWhatsAppTestReply, whatsappTestProfileStamp } from '../server/concierge/whatsapp-test-send-policy.mjs';
const A='5511000000001', B='5511000000002', receiver='999999999';
function configure() {
  Object.assign(process.env, { WHATSAPP_ACCESS_TOKEN:'fictional', WHATSAPP_PHONE_NUMBER_ID:receiver,
    CREWCHECK_WHATSAPP_TEST_PROFILE:'restricted', CREWCHECK_WHATSAPP_TEST_RECIPIENTS:JSON.stringify([A,B]),
    CREWCHECK_WHATSAPP_TEST_PHONE_NUMBER_ID:receiver, CREWCHECK_WHATSAPP_TEST_TRANSPORT_ATTESTED:'true', CREWCHECK_WHATSAPP_TEST_ISOLATION_ATTESTED:'true' });
}
const remove=()=>{delete process.env.CREWCHECK_WHATSAPP_TEST_PROFILE;};
const change=()=>{process.env.CREWCHECK_WHATSAPP_TEST_RECIPIENTS=JSON.stringify([B,'5511000000003']);};
const message=()=>({id:'fixture-pdf',from:A,phoneNumberId:receiver,type:'document',timestamp:String(Math.floor(Date.now()/1000)),document:{id:'100',mime_type:'application/pdf'}});
const link={email:'owner@example.invalid',linked_at:'fictional-version',consent_concierge:1};
let imports=0,fetches=0;
globalThis.fetch=async()=>{fetches++;return {ok:true,json:async()=>({messages:[{id:'fictional'}]})};};
async function worker({before=()=>{},duringLink=()=>{},duringImport=()=>{},duringConfirmation=()=>{},revoked=false}={}) {
  configure();imports=fetches=0;const m=message(),job={stage:'queued',binding:JSON.stringify([link.email,link.linked_at]),phoneCipher:'fake',testProfileStamp:whatsappTestProfileStamp(),message:m};
  before();let reads=0;const pool={query:async(sql)=>sql.startsWith('SELECT')?[[{state_key:'fixture',payload:JSON.stringify(job)}]]:[{affectedRows:1}]};
  const outcomes=await runPdfJobs(pool,{enabled:()=>true,now:()=>new Date(),receiver:()=>receiver,decryptPhone:()=>A,
    findLink:async()=>{await Promise.resolve();reads++;if(reads===1)duringLink();else duringConfirmation();return revoked?{...link,revoked_at:'fixture'}:link;},
    importPdf:async()=>{imports++;await Promise.resolve();duringImport();return {ok:true};},
    confirm:(phone,id,phoneNumberId,result,metadata)=>withWhatsAppTestReply({from:phone,id,phoneNumberId,...metadata},'pdf',()=>sendWhatsAppText(phone,'fixture',{replyToMessageId:id,expectedPhoneNumberId:phoneNumberId}))});
  return outcomes;
}
for(const mutate of [remove,change]) {
  await worker({before:mutate});assert.equal(imports,0);assert.equal(fetches,0);
  await worker({duringLink:mutate});assert.equal(imports,0);assert.equal(fetches,0);
  await worker({duringImport:mutate});assert.equal(imports,1);assert.equal(fetches,0);
  await worker({duringConfirmation:mutate});assert.equal(fetches,0);
  configure();const m=message();let persisted,commits=0,rollbacks=0;
  const connection={beginTransaction:async()=>{},query:async(sql,args)=>{await Promise.resolve();if(sql.startsWith('SELECT')){mutate();return [[link]];}persisted=JSON.parse(args[1]);return [{affectedRows:1}];},commit:async()=>{commits++;},rollback:async()=>{rollbacks++;},release:()=>{}};
  const queued=await enqueuePdfJob({getConnection:async()=>connection},m,{receiver:()=>receiver,phoneHash:()=> 'fixture-hash',encryptPhone:()=> 'fixture-cipher',now:()=>new Date()});
  assert.equal(queued.queued,false);assert.equal(persisted,undefined);assert.equal(commits,0);assert.equal(rollbacks,1);
}
await worker({revoked:true});assert.equal(imports,0);assert.equal(fetches,0);
await worker();assert.equal(imports,1);assert.equal(fetches,1);
for (const mutate of [remove,change]) {
  configure();let commits=0;
  const m={...message(),testProfileStamp:whatsappTestProfileStamp()};
  const result=await importWhatsAppPdf(m,{environment:{CREWCHECK_WHATSAPP_PDF_ENABLED:'true'},receiver:()=>receiver,findLink:async()=>link,
    download:async()=>{await Promise.resolve();mutate();return {bytes:Buffer.from('synthetic'),filename:'fixture.pdf'};},
    parse:async()=>({roster:{days:[{}]}}),commit:async()=>{commits++;return {ok:true};}});
  assert.equal(result.ok,false);assert.equal(commits,0,'real importer rejects drift during download before persistence');
  configure();let committed=0,rolledBack=0;const stamp=whatsappTestProfileStamp();let saved;
  const c={beginTransaction:async()=>{},query:async(sql,args)=>{if(sql.startsWith('SELECT'))return [[link]];saved=JSON.parse(args[1]);await Promise.resolve();mutate();return [{affectedRows:1}];},commit:async()=>{committed++;},rollback:async()=>{rolledBack++;},release:()=>{}};
  assert.equal((await enqueuePdfJob({getConnection:async()=>c},message(),{receiver:()=>receiver,phoneHash:()=> 'fixture',encryptPhone:()=> 'fake',now:()=>new Date()})).queued,false);
  assert.equal(saved.testProfileStamp,stamp);assert.equal(committed,0);assert.equal(rolledBack,1,'enqueue rolls back drift during INSERT await');
}
console.log('PASS actual PDF queue → confirmation wrapper → sender: removed/changed profile before job, during link/import/confirmation and enqueue; revoked binding; positive control; fictional SQL/import/fetch only');
