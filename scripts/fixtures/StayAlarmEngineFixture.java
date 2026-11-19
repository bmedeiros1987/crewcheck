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
        java.util.function.Consumer<StayAlarmEngine.Record> afterCommit=(record)->{};
        public StayAlarmEngine.Record read(String key)throws Exception {if(corrupt)throw new Exception("corrupt");return records.get(key);}
        public void commit(StayAlarmEngine.Record record)throws Exception {if(++commits==failCommit)throw new Exception("disk");records.put(record.key,record);afterCommit.accept(record);}
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
    private static StayAlarmEngine.Record fireLocalAlert(Fixture f) throws Exception {
        check(f.replace("alert",0,120_000,"relative").state.equals("scheduled"),"prepare synthetic local alert");
        StayAlarmEngine.Record due=f.store.read(f.key);
        f.device.clock=due.alarm;
        check(f.engine.receive(f.key,due.revision,due.alarm),"claim synthetic local alert once");
        return f.store.read(f.key);
    }

    private static void localAlertControls() throws Exception {
        final StayAlarmEngine.LocalAlertAction snooze=StayAlarmEngine.LocalAlertAction.SNOOZE;
        final StayAlarmEngine.LocalAlertAction dismiss=StayAlarmEngine.LocalAlertAction.DISMISS;

        Fixture f=new Fixture();
        check(f.replace("awaiting",0,120_000,"relative").state.equals("scheduled"),"scheduled fixture");
        StayAlarmEngine.Record at=f.store.read(f.key);
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,dismiss,0).state.equals("not-programmed"),
            "controls need a claimed alert, not a future schedule");

        f=new Fixture();
        at=fireLocalAlert(f);
        long next=at.alarm+300_000;
        check(f.engine.applyLocalAlertAction(false,f.key,at.revision,at.alarm,snooze,next).reason.equals("alert-controls-disabled"),
            "explicit opt-in required");
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm-1,dismiss,0).state.equals("not-programmed"),
            "stale alert instant cannot silence the current revision");
        for(long invalid:new long[]{at.alarm,at.alarm+600_001,at.apz}) {
            check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,invalid).state.equals("not-programmed"),
                "invalid snooze leaves the alert unchanged");
        }
        f.owner.epoch="other-epoch";
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,dismiss,0).key.isEmpty(),
            "stale owner epoch has no control or scope receipt");
        f.owner.epoch=at.ownerEpoch;
        f.device.allowed=false;
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,next).state.equals("not-programmed"),
            "snooze does not silence if exact scheduling is unavailable");
        f.device.allowed=true;
        check(f.device.cancellations==0&&f.device.replacements==1,"rejected controls did not mutate the device");

        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,next).state.equals("scheduled"),"snooze arms one new revision");
        StayAlarmEngine.Record snoozed=f.store.read(f.key);
        check(snoozed.revision==at.revision+1&&snoozed.alarm==next&&snoozed.apz==at.apz
            &&snoozed.key.equals(at.key)&&f.device.jobs.size()==1,"snooze reuses identity and APZ");
        check(f.device.cancellations==1&&f.device.notifications==1,"snooze clears only the earlier alert");
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,dismiss,0).state.equals("not-programmed"),
            "old dismiss cannot stop the newly snoozed revision");
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,next).state.equals("not-programmed"),
            "duplicate snooze cannot add another alarm");
        f.device.clock=next;
        check(!f.engine.receive(f.key,at.revision,at.alarm),"old delivery cannot ring again");
        check(f.engine.receive(f.key,snoozed.revision,snoozed.alarm)&&f.device.notifications==2,"new revision can alert once");
        check(f.engine.applyLocalAlertAction(true,f.key,snoozed.revision,snoozed.alarm,dismiss,0).state.equals("cancelled"),
            "dismiss completes a local cancellation");
        check(f.engine.applyLocalAlertAction(true,f.key,snoozed.revision,snoozed.alarm,snooze,next+300_000).state.equals("not-programmed"),
            "dismiss wins over stale snooze");
        f.engine.recover(false);
        check(f.device.jobs.isEmpty()&&f.store.read(f.key).state.equals("cancelled"),"recovery preserves dismissal");

        f=new Fixture();
        at=fireLocalAlert(f);
        f.device.clock=at.apz-70_000;
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,at.apz).state.equals("not-programmed"),
            "snooze within ten minutes still may not reach APZ");
        f.device.allowed=false;
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,dismiss,0).state.equals("cancelled"),
            "stopping a current alert does not require permission to arm a new one");

        f=new Fixture();
        at=fireLocalAlert(f);
        f.device.failCancel=true;
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,at.alarm+300_000).state.equals("unknown"),
            "failed silence does not acknowledge snooze");
        check(f.device.replacements==1&&f.store.read(f.key).state.equals("pending-snooze"),"snooze is durable but not acknowledged");
        f.device.failCancel=false;
        f.engine.recover(false);
        check(f.device.jobs.size()==1&&f.store.read(f.key).revision==at.revision+1,"recovery finishes the same snooze");

        f=new Fixture();
        at=fireLocalAlert(f);
        f.store.failCommit=f.store.commits+1;
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,at.alarm+300_000).state.equals("unknown"),
            "a failed journal write cannot be acknowledged");
        check(f.device.cancellations==0&&f.device.replacements==1&&f.store.read(f.key).state.equals("attempted"),
            "journal failure leaves the current alert untouched");

        f=new Fixture();
        at=fireLocalAlert(f);
        f.device.failReplace=true;
        check(f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,at.alarm+300_000).state.equals("unknown"),
            "failed OS rearm does not acknowledge snooze");
        f.device.failReplace=false;
        f.engine.recover(false);
        check(f.device.jobs.size()==1&&f.store.read(f.key).revision==at.revision+1,
            "journal recovers only the prepared snooze revision");
        f=new Fixture();
        at=fireLocalAlert(f);
        f.device.failCancel=true;
        f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,snooze,at.alarm+300_000);
        f.device.failCancel=false;
        check(f.replace("new-manual-edit",at.revision+1,240_000,"absolute").state.equals("scheduled"),
            "an authorized newer edit can supersede a pending snooze");
        check(f.device.cancellations==2&&f.device.jobs.size()==1,"the newer edit still clears the previous alert");

        for(StayAlarmEngine.LocalAlertAction action:StayAlarmEngine.LocalAlertAction.values()) {
            f=new Fixture();
            check(f.replace("local-alert:1:"+action.name(),0,120_000,"relative").state.equals("scheduled"),
                "caller operation may look like an internal action");
            at=f.store.read(f.key);
            f.device.clock=at.alarm;
            check(f.engine.receive(f.key,at.revision,at.alarm),"deliver collision fixture");
            StayAlarmEngine.Result result=f.engine.applyLocalAlertAction(true,f.key,at.revision,at.alarm,action,at.alarm+300_000);
            check(result.state.equals(action==dismiss?"cancelled":"scheduled")&&result.revision==2,
                "control cannot collide with the previous operation");
        }
        check(StayAlarmEngine.LocalAlertAction.values().length==2,"these controls cannot confirm awake");
    }

    private static void reboot(Fixture fixture) throws Exception {
        fixture.device.jobs.clear();
        fixture.engine = new StayAlarmEngine(fixture.store, fixture.device, fixture.owner);
        fixture.engine.recoverConfirmedOnBoot();
    }

    private static void directBootRecovery() throws Exception {
        Fixture f = new Fixture();
        f.replace("boot-alert", 0, 120_000, "absolute");
        StayAlarmEngine.Record first = f.store.read(f.key);
        reboot(f);
        check(f.device.jobs.size() == 1 && f.device.jobs.get(f.key).alarm == first.alarm,
            "locked boot restores the confirmed instant");
        f.engine.recoverConfirmedOnBoot();
        check(f.device.jobs.size() == 1, "repeated recovery replaces the same OS identity");
        f.device.clock = first.alarm;
        check(f.engine.receive(f.key, first.revision, first.alarm), "one on-time attempt after reboot");

        check(f.engine.applyLocalAlertAction(true, f.key, first.revision, first.alarm,
            StayAlarmEngine.LocalAlertAction.SNOOZE, first.alarm + 120_000).state.equals("scheduled"),
            "new snooze revision confirmed");
        StayAlarmEngine.Record snoozed = f.store.read(f.key);
        reboot(f);
        f.engine.recoverConfirmedOnBoot();
        check(f.device.jobs.size() == 1 && f.device.jobs.get(f.key).revision == snoozed.revision,
            "only confirmed snooze is restored by repeated recovery");
        f.device.clock = snoozed.alarm;
        check(!f.engine.receive(f.key, first.revision, first.alarm), "old revision remains silent");
        check(f.engine.receive(f.key, snoozed.revision, snoozed.alarm) && f.device.notifications == 2,
            "only the replacement can alert once");
        f.engine.applyLocalAlertAction(true, f.key, snoozed.revision, snoozed.alarm,
            StayAlarmEngine.LocalAlertAction.DISMISS, 0);
        reboot(f);
        check(f.device.jobs.isEmpty() && f.store.read(f.key).state.equals("cancelled"), "dismiss survives reboot");

        f = new Fixture();
        f.replace("cancel-before-reboot", 0, 120_000, "absolute");
        first = f.store.read(f.key);
        check(f.cancel("cancel", first.revision).state.equals("cancelled"), "cancel acknowledged");
        reboot(f);
        f.device.clock = first.alarm;
        check(f.device.jobs.isEmpty() && !f.engine.receive(f.key, first.revision, first.alarm),
            "confirmed cancellation suppresses old delivery");

        f = new Fixture();
        f.replace("owner-a", 0, 120_000, "absolute");
        f.owner.enabled = false;
        reboot(f);
        check(f.device.jobs.isEmpty(), "revoked owner cannot rearm");
        f.owner.enabled = true;
        f.owner.epoch = "new-generation";
        f.engine.recoverConfirmedOnBoot();
        check(f.device.jobs.isEmpty(), "same account with new epoch cannot resurrect its alarm");

        f = new Fixture();
        f.replace("account-a", 0, 120_000, "absolute");
        f.owner.account = "account-b";
        reboot(f);
        check(f.device.jobs.isEmpty(), "different account cannot recover old alarm");

        f = new Fixture();
        f.store.failCommit = 2;
        check(f.replace("interrupted", 0, 120_000, "absolute").state.equals("unknown"), "final write failed");
        reboot(f);
        check(f.device.jobs.isEmpty() && f.store.read(f.key).state.equals("blocked"),
            "an incomplete schedule is quarantined at boot");
        f.engine.recoverConfirmedOnBoot();
        check(f.device.jobs.isEmpty(), "unlock does not complete the interrupted schedule");

        f = new Fixture();
        StayAlarmEngine.Record attempted = fireLocalAlert(f);
        f.device.failReplace = true;
        f.engine.applyLocalAlertAction(true, f.key, attempted.revision, attempted.alarm,
            StayAlarmEngine.LocalAlertAction.SNOOZE, attempted.alarm + 120_000);
        f.device.failReplace = false;
        reboot(f);
        check(f.device.jobs.isEmpty() && f.store.read(f.key).state.equals("blocked"),
            "a pending snooze does not become a confirmed alarm on boot");

        f = new Fixture();
        f.replace("expired", 0, 120_000, "absolute");
        f.device.clock = f.store.read(f.key).alarm + 1;
        reboot(f);
        check(f.device.jobs.isEmpty() && f.store.read(f.key).state.equals("expired"), "past alarm never rearms");
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
        f=new Fixture();f.replace("owner",0,7_200_000,"relative");f.owner.epoch="session-2";
        check(f.engine.cancel(f.key,"synthetic","stay-1","old-cancel",1,"session-1").state.equals("not-programmed"),"stale native cancellation epoch rejected");
        check(f.device.cancellations==0,"stale cancellation cannot mutate OS state");f.engine.recover(false);
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

        f=new Fixture();final Fixture deliveryRace=f;f.replace("claim-owner-race",0,7_200_000,"relative");
        r=f.store.read(f.key);f.device.clock=r.alarm;
        f.store.afterCommit=(record)->{if(record.state.equals("delivery-unknown"))deliveryRace.owner.epoch="session-new";};
        check(!f.engine.receive(f.key,r.revision,r.alarm),"epoch changed during durable claim rejects delivery");
        check(f.device.notifications==0&&f.store.read(f.key).state.equals("blocked"),"old epoch never notifies or becomes attempted");
        check(!f.engine.receive(f.key,r.revision,r.alarm),"blocked claim cannot retry");
        f=new Fixture();final Fixture deliveryPermissionRace=f;f.replace("claim-permission-race",0,7_200_000,"relative");
        r=f.store.read(f.key);f.device.clock=r.alarm;
        f.store.afterCommit=(record)->{if(record.state.equals("delivery-unknown"))deliveryPermissionRace.device.allowed=false;};
        check(!f.engine.receive(f.key,r.revision,r.alarm)&&f.device.notifications==0,"permission revoked during claim suppresses delivery");

        // Trusted host revocation must share the delivery critical section.
        final Fixture hostRace=new Fixture();hostRace.replace("host-race",0,7_200_000,"relative");
        final StayAlarmEngine.Record hostRecord=hostRace.store.read(hostRace.key);hostRace.device.clock=hostRecord.alarm;
        CountDownLatch claimed=new CountDownLatch(1),releaseClaim=new CountDownLatch(1),revoking=new CountDownLatch(1);
        hostRace.store.afterCommit=(record)->{if(record.state.equals("delivery-unknown")){claimed.countDown();try{releaseClaim.await();}catch(Exception e){throw new RuntimeException(e);}}};
        Thread deliver=new Thread(()->hostRace.engine.receive(hostRace.key,hostRecord.revision,hostRecord.alarm));deliver.start();claimed.await();
        Thread revoke=new Thread(()->{revoking.countDown();StayAlarmEngine.updateTrustedOwner(()->hostRace.owner.epoch="revoked");});revoke.start();revoking.await();
        check(hostRace.owner.epoch.equals("session-1"),"host revocation cannot interleave with claim/notify critical section");
        releaseClaim.countDown();deliver.join();revoke.join();
        check(hostRace.device.notifications==1&&hostRace.owner.epoch.equals("revoked"),"delivery first linearizes before revocation; no retrospective suppression claim");
        f=new Fixture();f.replace("revoke-first",0,7_200_000,"relative");r=f.store.read(f.key);f.device.clock=r.alarm;
        final Fixture revokeFirst=f;StayAlarmEngine.updateTrustedOwner(()->revokeFirst.owner.epoch="revoked");
        check(!f.engine.receive(f.key,r.revision,r.alarm)&&f.device.notifications==0,"completed host revocation first suppresses notification");

        // Two independent bridge/engine instances share the same process lock.
        final Fixture serial=new Fixture();CountDownLatch entered=new CountDownLatch(1),release=new CountDownLatch(1);
        serial.device.duringReplace=()->{entered.countDown();try{release.await();}catch(Exception e){throw new RuntimeException(e);}};
        Thread schedule=new Thread(()->serial.replace("serialized",0,7_200_000,"relative"));schedule.start();entered.await();
        final StayAlarmEngine other=new StayAlarmEngine(serial.store,serial.device,serial.owner);
        Thread cancel=new Thread(()->other.cancel(serial.key,"synthetic","stay-1","serialized-cancel",1,serial.owner.epoch));cancel.start();
        release.countDown();schedule.join();cancel.join();check(serial.device.jobs.isEmpty(),"cancel waits for in-flight replace across instances");
        check(serial.store.read(serial.key).state.equals("cancelled"),"serialized terminal cancellation");
        check(StayAlarmEngine.identity("a:b ü","hotel/1").equals("stay-hotel-apz:a%3Ab%20%C3%BC:hotel%2F1"),"identity matches JS encoding");
        localAlertControls();
        directBootRecovery();
        System.out.println("PASS production native engine: "+checks+" assertions; durable replace/cancel/reboot/revocation/CAS/owner epochs/delivery races; fake device only");
    }
}
