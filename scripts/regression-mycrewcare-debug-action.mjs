import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
const java=process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin/java'):'/usr/lib/jvm/java-21-openjdk-amd64/bin/java';
const activity='android-wrapper/app/src/debug/java/com/crewcheck/app/CrewCheckMyCrewCareDebugActivity.java';

test('actual debug action: consent, lifecycle, validation and verified cleanup with synthetic Android driver',()=>{
 const text=readFileSync('scripts/regression-mycrewcare-webview-source.mjs','utf8');
 const begin=text.indexOf('const stubs=')+'const stubs='.length,end=text.indexOf('\n};',begin)+2;
 const stubs=vm.runInNewContext('('+text.slice(begin,end)+')');
 Object.assign(stubs,{
  'android/os/Bundle.java':'package android.os;public class Bundle {}',
  'android/app/Activity.java':`package android.app;public class Activity {public android.content.res.Resources getResources(){return new android.content.res.Resources();}public android.view.View content;public void setContentView(android.view.View v){content=v;}public android.content.res.AssetManager getAssets(){return new android.content.res.AssetManager();}protected void onCreate(android.os.Bundle b){}protected void onStart(){}protected void onStop(){}protected void onDestroy(){}public void create(){onCreate(null);onStart();}public void stop(){onStop();}public void destroy(){onDestroy();}}`,
  'android/os/Handler.java':`package android.os;public class Handler {static final java.util.ArrayDeque<Runnable> queue=new java.util.ArrayDeque<>();public static final java.util.List<Runnable> delayed=new java.util.ArrayList<>();public Handler(Looper l){}public boolean post(Runnable r){queue.add(r);return true;}public boolean postDelayed(Runnable r,long ms){delayed.add(r);return true;}public void removeCallbacks(Runnable r){delayed.remove(r);}public static void runMain(Runnable r){boolean old=Looper.active.get();Looper.active.set(true);try{r.run();}finally{Looper.active.set(old);}}public static void drain(){int limit=1000;while(!queue.isEmpty()){if(--limit==0)throw new AssertionError("finite queue");runMain(queue.remove());}}public static void tick(){var copy=new java.util.ArrayList<>(delayed);delayed.clear();for(var r:copy)runMain(r);drain();}}`,
  'android/view/View.java':`package android.view;public class View {public static final int IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS=8;public static final int GONE=8,VISIBLE=0;public int visibility;public void setVisibility(int v){visibility=v;}public boolean focusable;public void setFocusable(boolean v){focusable=v;}public boolean enabled=true,save=true;public int autofill;public interface OnClickListener{void onClick(View v);}public OnClickListener listener;public void setOnClickListener(OnClickListener l){listener=l;}public void setEnabled(boolean e){enabled=e;}public void setSaveEnabled(boolean s){save=s;}public void setImportantForAutofill(int v){autofill=v;}public void click(){if(enabled&&listener!=null)listener.onClick(this);}}`,
  'android/text/InputType.java':'package android.text;public class InputType {public static final int TYPE_CLASS_TEXT=1,TYPE_TEXT_FLAG_NO_SUGGESTIONS=524288;}',
  'android/widget/TextView.java':'package android.widget;public class TextView extends android.view.View {public static java.util.function.Consumer<String> hook;public String text="";public float textSize;public void setTextSize(float v){textSize=v;}public TextView(android.app.Activity a){}public void setText(String v){text=v;if(hook!=null)hook.accept(v);}public CharSequence getText(){return text;}}',
  'android/widget/EditText.java':'package android.widget;public class EditText extends TextView {public String hint;public EditText(android.app.Activity a){super(a);}public void setHint(String v){hint=v;}public void setInputType(int i){}}',
  'android/content/res/Resources.java':'package android.content.res;public class Resources {public static class Metrics {public float density=1;}public Metrics getDisplayMetrics(){return new Metrics();}}',
  'android/widget/ScrollView.java':'package android.widget;public class ScrollView extends android.view.View {public boolean fillViewport;public java.util.List<android.view.View> children=new java.util.ArrayList<>();public ScrollView(android.app.Activity a){}public void setFillViewport(boolean v){fillViewport=v;}public void addView(android.view.View v){children.add(v);}}',
  'android/widget/Button.java':'package android.widget;public class Button extends TextView {public Button(android.app.Activity a){super(a);}}',
  'android/widget/CheckBox.java':'package android.widget;public class CheckBox extends Button {public boolean checked;public CheckBox(android.app.Activity a){super(a);}public boolean isChecked(){return checked;}public void setChecked(boolean c){checked=c;}}',
  'android/widget/LinearLayout.java':'package android.widget;public class LinearLayout extends android.view.View {public static final int VERTICAL=1;public java.util.List<android.view.View> children=new java.util.ArrayList<>();public LinearLayout(android.app.Activity a){}public void setOrientation(int v){}public void addView(android.view.View v){children.add(v);}}',
 });
 stubs['com/crewcheck/app/CrewCheckMyCrewCareProfile.java']=stubs['com/crewcheck/app/CrewCheckMyCrewCareProfile.java'].replace('public boolean supported=true;','public static boolean supported=true;').replace('createdAccounts.add(id);','if(!supported)throw new UnsupportedOperationException("synthetic unsupported");createdAccounts.add(id);');
 stubs['android/widget/LinearLayout.java']=stubs['android/widget/LinearLayout.java'].replace('public void addView(android.view.View v){children.add(v);}', 'public void addView(android.view.View v){children.add(v);}public void addView(android.view.View v,LayoutParams p){children.add(v);}public void removeView(android.view.View v){children.remove(v);}public static class LayoutParams{public static final int MATCH_PARENT=-1;public LayoutParams(int w,int h,float weight){}}');
 stubs['android/view/View.java']=stubs['android/view/View.java'].replace('public void setEnabled(boolean e)', 'public boolean isEnabled(){return enabled;}public void setEnabled(boolean e)');
 stubs['android/webkit/WebView.java']=stubs['android/webkit/WebView.java'].replace('public class WebView {', 'public class WebView extends android.view.View {public final java.util.Map<String,String> sessionStorage=new java.util.HashMap<>();');
 stubs['android/webkit/WebView.java']=stubs['android/webkit/WebView.java'].replace('public boolean destroyed;', 'public static java.util.function.Consumer<WebView> stopHook,destroyHook;public boolean destroyed,stopError,destroyError;').replace('public void stopLoading(){guard();}', 'public void stopLoading(){guard();if(stopHook!=null)stopHook.accept(this);if(stopError)throw new IllegalStateException("synthetic stop");}').replace('destroyed=true;', 'destroyed=true;if(destroyHook!=null)destroyHook.accept(this);if(destroyError)throw new IllegalStateException("synthetic destroy");');
 stubs['android/webkit/WebSettings.java']=stubs['android/webkit/WebSettings.java'].replace('public class WebSettings {', 'public class WebSettings {public void setSaveFormData(boolean v){guard();}');
 const root=mkdtempSync(join(tmpdir(),'mycrewcare-debug-action-'));
 try {
  const files=[];for(const [name,source] of Object.entries(stubs)){const path=join(root,name);mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,source);files.push(path);}
  for(const name of ['CrewCheckMyCrewCarePortalV3','CrewCheckMyCrewCareRuntimeV3','CrewCheckMyCrewCareObservedWebViewSource'])files.push('android-wrapper/app/src/main/java/com/crewcheck/app/'+name+'.java');
  files.push(activity,'scripts/fixtures/mycrewcare-native/ObservedAcquisitionHarness.java','scripts/fixtures/mycrewcare-native/ObservedWebViewSourceHarness.java','scripts/fixtures/mycrewcare-native/DebugActionHarness.java');
  execFileSync(java,['com.sun.tools.javac.Main','-source','17','-target','17','-d',root,...files],{encoding:'utf8'});
  const result=execFileSync(java,['-cp',root,'DebugActionHarness',join(process.cwd(),'android-wrapper/app/src/main/assets/mycrewcare-transport-v3.js')],{encoding:'utf8'});
  assert.match(result,/PASS debug action cases=92/);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('debug source-set entry is excluded from production, isolation and OFF gates remain intact',()=>{
 const main=readFileSync('android-wrapper/app/src/main/AndroidManifest.xml','utf8');
 const debug=readFileSync('android-wrapper/app/src/debug/AndroidManifest.xml','utf8');
 const gradle=readFileSync('android-wrapper/app/build.gradle','utf8');
 const source=readFileSync(activity,'utf8');
 assert.doesNotMatch(main,/CrewCheckMyCrewCareDebugActivity/);
 assert.match(debug,/CrewCheckMyCrewCareDebugActivity/);assert.doesNotMatch(debug,/BROWSABLE|<data/);
 assert.deepEqual([...debug.matchAll(/<uses-permission(?:-sdk-23)?\b[^>]*android:name="([^"]+)"/g)].map(m=>m[1]),["android.permission.INTERNET"]);
 assert.match(debug,/<uses-permission tools:node="removeAll"/);
 assert.match(debug,/<uses-permission-sdk-23 tools:node="removeAll"/);
 assert.match(gradle,/debug\s*\{\s*applicationIdSuffix "\.mcctest"/);
 assert.doesNotMatch(gradle,/main\.(java|manifest).*debug|release\.(java|manifest).*debug|srcDirs.*debug/);
 assert.doesNotMatch(source,/getIntent|JavascriptInterface|CookieManager|SharedPreferences|saveMyCrewCare|loadMyCrewCare|evaluateJavascript|Log\.|println/);
 assert.match(source,/ObservedWebViewSource.prepare/);assert.match(source,/observeMyCrewCareV3ForReview/);
 assert.match(source,/startMyCrewCareCleanupV3\(account, true, operation\)/);
 assert.match(readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCarePortalV3.java','utf8'),/RELEASE_ENABLED = false/);
 assert.doesNotMatch(readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java','utf8'),/CrewCheckMyCrewCareDebugActivity/);
});
