import com.crewcheck.app.LocalAlarmLedger;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Executes the production LocalAlarmLedger with fake storage and OS. No Android
 * service, notification, device, credentials or network. */
public final class LocalAlarmLedgerFixture {
    static int checks=0;
    static void check(boolean value,String detail){checks++;if(!value)throw new AssertionError(detail);}
    static final class Store implements LocalAlarmLedger.Store {
        Map<String,LocalAlarmLedger.Entry> rows=new HashMap<>();int commits=0,failCommit=0;boolean lose=false;
        public Map<String,LocalAlarmLedger.Entry> entries(){return new HashMap<>(rows);}
        public void commit(Map<String,LocalAlarmLedger.Entry> next)throws Exception{if(++commits==failCommit)throw new Exception("disk");if(!lose)rows=new HashMap<>(next);}
    }
    static final class Device implements LocalAlarmLedger.Device {
        long clock=Instant.parse("2030-10-10T00:00:00Z").toEpochMilli();String epoch="epoch-1",boot="count:7";boolean allowed=true;
        int failArmAt=0,arms=0;boolean failCancel=false;Runnable duringArm=()->{};
        Map<String,Long> os=new HashMap<>();List<String> cancelled=new ArrayList<>();
        public long now(){return clock;}public String epoch(){return epoch;}public String boot(){return boot;}public boolean permitted(){return allowed;}
        public void arm(LocalAlarmLedger.Entry e,LocalAlarmLedger.Job job)throws Exception{if(++arms==failArmAt)throw new Exception("OS arm");os.put(e.key,e.at);duringArm.run();}
        public void cancel(String key)throws Exception{cancelled.add(key);if(failCancel)throw new Exception("OS cancel");os.remove(key);}
    }
    static final long MIN=60_000L;
    static LocalAlarmLedger.Job job(String id,long at,String channel){return new LocalAlarmLedger.Job(id,at,channel,"Fim do descanso","Seu turno termina agora.");}

