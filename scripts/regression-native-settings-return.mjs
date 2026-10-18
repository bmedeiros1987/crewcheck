import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// Execute the actual Activity callbacks; Android navigation and permission I/O
// are explicit doubles. No device, browser, permission prompt or real settings.
const source=fs.readFileSync(process.env.CREWCHECK_ACTIVITY_SOURCE||'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','utf8');
function method(signature){const start=source.indexOf(signature);assert(start>=0,signature);let end=source.indexOf('{',start)+1,depth=1;for(;depth;end++){if(source[end]==='{')depth++;if(source[end]==='}')depth--;}return source.slice(start,end);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'crewcheck-settings-return-'));
try{
 fs.writeFileSync(path.join(tmp,'SettingsReturnFixture.java'),`
class BaseActivity {int parentBack;protected void onResume(){}public void onBackPressed(){parentBack++;}}
public class SettingsReturnFixture extends BaseActivity {
 static final int LIFE_COMPANION_REFRESH_SETTLE_MS=1;static int checks;
 static void check(boolean ok,String why){checks++;if(!ok)throw new AssertionError(why);}
 static class WebView {boolean history;int backs,reloads;void postDelayed(Runnable task,int delay){task.run();}boolean canGoBack(){return history;}void goBack(){backs++;}}
 static class CrewLifeWatchPublisher {static void retryPendingRevocation(SettingsReturnFixture a,java.util.function.Consumer<Object> callback){}}
 static class Coordinator {void checkForUpdate(){}}
 static class Health {void refreshFromHost(){}}
 Coordinator playUpdateCoordinator;Health healthBridge;void dispatchCrewCheckWatchSyncResult(Object value){}
 WebView webView=new WebView(),portalWebView;boolean systemPermission,reportedPermission;int statusEvents,closedPortal;
 void resumeLifeCompanionMigrationIfNeeded(){}void syncLifeCompanionToCrewCheckAndWatch(String reason){}void requestLifeCompanionRefresh(){}
 void dispatchCrewCheckPermissionStatus(){if(webView!=null){statusEvents++;reportedPermission=systemPermission;}}
 void finishIFlightWithError(String message){closedPortal++;}
 ${method('protected void onResume()')}
 ${method('public void onBackPressed()')}
 public static void main(String[] args){SettingsReturnFixture a=new SettingsReturnFixture();WebView current=a.webView;
  a.systemPermission=true;a.onResume();check(a.statusEvents==1&&a.reportedPermission,"resume must report newly granted OS settings without relying on WebView focus");
  a.systemPermission=false;a.onResume();check(a.statusEvents==2&&!a.reportedPermission,"resume must report OS revocation");
  check(a.webView==current&&current.reloads==0,"resume must preserve current WebView/context");
  current.history=true;a.onBackPressed();check(current.backs==1&&a.parentBack==0,"Back returns through existing WebView history");
  a.portalWebView=new WebView();a.portalWebView.history=true;a.onBackPressed();check(a.portalWebView.backs==1&&current.backs==1,"portal Back preserves underlying app");
  a.portalWebView.history=false;a.onBackPressed();check(a.closedPortal==1&&a.parentBack==0,"portal close stays in existing app flow");
  a.portalWebView=null;current.history=false;a.onBackPressed();check(a.parentBack==1,"root Back delegates to Android");
  a.webView=null;a.onResume();check(a.statusEvents==2,"early resume without WebView is safe");
  System.out.println("PASS actual Activity callbacks: "+checks+" assertions; settings grant/revocation refresh, same WebView, app/portal/root Back; Android I/O synthetic");
 }
}`);
 const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin/java'):'java';
 execFileSync(java,['com.sun.tools.javac.Main','-d',tmp,path.join(tmp,'SettingsReturnFixture.java')],{timeout:60000,stdio:'pipe'});
 process.stdout.write(execFileSync(java,['-cp',tmp,'SettingsReturnFixture'],{timeout:60000,encoding:'utf8'}));
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
