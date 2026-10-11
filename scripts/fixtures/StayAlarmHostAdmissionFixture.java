package com.crewcheck.app;
/** Executes production origin/frame admission with real Android Uri classes. */
public final class StayAlarmHostAdmissionFixture {
 static int checks;static void check(boolean value){checks++;if(!value)throw new AssertionError("admission "+checks);}
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
  System.out.println("PASS host production admission: "+checks+" assertions; exact origin/main frame/navigation/OFF; no WebView/device instantiated");
 }
}
