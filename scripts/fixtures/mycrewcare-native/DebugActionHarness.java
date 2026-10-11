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
  android.widget.EditText employee,user;android.widget.CheckBox consent;android.widget.Button start,cancel;android.widget.TextView status;
  Screen(){android.os.Handler.runMain(activity::create);var layout=(android.widget.LinearLayout)activity.content;
   employee=(android.widget.EditText)layout.children.get(1);user=(android.widget.EditText)layout.children.get(2);consent=(android.widget.CheckBox)layout.children.get(3);start=(android.widget.Button)layout.children.get(4);cancel=(android.widget.Button)layout.children.get(5);status=(android.widget.TextView)layout.children.get(6);
   check(!employee.save&&!user.save&&!consent.save&&layout.autofill==8,"identity/consent not restored or autofilled");}
  void ready(){employee.setText("900000001");user.setText("synthetic.crew@example.invalid");consent.setChecked(true);}
  void click(){android.os.Handler.runMain(start::click);android.os.Handler.drain();}
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
  clean();Screen full=new Screen();full.ready();full.click();check(!full.start.enabled&&!full.consent.checked,"single-flight consumes consent");full.click();check(request(full).kind.equals("profile-before"),"double click cannot replace attempt");count++;
  for(int i=0;i<4;i++)deliver(full);
  check(full.status.text.contains("Contrato observado válido")&&full.status.text.contains("não validados")&&full.status.text.contains("Perfil de teste limpo")&&full.start.enabled&&!full.status.text.contains("Synthetic")&&view().destroyed,"only bounded summary after validated cleanup");count++;
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
  check(!delayed.start.enabled&&delayed.status.text.contains("ainda não concluído")&&!delayed.status.text.contains("Contrato observado válido"),"cleanup pending is not success");
  CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(false,"profile-clear-failed");android.os.Handler.tick();check(!delayed.start.enabled&&delayed.status.text.contains("não confirmada"),"cleanup failure blocks retry and success");delayed.close();count++;
  for(String mode:List.of("pending-success","pending-timeout","profile-throw","cache-throw")) {
   clean();CrewCheckMyCrewCareProfile.defer=mode.startsWith("pending");
   if(mode.equals("profile-throw"))CrewCheckMyCrewCareProfile.clearError=new IllegalStateException("synthetic");
   if(mode.equals("cache-throw"))CrewCheckMyCrewCareSecureStore.clearError=new IllegalStateException("synthetic");
   Screen s=new Screen();s.ready();s.click();for(int i=0;i<4;i++)deliver(s);
   if(mode.equals("pending-success")){check(!s.status.text.contains("Contrato observado válido"),"pending cleanup does not publish valid result");CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(true,"ok");android.os.Handler.tick();check(s.start.enabled&&s.status.text.contains("Contrato observado válido"),"only confirmed delayed cleanup permits result/retry");}
   else {if(mode.equals("pending-timeout"))for(int i=0;i<300;i++)android.os.Handler.tick();check(!s.start.enabled&&s.status.text.contains("não confirmada")&&!s.status.text.contains("Contrato observado válido"),"cleanup failures/timeout block result "+mode);}
   s.close();count++;
  }
  check(count==36,"expected full debug matrix");System.out.println("PASS debug action cases="+count);
 }catch(Exception e){throw new AssertionError(e);}}
}
