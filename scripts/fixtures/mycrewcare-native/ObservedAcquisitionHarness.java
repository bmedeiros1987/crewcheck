import com.crewcheck.app.CrewCheckMyCrewCarePortalV3.*;
import java.util.*;

public class ObservedAcquisitionHarness {
  static void check(boolean value,String label) { if(!value) throw new AssertionError(label); }
  static ObservedScope scope(String account) { return new ObservedScope(account,"session-"+account,"request-"+account,"900000001","synthetic.crew@example.invalid",0); }
  static Map<String,String> card() { return Map.of("providerReservationId","900000001","dutyPeriodNumber","1","airport","AAA","pairingId","SYNTHETIC-PAIRING-001","hotelName","Synthetic Harbor Hotel"); }
  static ObservedPage page(ObservedRequest request) {
    Map<String,String> row=new LinkedHashMap<>();
    String url;
    if(request.kind.startsWith("profile")) {
      row.put("employeeId",request.scope.employeeId);row.put("username",request.scope.username);
      url="https://api2.apicrewcare.com/LATAM/userprofile.aspx";
    } else if(request.kind.equals("cards")) {
      row.putAll(card());url="https://api2.apicrewcare.com/LATAM/mytravel.aspx";
    } else {
      row.putAll(card());row.put("confirmationRaw","Planned");
      row.put("checkInWallDateTime","2031-11-19T22:30");row.put("checkOutWallDateTime","2031-11-20T06:45");
      row.put("toHotelProvider","Synthetic Airport Shuttle");row.put("toHotelPickupWallTime","21:50");row.put("toHotelTransitMinutes","40");
      row.put("toAirportProvider","Synthetic Return Shuttle");row.put("toAirportPickupWallTime","07:05");row.put("toAirportTransitMinutes","50");
      url="https://api2.apicrewcare.com/LATAM/reservation.aspx?tripreservid=900000001&dutyperiodnumber=1";
    }
    return new ObservedPage(request.scope,url,List.of(row));
  }
  static class Capture { int count; ObservedResult result;String error;void done(ObservedResult r,String e) {count++;result=r;error=e;} }
  static class Deadline implements ObservedDeadline { Runnable fire;int cancelled; public ObservedCancel schedule(long ms,Runnable timeout) {check(ms==30000,"bounded timeout");fire=timeout;return ()->cancelled++;} }
  static class Pending {ObservedRequest request;ObservedPageCallback callback; Pending(ObservedRequest r,ObservedPageCallback cb){request=r;callback=cb;} void release(){callback.complete(page(request));} }
  static class Source implements ObservedSource {
    List<Pending> pending=new ArrayList<>();Runnable cancelHook;int cancelled;
    public void acquire(ObservedRequest request,ObservedPageCallback callback){pending.add(new Pending(request,callback));}
    public void cancel(ObservedScope scope){cancelled++;if(cancelHook!=null){Runnable hook=cancelHook;cancelHook=null;hook.run();}}
    Pending take(){return pending.remove(0);}
    void drive(){int limit=100;while(!pending.isEmpty()){check(--limit>0,"finite acquisition");take().release();}}
  }
  static void advance(Source source,String phase){while(!source.pending.get(0).request.kind.equals(phase))source.take().release();}
  public static void main(String[] args) {
    ObservedAcquisition session=new ObservedAcquisition();Source source=new Source();Deadline timer=new Deadline();Capture result=new Capture();
    check(session.begin(scope("A"),source,timer,result::done),"start");source.drive();
    check(result.count==1&&result.error==null&&result.result.schemaVersion==3&&!result.result.operationalImportAllowed,"normal observation");
    check(result.result.observations.get(0).get("confirmationRaw").equals("Planned"),"raw planned");
    check(result.result.observations.get(0).get("toAirportPickupWallTime").equals("07:05"),"time only");
    try{result.result.observations.get(0).put("html","forbidden");throw new AssertionError("mutable result");}catch(UnsupportedOperationException expected){}
    int cases=1;
    for(String phase:List.of("profile-before","cards","detail","profile-after")) {
      for(String mode:List.of("cancel","timeout","switch","bad-account","bad-session","bad-request","bad-generation","bad-origin","unknown-field","blank")) {
        session=new ObservedAcquisition();source=new Source();timer=new Deadline();result=new Capture();session.begin(scope("A"),source,timer,result::done);advance(source,phase);Pending old=source.take();
        if(mode.equals("cancel")){session.cancel();old.release();check(result.count==1&&result.error.equals("observed-cancelled"),"cancel");}
        else if(mode.equals("timeout")){timer.fire.run();old.release();check(result.count==1&&result.error.equals("observed-timeout"),"timeout");}
        else if(mode.equals("switch")){
          Source next=new Source();Capture latest=new Capture();session.begin(scope("B"),next,new Deadline(),latest::done);next.drive();old.release();
          check(result.count==1&&latest.count==1&&latest.result.accountId.equals("B"),"new account preserved");
        } else {
          ObservedPage original=page(old.request);ObservedScope captured=original.scope;
          ObservedScope bad=new ObservedScope(mode.equals("bad-account")?"OTHER":captured.accountId,mode.equals("bad-session")?"OTHER":captured.sessionId,
            mode.equals("bad-request")?"OTHER":captured.requestId,captured.employeeId,captured.username,mode.equals("bad-generation")?captured.generation+1:captured.generation);
          Map<String,String> fields=new LinkedHashMap<>(original.rows.get(0));
          if(mode.equals("unknown-field"))fields.put("html","must not export");
          if(mode.equals("blank"))fields.put(fields.keySet().iterator().next(),"   ");
          try { old.callback.complete(new ObservedPage(bad,mode.equals("bad-origin")?"https://evil.invalid/LATAM/mytravel.aspx":original.url,List.of(fields))); }
          catch(IllegalArgumentException boundedPageRejected) { old.callback.complete(null); }
          check(result.count==1&&result.result==null,"invalid boundary rejected "+phase+mode);
        }
        cases++;
      }
      // Reentrant source cancellation starts newer C inside older B.begin.
      final ObservedAcquisition owner=new ObservedAcquisition();Source a=new Source(),b=new Source(),c=new Source();Capture ar=new Capture(),br=new Capture(),cr=new Capture();
      owner.begin(scope("A"),a,new Deadline(),ar::done);advance(a,phase);Pending stale=a.take();
      a.cancelHook=()->owner.begin(scope("C"),c,new Deadline(),cr::done);
      check(!owner.begin(scope("B"),b,new Deadline(),br::done),"superseded begin cannot acquire");
      c.drive();stale.release();b.drive();check(cr.count==1&&cr.result.accountId.equals("C")&&br.error.equals("observed-cancelled"),"reentrant newest owner");cases++;
    }
    // Changed profile-after identity and duplicate callbacks.
    session=new ObservedAcquisition();source=new Source();timer=new Deadline();result=new Capture();session.begin(scope("A"),source,timer,result::done);advance(source,"profile-after");Pending last=source.take();
    ObservedPage ok=page(last.request);last.callback.complete(new ObservedPage(ok.scope,ok.url,List.of(Map.of("employeeId","900000002","username",ok.scope.username))));last.release();
    check(result.count==1&&result.result==null,"changed identity after navigation");cases++;
    // A terminal cancellation callback can start a newer request before old completion delivery.
    final ObservedAcquisition terminalOwner=new ObservedAcquisition();Source previous=new Source(),current=new Source();Capture previousResult=new Capture(),currentResult=new Capture();
    terminalOwner.begin(scope("A"),previous,new Deadline(),previousResult::done);
    previous.cancelHook=()->{terminalOwner.begin(scope("C"),current,new Deadline(),currentResult::done);current.drive();};
    previous.drive();
    check(previousResult.result==null&&previousResult.error.equals("observed-cancelled")&&currentResult.result.accountId.equals("C"),"terminal reentrancy cannot publish old success");cases++;
    // Runtime cleanup/logout revokes only the matching account before reporting cleanup success.
    for(String phase:List.of("profile-before","cards","detail","profile-after")) {
      com.crewcheck.app.CrewCheckMyCrewCareProfile.defer=false;
      com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3 runtime=new com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3(new android.app.Activity(),null,null,null);
      Source a=new Source();Capture ar=new Capture();runtime.observeMyCrewCareV3ForReview(scope("A"),a,new Deadline(),ar::done);advance(a,phase);Pending stale=a.take();
      check(runtime.startMyCrewCareCleanupV3(" A ",false,"logout_A_001"),"cleanup accepted");
      check(runtime.myCrewCareCleanupResultV3("A","logout_A_001").equals("ok"),"cleanup completed");
      stale.release();a.drive();check(ar.count==1&&ar.result==null&&ar.error.equals("observed-cancelled"),"logout suppresses old success "+phase);cases++;
      // A's deferred profile cleanup callback must not cancel B, even while B is pending.
      runtime=new com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3(new android.app.Activity(),null,null,null);
      a=new Source();ar=new Capture();runtime.observeMyCrewCareV3ForReview(scope("A"),a,new Deadline(),ar::done);advance(a,phase);stale=a.take();
      com.crewcheck.app.CrewCheckMyCrewCareProfile.defer=true;
      check(runtime.startMyCrewCareCleanupV3("A",true,"logout_A_002"),"deferred cleanup accepted");
      Source b=new Source();Capture br=new Capture();runtime.observeMyCrewCareV3ForReview(scope("B"),b,new Deadline(),br::done);advance(b,phase);
      com.crewcheck.app.CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(true,"ok");
      stale.release();a.drive();b.drive();check(ar.result==null&&br.count==1&&br.result.accountId.equals("B"),"late A cleanup preserves B "+phase);cases++;
      // A cleanup arriving after B is already current must leave B's generation intact.
      runtime=new com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3(new android.app.Activity(),null,null,null);
      b=new Source();br=new Capture();runtime.observeMyCrewCareV3ForReview(scope("B"),b,new Deadline(),br::done);advance(b,phase);
      check(runtime.startMyCrewCareCleanupV3("A",true,"logout_A_003"),"old account cleanup accepted");
      com.crewcheck.app.CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(true,"ok");
      b.drive();check(br.count==1&&br.result.accountId.equals("B"),"A cleanup start preserves current B "+phase);cases++;
    }
    com.crewcheck.app.CrewCheckMyCrewCareProfile.defer=false;
    System.out.println("PASS native observed acquisition cases="+cases);
  }
}
