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
  Screen(){android.os.Handler.runMain(activity::create);var scroll=(android.widget.ScrollView)activity.content;check(scroll.fillViewport,"whole debug screen scrollable, including controls/results");var layout=(android.widget.LinearLayout)scroll.children.get(0);
   employee=(android.widget.EditText)layout.children.get(1);user=(android.widget.EditText)layout.children.get(2);consent=(android.widget.CheckBox)layout.children.get(3);prepare=(android.widget.Button)layout.children.get(4);start=(android.widget.Button)layout.children.get(5);cancel=(android.widget.Button)layout.children.get(6);status=(android.widget.TextView)layout.children.get(7);check(status.focusable&&status.textSize==16,"focus and scaled text; no line cap");
   check(!employee.save&&!user.save&&!consent.save&&layout.autofill==8,"identity/consent not restored or autofilled");}
  void ready(){employee.setText("900000001");user.setText("synthetic.crew@example.invalid");consent.setChecked(true);}
  void prepare(){android.os.Handler.runMain(prepare::click);android.os.Handler.drain();}
  void click(){prepare();var scroll=(android.widget.ScrollView)activity.content;check(scroll.fillViewport,"whole debug screen scrollable, including controls/results");var layout=(android.widget.LinearLayout)scroll.children.get(0);for(var child:new ArrayList<>(layout.children))if(child instanceof android.webkit.WebView){var v=(android.webkit.WebView)child;android.os.Handler.runMain(()->v.client.onPageFinished(v,v.url));}android.os.Handler.runMain(start::click);android.os.Handler.drain();}
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
 static void clean(){CrewCheckMyCrewCareProfile.cleanupHook=null;CrewCheckMyCrewCareProfile.supported=true;CrewCheckMyCrewCareProfile.defer=false;CrewCheckMyCrewCareProfile.clearError=null;CrewCheckMyCrewCareProfile.pending.clear();CrewCheckMyCrewCareSecureStore.clearError=null;android.os.Handler.delayed.clear();}
 public static void main(String[] args){try {
  android.content.res.AssetManager.source=args[0];asset=Files.readString(Path.of(args[0]));
  Screen initial=new Screen();int before=android.webkit.WebView.instances.size();initial.click();check(android.webkit.WebView.instances.size()==before&&initial.status.text.contains("autorização"),"no navigation without consent");count++;
  initial.consent.setChecked(true);initial.click();check(android.webkit.WebView.instances.size()==before&&initial.status.text.contains("Informe"),"invalid identity no navigation");count++;
  initial.ready();android.os.Handler.runMain(initial.activity::stop);initial.click();check(android.webkit.WebView.instances.size()==before,"no background start");initial.close();count++;
  clean();CrewCheckMyCrewCareProfile.supported=false;Screen unsupported=new Screen();unsupported.ready();unsupported.click();check(android.webkit.WebView.instances.size()==before&&unsupported.status.text.contains("indisponível")&&!unsupported.consent.checked,"unsupported has no fallback, consent consumed");unsupported.close();count++;
  clean();Screen full=new Screen();full.ready();full.click();check(!full.prepare.enabled&&!full.consent.checked,"single-flight consumes consent");full.click();check(request(full).kind.equals("profile-before"),"double click cannot replace attempt");count++;
  for(int i=0;i<4;i++)deliver(full);
  check(full.status.text.contains("Contrato observado válido")&&full.status.text.contains("não validados")&&full.status.text.contains("Perfil de teste limpo")&&full.prepare.enabled&&full.status.text.contains("Synthetic Harbor Hotel")&&full.status.text.contains("Synthetic Airport Shuttle")&&full.status.text.contains("07:05")&&view().destroyed,"only validated own reservation preview after verified cleanup");count++;
  android.os.Handler.runMain(()->full.cancel.click());check(!full.status.text.contains("Synthetic")&&full.status.text.contains("apagada"),"disconnect clears completed preview");
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
   android.os.Handler.drain();check(v.destroyed&&s.status.text.contains("Não validado")&&!s.status.text.contains("Contrato observado válido")&&!s.status.text.contains("Synthetic"),"failure never becomes operational success "+phase+bad);s.close();count++;
  }
  clean();CrewCheckMyCrewCareProfile.defer=true;Screen delayed=new Screen();delayed.ready();delayed.click();for(int i=0;i<4;i++)deliver(delayed);
  check(!delayed.prepare.enabled&&delayed.status.text.contains("ainda não concluído")&&!delayed.status.text.contains("Contrato observado válido")&&!delayed.status.text.contains("Synthetic"),"cleanup pending is not success");
  CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(false,"profile-clear-failed");android.os.Handler.tick();check(!delayed.prepare.enabled&&delayed.status.text.contains("não confirmada"),"cleanup failure blocks retry and success");delayed.close();count++;
  for(String mode:List.of("pending-success","pending-timeout","profile-throw","cache-throw")) {
   clean();CrewCheckMyCrewCareProfile.defer=mode.startsWith("pending");
   if(mode.equals("profile-throw"))CrewCheckMyCrewCareProfile.clearError=new IllegalStateException("synthetic");
   if(mode.equals("cache-throw"))CrewCheckMyCrewCareSecureStore.clearError=new IllegalStateException("synthetic");
   Screen s=new Screen();s.ready();s.click();for(int i=0;i<4;i++)deliver(s);
   if(mode.equals("pending-success")){check(!s.status.text.contains("Contrato observado válido"),"pending cleanup does not publish valid result");CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(true,"ok");android.os.Handler.tick();check(s.prepare.enabled&&s.status.text.contains("Contrato observado válido"),"only confirmed delayed cleanup permits result/retry");}
   else {if(mode.equals("pending-timeout"))for(int i=0;i<300;i++)android.os.Handler.tick();check(!s.prepare.enabled&&s.status.text.contains("não confirmada")&&!s.status.text.contains("Contrato observado válido")&&!s.status.text.contains("Synthetic"),"cleanup failures/timeout block result "+mode);}
   s.close();count++;
  }
  clean();Screen login=new Screen();login.ready();int loginIndex=android.webkit.WebView.instances.size();login.prepare();var visible=view();
  check(((android.widget.LinearLayout)((android.widget.ScrollView)login.activity.content).children.get(0)).children.contains(visible)&&visible.settings.js&&visible.script==null&&visible.value==null&&!login.start.enabled,"visible official login page without native script/form extraction or early read");
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
   android.os.Handler.drain();
   if(mode.equals("stop")){check(!v.destroyed&&android.webkit.WebView.instances.size()==views,"login in background keeps the attempt during grace (MFA/e-mail app)");android.os.Handler.tick();check(s.status.text.contains("segundo plano por mais de 3 minutos"),"background grace expiry explains reason");}
   check(v.destroyed&&android.webkit.WebView.instances.size()==views&&!s.status.text.contains("Contrato observado válido"),"preparation invalidation/lifecycle prevents acquisition "+mode);s.close();count++;
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
  clean();Screen storageOnly=new Screen();storageOnly.ready();storageOnly.prepare();var loginPage=view();loginPage.sessionStorage.put("synthetic-session-only","not-a-credential");
  android.os.Handler.runMain(()->{loginPage.client.onPageFinished(loginPage,loginPage.url);storageOnly.start.click();});android.os.Handler.drain();var reader=view();
  check(loginPage.destroyed&&reader!=loginPage&&reader.sessionStorage.isEmpty(),"fresh page cannot pretend to inherit login sessionStorage");
  extract();android.os.Handler.runMain(()->reader.value.onReceiveValue("null"));android.os.Handler.drain();
  check(storageOnly.status.text.contains("Não validado")&&!storageOnly.status.text.contains("Synthetic")&&storageOnly.status.text.contains("Perfil de teste limpo"),"sessionStorage-only authentication fails closed with cleanup; no session copied or own reservations claimed");storageOnly.close();count++;
  for(String action:List.of("cancel","stop"))for(String outcome:List.of("ok","failure","timeout")) {
   clean();CrewCheckMyCrewCareProfile.defer=true;Screen s=new Screen();s.ready();s.click();for(int i=0;i<4;i++)deliver(s);
   check(s.status.text.contains("ainda não concluído")&&!s.status.text.contains("Synthetic"),"preview unpublished during cleanup");
   android.os.Handler.runMain(()->{if(action.equals("cancel")){s.cancel.click();s.cancel.click();}else s.activity.stop();});android.os.Handler.drain();
   if(action.equals("stop")){Method resume=CrewCheckMyCrewCareDebugActivity.class.getDeclaredMethod("onStart");resume.setAccessible(true);android.os.Handler.runMain(()->{try{resume.invoke(s.activity);}catch(Exception e){throw new AssertionError(e);}});}
   if(outcome.equals("timeout")){for(int i=0;i<300;i++)android.os.Handler.tick();}
   else {CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(outcome.equals("ok"),outcome.equals("ok")?"ok":"profile-clear-failed");android.os.Handler.tick();}
   check(!s.status.text.contains("Synthetic")&&!s.status.text.contains("Contrato observado válido"),"revoked preview never returns after cleanup: "+action+outcome);
   check(outcome.equals("ok")?s.prepare.enabled&&s.status.text.contains("Perfil de teste limpo"):!s.prepare.enabled&&s.status.text.contains("não confirmada"),"cleanup completion/errors remain authoritative after preview revocation: "+action+outcome);s.close();count++;
  }
  for(String state:List.of("Planned","Cancelled","UNRECOGNIZED")) {
   clean();Screen s=new Screen();s.ready();s.click();
   for(int i=0;i<4;i++){ObservedRequest r=request(s);var page=view();extract();String body=envelope(r).replace("Planned",state);android.os.Handler.runMain(()->page.value.onReceiveValue(q(body)));android.os.Handler.drain();}
   check(s.status.text.contains("Estado recebido: "+state),"raw reservation state never omitted: "+state);
   check(s.status.text.contains(state.equals("Planned")?"PLANEJADA — não equivale":state.equals("Cancelled")?"CANCELADA — hotel e pickup":"ESTADO DESCONHECIDO — não tratar"),"state-specific reservation/pickup warning: "+state);s.close();count++;
  }
  clean();Screen multiple=new Screen();multiple.ready();multiple.click();to(multiple,"detail");ObservedScope context=request(multiple).scope;
  List<Map<String,String>> rows=new ArrayList<>();for(String state:List.of("Planned","Cancelled","UNRECOGNIZED")){var row=new LinkedHashMap<>(ObservedAcquisitionHarness.page(request(multiple)).rows.get(0));row.put("confirmationRaw",state);row.put("hotelName","Synthetic "+state+" Hotel");rows.add(row);}
  Constructor<ObservedResult> resultConstructor=ObservedResult.class.getDeclaredConstructor(ObservedScope.class,List.class);resultConstructor.setAccessible(true);Method preview=CrewCheckMyCrewCareDebugActivity.class.getDeclaredMethod("reservationPreview",ObservedResult.class);preview.setAccessible(true);String formatted=(String)preview.invoke(multiple.activity,resultConstructor.newInstance(context,rows));
  check(formatted.contains("Synthetic Planned Hotel")&&formatted.contains("Synthetic Cancelled Hotel")&&formatted.contains("Synthetic UNRECOGNIZED Hotel")&&formatted.contains("CANCELADA")&&formatted.contains("ESTADO DESCONHECIDO")&&formatted.contains("PLANEJADA"),"multiple reservations retain each raw state and warning independently");multiple.close();count++;
  for(String action:List.of("cancel","stop-resume")) {
   clean();Screen s=new Screen();s.ready();s.click();for(int i=0;i<3;i++)deliver(s);
   CrewCheckMyCrewCareProfile.cleanupHook=()->{CrewCheckMyCrewCareProfile.cleanupHook=null;if(action.equals("cancel"))s.cancel.click();else{ s.activity.stop();try{Method resume=CrewCheckMyCrewCareDebugActivity.class.getDeclaredMethod("onStart");resume.setAccessible(true);resume.invoke(s.activity);}catch(Exception e){throw new AssertionError(e);}}};
   deliver(s);check(!s.status.text.contains("Synthetic")&&!s.status.text.contains("Contrato observado válido")&&s.status.text.contains("Perfil de teste limpo"),"native cleanup reentrancy cannot recapture revoked preview authority: "+action);s.close();count++;
  }
  for(String outcome:List.of("failure","timeout"))for(String action:List.of("cancel","stop")) {
   clean();CrewCheckMyCrewCareProfile.defer=true;Screen s=new Screen();s.ready();s.click();for(int i=0;i<4;i++)deliver(s);
   if(outcome.equals("failure")){CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(false,"profile-clear-failed");android.os.Handler.tick();}else for(int i=0;i<300;i++)android.os.Handler.tick();
   check(s.status.text.contains("não confirmada")&&!s.prepare.enabled,"cleanup reached terminal failure before UI revocation: "+outcome);String failure=s.status.text;int clears=CrewCheckMyCrewCareProfile.clearCalls,timers=android.os.Handler.delayed.size();
   android.os.Handler.runMain(()->{if(action.equals("cancel")){s.cancel.click();s.cancel.click();}else s.activity.stop();});android.os.Handler.drain();
   check(s.status.text.equals(failure)&&!s.status.text.contains("pendente")&&!s.status.text.contains("Synthetic")&&!s.prepare.enabled&&clears==CrewCheckMyCrewCareProfile.clearCalls&&timers==android.os.Handler.delayed.size(),"terminal cleanup failure remains visible, no restart/polling/retry after "+outcome+action);s.close();count++;
  }
  // ---- Login após o e-mail (reprodução sintética do relato de 13/10) ----
  String loginUrl="https://api2.apicrewcare.com/Main/Login.aspx?ReturnUrl=%2fLATAM%2fmytravel.aspx";
  clean();Screen pw=new Screen();pw.ready();pw.prepare();var pv=view();
  android.os.Handler.runMain(()->{
   check(!pv.client.shouldOverrideUrlLoading(pv,new android.webkit.WebResourceRequest(loginUrl,true,"POST")),"e-mail POST to observed login page allowed");
   check(pv.client.shouldInterceptRequest(pv,new android.webkit.WebResourceRequest(loginUrl,true,"POST"))==null,"e-mail POST not intercepted");
   pv.url=loginUrl;pv.client.onPageStarted(pv,loginUrl,null);pv.client.onPageFinished(pv,loginUrl);
   check(pv.client.shouldInterceptRequest(pv,new android.webkit.WebResourceRequest("https://api2.apicrewcare.com/Main/js/login.js",false))==null,"same-origin GET resource allowed on password step");
  });android.os.Handler.drain();
  check(!pv.destroyed&&!pw.start.enabled&&pw.status.text.startsWith("Prepare a sessão"),"password step on the portal itself keeps the visible login open; verify still disabled");pw.close();count++;
  for(String external:List.of("https://login.microsoftonline.com/common/oauth2/authorize?client_id=x&login_hint=crew%40example.invalid","https://sso2.apihotels.com/sso/sp/ACS.saml2?SAMLRequest=abc")) {
   clean();Screen s=new Screen();s.ready();s.prepare();var v=view();
   android.os.Handler.runMain(()->{check(!v.client.shouldOverrideUrlLoading(v,new android.webkit.WebResourceRequest(loginUrl,true,"POST")),"e-mail POST allowed");check(v.client.shouldOverrideUrlLoading(v,new android.webkit.WebResourceRequest(external,true)),"external provider after e-mail blocked (allowlist preserved)");});
   android.os.Handler.drain();var u=java.net.URI.create(external);
   check(v.destroyed&&s.status.text.contains("destino fora do escopo")&&s.status.text.contains("o login seguiu para "+u.getHost())&&!s.status.text.contains(u.getRawPath())&&!s.status.text.contains(u.getRawQuery())&&!s.status.text.contains("crew%40")
    &&s.status.text.contains("Nada importado")&&s.status.text.contains("nenhuma sessão ficou conectada")&&s.status.text.contains("Próximo passo")&&s.status.text.contains("Perfil de teste limpo")&&!s.status.text.contains("Contrato observado válido"),"post-e-mail redirect reproduces closure with explicit, non-sensitive reason: "+u.getHost());
   check(s.employee.text.equals("900000001")&&s.user.text.equals("synthetic.crew@example.invalid")&&!s.consent.checked&&s.prepare.enabled&&s.employee.visibility==0,"non-sensitive preparation data kept; consent required again");s.close();count++;
  }
  clean();Screen xhr=new Screen();xhr.ready();xhr.prepare();var xv=view();
  Thread xw=new Thread(()->check(xv.client.shouldInterceptRequest(xv,new android.webkit.WebResourceRequest("https://api2.apicrewcare.com/Main/Login.aspx/CheckUser?u=crew%40example.invalid",false,"POST"))!=null,"same-origin XHR POST still blocked"));xw.start();join(xw);android.os.Handler.drain();
  check(xv.destroyed&&xhr.status.text.contains("recurso POST de api2.apicrewcare.com/Main/Login.aspx/CheckUser")&&!xhr.status.text.contains("crew%40")&&!xhr.status.text.contains("?u="),"XHR after e-mail names method/path, never query");xhr.close();count++;
  clean();Screen cdn=new Screen();cdn.ready();cdn.prepare();var cv=view();
  Thread cw=new Thread(()->cv.client.shouldInterceptRequest(cv,new android.webkit.WebResourceRequest("https://cdn.example.invalid/lib/secret-path.js?k=1",false)));cw.start();join(cw);android.os.Handler.drain();
  check(cv.destroyed&&cdn.status.text.contains("recurso GET de cdn.example.invalid,")&&!cdn.status.text.contains("secret-path"),"third-party resource shows host only");cdn.close();count++;
  clean();Screen herr=new Screen();herr.ready();herr.prepare();var hv=view();
  android.os.Handler.runMain(()->hv.client.onReceivedHttpError(hv,new android.webkit.WebResourceRequest(loginUrl,true,"POST"),new android.webkit.WebResourceResponse("text/plain","UTF-8",new java.io.ByteArrayInputStream(new byte[0]))));android.os.Handler.drain();
  check(hv.destroyed&&herr.status.text.contains("erro HTTP")&&!herr.status.text.contains("fora do escopo")&&herr.status.text.contains("Tente de novo")&&herr.employee.text.equals("900000001"),"validation/HTTP failure explains retry, keeps preparation data");herr.close();count++;
  clean();Screen cancelLogin=new Screen();cancelLogin.ready();cancelLogin.prepare();var cl=view();android.os.Handler.runMain(cancelLogin.cancel::click);android.os.Handler.drain();
  check(cl.destroyed&&cancelLogin.status.text.contains("Cancelado. Nada importado.")&&cancelLogin.user.text.equals("synthetic.crew@example.invalid")&&cancelLogin.prepare.enabled,"cancel during login cleans profile and keeps preparation data");cancelLogin.close();count++;
  Method resumeMfa=CrewCheckMyCrewCareDebugActivity.class.getDeclaredMethod("onStart");resumeMfa.setAccessible(true);
  clean();Screen mfa=new Screen();mfa.ready();mfa.prepare();var mv=view();
  android.os.Handler.runMain(mfa.activity::stop);android.os.Handler.drain();check(!mv.destroyed&&android.os.Handler.delayed.size()==1,"leaving for MFA app arms a single grace deadline");
  android.os.Handler.runMain(()->{try{resumeMfa.invoke(mfa.activity);}catch(Exception e){throw new AssertionError(e);}});check(android.os.Handler.delayed.isEmpty()&&!mv.destroyed,"returning within grace cancels deadline and keeps login");
  android.os.Handler.runMain(()->{mv.url="https://api2.apicrewcare.com/LATAM/mytravel.aspx";mv.client.onPageFinished(mv,mv.url);mfa.start.click();});android.os.Handler.drain();for(int i=0;i<4;i++)deliver(mfa);
  check(mfa.status.text.contains("Contrato observado válido"),"login completed after MFA app switch reaches validated read");mfa.close();count++;
  clean();Screen late=new Screen();late.ready();late.prepare();var lv=view();android.os.Handler.runMain(late.activity::stop);android.os.Handler.drain();android.os.Handler.tick();
  check(lv.destroyed&&late.status.text.contains("segundo plano por mais de 3 minutos")&&late.status.text.contains("Nada importado")&&!late.status.text.contains("Contrato observado válido"),"grace expiry cancels with explicit reason, no stale background session");late.close();count++;
  clean();Field accountField=CrewCheckMyCrewCareDebugActivity.class.getDeclaredField("account");accountField.setAccessible(true);
  Screen first=new Screen(),second=new Screen();String a1=(String)accountField.get(first.activity),a2=(String)accountField.get(second.activity);int clears=CrewCheckMyCrewCareProfile.clearCalls;
  first.ready();first.prepare();android.os.Handler.runMain(first.cancel::click);android.os.Handler.drain();second.ready();second.prepare();var sv=view();
  int created=CrewCheckMyCrewCareProfile.createdAccounts.size();
  check(!a1.equals(a2)&&CrewCheckMyCrewCareProfile.clearCalls==clears+1&&CrewCheckMyCrewCareProfile.createdAccounts.get(created-1).equals(a2)&&!CrewCheckMyCrewCareProfile.createdAccounts.get(created-1).equals(a1)&&sv.sessionStorage.isEmpty(),"separate attempts use separate isolated profiles; first cleared before second");first.close();second.close();count++;
  Method describe=CrewCheckMyCrewCareDebugActivity.class.getDeclaredMethod("describeDestination",String.class);describe.setAccessible(true);
  check(describe.invoke(null,"javascript:alert(1)").equals("endereço com esquema não permitido (javascript)")&&describe.invoke(null,"intent://x#Intent;end").toString().contains("esquema não permitido")
   &&describe.invoke(null,"https://user:pw@evil.invalid/a?b").equals("evil.invalid (com credencial embutida no endereço)")&&describe.invoke(null,"http://api2.apicrewcare.com/LATAM/mytravel.aspx").equals("api2.apicrewcare.com (sem HTTPS)")
   &&describe.invoke(null,"https://api2.apicrewcare.com:8443/Main/Login.aspx?x=1").equals("api2.apicrewcare.com/Main/Login.aspx (porta não padrão)")&&describe.invoke(null,"https://api2.apicrewcare.com/a%20b?x").equals("api2.apicrewcare.com"),"diagnostic destination never includes query, credentials or unsafe path");count++;
  check(count==109,"expected full debug matrix");System.out.println("PASS debug action cases="+count);
 }catch(Exception e){throw new AssertionError(e);}}
}
