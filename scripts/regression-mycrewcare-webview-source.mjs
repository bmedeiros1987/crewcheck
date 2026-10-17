import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const java=process.env.JAVA_HOME?join(process.env.JAVA_HOME,'bin/java'):'/usr/lib/jvm/java-21-openjdk-amd64/bin/java';
const native=new URL('../android-wrapper/app/src/main/java/com/crewcheck/app/',import.meta.url);
const asset=new URL('../android-wrapper/app/src/main/assets/mycrewcare-transport-v3.js',import.meta.url);
const stubs={
  'android/os/Looper.java':`package android.os; public class Looper {static final Looper MAIN=new Looper();static final ThreadLocal<Boolean> active=ThreadLocal.withInitial(()->false);public static Looper getMainLooper(){return MAIN;}public static Looper myLooper(){return active.get()?MAIN:null;}}`,
  'android/os/Handler.java':`package android.os;public class Handler {static final java.util.ArrayDeque<Runnable> queue=new java.util.ArrayDeque<>();public Handler(Looper l){}public boolean post(Runnable r){queue.add(r);return true;}public static void runMain(Runnable r){boolean old=Looper.active.get();Looper.active.set(true);try{r.run();}finally{Looper.active.set(old);}}public static void drain(){int limit=1000;while(!queue.isEmpty()){if(--limit==0)throw new AssertionError("finite main queue");runMain(queue.remove());}}}`,
  'android/app/Activity.java':`package android.app;public class Activity {public android.content.res.AssetManager getAssets(){return new android.content.res.AssetManager();}}`,
  'android/content/res/AssetManager.java':`package android.content.res;public class AssetManager {public static String source;public java.io.InputStream open(String path)throws java.io.IOException {if(!path.equals("mycrewcare-transport-v3.js"))throw new AssertionError("asset allowlist");return new java.io.FileInputStream(source);}}`,
  'android/widget/FrameLayout.java':`package android.widget;public class FrameLayout {}`,
  'android/graphics/Bitmap.java':`package android.graphics;public class Bitmap {}`,
  'android/net/Uri.java':`package android.net;public class Uri {final String value;public Uri(String v){value=v;}public String toString(){return value;}}`,
  'android/net/http/SslError.java':`package android.net.http;public class SslError {}`,
  'android/webkit/WebSettings.java':`package android.webkit;public class WebSettings {public static final int MIXED_CONTENT_NEVER_ALLOW=1;public boolean js;void guard(){if(android.os.Looper.myLooper()!=android.os.Looper.getMainLooper())throw new AssertionError("WebSettings main only");}public void setJavaScriptEnabled(boolean b){guard();js=b;}public void setAllowFileAccess(boolean b){guard();if(b)throw new AssertionError("file access");}public void setAllowContentAccess(boolean b){guard();if(b)throw new AssertionError("content access");}public void setMixedContentMode(int m){guard();if(m!=1)throw new AssertionError("mixed content");}public void setJavaScriptCanOpenWindowsAutomatically(boolean b){guard();if(b)throw new AssertionError("popup");}public void setSupportMultipleWindows(boolean b){guard();if(b)throw new AssertionError("multiple windows");}}`,
  'android/webkit/WebView.java':`package android.webkit;public class WebView {public static final java.util.List<WebView> instances=new java.util.ArrayList<>();public final WebSettings settings=new WebSettings();public WebViewClient client;public WebChromeClient chrome;public DownloadListener download;public ValueCallback<String> value;public String url,script;public boolean destroyed;public WebView(){guard();instances.add(this);}void guard(){if(android.os.Looper.myLooper()!=android.os.Looper.getMainLooper())throw new AssertionError("WebView main only");}public WebSettings getSettings(){guard();return settings;}public void setWebChromeClient(WebChromeClient c){guard();chrome=c;}public void setWebViewClient(WebViewClient c){guard();client=c;}public void setDownloadListener(DownloadListener l){guard();download=l;}public void loadUrl(String u){guard();url=u;client.onPageStarted(this,u,null);}public String getUrl(){guard();return url;}public void evaluateJavascript(String s,ValueCallback<String> cb){guard();script=s;value=cb;}public void stopLoading(){guard();}public void destroy(){guard();destroyed=true;}}`,
  'android/webkit/ValueCallback.java':`package android.webkit;public interface ValueCallback<T>{void onReceiveValue(T value);}`,
  'android/webkit/DownloadListener.java':`package android.webkit;public interface DownloadListener{void onDownloadStart(String url,String userAgent,String disposition,String mimetype,long size);}`,
  'android/webkit/WebChromeClient.java':`package android.webkit;public class WebChromeClient {public void onPermissionRequest(PermissionRequest request){}}`,
  'android/webkit/PermissionRequest.java':`package android.webkit;public class PermissionRequest {public boolean denied;public void deny(){denied=true;}}`,
  'android/webkit/WebResourceRequest.java':`package android.webkit;public class WebResourceRequest {final String url,method;final boolean main;public WebResourceRequest(String u,boolean m){this(u,m,"GET");}public WebResourceRequest(String u,boolean m,String verb){url=u;main=m;method=verb;}public String getMethod(){return method;}public android.net.Uri getUrl(){return new android.net.Uri(url);}public boolean isForMainFrame(){return main;}}`,
  'android/webkit/WebResourceResponse.java':`package android.webkit;public class WebResourceResponse {public WebResourceResponse(String a,String b,java.io.InputStream c){}}`,
  'android/webkit/WebResourceError.java':`package android.webkit;public class WebResourceError {}`,
  'android/webkit/SslErrorHandler.java':`package android.webkit;public class SslErrorHandler {public boolean cancelled;public void cancel(){cancelled=true;}}`,
  'android/webkit/RenderProcessGoneDetail.java':`package android.webkit;public class RenderProcessGoneDetail {}`,
  'android/webkit/WebViewClient.java':`package android.webkit;public class WebViewClient {public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return false;}public boolean shouldOverrideUrlLoading(WebView v,String s){return false;}public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return null;}public void onPageStarted(WebView v,String s,android.graphics.Bitmap b){}public void onPageFinished(WebView v,String s){}public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){}public void onReceivedHttpError(WebView v,WebResourceRequest r,WebResourceResponse e){}public void onReceivedSslError(WebView v,SslErrorHandler h,android.net.http.SslError e){}public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail d){return false;}}`,
  'androidx/webkit/WebViewBuilder.java':`package androidx.webkit;public class WebViewBuilder {public @interface Experimental {}}`,
  'com/crewcheck/app/CrewCheckMyCrewCareProfile.java':`package com.crewcheck.app;public class CrewCheckMyCrewCareProfile {public static final java.util.List<String> createdAccounts=new java.util.ArrayList<>();public boolean supported=true;public boolean isSupported(){return supported;}public android.webkit.WebView create(android.app.Activity a,String id){createdAccounts.add(id);return new android.webkit.WebView();}public interface CleanupCallback{void onComplete(boolean success,String code);}public static int clearCalls;public static RuntimeException clearError;public static boolean defer,requireStopped;public static final java.util.List<CleanupCallback> pending=new java.util.ArrayList<>();public void clear(android.app.Activity a,String id,CleanupCallback cb){clearCalls++;if(clearError!=null)throw clearError;if(requireStopped){Runnable cleanup=()->{var all=android.webkit.WebView.instances;if(all.isEmpty()||!all.get(all.size()-1).destroyed)throw new AssertionError("profile clear before source stop");cb.onComplete(true,"ok");};if(android.os.Looper.myLooper()==android.os.Looper.getMainLooper())cleanup.run();else new android.os.Handler(android.os.Looper.getMainLooper()).post(cleanup);}else if(defer)pending.add(cb);else cb.onComplete(true,"ok");}}`,
  'com/crewcheck/app/CrewCheckMyCrewCareSecureStore.java':`package com.crewcheck.app;public class CrewCheckMyCrewCareSecureStore {public CrewCheckMyCrewCareSecureStore(android.app.Activity a){}public static int clearCalls;public static RuntimeException clearError;public boolean clear(String a){clearCalls++;if(clearError!=null)throw clearError;return true;}public String load(String a){return null;}public boolean save(String a,String p){return true;}}`,
};

