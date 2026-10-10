import com.crewcheck.app.StayAlarmEngine;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;

/** Executes the production Java engine. Every device/store/owner dependency is
 * fake; no Android service, notification, device, credentials or network. */
public final class StayAlarmEngineFixture {
    static int checks=0;
    static void check(boolean value,String detail){checks++;if(!value)throw new AssertionError(detail);}
    static final class Owner implements StayAlarmEngine.Owner {
        boolean enabled=true;String account="synthetic",epoch="session-1";
        public boolean enabled(){return enabled;}public String activeOwner(){return account;}public String epoch(){return epoch;}
    }
    static final class Store implements StayAlarmEngine.Store {
        Map<String,StayAlarmEngine.Record> records=new HashMap<>();int commits=0,failCommit=0;boolean corrupt=false;
        public StayAlarmEngine.Record read(String key)throws Exception {if(corrupt)throw new Exception("corrupt");return records.get(key);}
        public void commit(StayAlarmEngine.Record record)throws Exception {if(++commits==failCommit)throw new Exception("disk");records.put(record.key,record);}
        public java.util.List<StayAlarmEngine.Record> all(){return new ArrayList<>(records.values());}
    }
    static final class Device implements StayAlarmEngine.Device {
        long clock=Instant.parse("2030-10-10T00:00:00Z").toEpochMilli();boolean allowed=true;
        boolean failReplace=false,failCancel=false,failNotify=false;int replacements=0,cancellations=0,notifications=0;
        Runnable duringReplace=()->{};Map<String,StayAlarmEngine.Record> jobs=new HashMap<>();
        public long now(){return clock;}public boolean permitted(){return allowed;}
        public void replace(StayAlarmEngine.Record r)throws Exception {replacements++;if(failReplace)throw new Exception("OS replace");jobs.put(r.key,r);duringReplace.run();}
        public void cancel(String key)throws Exception {cancellations++;if(failCancel)throw new Exception("OS cancel");jobs.remove(key);}
        public void notify(StayAlarmEngine.Record r)throws Exception {notifications++;if(failNotify)throw new Exception("OS notify");}
    }
    static final class Fixture {
        Store store=new Store();Device device=new Device();Owner owner=new Owner();
        StayAlarmEngine engine=new StayAlarmEngine(store,device,owner);
        String key=StayAlarmEngine.identity("synthetic","stay-1");
        StayAlarmEngine.Record request(String op,long delta,String mode){return new StayAlarmEngine.Record(key,owner.account,owner.epoch,"stay-1",op,1,
            Instant.ofEpochMilli(device.clock+delta).toString(),device.clock+delta,device.clock+12_600_000L,mode,"pending-schedule");}
        StayAlarmEngine.Result replace(String op,long revision,long delta,String mode){return engine.replace(request(op,delta,mode),revision,true,true);}
        StayAlarmEngine.Result cancel(String op,long revision){return engine.cancel(key,owner.account,"stay-1",op,revision,owner.epoch);}
    }
    public static void main(String[] args)throws Exception {
        Fixture f=new Fixture();check(f.replace("one",0,7_200_000,"relative").state.equals("scheduled"),"native completion receipt");
        check(f.device.jobs.size()==1,"one OS identity");check(f.store.read(f.key).state.equals("scheduled"),"journal committed");
        check(f.replace("one",0,7_200_000,"relative").state.equals("scheduled"),"idempotent exact retry");
        check(f.store.read(f.key).revision==1&&f.device.jobs.size()==1,"retry retains revision and single identity");
        check(f.replace("two",1,5_400_000,"absolute").state.equals("scheduled"),"edit replaces existing identity across mode");
        check(f.device.jobs.size()==1&&f.store.read(f.key).revision==2,"no duplicate after edit");
        int replacements=f.device.replacements;
        check(f.replace("old",0,7_200_000,"relative").reason.equals("stale-revision"),"old request cannot overwrite edit");
        check(f.replace("two",1,7_200_000,"relative").reason.equals("operation-id-conflict"),"operation reuse with changed body rejected");
        check(f.device.replacements==replacements,"rejected requests have no OS mutation");
        check(f.cancel("cancel",2).state.equals("cancelled"),"cancel after actual API and journal");
        check(f.device.jobs.isEmpty()&&f.store.read(f.key).state.equals("cancelled"),"durable cancellation tombstone");
        check(f.cancel("cancel",2).state.equals("cancelled"),"cancel retry idempotent");
        f.engine.recover(false);check(f.device.jobs.isEmpty(),"cancel not resurrected on reboot");
        check(f.replace("two",2,5_400_000,"absolute").reason.equals("stale-revision"),"old edit after cancellation blocked");

        f=new Fixture();f.store.failCommit=1;
        check(f.replace("write-fails",0,7_200_000,"relative").state.equals("unknown"),"prepare failure not scheduled");
        check(f.device.replacements==0,"no device operation before durable intent");
        f=new Fixture();f.store.failCommit=2;
        check(f.replace("ack-fails",0,7_200_000,"absolute").state.equals("unknown"),"OS success without final commit not acknowledged");
        check(f.store.read(f.key).state.equals("pending-schedule"),"recoverable pending journal");
        f.store.failCommit=0;f.engine=new StayAlarmEngine(f.store,f.device,f.owner);f.device.jobs.clear();f.engine.recover(false);
        check(f.device.jobs.size()==1&&f.store.read(f.key).state.equals("scheduled"),"new process/reboot restores one future job");
        long instant=f.store.read(f.key).alarm;f.engine.recover(false);check(f.store.read(f.key).alarm==instant,"absolute instant unchanged by repeated recovery/timezone");
        f.device.clock=instant+1;f.device.jobs.clear();f.engine.recover(false);
        check(f.device.jobs.isEmpty()&&f.store.read(f.key).state.equals("expired"),"reboot-past never immediate alarm");

        f=new Fixture();f.device.failReplace=true;
        check(f.replace("os-fails",0,7_200_000,"relative").state.equals("unknown"),"OS error no positive receipt");
        f.device.failReplace=false;f.engine.recover(false);check(f.device.jobs.size()==1,"recover uncertain replacement without duplicates");
        f.device.failCancel=true;check(f.cancel("cancel-fails",1).state.equals("unknown"),"cancel OS failure no false receipt");
        check(f.store.read(f.key).state.equals("pending-cancel"),"pending cancel suppresses receiver");
        f.device.clock=f.store.read(f.key).alarm;check(!f.engine.receive(f.key,2,f.device.clock),"pending cancel cannot deliver");
        f.device.failCancel=false;f.engine.recover(false);check(f.device.jobs.isEmpty(),"pending cancel completed after restart");

        f=new Fixture();f.replace("permission",0,7_200_000,"relative");f.device.allowed=false;f.engine.recover(false);
        check(f.store.read(f.key).state.equals("blocked")&&f.device.jobs.isEmpty(),"detected revocation cancels and quarantines");
        f.device.allowed=true;f.engine.recover(false);check(f.device.jobs.isEmpty(),"permission regained cannot resurrect blocked preference");
        check(f.replace("fresh-confirm",1,7_200_000,"relative").state.equals("scheduled"),"explicit fresh confirmation can rearm");
        f.engine.recover(true);check(f.device.jobs.isEmpty()&&f.store.read(f.key).state.equals("blocked"),"grant broadcast never automatically re-arms old job");
        f=new Fixture();f.replace("owner",0,7_200_000,"relative");f.owner.epoch="session-2";f.engine.recover(false);
        check(f.device.jobs.isEmpty()&&f.store.read(f.key).state.equals("blocked"),"logout/relogin same ID invalidates old native owner epoch");
        f=new Fixture();f.owner.enabled=false;check(f.replace("off",0,7_200_000,"relative").state.equals("not-programmed"),"OFF gate");
        check(f.device.replacements==0&&f.store.commits==0,"OFF has no programming or store effects");
        f=new Fixture();f.owner.account="foreign";check(f.engine.replace(new Fixture().request("foreign",7_200_000,"relative"),0,true,true).state.equals("not-programmed"),"foreign owner rejected");
        f=new Fixture();check(f.engine.replace(f.request("unconfirmed",7_200_000,"relative"),0,false,true).state.equals("not-programmed"),"explicit confirmation required");
        check(f.engine.replace(f.request("no-apz",7_200_000,"relative"),0,true,false).state.equals("not-programmed"),"APZ confirmation required");
        check(f.replace("past",0,-1,"relative").state.equals("not-programmed"),"past instant rejected natively");
        check(f.replace("late",0,12_600_000,"absolute").state.equals("not-programmed"),"alarm at APZ rejected");

        f=new Fixture();final Fixture changing=f;f.device.duringReplace=()->changing.owner.epoch="session-2";
        check(f.replace("race",0,7_200_000,"relative").state.equals("not-programmed"),"owner change during OS call not acknowledged");
        check(f.device.jobs.isEmpty(),"owner race rolls back scheduled identity");
        f=new Fixture();final Fixture permissionChanging=f;f.device.duringReplace=()->permissionChanging.device.allowed=false;
        check(f.replace("permission-race",0,7_200_000,"relative").state.equals("not-programmed"),"permission race rolls back and blocks");

        f=new Fixture();f.replace("delivery",0,7_200_000,"relative");StayAlarmEngine.Record r=f.store.read(f.key);
        check(!f.engine.receive(f.key,r.revision,r.alarm),"future envelope suppressed");f.device.clock=r.alarm;
        check(!f.engine.receive(f.key,r.revision-1,r.alarm),"stale revision suppressed");
        check(!f.engine.receive(f.key,r.revision,r.alarm-1),"stale instant suppressed");
        check(f.engine.receive(f.key,r.revision,r.alarm),"single on-time API attempt");
        check(!f.engine.receive(f.key,r.revision,r.alarm)&&f.device.notifications==1,"duplicate envelope cannot post twice");
        f=new Fixture();f.replace("late-delivery",0,7_200_000,"absolute");r=f.store.read(f.key);f.device.clock=r.alarm+120_001;
        check(!f.engine.receive(f.key,r.revision,r.alarm)&&f.device.notifications==0,"late delivery expires");
        f=new Fixture();f.replace("unknown-delivery",0,7_200_000,"absolute");r=f.store.read(f.key);f.device.clock=r.alarm;f.device.failNotify=true;
        check(!f.engine.receive(f.key,r.revision,r.alarm),"delivery exception not claimed successful");
        f.device.failNotify=false;check(!f.engine.receive(f.key,r.revision,r.alarm)&&f.device.notifications==1,"unknown delivery never retried");
        f=new Fixture();f.replace("corrupt",0,7_200_000,"relative");r=f.store.read(f.key);f.store.corrupt=true;f.device.clock=r.alarm;
        check(!f.engine.receive(f.key,r.revision,r.alarm)&&f.device.notifications==0,"corrupt journal fails closed");

        // Two independent bridge/engine instances share the same process lock.
        final Fixture serial=new Fixture();CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        serial.device.duringReplace=()->{entered.countDown();try{release.await();}catch(Exception e){throw new RuntimeException(e);}};
        Thread schedule=new Thread(()->serial.replace("serialized",0,7_200_000,"relative"));schedule.start();entered.await();
        final StayAlarmEngine other=new StayAlarmEngine(serial.store,serial.device,serial.owner);
        Thread cancel=new Thread(()->other.cancel(serial.key,"synthetic","stay-1","serialized-cancel",1,serial.owner.epoch));cancel.start();
        release.countDown();schedule.join();cancel.join();check(serial.device.jobs.isEmpty(),"cancel waits for in-flight replace across instances");
        check(serial.store.read(serial.key).state.equals("cancelled"),"serialized terminal cancellation");
        check(StayAlarmEngine.identity("a:b ü","hotel/1").equals("stay-hotel-apz:a%3Ab%20%C3%BC:hotel%2F1"),"identity matches JS encoding");
        System.out.println("PASS production native engine: "+checks+" assertions; durable replace/cancel/reboot/revocation/CAS/owner epochs/delivery races; fake device only");
    }
}
