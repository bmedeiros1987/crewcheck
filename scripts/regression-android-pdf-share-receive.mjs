import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Real Android Intent/IntentFilter classes, with controlled resolver/lifecycle/UI
// boundaries. No emulator, installation, personal PDF, account or network access.
const jar=process.env.CREWCHECK_ANDROID_FRAMEWORK_JAR;
assert(jar&&fs.statSync(jar).isFile(),'Set CREWCHECK_ANDROID_FRAMEWORK_JAR to pinned android-all15');
const source=fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','utf8');
const xml=fs.readFileSync(process.env.CREWCHECK_SHARE_MANIFEST||'android-wrapper/app/src/main/AndroidManifest.xml','utf8');
const activity=[...xml.matchAll(/<activity\b[\s\S]*?<\/activity>/g)].map(x=>x[0]).find(x=>/android:name="(?:com\.crewcheck\.app\.)?\.?MainActivity"/.test(x));
assert(activity&&activity.includes('android:exported="true"'),'share activity must be exported');
const filters=[...activity.matchAll(/<intent-filter>[\s\S]*?<\/intent-filter>/g)].map(x=>x[0]);
const values=(s,key)=>[...s.matchAll(new RegExp('android:'+key+'="([^"]+)"','g'))].map(x=>x[1]);
const quoted=JSON.stringify;
const declarations=filters.map(block=>`{IntentFilter f=new IntentFilter();${[...block.matchAll(/<action[^>]*android:name="([^"]+)"/g)].map(x=>`f.addAction(${quoted(x[1])});`).join('')}${[...block.matchAll(/<category[^>]*android:name="([^"]+)"/g)].map(x=>`f.addCategory(${quoted(x[1])});`).join('')}${values(block,'mimeType').map(x=>`f.addDataType(${quoted(x)});`).join('')}${values(block,'scheme').map(x=>`f.addDataScheme(${quoted(x)});`).join('')}filters.add(f);}`).join('\n');
function method(signature){const start=source.indexOf(signature);assert(start>=0,signature);const open=source.indexOf('{',start);let depth=0;for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&!--depth)return source.slice(start,i+1);}throw Error('Method not closed');}
const receiver=method('private void handleIncomingPdfIntent('),reader=method('private void readIncomingPdfUri('),warm=method('protected void onNewIntent(');
assert(method('protected void onCreate(').includes('handleIncomingPdfIntent(getIntent());'),'cold entry must call actual receiver');
assert(warm.includes('setIntent(intent);')&&warm.includes('handleIncomingPdfIntent(intent);'),'warm entry must use new intent');
const clipped=receiver.includes('intent.getClipData()');
const expectMatch=true;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-share-receive-'));
const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/java'):'java';
const harness=`import android.content.*;import android.net.Uri;import android.util.Base64;import java.io.*;import java.util.*;import java.nio.charset.StandardCharsets;
class ShareLifecycle {int warmEntries;protected void onNewIntent(Intent i){warmEntries++;}}
public class ShareReceiveHarness extends ShareLifecycle {
 static final int MAX_PDF_BYTES=35*1024*1024;
 private String pendingSharedPdfName,pendingSharedPdfBase64,pendingSharedPdfId;
 private Intent current;int dispatches,reads;final List<String> errors=new ArrayList<>();
 static final byte[] PDF="%PDF-1.7\\nSynthetic roster fixture only\\n%%EOF".getBytes(StandardCharsets.UTF_8);
 void setIntent(Intent i){current=i;}Intent getIntent(){return current;}
 void cold(Intent i){setIntent(i);handleIncomingPdfIntent(getIntent());}
 void dispatchPendingSharedPdf(){dispatches++;}
 class Resolver {InputStream openInputStream(Uri u){reads++;if((current.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)==0)throw new SecurityException("synthetic grant denied");if(u.toString().contains("bad"))return new ByteArrayInputStream(new byte[]{1,2,3,4,5});return new ByteArrayInputStream(PDF);}}
 Resolver getContentResolver(){return new Resolver();}
 static class Toast {static final int LENGTH_LONG=1;ShareReceiveHarness h;String m;static Toast makeText(Object o,String m,int n){Toast t=new Toast();t.h=(ShareReceiveHarness)o;t.m=m;return t;}void show(){h.errors.add(m);}}
 ${receiver}
 ${reader}
 ${warm}
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 static Intent send(String type,Uri uri){return new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);}
 static boolean resolves(List<IntentFilter> filters,Intent i){for(IntentFilter f:filters)if(f.match(i.getAction(),i.getType(),i.getScheme(),i.getData(),Set.of(Intent.CATEGORY_DEFAULT),"synthetic")>=0)return true;return false;}
 public static void main(String[]args)throws Exception{
  List<IntentFilter> filters=new ArrayList<>();${declarations}
  Uri uri=Uri.parse("content://synthetic/roster.pdf");Intent incoming=send("application/pdf",uri);
  check(incoming.getData()==null,"normal SEND carries URI in EXTRA_STREAM, not Intent.data");
  check(resolves(filters,incoming)==${expectMatch},"PDF discovery mismatch for actual manifest");
  check(resolves(filters,send("application/octet-stream",uri))==${expectMatch},"octet discovery mismatch");
  check(!resolves(filters,send("text/plain",uri)),"do not advertise unsupported text type");
  check(!resolves(filters,new Intent(Intent.ACTION_SEND_MULTIPLE).setType("application/pdf")),"do not advertise unsupported multiple import");
  check(resolves(filters,new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/pdf")),"VIEW content PDF retained");
  check(resolves(filters,new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("file:///synthetic.pdf"),"application/pdf")),"VIEW file PDF retained");
  check(!resolves(filters,new Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse("https://example.test/roster.pdf"),"application/pdf")),"do not widen VIEW to remote URLs");
  ShareReceiveHarness cold=new ShareReceiveHarness();cold.cold(incoming);check(cold.dispatches==1&&cold.reads==1,"cold receive reads bytes and dispatches exactly once");check(cold.errors.isEmpty(),"valid cold PDF accepted");check(Arrays.equals(Base64.decode(cold.pendingSharedPdfBase64,Base64.DEFAULT),PDF),"actual reader passes identical bytes");check(cold.pendingSharedPdfName.endsWith(".pdf"),"filename retained");
  cold.onNewIntent(send("application/pdf",Uri.parse("content://synthetic/next.pdf")));check(cold.warmEntries==1&&cold.current.getParcelableExtra(Intent.EXTRA_STREAM)!=null&&cold.dispatches==2,"actual warm method reads new intent");
  ${clipped?`ShareReceiveHarness clip=new ShareReceiveHarness();Intent clipIntent=new Intent(Intent.ACTION_SEND).setType("application/pdf").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);clipIntent.setClipData(ClipData.newRawUri("synthetic",uri));clip.cold(clipIntent);check(clip.dispatches==1,"ClipData fallback receives PDF");`:''}
  ShareReceiveHarness denied=new ShareReceiveHarness();denied.cold(send("application/pdf",uri).setFlags(0));check(denied.dispatches==0&&denied.errors.size()==1,"grant denial must not dispatch");
  ShareReceiveHarness bad=new ShareReceiveHarness();bad.cold(send("application/pdf",Uri.parse("content://synthetic/bad.pdf")));check(bad.dispatches==0&&bad.errors.size()==1,"PDF signature rejects arbitrary bytes");
  ShareReceiveHarness absent=new ShareReceiveHarness();absent.cold(new Intent(Intent.ACTION_SEND).setType("application/pdf"));check(absent.dispatches==0&&absent.reads==0,"missing URI does not import");
  System.out.println("PASS actual Android filter matching and extracted cold/warm receiver/reader; controlled grants/UI/dispatch, synthetic PDF bytes, no device or parser/session delivery claim.");
 }
}`;
try{fs.writeFileSync(path.join(temp,'ShareReceiveHarness.java'),harness);for(const args of [['com.sun.tools.javac.Main','-encoding','UTF-8','-cp',jar,'-d',temp,path.join(temp,'ShareReceiveHarness.java')],['-Xmx256m','-cp',temp+path.delimiter+jar,'ShareReceiveHarness']]){const r=spawnSync(java,args,{encoding:'utf8'});assert.equal(r.status,0,(r.stdout||'')+(r.stderr||''));if(r.stdout)process.stdout.write(r.stdout);}}
finally{fs.rmSync(temp,{recursive:true,force:true});}
