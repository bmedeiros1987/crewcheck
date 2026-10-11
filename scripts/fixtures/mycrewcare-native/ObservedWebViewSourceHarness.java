import com.crewcheck.app.CrewCheckMyCrewCarePortalV3.*;
import com.crewcheck.app.CrewCheckMyCrewCareObservedWebViewSource;
import com.crewcheck.app.CrewCheckMyCrewCareObservedWebViewSource.Navigation;
import com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3;
import java.util.*;
import java.util.function.Consumer;
import java.nio.file.*;

public class ObservedWebViewSourceHarness extends ObservedAcquisitionHarness {
  static String asset;static Path output;static int cases;
  static String q(String value){return "\""+value.replace("\\","\\\\").replace("\"","\\\"")+"\"";}
  static String envelope(ObservedRequest request) {
    StringBuilder out=new StringBuilder("{\"schemaVersion\":3,\"operationalImportAllowed\":false,\"accountId\":").append(q(request.scope.accountId))
      .append(",\"sessionId\":").append(q(request.scope.sessionId)).append(",\"requestId\":").append(q(request.scope.requestId))
      .append(",\"generation\":").append(request.scope.generation).append(",\"kind\":").append(q(request.kind)).append(",\"rows\":[{");
    boolean first=true;for(var field:page(request).rows.get(0).entrySet()){if(!first)out.append(',');first=false;out.append(q(field.getKey())).append(':').append(q(field.getValue()));}
    return out.append("}]}").toString();
  }
  static class Ui implements CrewCheckMyCrewCareObservedWebViewSource.Driver {
    final java.util.concurrent.ConcurrentLinkedQueue<Runnable> queue=new java.util.concurrent.ConcurrentLinkedQueue<>();Thread uiThread;boolean stopped,started,finished,replied;int navigations,evaluations,stops;
    String currentUrl;ObservedRequest loadedRequest;Navigation callback;Consumer<String> receipt;ObservedRequest request;String rawOverride;
    public void post(Runnable r){queue.add(r);}
    public boolean isMainThread(){return Thread.currentThread()==uiThread;}
    public void navigate(String url,Navigation cb){check(isMainThread(),"navigate main");navigations++;loadedRequest=request;currentUrl=url;callback=cb;receipt=null;started=false;finished=false;replied=false;}
    public String url(){check(isMainThread(),"url main");return currentUrl;}
    public void evaluate(String script,Consumer<String> cb){check(isMainThread(),"evaluate main");evaluations++;receipt=cb;check(script.startsWith(asset)&&script.endsWith(");"),"actual asset and serialized contract");}
    public void stop(){check(isMainThread(),"stop main");stopped=true;stops++;}
    boolean step(){
      Runnable r=queue.poll();if(r!=null){uiThread=Thread.currentThread();try{r.run();}finally{uiThread=null;}return true;}
      if(stopped||callback==null)return false;
      if(!started){started=true;callback.started(currentUrl);return true;}
      if(!finished){finished=true;callback.finished(currentUrl);return true;}
      if(receipt!=null&&!replied){replied=true;
        receipt.accept(rawOverride==null?q(envelope(request)):rawOverride);return true;}
      return false;
    }
    void drive(){int limit=200;while(step())check(--limit>0,"finite UI queue");}
  }
  static class Bound implements ObservedSource {
    final Ui ui;final CrewCheckMyCrewCareObservedWebViewSource source;
    Bound(String account,Ui ui){this.ui=ui;source=new CrewCheckMyCrewCareObservedWebViewSource(scope(account),ui,asset);}
    public void acquire(ObservedRequest request,ObservedPageCallback cb){ui.request=request;source.acquire(request,cb);}
    public void cancel(ObservedScope scope){source.cancel(scope);}
  }
  static void boundary(Ui ui,String phase,String stage) {
    int limit=100;
    while(!ui.request.kind.equals(phase)){check(--limit>0&&ui.step(),"phase reached");}
    if(stage.equals("queued"))return;
    while(ui.loadedRequest!=ui.request){check(--limit>0&&ui.step(),"navigation reached");}
    while(ui.receipt==null){check(--limit>0&&ui.step(),"extraction reached");if(stage.equals("navigating")&&ui.started)return;}
    if(stage.equals("receipt-queued")){ui.replied=true;ui.receipt.accept(q(envelope(ui.request)));}
  }
  static CrewCheckMyCrewCareRuntimeV3 runtime(){return new CrewCheckMyCrewCareRuntimeV3(new android.app.Activity(),null,null,null);}
  static void matrix() {
    for(String phase:List.of("profile-before","cards","detail","profile-after"))for(String stage:List.of("queued","navigating","evaluating","receipt-queued"))for(String mode:List.of("cancel","cleanup","timeout","switch")){
      var runtime=runtime();Ui ui=new Ui();Bound a=new Bound("A",ui);Capture ar=new Capture();Deadline timer=new Deadline();
      runtime.observeMyCrewCareV3ForReview(scope("A"),a,timer,ar::done);boundary(ui,phase,stage);int dispatchBefore=ui.navigations;
      Navigation oldNav=ui.callback;Consumer<String> oldReceipt=ui.receipt;ObservedRequest oldRequest=ui.request;
      Ui bUi=new Ui();Capture br=new Capture();
      if(mode.equals("cancel"))runtime.cancelMyCrewCareObservationV3ForReview();
      if(mode.equals("cleanup"))check(runtime.startMyCrewCareCleanupV3("A",true,"logout_native"),"cleanup accepted");
      if(mode.equals("timeout"))timer.fire.run();
      if(mode.equals("switch"))runtime.observeMyCrewCareV3ForReview(scope("B"),new Bound("B",bUi),new Deadline(),br::done);
      if(oldNav!=null){oldNav.started(page(oldRequest).url);oldNav.finished(page(oldRequest).url);oldNav.failed();}
      if(oldReceipt!=null){oldReceipt.accept(q(envelope(oldRequest)));oldReceipt.accept(q(envelope(oldRequest)));}
      ui.drive();bUi.drive();
      check(ar.count==1&&ar.result==null,"no stale result "+phase+stage+mode);
      check(ui.stops==1,"stop once on main "+phase+stage+mode);
      if(stage.equals("queued"))check(ui.navigations==dispatchBefore,"cancel queued navigation before dispatch");
      if(mode.equals("switch"))check(br.count==1&&br.result!=null&&br.result.accountId.equals("B"),"new B isolated "+phase+stage+" error="+br.error+" last="+bUi.request.kind);
      if(mode.equals("cleanup"))check(runtime.myCrewCareCleanupResultV3("A","logout_native").equals("ok"),"cleanup terminal");
      cases++;
    }
  }
  static void negatives() {
    for(String kind:List.of("profile-before","cards","detail","profile-after")) {
      for(String bad:List.of("foreign-origin","login-redirect","fragment","userinfo","http","bad-port","query","finished-before-start","url-before-eval","url-after-eval","duplicate-finish","duplicate-receipt")) {
        var runtime=runtime();Ui ui=new Ui();Capture result=new Capture();runtime.observeMyCrewCareV3ForReview(scope("A"),new Bound("A",ui),new Deadline(),result::done);
        boundary(ui,kind,"navigating");String expected=page(ui.request).url;
        if(bad.equals("finished-before-start")){ui.started=false;ui.queue.clear();ui.callback.finished(expected);ui.finished=true;}
        else if(bad.equals("url-before-eval")){ui.currentUrl="https://evil.invalid/";}
        else if(bad.equals("url-after-eval")){boundary(ui,kind,"evaluating");ui.currentUrl="https://evil.invalid/";}
        else if(bad.equals("duplicate-finish")){ui.callback.finished(expected);ui.callback.finished(expected);}
        else if(bad.equals("duplicate-receipt")){boundary(ui,kind,"evaluating");ui.receipt.accept(q(envelope(ui.request)));ui.receipt.accept(q(envelope(ui.request)));ui.replied=true;}
        else {
          String url=bad.equals("foreign-origin")?expected.replace("api2.apicrewcare.com","evil.invalid"):
            bad.equals("login-redirect")?"https://api2.apicrewcare.com/LATAM/login.aspx":bad.equals("fragment")?expected+"#hidden":
            bad.equals("userinfo")?expected.replace("https://","https://name@"):
            bad.equals("http")?expected.replace("https://","http://"):bad.equals("bad-port")?expected.replace(".com/",".com:8443/"):
            expected+(expected.contains("?")?"&":"?")+"unexpected=1";
          check(!ui.callback.allow(url,true),"redirect denied");ui.callback.started(url);ui.callback.finished(url);
        }
        ui.drive();boolean duplicate=bad.startsWith("duplicate");
        check(result.count==1&&(duplicate?result.result!=null:result.result==null),"navigation receipt guard "+kind+bad);cases++;
      }
      for(String bad:List.of("extra-root","extra-row","wrong-account","wrong-session","wrong-request","wrong-generation","wrong-kind","wrong-profile","oversized","duplicate-key","number-coercion","null","object-not-wrapper","bad-json","lone-surrogate","invalid-hex","too-many-rows")) {
        var runtime=runtime();Ui ui=new Ui();Capture result=new Capture();runtime.observeMyCrewCareV3ForReview(scope("A"),new Bound("A",ui),new Deadline(),result::done);boundary(ui,kind,"evaluating");
        String raw=envelope(ui.request);
        if(bad.equals("extra-root"))raw=raw.replace("\"schemaVersion\":3","\"html\":\"forbidden\",\"schemaVersion\":3");
        if(bad.equals("extra-row"))raw=raw.replace("\"rows\":[{","\"rows\":[{\"cookie\":\"forbidden\",");
        if(bad.equals("wrong-account"))raw=raw.replace("\"accountId\":\"A\"","\"accountId\":\"B\"");
        if(bad.equals("wrong-session"))raw=raw.replace("session-A","session-B");
        if(bad.equals("wrong-request"))raw=raw.replace("request-A","request-B");
        if(bad.equals("wrong-generation"))raw=raw.replace("\"generation\":1","\"generation\":2");
        if(bad.equals("wrong-kind"))raw=raw.replace(q(kind),q("OTHER"));
        if(bad.equals("wrong-profile"))raw=raw.replace("900000001","900000002");
        if(bad.equals("oversized"))raw=" ".repeat(262145)+raw;
        if(bad.equals("duplicate-key"))raw=raw.replace("\"schemaVersion\":3","\"schemaVersion\":3,\"schemaVersion\":3");
        if(bad.equals("number-coercion"))raw=raw.replace("\"schemaVersion\":3","\"schemaVersion\":\"3\"");
        if(bad.equals("bad-json"))raw="{";
        if(bad.equals("lone-surrogate"))raw=raw.replace("session-A","\\uD800");
        if(bad.equals("invalid-hex"))raw=raw.replace("session-A","\\uＦＦＦＦ");
        if(bad.equals("too-many-rows"))raw=raw.replace("\"rows\":[{","\"rows\":["+"{},".repeat(50)+"{");
        String callback=bad.equals("null")?"null":bad.equals("object-not-wrapper")?raw:q(raw);
        ui.receipt.accept(callback);ui.replied=true;ui.drive();
        check(result.count==1&&result.result==null,"strict wire/typed guard "+kind+bad);cases++;
      }
    }
  }
  static void foreignCleanupAndCancel() {
    for(String phase:List.of("profile-before","cards","detail","profile-after"))for(String stage:List.of("queued","navigating","evaluating","receipt-queued")) {
      var runtime=runtime();Ui ui=new Ui();Capture result=new Capture();runtime.observeMyCrewCareV3ForReview(scope("B"),new Bound("B",ui),new Deadline(),result::done);boundary(ui,phase,stage);
      check(runtime.startMyCrewCareCleanupV3("A",true,"cleanup_old_A"),"foreign cleanup accepted");ui.drive();check(result.count==1&&result.result!=null&&result.result.accountId.equals("B"),"A cleanup preserves source B "+phase+stage);cases++;
    }
    for(String phase:List.of("profile-before","cards","detail","profile-after"))for(String field:List.of("account","session","request","generation","employee","username")) {
      var runtime=runtime();Ui ui=new Ui();Bound source=new Bound("A",ui);Capture result=new Capture();runtime.observeMyCrewCareV3ForReview(scope("A"),source,new Deadline(),result::done);boundary(ui,phase,"evaluating");ObservedScope a=ui.request.scope;
      source.cancel(new ObservedScope(field.equals("account")?"B":a.accountId,field.equals("session")?"OTHER":a.sessionId,field.equals("request")?"OTHER":a.requestId,
        field.equals("employee")?"900000002":a.employeeId,field.equals("username")?"other@example.invalid":a.username,field.equals("generation")?a.generation+1:a.generation));
      ui.drive();check(result.count==1&&result.result!=null,"foreign cancel cannot stop source A "+phase+field);cases++;
    }
  }
  static void concurrentDispatch() {
    for(String at:List.of("navigate","evaluate")) {
      final java.util.concurrent.CountDownLatch entered=new java.util.concurrent.CountDownLatch(1),release=new java.util.concurrent.CountDownLatch(1);
      Ui ui=new Ui(){public void navigate(String u,Navigation cb){if(at.equals("navigate")){entered.countDown();await(release);}super.navigate(u,cb);}public void evaluate(String script,Consumer<String> cb){if(at.equals("evaluate")){entered.countDown();await(release);}super.evaluate(script,cb);}};
      var runtime=runtime();Capture result=new Capture();runtime.observeMyCrewCareV3ForReview(scope("A"),new Bound("A",ui),new Deadline(),result::done);
      if(at.equals("evaluate")){ui.step();ui.step();ui.step();ui.step();} // navigate, start callback, consume start, queue finish
      Thread main=new Thread(ui::step);main.start();await(entered);
      Thread worker=new Thread(()->runtime.startMyCrewCareCleanupV3("A",true,"cleanup_race"));worker.start();blocked(worker);release.countDown();join(main);join(worker);ui.drive();
      check(result.count==1&&result.result==null&&ui.stops==1&&runtime.myCrewCareCleanupResultV3("A","cleanup_race").equals("ok"),"concurrent source dispatch/cancel "+at);cases++;
    }
  }
  static void nativeDriver() throws Exception {
    android.content.res.AssetManager.source=output.resolve("mycrewcare-transport-v3.js").toString();Files.writeString(Path.of(android.content.res.AssetManager.source),asset);
    android.webkit.WebView.instances.clear();com.crewcheck.app.CrewCheckMyCrewCareProfile.createdAccounts.clear();
    var profiles=new com.crewcheck.app.CrewCheckMyCrewCareProfile();
    for(boolean escaped:List.of(false,true)) {
    ObservedScope boundScope=escaped?new ObservedScope("A\"\\$","session\"\\A","request\"\\A","900000001","synthetic.crew@example.invalid",0):scope("A");
    int viewIndex=android.webkit.WebView.instances.size();
    var source=CrewCheckMyCrewCareObservedWebViewSource.prepare(new android.app.Activity(),profiles,boundScope);
    var owner=new ObservedAcquisition();Capture result=new Capture();final ObservedRequest[] request=new ObservedRequest[1];
    ObservedSource bound=new ObservedSource(){public void acquire(ObservedRequest r,ObservedPageCallback cb){request[0]=r;source.acquire(r,cb);}public void cancel(ObservedScope s){source.cancel(s);}};
    check(owner.begin(boundScope,bound,new Deadline(),result::done),"native prepare accepted");check(android.webkit.WebView.instances.size()==viewIndex,"lazy profile creation only in main queue");
    for(int index=0;index<4;index++){
      android.os.Handler.drain();var view=android.webkit.WebView.instances.get(android.webkit.WebView.instances.size()-1);ObservedRequest r=request[0];
      if(index>0){var old=android.webkit.WebView.instances.get(android.webkit.WebView.instances.size()-2);check(old.destroyed,"previous same-profile view destroyed before next page");
        android.os.Handler.runMain(()->{old.client.onPageFinished(old,view.url);view.client.onPageFinished(old,view.url);old.client.onReceivedError(old,new android.webkit.WebResourceRequest(view.url,true),new android.webkit.WebResourceError());});android.os.Handler.drain();check(view.value==null,"late or wrongly attributed same-URL callback cannot evaluate new view");}
      check(view.settings.js==false,"provider scripts disabled on navigation");
      android.os.Handler.runMain(()->view.client.onPageFinished(view,view.url));android.os.Handler.drain();
      check(view.settings.js&&view.script.startsWith(asset),"actual generated asset evaluated in main");
      Files.writeString(output.resolve((index+(escaped?4:0))+"-script.js"),view.script);Files.writeString(output.resolve((index+(escaped?4:0))+"-request.json"),"{\"kind\":"+q(r.kind)+",\"url\":"+q(view.url)+",\"envelope\":"+envelope(r)+"}");
      android.os.Handler.runMain(()->view.client.onReceivedError(view,new android.webkit.WebResourceRequest("https://evil.invalid/",false),new android.webkit.WebResourceError()));
      android.webkit.PermissionRequest permission=new android.webkit.PermissionRequest();android.os.Handler.runMain(()->view.chrome.onPermissionRequest(permission));check(permission.denied,"no permission request granted");
      check(view.client.shouldInterceptRequest(view,new android.webkit.WebResourceRequest("https://evil.invalid/private",false))!=null,"subresource blocked without WebView access on worker");
      final boolean[] denied=new boolean[1];android.os.Handler.runMain(()->denied[0]=view.client.shouldOverrideUrlLoading(view,new android.webkit.WebResourceRequest(view.url,false)));check(denied[0],"subframe navigation blocked");
      android.os.Handler.runMain(()->view.value.onReceiveValue(q(envelope(r))));android.os.Handler.drain();
    }
    check(result.count==1&&result.result!=null&&android.webkit.WebView.instances.get(android.webkit.WebView.instances.size()-1).destroyed,"native driver full sequence and destroy main");
    check(profiles.createdAccounts.get(viewIndex).equals(boundScope.accountId),"existing isolated profile factory owns the exact binding only");cases++;
    }
    // Actual AndroidDriver stop precedes profile cleanup, both inline-main and worker-queued.
    for(String phase:List.of("profile-before","cards","detail","profile-after"))for(boolean onMain:List.of(false,true)) {
      int viewIndex=android.webkit.WebView.instances.size();var source=CrewCheckMyCrewCareObservedWebViewSource.prepare(new android.app.Activity(),profiles,scope("A"));var runtime=runtime();Capture result=new Capture();final ObservedRequest[] current=new ObservedRequest[1];
      ObservedSource bound=new ObservedSource(){public void acquire(ObservedRequest r,ObservedPageCallback cb){current[0]=r;source.acquire(r,cb);}public void cancel(ObservedScope s){source.cancel(s);}};
      runtime.observeMyCrewCareV3ForReview(scope("A"),bound,new Deadline(),result::done);android.os.Handler.drain();
      while(!current[0].kind.equals(phase)) {ObservedRequest r=current[0];var stageView=android.webkit.WebView.instances.get(android.webkit.WebView.instances.size()-1);android.os.Handler.runMain(()->stageView.client.onPageFinished(stageView,stageView.url));android.os.Handler.drain();android.os.Handler.runMain(()->stageView.value.onReceiveValue(q(envelope(r))));android.os.Handler.drain();}
      var view=android.webkit.WebView.instances.get(android.webkit.WebView.instances.size()-1);
      com.crewcheck.app.CrewCheckMyCrewCareProfile.requireStopped=true;
      Runnable cleanup=()->check(runtime.startMyCrewCareCleanupV3("A",true,"cleanup_thread"),"thread cleanup accepted");
      if(onMain)android.os.Handler.runMain(cleanup);else {Thread worker=new Thread(cleanup);worker.start();join(worker);}android.os.Handler.drain();
      check(runtime.myCrewCareCleanupResultV3("A","cleanup_thread").equals("ok")&&view.destroyed&&result.count==1&&result.result==null,"source stop before profile cleanup "+phase+onMain);
      com.crewcheck.app.CrewCheckMyCrewCareProfile.requireStopped=false;cases++;
    }
    // Unsupported isolation has no fallback or WebView allocation.
    for(String mode:List.of("ssl","main-error","http-error","renderer","download","redirect","null-native-url","post")) {
      int viewIndex=android.webkit.WebView.instances.size();var source=CrewCheckMyCrewCareObservedWebViewSource.prepare(new android.app.Activity(),profiles,scope("A"));var owner=new ObservedAcquisition();Capture result=new Capture();owner.begin(scope("A"),source,new Deadline(),result::done);android.os.Handler.drain();var view=android.webkit.WebView.instances.get(viewIndex);
      android.os.Handler.runMain(()->{
        if(mode.equals("ssl")){var handler=new android.webkit.SslErrorHandler();view.client.onReceivedSslError(view,handler,new android.net.http.SslError());check(handler.cancelled,"SSL always canceled");}
        if(mode.equals("main-error"))view.client.onReceivedError(view,new android.webkit.WebResourceRequest(view.url,true),new android.webkit.WebResourceError());
        if(mode.equals("http-error"))view.client.onReceivedHttpError(view,new android.webkit.WebResourceRequest(view.url,true),new android.webkit.WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0])));
        if(mode.equals("renderer"))check(view.client.onRenderProcessGone(view,new android.webkit.RenderProcessGoneDetail()),"renderer handled fail-closed");
        if(mode.equals("download"))view.download.onDownloadStart(view.url,"synthetic","","",1);
        if(mode.equals("redirect"))check(view.client.shouldOverrideUrlLoading(view,new android.webkit.WebResourceRequest("https://evil.invalid/",true)),"native redirect blocked");
        if(mode.equals("post"))check(view.client.shouldInterceptRequest(view,new android.webkit.WebResourceRequest(view.url,true,"POST"))!=null,"non-GET main request blocked");
        if(mode.equals("null-native-url")){String url=view.url;view.url=null;view.client.onPageFinished(view,url);}
      });android.os.Handler.drain();check(result.count==1&&result.result==null&&view.destroyed,"native driver rejects "+mode);cases++;
    }
    profiles.supported=false;try{CrewCheckMyCrewCareObservedWebViewSource.prepare(new android.app.Activity(),profiles,scope("A"));throw new AssertionError("fallback permitted");}catch(IllegalArgumentException expected){}cases++;
  }
  public static void main(String[] args) {
    try {
    asset=Files.readString(Path.of(args[0]));output=Path.of(args[1]);matrix();negatives();foreignCleanupAndCancel();concurrentDispatch();nativeDriver();
    System.out.println("PASS observed WebView source cases="+cases);
    } catch(Exception error) {throw new AssertionError(error);}
  }
}
