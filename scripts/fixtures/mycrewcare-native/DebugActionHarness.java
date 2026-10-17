import com.crewcheck.app.*;
import static com.crewcheck.app.CrewCheckMyCrewCarePortalV3.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;

/** Synthetic UI + actual debug Activity/factory/Runtime. No provider/device calls. */
public class DebugActionHarness extends ObservedWebViewSourceHarness {
 static int count;
 static class Screen {
  final CrewCheckMyCrewCareDebugActivity activity=new CrewCheckMyCrewCareDebugActivity();
  android.widget.EditText employee,user;android.widget.CheckBox consent;android.widget.Button prepare,start,cancel;android.widget.TextView status;
  Screen(){android.os.Handler.runMain(activity::create);var layout=(android.widget.LinearLayout)activity.content;
   employee=(android.widget.EditText)layout.children.get(1);user=(android.widget.EditText)layout.children.get(2);consent=(android.widget.CheckBox)layout.children.get(3);prepare=(android.widget.Button)layout.children.get(4);start=(android.widget.Button)layout.children.get(5);cancel=(android.widget.Button)layout.children.get(6);status=(android.widget.TextView)layout.children.get(7);
   check(!employee.save&&!user.save&&!consent.save&&layout.autofill==8,"identity/consent not restored or autofilled");}
  void ready(){employee.setText("900000001");user.setText("synthetic.crew@example.invalid");consent.setChecked(true);}
  void prepare(){android.os.Handler.runMain(prepare::click);android.os.Handler.drain();}
  void click(){prepare();var layout=(android.widget.LinearLayout)activity.content;for(var child:new ArrayList<>(layout.children))if(child instanceof android.webkit.WebView){var v=(android.webkit.WebView)child;android.os.Handler.runMain(()->v.client.onPageFinished(v,v.url));}android.os.Handler.runMain(start::click);android.os.Handler.drain();}
  void close(){android.os.Handler.runMain(activity::destroy);android.os.Handler.drain();}
 }
 static ObservedRequest request(Screen s) {
  try {Field f=CrewCheckMyCrewCareDebugActivity.class.getDeclaredField("runtime");f.setAccessible(true);Object runtime=f.get(s.activity);Field observations=runtime.getClass().getDeclaredField("observations");observations.setAccessible(true);Object owner=observations.get(runtime);Field active=owner.getClass().getDeclaredField("active");active.setAccessible(true);Object op=active.get(owner);Field scope=op.getClass().getDeclaredField("scope"),step=op.getClass().getDeclaredField("step"),cards=op.getClass().getDeclaredField("cards");scope.setAccessible(true);step.setAccessible(true);cards.setAccessible(true);int n=step.getInt(op);String kind=n==1?"profile-before":n==3?"cards":n==5?"detail":"profile-after";Map<String,String> card=n==5?((List<Map<String,String>>)cards.get(op)).get(0):null;Constructor<ObservedRequest> c=ObservedRequest.class.getDeclaredConstructor(ObservedScope.class,String.class,Map.class);c.setAccessible(true);return c.newInstance(scope.get(op),kind,card);
  }catch(Exception e){throw new AssertionError(e);}
 }
 static android.webkit.WebView view(){return android.webkit.WebView.instances.get(android.webkit.WebView.instances.size()-1);}
 static void extract(){var v=view();android.os.Handler.runMain(()->v.client.onPageFinished(v,v.url));android.os.Handler.drain();}
 static void deliver(Screen s){ObservedRequest r=request(s);var v=view();extract();android.os.Handler.runMain(()->v.value.onReceiveValue(q(envelope(r))));android.os.Handler.drain();}
 static void to(Screen s,String phase){while(!request(s).kind.equals(phase))deliver(s);}
 static void clean(){CrewCheckMyCrewCareProfile.supported=true;CrewCheckMyCrewCareProfile.defer=false;CrewCheckMyCrewCareProfile.clearError=null;CrewCheckMyCrewCareProfile.pending.clear();CrewCheckMyCrewCareSecureStore.clearError=null;android.os.Handler.delayed.clear();}
 public static void main(String[] args){try {
  android.content.res.AssetManager.source=args[0];asset=Files.readString(Path.of(args[0]));
  Screen initial=new Screen();int before=android.webkit.WebView.instances.size();initial.click();check(android.webkit.WebView.instances.size()==before&&initial.status.text.contains("autorização"),"no navigation without consent");count++;
  initial.consent.setChecked(true);initial.click();check(android.webkit.WebView.instances.size()==before&&initial.status.text.contains("Informe"),"invalid identity no navigation");count++;
  initial.ready();android.os.Handler.runMain(initial.activity::stop);initial.click();check(android.webkit.WebView.instances.size()==before,"no background start");initial.close();count++;
  clean();CrewCheckMyCrewCareProfile.supported=false;Screen unsupported=new Screen();unsupported.ready();unsupported.click();check(android.webkit.WebView.instances.size()==before&&unsupported.status.text.contains("indisponível")&&!unsupported.consent.checked,"unsupported has no fallback, consent consumed");unsupported.close();count++;
  clean();Screen full=new Screen();full.ready();full.click();check(!full.prepare.enabled&&!full.consent.checked,"single-flight consumes consent");full.click();check(request(full).kind.equals("profile-before"),"double click cannot replace attempt");count++;
  for(int i=0;i<4;i++)deliver(full);
  check(full.status.text.contains("Contrato observado válido")&&full.status.text.contains("não validados")&&full.status.text.contains("Perfil de teste limpo")&&full.prepare.enabled&&!full.status.text.contains("Synthetic")&&view().destroyed,"only bounded summary after validated cleanup");count++;
  int after=android.webkit.WebView.instances.size();full.click();check(android.webkit.WebView.instances.size()==after,"retry needs new consent");full.close();count++;
  for(String phase:List.of("profile-before","cards","detail","profile-after"))for(String how:List.of("cancel","stop","destroy","timeout")) {
   clean();Screen s=new Screen();s.ready();s.click();to(s,phase);var v=view();extract();var late=v.value;ObservedRequest r=request(s);
   if(how.equals("cancel"))android.os.Handler.runMain(s.cancel::click);if(how.equals("stop"))android.os.Handler.runMain(s.activity::stop);if(how.equals("destroy"))android.os.Handler.runMain(s.activity::destroy);if(how.equals("timeout"))android.os.Handler.tick();
   android.os.Handler.drain();android.os.Handler.runMain(()->late.onReceiveValue(q(envelope(r))));android.os.Handler.drain();
   check(v.destroyed&&!s.status.text.contains("Contrato observado válido"),"late completion cannot publish success "+phase+how);s.close();count++;
  }
  for(String phase:List.of("profile-before","cards","detail","profile-after"))for(String bad:List.of("http","identity")) {
   clean();Screen s=new Screen();s.ready();s.click();to(s,phase);var v=view();
   if(bad.equals("http"))android.os.Handler.runMain(()->v.client.onReceivedHttpError(v,new android.webkit.WebResourceRequest(v.url,true),new android.webkit.WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0]))));
   else {ObservedRequest r=request(s);extract();android.os.Handler.runMain(()->v.value.onReceiveValue(q(envelope(r).replace(r.scope.accountId,"foreign"))));}
   android.os.Handler.drain();check(v.destroyed&&s.status.text.contains("Não validado")&&!s.status.text.contains("Contrato observado válido"),"failure never becomes operational success "+phase+bad);s.close();count++;
  }
  clean();CrewCheckMyCrewCareProfile.defer=true;Screen delayed=new Screen();delayed.ready();delayed.click();for(int i=0;i<4;i++)deliver(delayed);
  check(!delayed.prepare.enabled&&delayed.status.text.contains("ainda não concluído")&&!delayed.status.text.contains("Contrato observado válido"),"cleanup pending is not success");
  CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(false,"profile-clear-failed");android.os.Handler.tick();check(!delayed.prepare.enabled&&delayed.status.text.contains("não confirmada"),"cleanup failure blocks retry and success");delayed.close();count++;
  for(String mode:List.of("pending-success","pending-timeout","profile-throw","cache-throw")) {
   clean();CrewCheckMyCrewCareProfile.defer=mode.startsWith("pending");
   if(mode.equals("profile-throw"))CrewCheckMyCrewCareProfile.clearError=new IllegalStateException("synthetic");
   if(mode.equals("cache-throw"))CrewCheckMyCrewCareSecureStore.clearError=new IllegalStateException("synthetic");
   Screen s=new Screen();s.ready();s.click();for(int i=0;i<4;i++)deliver(s);
   if(mode.equals("pending-success")){check(!s.status.text.contains("Contrato observado válido"),"pending cleanup does not publish valid result");CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(true,"ok");android.os.Handler.tick();check(s.prepare.enabled&&s.status.text.contains("Contrato observado válido"),"only confirmed delayed cleanup permits result/retry");}
   else {if(mode.equals("pending-timeout"))for(int i=0;i<300;i++)android.os.Handler.tick();check(!s.prepare.enabled&&s.status.text.contains("não confirmada")&&!s.status.text.contains("Contrato observado válido"),"cleanup failures/timeout block result "+mode);}
   s.close();count++;
  }
  clean();Screen login=new Screen();login.ready();int loginIndex=android.webkit.WebView.instances.size();login.prepare();var visible=view();
  check(((android.widget.LinearLayout)login.activity.content).children.contains(visible)&&visible.settings.js&&visible.script==null&&visible.value==null&&!login.start.enabled,"visible official login page without native script/form extraction or early read");
  String official="https://api2.apicrewcare.com/Main/Login.aspx?ReturnUrl=%2fLATAM%2fmytravel.aspx";
  android.os.Handler.runMain(()->{check(!visible.client.shouldOverrideUrlLoading(visible,new android.webkit.WebResourceRequest(official,true)),"observed login target allowed");visible.url=official;visible.client.onPageStarted(visible,official,null);visible.client.onPageFinished(visible,official);check(!login.start.enabled,"login URL not authentication");check(!visible.client.shouldOverrideUrlLoading(visible,new android.webkit.WebResourceRequest(official,true,"POST")),"user browser form POST allowed only observed login target");check(visible.client.shouldInterceptRequest(visible,new android.webkit.WebResourceRequest("https://api2.apicrewcare.com/Content/site.css",false))==null,"same exact portal origin GET resources");visible.url="https://api2.apicrewcare.com/LATAM/mytravel.aspx";visible.client.onPageStarted(visible,visible.url,null);visible.client.onPageFinished(visible,visible.url);login.start.click();});android.os.Handler.drain();
  check(visible.destroyed&&CrewCheckMyCrewCareProfile.createdAccounts.get(loginIndex).equals(request(login).scope.accountId)&&CrewCheckMyCrewCareProfile.createdAccounts.get(loginIndex+1).equals(request(login).scope.accountId),"login and real source share exact profile/account; visible view stopped before acquisition");
  for(int i=0;i<4;i++)deliver(login);check(login.status.text.contains("Contrato observado válido"),"typed owner, not login button/URL, decides validity");login.close();count++;
  for(String bad:List.of("https://sso2.apihotels.com/sso/sp/ACS.saml2","https://evil.invalid/","http://api2.apicrewcare.com/LATAM/mytravel.aspx","https://user@api2.apicrewcare.com/LATAM/mytravel.aspx","https://api2.apicrewcare.com:444/LATAM/mytravel.aspx","https://api2.apicrewcare.com/LATAM/mytravel.aspx#x","https://api2.apicrewcare.com/LATAM/login.aspx?logout=1","https://api2.apicrewcare.com/LATAM/login.aspx","https://api2.apicrewcare.com/Main/Login.aspx?ReturnUrl=%2fOTHER%2f","https://api2.apicrewcare.com/Main/Login.aspx")) {
   clean();Screen s=new Screen();s.ready();s.prepare();var v=view();android.os.Handler.runMain(()->check(v.client.shouldOverrideUrlLoading(v,new android.webkit.WebResourceRequest(bad,true)),"unverified main destination blocked"));android.os.Handler.drain();check(v.destroyed&&s.status.text.contains("fora do escopo")&&!s.status.text.contains(bad),"blocked destination explicit, URL not disclosed");s.close();count++;
  }
  for(String mode:List.of("cancel","stop","destroy","http","ssl","renderer","download","subframe","worker-resource","worker-before-read")) {
   clean();Screen s=new Screen();s.ready();s.prepare();var v=view();int views=android.webkit.WebView.instances.size();
   android.os.Handler.runMain(()->v.client.onPageFinished(v,v.url));
   if(mode.startsWith("worker")){Thread worker=new Thread(()->check(v.client.shouldInterceptRequest(v,new android.webkit.WebResourceRequest("https://sso2.apihotels.com/asset",false))!=null,"unverified worker resource blocked"));worker.start();join(worker);if(mode.equals("worker-before-read"))android.os.Handler.runMain(s.start::click);}
   else android.os.Handler.runMain(()->{if(mode.equals("cancel"))s.cancel.click();if(mode.equals("stop"))s.activity.stop();if(mode.equals("destroy"))s.activity.destroy();if(mode.equals("http"))v.client.onReceivedHttpError(v,new android.webkit.WebResourceRequest(v.url,true),new android.webkit.WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0])));if(mode.equals("ssl")){var h=new android.webkit.SslErrorHandler();v.client.onReceivedSslError(v,h,new android.net.http.SslError());check(h.cancelled,"SSL never bypassed");}if(mode.equals("renderer"))v.client.onRenderProcessGone(v,new android.webkit.RenderProcessGoneDetail());if(mode.equals("download"))v.download.onDownloadStart(v.url,"","","",1);if(mode.equals("subframe"))check(v.client.shouldOverrideUrlLoading(v,new android.webkit.WebResourceRequest(v.url,false)),"frame navigation denied");});
   android.os.Handler.drain();check(v.destroyed&&android.webkit.WebView.instances.size()==views&&!s.status.text.contains("Contrato observado válido"),"preparation invalidation/lifecycle prevents acquisition "+mode);s.close();count++;
  }
  for(String late:List.of("started","http","renderer","worker")) {
   clean();Screen s=new Screen();s.ready();s.prepare();var old=view();android.os.Handler.runMain(s.cancel::click);android.os.Handler.drain();s.ready();s.prepare();var fresh=view();
   Runnable callback=()->{if(late.equals("started"))old.client.onPageStarted(old,"https://sso2.apihotels.com/",null);if(late.equals("http"))old.client.onReceivedHttpError(old,new android.webkit.WebResourceRequest(old.url,true),new android.webkit.WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0])));if(late.equals("renderer"))old.client.onRenderProcessGone(old,new android.webkit.RenderProcessGoneDetail());if(late.equals("worker"))old.client.shouldInterceptRequest(old,new android.webkit.WebResourceRequest("https://sso2.apihotels.com/asset",false));};
   if(late.equals("worker")){Thread worker=new Thread(callback);worker.start();join(worker);}else android.os.Handler.runMain(callback);
   android.os.Handler.drain();check(!fresh.destroyed,"stale old preparation cannot revoke replacement");android.os.Handler.runMain(()->{fresh.client.onPageFinished(fresh,fresh.url);s.start.click();});android.os.Handler.drain();for(int i=0;i<4;i++)deliver(s);check(s.status.text.contains("Contrato observado válido"),"replacement remains deliverable "+late);s.close();count++;
  }
  for(String event:List.of("started","http","renderer","worker")) {
   clean();Screen s=new Screen();s.ready();s.prepare();var old=view();android.os.Handler.runMain(()->{old.client.onPageFinished(old,old.url);s.start.click();});android.os.Handler.drain();
   Runnable callback=()->{if(event.equals("started"))old.client.onPageStarted(old,"https://sso2.apihotels.com/",null);if(event.equals("http"))old.client.onReceivedHttpError(old,new android.webkit.WebResourceRequest(old.url,true),new android.webkit.WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0])));if(event.equals("renderer"))old.client.onRenderProcessGone(old,new android.webkit.RenderProcessGoneDetail());if(event.equals("worker"))old.client.shouldInterceptRequest(old,new android.webkit.WebResourceRequest("https://sso2.apihotels.com/asset",false));};
   if(event.equals("worker")){Thread worker=new Thread(callback);worker.start();join(worker);}else android.os.Handler.runMain(callback);android.os.Handler.drain();for(int i=0;i<4;i++)deliver(s);check(s.status.text.contains("Contrato observado válido"),"stale login callback after handoff cannot cancel actual source "+event);s.close();count++;
  }
  for(String broken:List.of("stop","destroy"))for(String action:List.of("cancel","read")) {
   clean();Screen s=new Screen();s.ready();s.prepare();var v=view();v.stopError=broken.equals("stop");v.destroyError=broken.equals("destroy");int clearBefore=CrewCheckMyCrewCareProfile.clearCalls,viewsBefore=android.webkit.WebView.instances.size();
   android.os.Handler.runMain(()->{if(action.equals("cancel"))s.cancel.click();else{v.client.onPageFinished(v,v.url);s.start.click();}});android.os.Handler.drain();
   check(v.destroyed&&CrewCheckMyCrewCareProfile.clearCalls==clearBefore+1&&android.webkit.WebView.instances.size()==viewsBefore&&!s.prepare.enabled&&s.status.text.contains("não confirmada"),"cleanup attempted despite teardown exception, no source/retry/success "+broken+action);s.close();count++;
  }
  for(String boundary:List.of("status","stop","destroy"))for(String event:List.of("resource","http","renderer","started")) {
   clean();Screen s=new Screen();s.ready();s.prepare();var v=view();int viewsBefore=android.webkit.WebView.instances.size();
   android.os.Handler.runMain(()->v.client.onPageFinished(v,v.url));
   Runnable invalidation=()->{if(event.equals("resource")){Thread worker=new Thread(()->v.client.shouldInterceptRequest(v,new android.webkit.WebResourceRequest("https://sso2.apihotels.com/asset",false)));worker.start();join(worker);}if(event.equals("http"))v.client.onReceivedHttpError(v,new android.webkit.WebResourceRequest(v.url,true),new android.webkit.WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0])));if(event.equals("renderer"))v.client.onRenderProcessGone(v,new android.webkit.RenderProcessGoneDetail());if(event.equals("started"))v.client.onPageStarted(v,"https://sso2.apihotels.com/",null);};
   if(boundary.equals("status"))android.widget.TextView.hook=text->{if(text.startsWith("Verificando identidade")){android.widget.TextView.hook=null;invalidation.run();}};
   if(boundary.equals("stop"))android.webkit.WebView.stopHook=page->{if(page==v){android.webkit.WebView.stopHook=null;invalidation.run();}};
   if(boundary.equals("destroy"))android.webkit.WebView.destroyHook=page->{if(page==v){android.webkit.WebView.destroyHook=null;invalidation.run();}};
   android.os.Handler.runMain(s.start::click);android.os.Handler.drain();
   android.widget.TextView.hook=null;android.webkit.WebView.stopHook=null;android.webkit.WebView.destroyHook=null;
   check(v.destroyed&&android.webkit.WebView.instances.size()==viewsBefore&&!s.status.text.contains("Contrato observado válido")&&s.status.text.contains("não confirmado"),"causal handoff invalidation prevents acquisition "+boundary+event);s.close();count++;
  }
  check(count==81,"expected full debug matrix");System.out.println("PASS debug action cases="+count);
 }catch(Exception e){throw new AssertionError(e);}}
}