test('actual source + acquisition + Runtime: offline lifecycle, navigation, bounded JSON and main-looper driver',()=>{
  const root=mkdtempSync(join(tmpdir(),'mycrewcare-webview-source-'));
  try {
    const files=[];
    for(const [name,source]of Object.entries(stubs)){const path=join(root,name);mkdirSync(join(path,'..'),{recursive:true});writeFileSync(path,source);files.push(path);}
    for(const name of ['CrewCheckMyCrewCarePortalV3','CrewCheckMyCrewCareRuntimeV3','CrewCheckMyCrewCareObservedWebViewSource'])files.push(new URL(name+'.java',native).pathname);
    for(const name of ['ObservedAcquisitionHarness','ObservedWebViewSourceHarness'])files.push(new URL('./fixtures/mycrewcare-native/'+name+'.java',import.meta.url).pathname);
    execFileSync(java,['com.sun.tools.javac.Main','-source','17','-target','17','-d',root,...files],{encoding:'utf8'});
    const result=execFileSync(java,['-cp',root,'ObservedWebViewSourceHarness',asset.pathname,root],{encoding:'utf8'});
    assert.match(result,/PASS observed WebView source cases=265/);
    const require=createRequire(process.env.WAKEUP_JSDOM_PACKAGE||import.meta.url),{JSDOM}=require('jsdom');
    for(let i=0;i<8;i++){
      const request=JSON.parse(readFileSync(join(root,i+'-request.json'),'utf8'));
      const kind=request.kind==='cards'?'mytravel':request.kind==='detail'?'reservation':'profile';
      const html=readFileSync(new URL('./fixtures/mycrewcare-observed/'+kind+'.synthetic.html',import.meta.url),'utf8');
      const dom=new JSDOM(html,{url:request.url});
      const raw=vm.runInNewContext(readFileSync(join(root,i+'-script.js'),'utf8'),{document:dom.window.document,location:dom.window.location,URL,Date});
      assert.deepEqual(JSON.parse(raw),request.envelope,'actual Android-generated evaluation script executes against observed synthetic DOM');dom.window.close();
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('source is unwired; profile isolation and extraction use existing reviewed boundaries',()=>{
  const source=readFileSync(new URL('CrewCheckMyCrewCareObservedWebViewSource.java',native),'utf8');
  assert.match(source,/profiles\.create\(activity,accountId\)/);
  assert.match(source,/Looper\.getMainLooper\(\)/);
  assert.match(source,/validatedObservedPage\(request,url,rows\)/);
  assert.doesNotMatch(source,/addJavascriptInterface|CookieManager|clearCache|removeAllCookies|Authorization|getPassword|document\.body|innerHTML/);
  for(const name of ['MainActivity','CrewCheckMyCrewCareRuntimeV3','CrewCheckMyCrewCarePortalV3'])assert.doesNotMatch(readFileSync(new URL(name+'.java',native),'utf8'),/ObservedWebViewSource\.prepare|new CrewCheckMyCrewCareObservedWebViewSource/);
});