    public static void main(String[] args) throws Exception {
        String group="inflight-rest:LA8084-2030-10-10";
        // Replace arms every job, journaled under the current epoch and boot.
        {
            Store store=new Store();Device device=new Device();LocalAlarmLedger ledger=new LocalAlarmLedger(store,device);
            long t=device.clock;
            LocalAlarmLedger.Result r=ledger.replace(group,Arrays.asList(job("own:2",t+120*MIN,"alarm"),job("handover:3",t+240*MIN,"vibrate")));
            check(r.ok&&"scheduled".equals(r.reason)&&r.armed.size()==2,"scheduled two");
            check(device.os.size()==2&&store.rows.size()==2,"OS and journal hold both");
            check(ledger.group(group).get(0).id.equals("own:2")&&ledger.group(group).get(1).channel.equals("vibrate"),"group sampled in order");
            // A revision replaces the whole group: the old handover can no longer be claimed.
            String oldHandover=null;for(LocalAlarmLedger.Entry e:store.rows.values())if(e.id.equals("handover:3"))oldHandover=e.key;
            r=ledger.replace(group,Arrays.asList(job("own:2",t+130*MIN,"alarm")));
            check(r.ok&&device.os.size()==1&&store.rows.size()==1,"revision leaves one alarm");
            check(device.cancelled.contains(oldHandover),"old alarm cancelled in the OS");
            device.clock=t+240*MIN;
            check(ledger.claim(oldHandover,"epoch-1",t+240*MIN)==null,"replaced alarm never rings");
            // Another group is untouched by this one's revision.
            check(ledger.replace("validity:cma",Arrays.asList(job("30d",t+30*24*60*MIN,"default"))).ok,"second group");
            check(ledger.replace(group,new ArrayList<>()).ok&&ledger.group(group).isEmpty()&&ledger.group("validity:cma").size()==1,"cancel scoped to its group");
        }
        // Claim: once, on time, only for the current epoch and boot.
        {
            Store store=new Store();Device device=new Device();LocalAlarmLedger ledger=new LocalAlarmLedger(store,device);
            long t=device.clock,at=t+60*MIN;
            ledger.replace(group,Arrays.asList(job("own:1",at,"alarm")));String key=store.rows.keySet().iterator().next();
            device.clock=at-1;check(ledger.claim(key,"epoch-1",at)==null,"early intent does not ring");
            check(store.rows.size()==0,"early claim consumes the entry (no later duplicate)");
            ledger.replace(group,Arrays.asList(job("own:1",at,"alarm")));key=store.rows.keySet().iterator().next();
            device.clock=at+LocalAlarmLedger.LATE_WINDOW;
            LocalAlarmLedger.Entry rung=ledger.claim(key,"epoch-1",at);
            check(rung!=null&&rung.channel.equals("alarm"),"late within window still rings");
            check(ledger.claim(key,"epoch-1",at)==null,"second delivery denied");
            device.clock=t;ledger.replace(group,Arrays.asList(job("own:1",at,"alarm")));key=store.rows.keySet().iterator().next();
            device.clock=at+LocalAlarmLedger.LATE_WINDOW+1;check(ledger.claim(key,"epoch-1",at)==null,"too late is dropped");
            device.clock=t;ledger.replace(group,Arrays.asList(job("own:1",at,"alarm")));key=store.rows.keySet().iterator().next();
            device.clock=at;check(ledger.claim(key,"epoch-1",at+1)==null,"envelope time mismatch denied");
            check(ledger.claim(key,"epoch-0",at)==null,"envelope epoch mismatch denied");
            device.allowed=false;check(ledger.claim(key,"epoch-1",at)==null,"notifications revoked: silent");
            device.allowed=true;device.clock=t;ledger.replace(group,Arrays.asList(job("own:1",at,"alarm")));key=store.rows.keySet().iterator().next();
            device.boot="count:8";device.clock=at;check(ledger.claim(key,"epoch-1",at)==null,"armed before reboot never rings after it");
            check(ledger.group(group).isEmpty(),"reboot leaves nothing reported as armed");
            device.boot="count:7";device.clock=t;ledger.replace(group,Arrays.asList(job("own:1",at,"alarm")));key=store.rows.keySet().iterator().next();
            device.epoch="epoch-2";device.clock=at;check(ledger.claim(key,"epoch-1",at)==null,"account change: old alarm silent");
        }
        // Account fence and signed-out state.
        {
            Store store=new Store();Device device=new Device();LocalAlarmLedger ledger=new LocalAlarmLedger(store,device);
            long t=device.clock;
            ledger.replace(group,Arrays.asList(job("own:1",t+60*MIN,"alarm")));ledger.replace("report:2030-10-11",Arrays.asList(job("lead",t+90*MIN,"default")));
            device.epoch="epoch-2";check(ledger.fence()&&store.rows.isEmpty()&&device.os.isEmpty(),"fence clears every alarm of the old epoch");
            device.epoch="";
            LocalAlarmLedger.Result r=ledger.replace(group,Arrays.asList(job("own:1",t+60*MIN,"alarm")));
            check(!r.ok&&"signed-out".equals(r.reason)&&device.os.isEmpty(),"signed out: nothing armed");
            device.epoch="epoch-2";device.allowed=false;
            r=ledger.replace(group,Arrays.asList(job("own:1",t+60*MIN,"alarm")));
            check(!r.ok&&"notifications-not-permitted".equals(r.reason),"no notification permission: refused");
            check(ledger.cancel(group).ok,"cancel still allowed without permission");
            // The epoch moves while the OS call is in flight: the group is rolled back.
            device.allowed=true;device.duringArm=()->device.epoch="epoch-3";
            r=ledger.replace(group,Arrays.asList(job("own:1",t+60*MIN,"alarm")));
            check(!r.ok&&"account-changed".equals(r.reason)&&store.rows.isEmpty()&&device.os.isEmpty(),"mid-arm account change rolls back");
        }
        // All-or-nothing on OS or journal failure.
        {
            Store store=new Store();Device device=new Device();LocalAlarmLedger ledger=new LocalAlarmLedger(store,device);
            long t=device.clock;device.failArmAt=2;
            LocalAlarmLedger.Result r=ledger.replace(group,Arrays.asList(job("a",t+60*MIN,"alarm"),job("b",t+120*MIN,"alarm")));
            check(!r.ok&&"arm-failed".equals(r.reason)&&store.rows.isEmpty()&&device.os.isEmpty(),"partial arm rolls back the group");
            device.failArmAt=0;store.failCommit=store.commits+2;
            r=ledger.replace(group,Arrays.asList(job("a",t+60*MIN,"alarm")));
            check(!r.ok&&"journal-incomplete".equals(r.reason),"journal failure reported");
            store.failCommit=0;
            check(device.os.isEmpty(),"journal failure leaves no OS alarm");
            Store lost=new Store();lost.lose=true;Device d1=new Device();LocalAlarmLedger lossy=new LocalAlarmLedger(lost,d1);
            r=lossy.replace(group,Arrays.asList(job("a",t+60*MIN,"alarm")));
            check(!r.ok&&"journal-incomplete".equals(r.reason)&&d1.os.isEmpty(),"journal readback mismatch never leaves an OS alarm");
            // Uncertainty blocks claims until a clean fence.
            lost.lose=false;lost.rows.put("k",new LocalAlarmLedger.Entry("k",group,"a","epoch-1","count:7","alarm",t+60*MIN));
            d1.clock=t+60*MIN;check(lossy.claim("k","epoch-1",t+60*MIN)==null,"uncertain journal: no claim");
            d1.clock=t;
            check(ledger.fence(),"clean fence clears uncertainty");
            // A failed OS cancel cannot resurrect the replaced alarm.
            Store s2=new Store();Device d2=new Device();LocalAlarmLedger l2=new LocalAlarmLedger(s2,d2);
            l2.replace(group,Arrays.asList(job("a",d2.clock+60*MIN,"alarm")));String old=s2.rows.keySet().iterator().next();
            d2.failCancel=true;check(l2.replace(group,Arrays.asList(job("b",d2.clock+90*MIN,"alarm"))).ok,"revision proceeds when OS cancel fails");
            d2.clock+=60*MIN;check(l2.claim(old,"epoch-1",d2.clock)==null,"stale OS intent cannot be claimed");
        }
        // Input validation.
        {
            Store store=new Store();Device device=new Device();LocalAlarmLedger ledger=new LocalAlarmLedger(store,device);long t=device.clock;
            String[] badGroups={null,"","rest:x","inflight-rest:","inflight-rest:a/b","other:x","inflight-rest:"+"x".repeat(97)};
            for(String bad:badGroups)check("invalid-group".equals(ledger.replace(bad,new ArrayList<>()).reason),"bad group "+bad);
            List<List<LocalAlarmLedger.Job>> bad=Arrays.asList(
                Arrays.asList(job("a",t,"alarm")),Arrays.asList(job("a",t+LocalAlarmLedgerFixtureLimits.ahead()+1,"alarm")),
                Arrays.asList(job("a",t+MIN,"siren")),Arrays.asList(job("a b",t+MIN,"alarm")),
                Arrays.asList(job("a",t+MIN,"alarm"),job("a",t+2*MIN,"alarm")),
                Arrays.asList(new LocalAlarmLedger.Job("a",t+MIN,"alarm","x".repeat(121),"")),
                Arrays.asList(new LocalAlarmLedger.Job("a",t+MIN,"alarm","t",null)));
            for(List<LocalAlarmLedger.Job> jobs:bad)check("invalid-jobs".equals(ledger.replace(group,jobs).reason),"bad jobs");
            List<LocalAlarmLedger.Job> many=new ArrayList<>();for(int i=0;i<=LocalAlarmLedger.MAX_GROUP_JOBS;i++)many.add(job("j"+i,t+(i+1)*MIN,"alarm"));
            check("invalid-jobs".equals(ledger.replace(group,many).reason),"group size limit");
            check(device.os.isEmpty()&&store.rows.isEmpty(),"rejections arm nothing");
            // Global limit across groups.
            for(int g=0;g<8;g++){List<LocalAlarmLedger.Job> jobs=new ArrayList<>();for(int i=0;i<16;i++)jobs.add(job("j"+i,t+(g*16+i+1)*MIN,"default"));
                check(ledger.replace("validity:g"+g,jobs).ok,"fill "+g);}
            check("too-many-alarms".equals(ledger.replace(group,Arrays.asList(job("x",t+MIN,"alarm"))).reason),"global limit");
        }
        System.out.println("PASS LocalAlarmLedger: "+checks+" checks (group replace/cancel, single claim, late window, epoch/boot fence, rollback, validation, limits)");
    }
}
final class LocalAlarmLedgerFixtureLimits { static long ahead(){return 400L*24*3_600_000L;} }
