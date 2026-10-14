import assert from 'node:assert/strict';
// Source contract complements the real web/JVM behavioral suites; no bridge is executed here.
export function block(source, signature) {
  const start=source.indexOf(signature);assert(start>=0,'missing '+signature);
  const open=source.indexOf('{',start);let depth=0,quote=null,escape=false,line=false,comment=false;
  for(let i=open;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(line){if(c==='\n')line=false;continue;}if(comment){if(c==='*'&&next==='/'){comment=false;i++;}continue;}
    if(quote){if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote=null;continue;}
    if(c==='/'&&next==='/'){line=true;i++;continue;}if(c==='/'&&next==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}if(c==='{')depth++;if(c==='}'&&!--depth)return source.slice(open+1,i);
  }
  throw Error('unclosed '+signature);
}
const flat=s=>s.replace(/\s+/g,'');
export function assertSharedPdfAckContract({home,android,inbox,channel,binding}) {
  const global=block(android,'public class CrewCheckNativeBridge');
  const aliases=['acknowledgeSharedPdf','readSharedPdfChunk','sharedPdfStatus','reportSharedPdfSession','claimSharedPdf','blockSharedPdf','beginSharedPdfCommit','confirmSharedPdfCommit','readClaimedSharedPdfChunk','acknowledgeClaimedSharedPdf'];
  for(const name of aliases)assert.doesNotMatch(android,new RegExp('public\\s+(?:boolean|String)\\s+'+name+'\\s*\\('),'sensitive global alias '+name);
  assert.doesNotMatch(global,/\b(?:SharedPdfInbox|pdfChannelPolicy|pendingSharedPdfId)\b/,'global interface cannot access inbox authority');
  for(const name of ['openPdfPicker','openGoogleDrivePdfPicker'])assert.match(global,new RegExp('public boolean '+name+'\\('),'manual picker preserved');
  const host=flat(block(android,'private void installPdfChannel()'));
  assert(host.includes('acceptsDocument(origin,isMainFrame,document)'),'origin/frame/document required');
  const owner=host.indexOf('Stringowner=pdfChannelPolicy.owner(epoch,android.os.SystemClock.elapsedRealtime());');
  const ack=host.indexOf('case"ack":');assert(owner>=0&&ack>owner,'ACK uses host-validated current epoch owner');
  assert(host.slice(owner,ack).includes('if(owner==null){replyPdf(reply,requestId,epoch,false);return;}'),'invalid owner rejected before ACK');
  assert(!host.includes('request.optString("owner"'),'caller owner cannot establish identity');
  const operation=host.slice(ack,host.indexOf('break;',ack));
  assert(operation.includes('result=SharedPdfInbox.acknowledge(this,id,owner);'),'exact receipt and derived owner passed to durable ACK');
  assert(operation.includes('if(Boolean.TRUE.equals(result)&&id.equals(pendingSharedPdfId))'),'pending cleanup gated by successful exact ACK');
  const reply=flat(block(android,'private void replyPdf('));for(const field of ['"id",id','"epoch",epoch','"document",pdfDocument','"result",result'])assert(reply.includes('.put('+field+')'),'reply correlation '+field);
  const same=flat(block(inbox,'private static boolean same(')),owned=flat(block(inbox,'private static boolean owned('));
  assert(same.includes('pending.id.equals(id.trim())')&&owned.includes('same(context,id)')&&owned.includes('account.equals(owner(context))'),'durable receipt identity and owner fence');
  const durable=flat(block(inbox,'public static synchronized boolean acknowledge('));
  assert(durable.includes('if(!owned(context,id,account)||!"committed".equals(phase(context)))returnfalse;')&&durable.includes('returnclear(context,id);'),'durable committed phase required before deletion');
  const clear=flat(block(inbox,'private static boolean clear('));
  assert(clear.includes('expectedId.equals(prefs.getString(KEY_ID,""))'),'durable pointer exact ID');
  const saved=clear.indexOf('booleansaved=persist('),failure=clear.indexOf('if(!saved)returnfalse;'),deletion=clear.indexOf('newFile(path).delete()');
  assert(saved>=0&&failure>saved&&deletion>failure,'persist must succeed before deleting bytes');
  const persist=flat(block(inbox,'private static boolean persist('));assert(persist.includes('changes.commit()')&&persist.includes('rollback.commit()')&&persist.endsWith('returnfalse;'),'failed commit restores pointer and reports failure');
  const listener=flat(home);
  assert(listener.includes("awaitsharedPdfChannelCall('ack',shareId)===true"),'client awaits correlated ACK');
  assert(listener.includes('if(!(awaitmarkSharedPdfCommitted(payload)))return;finalized=awaitfinalizeSharedPdf();'),'canonical commit confirmation precedes ACK');
  assert(listener.includes('committed!==true||!context.plannedImport.canCommit()||!context.canCommit()||context.importOwner!==publicationOwner()'),'commit/choice/account guards retained');
  const marker=flat(block(binding,'export async function markSharedPdfCommitted('));assert(marker.includes("awaitsharedPdfChannelCall('confirm',sharedPdfIdentity(payload))!==true"),'native durable confirmation required');
  const client=flat(channel);for(const guard of ['pending.get(response.id)','response.document!==item.document','getToken()!==item.token','response?.epoch!==epoch'])assert(client.includes(guard),'client response fence '+guard);
}
