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
  static void await(java.util.concurrent.CountDownLatch latch) {try {check(latch.await(5,java.util.concurrent.TimeUnit.SECONDS),"bounded latch");}catch(InterruptedException e){throw new AssertionError(e);}}
  static void blocked(Thread thread) {long end=System.nanoTime()+5_000_000_000L;while(thread.getState()!=Thread.State.BLOCKED&&System.nanoTime()<end) Thread.yield();check(thread.getState()==Thread.State.BLOCKED,"operation waits on ownership boundary");}
  static void join(Thread thread) {try {thread.join(5000);check(!thread.isAlive(),"thread finished");}catch(InterruptedException e){throw new AssertionError(e);}}
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
    // Concurrent cancellation cannot return before an already reserved source dispatch finishes.
    final ObservedAcquisition dispatchOwner=new ObservedAcquisition();
    final java.util.concurrent.CountDownLatch dispatchEntered=new java.util.concurrent.CountDownLatch(1), dispatchRelease=new java.util.concurrent.CountDownLatch(1);
    final java.util.concurrent.atomic.AtomicInteger dispatches=new java.util.concurrent.atomic.AtomicInteger();Capture dispatched=new Capture();
    Source dispatchSource=new Source(){public void acquire(ObservedRequest r,ObservedPageCallback cb){dispatchEntered.countDown();await(dispatchRelease);dispatches.incrementAndGet();super.acquire(r,cb);}};
    Thread starter=new Thread(()->dispatchOwner.begin(scope("A"),dispatchSource,new Deadline(),dispatched::done));starter.start();await(dispatchEntered);
    Thread canceller=new Thread(dispatchOwner::cancel);canceller.start();blocked(canceller);dispatchRelease.countDown();join(starter);join(canceller);
    check(dispatches.get()==1&&dispatched.error.equals("observed-cancelled"),"dispatch linearized before cancel");dispatchSource.drive();check(dispatched.count==1,"no post-cancel dispatch");cases++;
    // Terminal delivery owns the boundary until completion returns; B cannot replace it mid-delivery.
    final ObservedAcquisition deliveryOwner=new ObservedAcquisition();Source deliverySource=new Source(),deliveryB=new Source();Capture deliveryResult=new Capture(),deliveryBResult=new Capture();
    final java.util.concurrent.CountDownLatch deliveryEntered=new java.util.concurrent.CountDownLatch(1),deliveryRelease=new java.util.concurrent.CountDownLatch(1);
    deliveryOwner.begin(scope("A"),deliverySource,new Deadline(),(r,e)->{deliveryEntered.countDown();await(deliveryRelease);deliveryResult.done(r,e);});
    Thread deliverer=new Thread(deliverySource::drive);deliverer.start();await(deliveryEntered);
    Thread replacement=new Thread(()->deliveryOwner.begin(scope("B"),deliveryB,new Deadline(),deliveryBResult::done));replacement.start();blocked(replacement);deliveryRelease.countDown();join(deliverer);join(replacement);deliveryB.drive();
    check(deliveryResult.result.accountId.equals("A")&&deliveryBResult.result.accountId.equals("B"),"delivery linearized before replacement");cases++;
    // An old callback exception remains visible, while newly reserved B is fully started.
    ObservedAcquisition exceptionOwner=new ObservedAcquisition();Source exceptionA=new Source(),exceptionB=new Source();Deadline exceptionTimer=new Deadline();Capture exceptionBResult=new Capture();
    RuntimeException callbackFailure=new RuntimeException("synthetic callback failure");
    exceptionOwner.begin(scope("A"),exceptionA,new Deadline(),(r,e)->{throw callbackFailure;});
    try {exceptionOwner.begin(scope("B"),exceptionB,exceptionTimer,exceptionBResult::done);throw new AssertionError("old callback exception hidden");}catch(RuntimeException e){check(e==callbackFailure,"original callback exception preserved");}
    check(exceptionTimer.fire!=null&&!exceptionB.pending.isEmpty(),"B timer and acquisition initialized despite A callback failure");exceptionB.drive();check(exceptionBResult.result.accountId.equals("B"),"B remains live");cases++;
    // Cleanup continues even when the canceled operation's completion throws, preserving the error.
    final com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3 throwingCleanup=new com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3(new android.app.Activity(),null,null,null);
    Source throwingCleanupSource=new Source();RuntimeException cleanupFailure=new RuntimeException("synthetic canceled completion");
    throwingCleanup.observeMyCrewCareV3ForReview(scope("A"),throwingCleanupSource,new Deadline(),(r,e)->{throw cleanupFailure;});
    int storeBefore=com.crewcheck.app.CrewCheckMyCrewCareSecureStore.clearCalls,profileBefore=com.crewcheck.app.CrewCheckMyCrewCareProfile.clearCalls;
    try {throwingCleanup.startMyCrewCareCleanupV3("A",true,"cleanup_throw");throw new AssertionError("cleanup completion error hidden");}catch(RuntimeException e){check(e==cleanupFailure,"cleanup error preserved");}
    check(com.crewcheck.app.CrewCheckMyCrewCareSecureStore.clearCalls==storeBefore+1&&com.crewcheck.app.CrewCheckMyCrewCareProfile.clearCalls==profileBefore+1&&throwingCleanup.myCrewCareCleanupResultV3("A","cleanup_throw").equals("ok"),"actual cleanup completes despite completion failure");cases++;
    // A's finishing operation is detached from active before source.cancel reenters cleanup.
    final com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3 terminalCleanup=new com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3(new android.app.Activity(),null,null,null);
    Source terminalCleanupSource=new Source();Capture terminalCleanupResult=new Capture();
    terminalCleanup.observeMyCrewCareV3ForReview(scope("A"),terminalCleanupSource,new Deadline(),terminalCleanupResult::done);
    terminalCleanupSource.cancelHook=()->check(terminalCleanup.startMyCrewCareCleanupV3("A",true,"cleanup_finish"),"reentrant terminal cleanup accepted");
    terminalCleanupSource.drive();check(terminalCleanup.myCrewCareCleanupResultV3("A","cleanup_finish").equals("ok")&&terminalCleanupResult.count==1&&terminalCleanupResult.result==null&&terminalCleanupResult.error.equals("observed-cancelled"),"account epoch revokes detached terminal success");cases++;
    // Pending cleanup prevents new A from replacing B; repeated callbacks cannot release a second cleanup.
    final com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3 pendingCleanup=new com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3(new android.app.Activity(),null,null,null);
    com.crewcheck.app.CrewCheckMyCrewCareProfile.defer=true;
    pendingCleanup.startMyCrewCareCleanupV3("A",true,"cleanup_pending1");pendingCleanup.startMyCrewCareCleanupV3("A",true,"cleanup_pending2");
    Source pendingB=new Source(),blockedA=new Source();Capture pendingBResult=new Capture(),blockedAResult=new Capture();Deadline blockedATimer=new Deadline();
    pendingCleanup.observeMyCrewCareV3ForReview(scope("B"),pendingB,new Deadline(),pendingBResult::done);
    check(!pendingCleanup.observeMyCrewCareV3ForReview(scope("A"),blockedA,blockedATimer,blockedAResult::done)&&blockedA.pending.isEmpty()&&blockedATimer.fire==null,"pending A cleanup blocks observation without touching B");
    com.crewcheck.app.CrewCheckMyCrewCareProfile.CleanupCallback firstCleanup=com.crewcheck.app.CrewCheckMyCrewCareProfile.pending.remove(0);firstCleanup.onComplete(true,"ok");firstCleanup.onComplete(true,"ok");
    check(!pendingCleanup.observeMyCrewCareV3ForReview(scope("A"),blockedA,blockedATimer,blockedAResult::done),"duplicate callback cannot release remaining account barrier");
    pendingB.drive();check(pendingBResult.result.accountId.equals("B"),"B succeeds during A cleanup");cases++;
    com.crewcheck.app.CrewCheckMyCrewCareProfile.pending.remove(0).onComplete(true,"ok");
    check(pendingCleanup.observeMyCrewCareV3ForReview(scope("A"),blockedA,blockedATimer,blockedAResult::done),"completed cleanup releases A barrier");blockedA.drive();check(blockedAResult.result.accountId.equals("A"),"new A needs fresh acquisition");cases++;
    com.crewcheck.app.CrewCheckMyCrewCareProfile.defer=false;
    // Store/profile failure paths release the account barrier and never leave a fake pending result.
    for(String failingPart:List.of("store","profile")) {
      com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3 failedCleanup=new com.crewcheck.app.CrewCheckMyCrewCareRuntimeV3(new android.app.Activity(),null,null,null);
      RuntimeException failedClear=new RuntimeException("synthetic clear failure");
      if(failingPart.equals("store")) com.crewcheck.app.CrewCheckMyCrewCareSecureStore.clearError=failedClear;
      else com.crewcheck.app.CrewCheckMyCrewCareProfile.clearError=failedClear;
      try {failedCleanup.startMyCrewCareCleanupV3("A",true,"cleanup_failed");check(failingPart.equals("profile"),"store failure propagated");}
      catch(RuntimeException e) {check(failingPart.equals("store")&&e==failedClear,"original store exception visible");}
      check(failedCleanup.myCrewCareCleanupResultV3("A","cleanup_failed").equals(failingPart.equals("store")?"failed:cache-clear-failed":"failed:disconnect-rejected"),"failure status terminal");
      com.crewcheck.app.CrewCheckMyCrewCareSecureStore.clearError=null;com.crewcheck.app.CrewCheckMyCrewCareProfile.clearError=null;
      Source afterFailure=new Source();Capture afterFailureResult=new Capture();
      check(failedCleanup.observeMyCrewCareV3ForReview(scope("A"),afterFailure,new Deadline(),afterFailureResult::done),"failed cleanup releases barrier");afterFailure.drive();check(afterFailureResult.result.accountId.equals("A"),"fresh acquisition after failure");cases++;
    }
    System.out.println("PASS native observed acquisition cases="+cases);
  }
}
