package com.crewcheck.app;
/** Executes production origin/frame admission with real Android Uri classes. */
public final class StayAlarmHostAdmissionFixture {
 static int checks;static void check(boolean value){checks++;if(!value)throw new AssertionError("admission "+checks);}
 static final class LocalFixture {
  long now=1900000000000L;boolean failJournal,failDurable;int displayed;
  StayAlarmDurableAuthority.Snapshot snapshot;StayAlarmEngine.Record saved;
  final StayAlarmDurableAuthority.Store durableStore=new StayAlarmDurableAuthority.Store(){
   public StayAlarmDurableAuthority.Snapshot read(){return snapshot;}
   public boolean write(StayAlarmDurableAuthority.Snapshot value){if(failDurable)return false;snapshot=value;return true;}};
  final StayAlarmDurableAuthority durable=new StayAlarmDurableAuthority(durableStore,()->now);
  final StayAlarmSessionHost session=newSession();
  StayAlarmSessionHost newSession(){return new StayAlarmSessionHost(true,()->now,(owner,epoch,expiry)->{});}
  final StayAlarmEngine.Store journal=new StayAlarmEngine.Store(){
   public StayAlarmEngine.Record read(String key){return saved!=null&&saved.key.equals(key)?saved:null;}
   public void commit(StayAlarmEngine.Record r)throws Exception{if(failJournal)throw new Exception("synthetic disk");saved=r;if("scheduled".equals(r.state)&&!durable.grant(r))throw new Exception("durable commit");}
   public java.util.List<StayAlarmEngine.Record> all(){return saved==null?java.util.Collections.emptyList():java.util.Collections.singletonList(saved);}};
  final StayAlarmEngine.Device device=new StayAlarmEngine.Device(){public long now(){return now;}public boolean permitted(){return true;}
   public void replace(StayAlarmEngine.Record r){}public void cancel(String key){}public void notify(StayAlarmEngine.Record r){displayed++;}};
  final StayAlarmEngine engine=new StayAlarmEngine(journal,device,new StayAlarmCompositeOwner(session,durable));
  LocalFixture(){check(durable.revokeCurrent());}
  void schedule(String owner){
   check(StayAlarmHostAndroid.acceptVerified(session,durable,session.begin(),owner,now+300000));
   long at=now+360000;StayAlarmEngine.Record r=new StayAlarmEngine.Record(StayAlarmEngine.identity(owner,"event"),owner,session.epoch(),"event","schedule-"+owner,1,
    java.time.Instant.ofEpochMilli(at).toString(),at,now+900000,"absolute","pending-schedule");
   check("scheduled".equals(engine.replace(r,0,true,true).state));
  }
  String cancellation()throws Exception{return new org.json.JSONObject().put("protocol",StayAlarmBridge.PROTOCOL).put("key",saved.key).put("accountId",saved.owner)
   .put("ownerEpoch",saved.ownerEpoch).put("eventId",saved.event).put("operationId","cancel-current").put("action","cancel").put("expectedRevision",saved.revision).toString();}
  boolean receive(){now=Math.max(now,saved.alarm);return engine.receive(saved.key,saved.revision,saved.alarm);}
 }
 static void durableHostCounterproofs()throws Exception{
  LocalFixture f=new LocalFixture();f.schedule("A");String epoch=f.saved.ownerEpoch;f.now+=310000;
  check(f.session.activeOwner()==null);check(StayAlarmHostAndroid.revokeLocal(f.session,f.durable,"A",epoch));
  check(StayAlarmHostAndroid.revokeLocal(f.session,f.durable,"A",epoch));
  check(f.snapshot.revoked&&!f.receive()&&f.displayed==0);
  f=new LocalFixture();f.schedule("A");StayAlarmSessionHost restarted=f.newSession();
  check(StayAlarmHostAndroid.revokeLocal(restarted,f.durable,null,null));check(f.snapshot.revoked&&!f.receive());
  f=new LocalFixture();f.schedule("A");epoch=f.saved.ownerEpoch;f.now+=310000;
  check(StayAlarmHostAndroid.acceptVerified(f.session,f.durable,f.session.begin(),"A",f.now+300000));
  check(epoch.equals(f.session.epoch()));f.engine.recover(false);check("scheduled".equals(f.saved.state));
  check(f.receive()&&f.displayed==1);check(!f.receive()&&f.displayed==1);
  f=new LocalFixture();f.schedule("A");epoch=f.saved.ownerEpoch;
  check(StayAlarmHostAndroid.acceptVerified(f.session,f.durable,f.session.begin(),"B",f.now+300000));
  check(f.snapshot.revoked);f.engine.recover(false);check("blocked".equals(f.saved.state));
  f.session.revoke();check(!f.receive());
  f=new LocalFixture();f.schedule("A");String cancel=f.cancellation();f.failJournal=true;
  String receipt=StayAlarmHostAndroid.transactOrRevoke(new StayAlarmBridge(f.engine,f.session),f.session,f.durable,cancel);
  check("unknown".equals(new org.json.JSONObject(receipt).getString("state")));
  check("scheduled".equals(f.saved.state)&&f.snapshot.revoked);f.failJournal=false;check(!f.receive());
  f=new LocalFixture();f.schedule("A");epoch=f.saved.ownerEpoch;f.session.revoke();f.failDurable=true;
  check(!StayAlarmHostAndroid.revokeLocal(f.session,f.durable,"A",epoch));
  check(!new StayAlarmDurableAuthority(f.durableStore,()->1900000000000L).enabled());check(!f.receive());
  f.failDurable=false;check(f.durable.revokeCurrent());check(f.snapshot.revoked);
  f=new LocalFixture();f.schedule("B");
  check(!StayAlarmHostAndroid.revokeLocal(f.session,f.durable,"A","old-epoch"));
  check(!StayAlarmHostAndroid.revokeLocal(f.session,f.durable,null,null));check("B".equals(f.session.activeOwner()));
 }
 public static void main(String[] args)throws Exception{
  check(StayAlarmHostAndroid.admitted(true,"https://crewcheck.online","https://crewcheck.online?app=1"));
  check(!StayAlarmHostAndroid.admitted(false,"https://crewcheck.online","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://evil.invalid","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://crewcheck.online","https://portal.invalid"));
  check(!StayAlarmHostAndroid.admitted(true,"http://crewcheck.online","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://crewcheck.online:444","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://user@crewcheck.online","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.admitted(true,"https://crewcheck.online.evil.invalid","https://crewcheck.online"));
  check(!StayAlarmHostAndroid.PREPARED_HOST_ENABLED);check(StayAlarmHostAndroid.install(null,null)==null);
  check(!StayAlarmHostAndroid.owner().enabled());check(StayAlarmHostAndroid.owner().activeOwner()==null);
  // Real endpoint/core and trusted host; fail journal BEFORE pending-cancel.
  long[] clock={java.time.Instant.parse("2030-10-11T00:00:00Z").toEpochMilli()};
  StayAlarmSessionHost session=new StayAlarmSessionHost(true,()->clock[0],(id,epoch,expiry)->{});
  check(session.verified(session.begin(),"verified-a","epoch-a",clock[0]+300000));
  final StayAlarmEngine.Record[] record={null};final boolean[] failWrite={false},switchOnRead={false};final int[] notifications={0};
  StayAlarmEngine.Store store=new StayAlarmEngine.Store(){public StayAlarmEngine.Record read(String key){if(switchOnRead[0]){switchOnRead[0]=false;session.verified(session.begin(),"verified-b","epoch-b",clock[0]+180000);}return record[0];}
   public void commit(StayAlarmEngine.Record value)throws Exception{if(failWrite[0])throw new Exception("disk");record[0]=value;}
   public java.util.List<StayAlarmEngine.Record> all(){return java.util.Collections.singletonList(record[0]);}};
  StayAlarmEngine.Device device=new StayAlarmEngine.Device(){public long now(){return clock[0];}public boolean permitted(){return true;}
   public void replace(StayAlarmEngine.Record value){}public void cancel(String key){}public void notify(StayAlarmEngine.Record value){notifications[0]++;}};
  StayAlarmEngine engine=new StayAlarmEngine(store,device,session);String key=StayAlarmEngine.identity("verified-a","event");
  long alarm=clock[0]+60000;
  StayAlarmEngine.Record request=new StayAlarmEngine.Record(key,"verified-a","epoch-a","event","replace",1,
   java.time.Instant.ofEpochMilli(alarm).toString(),alarm,clock[0]+120000,"relative","pending-schedule");
  check(engine.replace(request,0,true,true).state.equals("scheduled"));failWrite[0]=true;
  org.json.JSONObject cancel=new org.json.JSONObject().put("protocol",StayAlarmBridge.PROTOCOL).put("key",key).put("accountId","verified-a")
   .put("ownerEpoch","epoch-a").put("eventId","event").put("operationId","cancel").put("action","cancel").put("expectedRevision",1);
  String receipt=StayAlarmHostAndroid.transactOrRevoke(new StayAlarmBridge(engine,session),session,cancel.toString());
  check(new org.json.JSONObject(receipt).getString("state").equals("unknown"));check(record[0].state.equals("scheduled"));
  check(session.activeOwner()==null);clock[0]=alarm;
  check(!engine.receive(key,1,alarm));check(notifications[0]==0);
  org.json.JSONObject proof=new org.json.JSONObject().put("ok",true).put("authenticated",true)
   .put("user",new org.json.JSONObject().put("id","verified-night"))
   .put("stayAlarmLease",new org.json.JSONObject().put("serverNow",1000L).put("sessionExpiresAt",1000L+8*3_600_000L).put("stayLeaseExpiresAt",1000L+8*3_600_000L));
  check(StayAlarmHostAndroid.verifiedResponse(proof).duration==8*3_600_000L);
  check(!StayAlarmHostAndroid.PREPARED_OVERNIGHT_LEASE_ENABLED);
  proof.getJSONObject("stayAlarmLease").put("stayLeaseExpiresAt",1000L+19*3_600_000L);
  boolean rejected=false;try{StayAlarmHostAndroid.verifiedResponse(proof);}catch(Exception error){rejected=true;}check(rejected);
  proof.remove("stayAlarmLease");rejected=false;try{StayAlarmHostAndroid.verifiedResponse(proof);}catch(Exception error){rejected=true;}check(rejected);
  session.begin();boolean recoveryFailed=false;try{engine.recover(false);}catch(Exception error){recoveryFailed=true;}
  check(recoveryFailed&&session.activeOwner()==null);
  check(session.verified(session.begin(),"verified-b","epoch-b",clock[0]+180000));
  StayAlarmHostAndroid.transactOrRevoke(new StayAlarmBridge(engine,session),session,cancel.toString());
  check("verified-b".equals(session.activeOwner()));check("epoch-b".equals(session.epoch()));
  check(!engine.receive(key,1,alarm));check(notifications[0]==0);
  check(session.verified(session.begin(),"verified-a","epoch-new",clock[0]+180000));
  StayAlarmHostAndroid.transactOrRevoke(new StayAlarmBridge(engine,session),session,cancel.toString());
  check("epoch-new".equals(session.epoch()));
  check(session.verified(session.begin(),"verified-a","epoch-a",clock[0]+180000));switchOnRead[0]=true;
  StayAlarmHostAndroid.transactOrRevoke(new StayAlarmBridge(engine,session),session,cancel.toString());
  check("verified-b".equals(session.activeOwner()));check("epoch-b".equals(session.epoch()));
  durableHostCounterproofs();
  System.out.println("PASS host production admission: "+checks+" assertions; origin/frame/OFF plus durable logout/restart/reauth/cancel counterproofs; no WebView/device instantiated");
 }
}
