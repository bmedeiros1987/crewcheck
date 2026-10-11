package com.crewcheck.app;

import android.app.Activity;
import android.graphics.Bitmap;
import android.net.http.SslError;
import android.os.Handler;
import android.os.Looper;
import android.webkit.*;
import androidx.webkit.WebViewBuilder;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.Consumer;
import com.crewcheck.app.CrewCheckMyCrewCarePortalV3.*;

/** Prepared, unwired source. One instance belongs to one observed operation, never the main shell. */
public final class CrewCheckMyCrewCareObservedWebViewSource implements ObservedSource {
    private static final int PAYLOAD_LIMIT=256*1024, CALLBACK_LIMIT=2*1024*1024, ASSET_LIMIT=512*1024;
    private static final long MAX_JS_INTEGER=9007199254740991L;
    /** post must always enqueue, never invoke inline; all WebView methods are confined to main. */
    public interface Driver {
        void post(Runnable task);
        boolean isMainThread();
        void navigate(String url,Navigation callback);
        String url();
        void evaluate(String script,Consumer<String> callback);
        void stop();
    }
    public interface Navigation {
        boolean allow(String url,boolean mainFrame);
        void started(String url);
        void finished(String url);
        void failed();
    }
    private final ObservedScope binding;
    private final Driver driver;
    private final String asset;
    private long generation;
    private boolean closed;
    private Pending pending;
    private static final class Pending {
        final ObservedRequest request; final ObservedPageCallback callback; final String url;
        boolean started,extracting,receiptQueued,revoked;
        Pending(ObservedRequest request,ObservedPageCallback callback,String url) {
            this.request=request; this.callback=callback; this.url=url;
        }
    }
    /** Injected offline boundary; does not create a WebView, navigate or authenticate. */
    public CrewCheckMyCrewCareObservedWebViewSource(ObservedScope binding,Driver driver,String asset) {
        if(binding==null || driver==null || asset==null || asset.isEmpty() || asset.length()>ASSET_LIMIT
            || asset.getBytes(StandardCharsets.UTF_8).length>ASSET_LIMIT) throw invalid();
        this.binding=binding; this.driver=driver; this.asset=asset;
    }
    /** Explicit future construction only. No caller in Runtime, Home or MainActivity. */
    @WebViewBuilder.Experimental
    public static CrewCheckMyCrewCareObservedWebViewSource prepare(Activity activity,CrewCheckMyCrewCareProfile profiles,ObservedScope binding) throws IOException {
        if(activity==null || profiles==null || binding==null || !profiles.isSupported()) throw invalid();
        String asset;
        try(InputStream in=activity.getAssets().open("mycrewcare-transport-v3.js");ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] block=new byte[4096];int read;
            while((read=in.read(block))!=-1) { if(out.size()+read>ASSET_LIMIT) throw invalid();out.write(block,0,read); }
            asset=new String(out.toByteArray(),StandardCharsets.UTF_8);
        }
        return new CrewCheckMyCrewCareObservedWebViewSource(binding,new AndroidDriver(activity,profiles,binding.accountId),asset);
    }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("observed-webview-unverified"); }
    private boolean matches(ObservedScope scope) {
        return scope!=null && binding.accountId.equals(scope.accountId) && binding.sessionId.equals(scope.sessionId)
            && binding.requestId.equals(scope.requestId) && binding.employeeId.equals(scope.employeeId)
            && binding.username.equals(scope.username) && scope.generation>0 && scope.generation<=MAX_JS_INTEGER
            && (generation==0 || generation==scope.generation);
    }
    @Override public void acquire(ObservedRequest request,ObservedPageCallback callback) {
        final Pending next;
        synchronized(this) {
            if(closed || request==null || callback==null || pending!=null || !matches(request.scope)) throw invalid();
            String url=target(request); // Never navigate a page-derived arbitrary URL.
            generation=request.scope.generation;pending=next=new Pending(request,callback,url);
            driver.post(()->navigate(next));
        }
    }
    @Override public void cancel(ObservedScope scope) {
        synchronized(this) {
            if(closed || !matches(scope)) return;
            closed=true;pending=null;
        }
        // On main, stop before a reentrant profile cleanup can run inline. On a worker,
        // enqueue stop before Runtime enqueues that profile cleanup on the same main looper.
        if(driver.isMainThread()) driver.stop();
        else driver.post(()->{main();driver.stop();});
    }
    private void main() { if(!driver.isMainThread()) throw invalid(); }
    private boolean current(Pending op) { return !closed && pending==op; }
    private void navigate(Pending op) {
        try {
            main();
            synchronized(this) {
                if(!current(op)) return;
                driver.navigate(op.url,new Navigation() {
                    public boolean allow(String url,boolean mainFrame) {
                        boolean accepted;
                        synchronized(CrewCheckMyCrewCareObservedWebViewSource.this) { accepted=current(op)&&!op.revoked&&mainFrame&&sameUrl(url,op.url); if(!accepted && mainFrame && current(op)) op.revoked=true; }
                        if(!accepted && mainFrame) driver.post(()->finish(op,null));
                        return accepted;
                    }
                    public void started(String url) { onStarted(op,url); }
                    public void finished(String url) {
                        synchronized(CrewCheckMyCrewCareObservedWebViewSource.this) { if(current(op) && !sameUrl(url,op.url)) op.revoked=true; }
                        driver.post(()->extract(op,url));
                    }
                    public void failed() { revoke(op); }
                });
            }
        } catch(RuntimeException error) { finish(op,null); }
    }
    private void onStarted(Pending op,String url) {
        boolean rejected=false;
        synchronized(this) {
            if(!current(op)) return;
            if(op.revoked || op.started || !sameUrl(url,op.url) || op.extracting) { op.revoked=true;rejected=true; }
            else op.started=true;
        }
        if(rejected) driver.post(()->finish(op,null));
    }
    // Revoke validity at the native event, before queued receipt delivery.
    private void revoke(Pending op) {
        synchronized(this) { if(!current(op)) return;op.revoked=true; }
        driver.post(()->finish(op,null));
    }
    private void extract(Pending op,String pageUrl) {
        try {
            main();
            synchronized(this) {
                if(!current(op) || op.extracting) return;
                if(op.revoked || !op.started || !sameUrl(pageUrl,op.url) || !sameUrl(driver.url(),op.url)) throw invalid();
                op.extracting=true;
                driver.evaluate(asset+"("+contract(op.request)+");",raw->{
                    synchronized(CrewCheckMyCrewCareObservedWebViewSource.this) {
                        if(!current(op) || op.receiptQueued) return;op.receiptQueued=true;
                        final String bounded=raw!=null && raw.length()<=CALLBACK_LIMIT ? raw : null;
                        driver.post(()->receipt(op,bounded));
                    }
                });
            }
        } catch(RuntimeException error) { finish(op,null); }
    }
    private void receipt(Pending op,String raw) {
        ObservedPage page;
        try {
            main();
            synchronized(this) {
                if(!current(op) || !op.extracting) return;
                String url=driver.url();if(op.revoked || !sameUrl(url,op.url)) throw invalid();
                page=decode(raw,op.request,url);
            }
        } catch(RuntimeException error) { finish(op,null);return; }
        finish(op,page);
    }
    private void finish(Pending op,ObservedPage page) {
        main();
        synchronized(this) { if(!current(op)) return;if(op.revoked) page=null;pending=null; }
        // No source monitor while entering the acquisition owner: avoid cross-lock inversion.
        op.callback.complete(page);
    }
    private static String target(ObservedRequest request) {
        String path;
        if(request.kind.equals("profile-before") || request.kind.equals("profile-after")) path="userprofile.aspx";
        else if(request.kind.equals("cards")) path="mytravel.aspx";
        else if(request.kind.equals("detail")) {
            if(request.card==null) throw invalid();
            String id=request.card.get("providerReservationId"),duty=request.card.get("dutyPeriodNumber");
            if(id==null || duty==null || !id.matches("[0-9]{1,240}") || !duty.matches("[0-9]{1,240}")) throw invalid();
            path="reservation.aspx?tripreservid="+id+"&dutyperiodnumber="+duty;
        } else throw invalid();
        return "https://api2.apicrewcare.com/LATAM/"+path;
    }
    private static boolean sameUrl(String value,String expected) {
        try {
            URI a=URI.create(value),b=URI.create(expected);
            return "https".equals(a.getScheme()) && "api2.apicrewcare.com".equals(a.getHost())
                && a.getUserInfo()==null && a.getFragment()==null && (a.getPort()==-1 || a.getPort()==443)
                && b.getRawPath().equals(a.getRawPath()) && Objects.equals(b.getRawQuery(),a.getRawQuery());
        } catch(RuntimeException error) { return false; }
    }
    static String quote(String text) {
        StringBuilder out=new StringBuilder("\"");
        for(int i=0;i<text.length();i++) {
            char c=text.charAt(i);
            if(c=='"' || c=='\\') out.append('\\').append(c);
            else if(c<32 || c==0x2028 || c==0x2029) out.append(String.format(Locale.ROOT,"\\u%04x",(int)c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
    private static String contract(ObservedRequest request) {
        ObservedScope s=request.scope;
        StringBuilder out=new StringBuilder("{\"schemaVersion\":3,\"operationalImportAllowed\":false,\"kind\":")
            .append(quote(request.kind)).append(",\"scope\":{\"accountId\":").append(quote(s.accountId))
            .append(",\"sessionId\":").append(quote(s.sessionId)).append(",\"requestId\":").append(quote(s.requestId))
            .append(",\"employeeId\":").append(quote(s.employeeId)).append(",\"username\":").append(quote(s.username))
            .append(",\"generation\":").append(s.generation).append("},\"card\":{");
        boolean first=true;
        for(Map.Entry<String,String> field:(request.card==null?Collections.<String,String>emptyMap():request.card).entrySet()) {
            if(!first) out.append(',');first=false;out.append(quote(field.getKey())).append(':').append(quote(field.getValue()));
        }
        return out.append("}}").toString();
    }
    @SuppressWarnings("unchecked")
    private static ObservedPage decode(String callback,ObservedRequest request,String url) {
        if(callback==null || callback.length()>CALLBACK_LIMIT || callback.getBytes(StandardCharsets.UTF_8).length>CALLBACK_LIMIT) throw invalid();
        Object wrapper=new Json(callback).read();if(!(wrapper instanceof String)) throw invalid();
        String raw=(String)wrapper;if(raw.getBytes(StandardCharsets.UTF_8).length>PAYLOAD_LIMIT) throw invalid();
        Object parsed=new Json(raw).read();if(!(parsed instanceof Map)) throw invalid();
        Map<String,Object> root=(Map<String,Object>)parsed;
        Set<String> keys=new HashSet<>(Arrays.asList("schemaVersion","operationalImportAllowed","accountId","sessionId","requestId","generation","kind","rows"));
        if(!root.keySet().equals(keys) || !Long.valueOf(3).equals(root.get("schemaVersion")) || !Boolean.FALSE.equals(root.get("operationalImportAllowed"))
            || !request.scope.accountId.equals(root.get("accountId")) || !request.scope.sessionId.equals(root.get("sessionId"))
            || !request.scope.requestId.equals(root.get("requestId")) || !Long.valueOf(request.scope.generation).equals(root.get("generation"))
            || !request.kind.equals(root.get("kind")) || !(root.get("rows") instanceof List)) throw invalid();
        List<Map<String,String>> rows=new ArrayList<>();
        for(Object value:(List<?>)root.get("rows")) {
            if(!(value instanceof Map)) throw invalid();Map<String,String> row=new LinkedHashMap<>();
            for(Map.Entry<String,Object> field:((Map<String,Object>)value).entrySet()) {
                if(!(field.getValue() instanceof String)) throw invalid();row.put(field.getKey(),(String)field.getValue());
            }
            rows.add(row);
        }
        return CrewCheckMyCrewCarePortalV3.validatedObservedPage(request,url,rows);
    }
    /** Bounded strict wire JSON only, not another page/identity decoder. Rejects duplicates and coercion. */
    private static final class Json {
        final String text;int at;
        Json(String text) { this.text=text; }
        Object read() { Object result=value(0);space();if(at!=text.length()) throw invalid();return result; }
        void space() { while(at<text.length() && " \t\r\n".indexOf(text.charAt(at))>=0) at++; }
        char take() { if(at==text.length()) throw invalid();return text.charAt(at++); }
        Object value(int depth) {
            if(depth>6) throw invalid();space();if(at==text.length()) throw invalid();char c=text.charAt(at);
            if(c=='"') return string();
            if(c=='{') {
                at++;Map<String,Object> map=new LinkedHashMap<>();space();if(at<text.length()&&text.charAt(at)=='}'){at++;return map;}
                while(true) { space();if(at==text.length()||text.charAt(at)!='"') throw invalid();String key=string();space();if(take()!=':'||map.containsKey(key)||map.size()>=14) throw invalid();map.put(key,value(depth+1));space();char end=take();if(end=='}')return map;if(end!=',')throw invalid(); }
            }
            if(c=='[') {
                at++;List<Object> list=new ArrayList<>();space();if(at<text.length()&&text.charAt(at)==']'){at++;return list;}
                while(true) { if(list.size()>=50)throw invalid();list.add(value(depth+1));space();char end=take();if(end==']')return list;if(end!=',')throw invalid(); }
            }
            for(String literal:Arrays.asList("true","false","null")) if(text.startsWith(literal,at)){at+=literal.length();return literal.equals("null")?null:Boolean.valueOf(literal);}
            int start=at;if(c=='-')at++;if(at==text.length()||text.charAt(at)<'0'||text.charAt(at)>'9')throw invalid();
            if(text.charAt(at)=='0')at++;else while(at<text.length()&&text.charAt(at)>='0'&&text.charAt(at)<='9')at++;
            try{return Long.valueOf(text.substring(start,at));}catch(RuntimeException error){throw invalid();}
        }
        String string() {
            if(take()!='"')throw invalid();StringBuilder out=new StringBuilder();
            while(true) {
                char c=take();if(c=='"')break;if(c<32)throw invalid();
                if(c=='\\') {
                    c=take();switch(c) {
                        case '"':case '\\':case '/':break;
                        case 'b':c='\b';break;case 'f':c='\f';break;case 'n':c='\n';break;case 'r':c='\r';break;case 't':c='\t';break;
                        case 'u':int n=0;for(int i=0;i<4;i++){char hex=take();int digit=hex>='0'&&hex<='9'?hex-'0':hex>='a'&&hex<='f'?hex-'a'+10:hex>='A'&&hex<='F'?hex-'A'+10:-1;if(digit<0)throw invalid();n=n*16+digit;}c=(char)n;break;
                        default:throw invalid();
                    }
                }
                out.append(c);if(out.length()>PAYLOAD_LIMIT)throw invalid();
            }
            for(int i=0;i<out.length();i++) {char c=out.charAt(i);if(Character.isHighSurrogate(c)){if(++i==out.length()||!Character.isLowSurrogate(out.charAt(i)))throw invalid();}else if(Character.isLowSurrogate(c))throw invalid();}
            return out.toString();
        }
    }
    @WebViewBuilder.Experimental
    private static final class AndroidDriver implements Driver {
        final Activity activity;final CrewCheckMyCrewCareProfile profiles;final String accountId;
        final Handler handler=new Handler(Looper.getMainLooper());volatile WebView view;
        AndroidDriver(Activity activity,CrewCheckMyCrewCareProfile profiles,String accountId) {this.activity=activity;this.profiles=profiles;this.accountId=accountId;}
        public void post(Runnable task) {if(!handler.post(task))throw invalid();}
        public boolean isMainThread() {return Looper.myLooper()==Looper.getMainLooper();}
        public void navigate(String url,Navigation callback) {
            if(!isMainThread())throw invalid();
            // A distinct view per page request makes late same-URL callbacks attributable.
            // All views use the existing account profile; no session data is copied.
            stop();
            {
                view=profiles.create(activity,accountId);
                WebSettings settings=view.getSettings();settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
                view.setWebChromeClient(new WebChromeClient(){@Override public void onPermissionRequest(PermissionRequest request){request.deny();}});
            }
            final WebView page=view;
            view.setDownloadListener((a,b,c,d,e)->{if(view==page)callback.failed();});
            view.getSettings().setJavaScriptEnabled(false); // Read server-rendered DOM; provider scripts/subresources are not required.
            view.setWebViewClient(new WebViewClient() {
                @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){if(v!=page || view!=page)return true;if(!"GET".equals(r.getMethod())){if(r.isForMainFrame())callback.failed();return true;}return !callback.allow(r.getUrl().toString(),r.isForMainFrame());}
                @Override public boolean shouldOverrideUrlLoading(WebView v,String next){if(v!=page || view!=page)return true;return !callback.allow(next,true);}
                @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
                    if(v!=page || view!=page)return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                    if(r.isForMainFrame() && "GET".equals(r.getMethod()) && callback.allow(r.getUrl().toString(),true))return null;
                    if(r.isForMainFrame() && !"GET".equals(r.getMethod()))callback.failed();
                    return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                }
                @Override public void onPageStarted(WebView v,String next,Bitmap icon){if(v==page && view==page)callback.started(next);}
                @Override public void onPageFinished(WebView v,String next){if(v==page && view==page)callback.finished(next);}
                @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError error){if(v==page && view==page && r.isForMainFrame())callback.failed();}
                @Override public void onReceivedHttpError(WebView v,WebResourceRequest r,WebResourceResponse response){if(v==page && view==page && r.isForMainFrame())callback.failed();}
                @Override public void onReceivedSslError(WebView v,SslErrorHandler handler,SslError error){handler.cancel();if(v==page && view==page)callback.failed();}
                @Override public boolean onRenderProcessGone(WebView v,RenderProcessGoneDetail detail){if(v==page && view==page)callback.failed();return true;}
            });
            view.loadUrl(url);
        }
        public String url(){if(!isMainThread() || view==null)throw invalid();return view.getUrl();}
        public void evaluate(String script,Consumer<String> callback){if(!isMainThread() || view==null)throw invalid();view.getSettings().setJavaScriptEnabled(true);view.evaluateJavascript(script,callback::accept);}
        public void stop(){if(!isMainThread())throw invalid();WebView old=view;view=null;if(old!=null){try{old.stopLoading();}finally{old.destroy();}}}
    }
}
