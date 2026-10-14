// Benign source mutation fixtures only. No iframe, WebView, network or user data.
import assert from 'node:assert/strict';import fs from 'node:fs';
import {assertSharedPdfAckContract} from './shared-pdf-ack-contract.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const source={home:read('client/src/pages/Home.tsx'),android:read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java'),inbox:read('android-wrapper/app/src/main/java/com/crewcheck/app/SharedPdfInbox.java'),channel:read('client/src/lib/sharedPdfChannel.ts'),binding:read('client/src/lib/sharedPdfAccountBinding.ts')};
assertSharedPdfAckContract(source);let checks=1;
function rejects(label,key,before,after){assert(source[key].includes(before),'fixture anchor '+label);const fixture={...source,[key]:source[key].replace(before,after)};assert.throws(()=>assertSharedPdfAckContract(fixture),undefined,label);checks++;}
for(const name of ['acknowledgeSharedPdf','readSharedPdfChunk','sharedPdfStatus','reportSharedPdfSession','claimSharedPdf','blockSharedPdf','beginSharedPdfCommit','confirmSharedPdfCommit','readClaimedSharedPdfChunk','acknowledgeClaimedSharedPdf'])rejects('global alias '+name,'android','public class CrewCheckNativeBridge {','public class CrewCheckNativeBridge {\n @JavascriptInterface public String '+name+'(){return "";}');
rejects('anonymous new alias cannot expose inbox','android','public class CrewCheckNativeBridge {','public class CrewCheckNativeBridge {\n @JavascriptInterface public boolean oldReceiptAck(){return SharedPdfInbox.acknowledge(MainActivity.this,"id","A");}');
rejects('another global bridge cannot expose inbox','android','public class CrewCheckIFlightBridge {','public class CrewCheckIFlightBridge {\n @JavascriptInterface public boolean oldInboxAlias(){return SharedPdfInbox.acknowledge(MainActivity.this,"id","A");}');
rejects('missing owner fence','inbox','!owned(context, id, account) || !"committed"','!"committed"');
rejects('ACK before committed phase','inbox','!"committed".equals(phase(context))','!"claimed".equals(phase(context))');
rejects('durable identity guard missing','inbox','pending.id.equals(id.trim())','true');
rejects('durable ACK persisted failure ignored','inbox','if (!saved) return false;','if (false) return false;');
rejects('wrong request receipt','android','SharedPdfInbox.acknowledge(this,id,owner)','SharedPdfInbox.acknowledge(this,"other",owner)');
rejects('caller-selected owner','android','SharedPdfInbox.acknowledge(this,id,owner)','SharedPdfInbox.acknowledge(this,id,request.optString("owner",""))');
rejects('cleanup without success','android','Boolean.TRUE.equals(result) && id.equals(pendingSharedPdfId)','id.equals(pendingSharedPdfId)');
rejects('reply missing request ID','android','response.put("id",id);','response.put("other",id);');
rejects('reply missing epoch','android','response.put("epoch",epoch);','response.put("otherEpoch",epoch);');
rejects('reply missing document','android','response.put("document",pdfDocument);','response.put("otherDocument",pdfDocument);');
rejects('client ignores request correlation','channel','pending.get(response.id)','pending.values().next().value');
rejects('client does not await ACK','home',"await sharedPdfChannelCall('ack',shareId)","sharedPdfChannelCall('ack',shareId)");
rejects('client ACK before native confirmation','home','if (!(await markSharedPdfCommitted(payload))) return;','');
rejects('delete before durable commit','inbox','boolean saved = persist(context, terminal','new File(path).delete(); boolean saved = persist(context, terminal');
rejects('no rollback on failed disk commit','inbox','rollback.commit();','');
rejects('reply missing result','android','response.put("result",result);','response.put("otherResult",result);');
console.log('PASS shared PDF ACK contract: '+checks+' positive/negative source fixtures');
