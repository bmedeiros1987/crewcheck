package com.crewcheck.app;
import org.json.JSONObject;
import java.util.*;

public final class LifeReminderLedgerFixture {
    static int checks; static final long NOW=1_800_000_000_000L;
    static final String ID="hydration:2026-10-19:morning";
    static void check(boolean value,String label){checks++;if(!value)throw new AssertionError("case "+checks+": "+label);}
    static class Store implements LifeReminderLedger.Store {
        String raw="", failPhase=""; boolean afterWrite;
        public String read(){return raw;}
        public void write(String json)throws Exception{
            if(!failPhase.isEmpty()&&json.contains("\"phase\":\""+failPhase+"\"")){if(afterWrite)raw=json;throw new Exception("synthetic disk receipt");}
            raw=json;
        }
    }
    static class Owner implements LifeReminderLedger.Owner {String context=NotificationIdentity.key("owner","A",1);public String context(){return context;}}
    static class Device implements LifeReminderLedger.Device {
        long now=NOW; int arms,cancels; boolean failCancel,failArm; Runnable afterArm; Map<String,Long> alarms=new HashMap<>();
        Device(){alarms.put("other-module",NOW+60000);}
        public long now(){return now;}
        public void cancel(String key)throws Exception{check(LifeReminderLedger.lifeKey(key),"only native Life keys reach OS cancel");cancels++;if(failCancel)throw new Exception("synthetic cancel");alarms.remove(key);}
        public void arm(String key,String context,long at,String title,String body)throws Exception{check(LifeReminderLedger.lifeKey(key),"opaque native Life key");arms++;alarms.put(key,at);if(afterArm!=null)afterArm.run();if(failArm)throw new Exception("synthetic arm failure after OS acceptance");}
    }
    static class Fixture {
        Store store=new Store(); Owner owner=new Owner(); Device device=new Device(); LifeReminderLedger ledger=new LifeReminderLedger(store,owner,device);
        JSONObject request(String op,String id,long revision)throws Exception{return new JSONObject().put("schemaVersion",1).put("op",op).put("context",owner.context).put("id",id).put("revision",revision);}
        JSONObject replace(String id,long revision,long at)throws Exception{return request("replace",id,revision).put("at",at).put("title","Synthetic reminder").put("body","SYNTHETIC_BODY_NOT_STORED");}
        JSONObject update(JSONObject r)throws Exception{return new JSONObject(ledger.update(r.toString()));}
        String key(String id)throws Exception{return new JSONObject(store.raw).getJSONObject("records").getJSONObject(id).getString("key");}
        void other(){check(device.alarms.containsKey("other-module"),"other module alarm preserved");}
    }
    public static void main(String[] args)throws Exception{
        Fixture f=new Fixture();JSONObject r=f.replace(ID,1,NOW+60000);
        check(f.update(r).getString("status").equals("accepted"),"initial receipt");String first=f.key(ID);
        check(!f.store.raw.contains("SYNTHETIC_BODY_NOT_STORED"),"no title/body stored in journal");
        check(!f.update(r).getBoolean("deliveryConfirmed"),"acceptance never claims physical delivery");check(f.device.arms==1,"idempotent accepted request never rearms");
        check(f.update(f.replace(ID,1,NOW+70000)).getString("status").equals("revision_conflict"),"same revision mutation rejected");
        check(f.update(f.replace(ID,2,NOW+90000)).getBoolean("ok"),"reschedule accepted");String second=f.key(ID);
        check(!first.equals(second)&&!f.device.alarms.containsKey(first),"old OS identity replaced");f.other();
        f.device.now=NOW+60000;check(!f.ledger.claim(first,f.owner.context,NOW+60000),"old broadcast cannot consume replacement");
        check(f.update(f.request("cancel",ID,3)).getString("status").equals("cancelled"),"selective OFF receipt");
        check(f.update(f.request("cancel",ID,3)).getBoolean("ok"),"idempotent cancellation");check(!f.device.alarms.containsKey(second),"target removed");f.other();
        check(f.update(f.replace(ID,2,NOW+100000)).getString("status").equals("stale_revision"),"cancel revision blocks old reschedule");
        Fixture framing=new Fixture();JSONObject framed=framing.replace(ID,1,NOW+60000).put("title","A\nB").put("body","C");
        check(framing.update(framed).getBoolean("ok"),"framed payload accepted");
        check(framing.update(framing.replace(ID,1,NOW+60000).put("title","A").put("body","B\nC")).getString("status").equals("revision_conflict"),"title/body framing cannot confuse idempotent receipt");
        Fixture sameEpoch=new Fixture();sameEpoch.update(sameEpoch.replace(ID,1,NOW+60000));String oldSame=sameEpoch.key(ID);
        check(sameEpoch.update(sameEpoch.replace(ID,2,NOW+60000).put("body","Changed synthetic body")).getBoolean("ok"),"same-time replacement accepted");
        sameEpoch.device.now=NOW+60000;check(!sameEpoch.ledger.claim(oldSame,sameEpoch.owner.context,NOW+60000),"old same-time broadcast cannot display old body");
        check(sameEpoch.ledger.claim(sameEpoch.key(ID),sameEpoch.owner.context,NOW+60000),"new same-time revision has its own single claim");sameEpoch.other();
        for(String id:List.of("other-module","life1-00000000-0000-0000-0000-000000000000","hydration:2026-02-30:morning","hydration:2026-10-19:../other","study:2026-10-19:")){
            int before=f.device.cancels;check(!f.update(f.request("cancel",id,4)).getBoolean("ok"),"invalid/foreign module ID rejected");check(f.device.cancels==before,"invalid ID cannot touch OS");f.other();
        }
        check(!LifeReminderLedger.lifeKey("life1-------------------------------------"),"malformed UUID rejected");
        r=f.replace(ID,4,NOW+120000);r.put("module","other");check(f.update(r).getString("status").equals("uncertain"),"unknown schema field fails closed");
        r=f.replace(ID,4,NOW+120000);r.put("revision","4");check(!f.update(r).getBoolean("ok"),"numeric string rejected");
        Fixture partial=new Fixture();partial.update(partial.replace(ID,1,NOW+60000));String old=partial.key(ID);partial.device.failCancel=true;
        check(partial.update(partial.replace(ID,2,NOW+90000)).getString("status").equals("partial"),"partial OS cleanup is not success");check(partial.device.arms==1,"no new arm before old cleanup confirmed");
        partial.device.now=NOW+60000;check(!partial.ledger.claim(old,partial.owner.context,NOW+60000),"durable invalidation precedes failed OS cancel");partial.other();
        partial.device.failCancel=false;check(partial.update(partial.replace(ID,2,NOW+90000)).getBoolean("ok"),"same request resumes confirmed cleanup without duplicate arm");check(partial.device.arms==2,"one replacement after recovery");partial.other();
        Fixture switched=new Fixture();r=switched.replace(ID,1,NOW+60000);switched.update(r);old=switched.key(ID);String ownerA=switched.owner.context;switched.owner.context=NotificationIdentity.key("owner","B",1);
        check(switched.update(r).getString("status").equals("wrong_context"),"old account cannot act in B");check(!switched.update(switched.request("cancel",ID,2)).getBoolean("ok"),"B cannot address A record");
        switched.device.now=NOW+60000;check(!switched.ledger.claim(old,ownerA,NOW+60000),"old account intent blocked");check(switched.device.arms==1,"account change does not restore");switched.other();
        Fixture inFlight=new Fixture();inFlight.device.afterArm=()->inFlight.owner.context=NotificationIdentity.key("owner","B",1);
        check(inFlight.update(inFlight.replace(ID,1,NOW+60000)).getString("status").equals("wrong_context"),"owner checked after OS boundary");
        check(inFlight.device.alarms.size()==1,"in-flight old owner arm cancelled without touching other module");inFlight.other();
        Fixture restart=new Fixture();restart.update(restart.replace(ID,1,NOW+60000));old=restart.key(ID);restart.ledger=new LifeReminderLedger(restart.store,restart.owner,restart.device);restart.device.now=NOW+60000;
        check(restart.ledger.claim(old,restart.owner.context,NOW+60000),"ordinary process recreation can claim current eligible ticket");check(!restart.ledger.claim(old,restart.owner.context,NOW+60000),"single claim after process recreation");
        Fixture reboot=new Fixture();reboot.update(reboot.replace(ID,1,NOW+60000));old=reboot.key(ID);ownerA=reboot.owner.context;reboot.owner.context=NotificationIdentity.key("owner","A",2);reboot.device.now=NOW+60000;
        check(!reboot.ledger.claim(old,ownerA,NOW+60000),"boot change invalidates old ticket");check(new JSONObject(reboot.ledger.state()).getJSONObject("records").length()==0,"no boot restoration");check(reboot.device.arms==1,"state is observational");
        for(boolean after:List.of(false,true)){
            Fixture receipt=new Fixture();receipt.store.failPhase="armed";receipt.store.afterWrite=after;r=receipt.replace(ID,1,NOW+60000);
            check(receipt.update(r).getString("status").equals("uncertain"),"failed durable receipt is never accepted");check(receipt.device.arms==1,"OS arm attempted once");
            receipt.store.failPhase="";String status=receipt.update(r).getString("status");check(status.equals(after?"accepted":"uncertain"),"retry reconciles disk but does not repeat OS arm");check(receipt.device.arms==1,"no replay after uncertain receipt");receipt.other();
            check(receipt.update(receipt.request("cancel",ID,2)).getBoolean("ok"),"uncertain arm can be selectively invalidated/cancelled");receipt.other();
        }
        Fixture armFail=new Fixture();armFail.device.failArm=true;check(armFail.update(armFail.replace(ID,1,NOW+60000)).getString("status").equals("failed"),"arm exception yields no accepted receipt");check(armFail.device.alarms.size()==1,"best effort cancel removes possibly accepted failed arm");armFail.other();
        for(boolean after:List.of(false,true)){
            Fixture cancelDisk=new Fixture();cancelDisk.update(cancelDisk.replace(ID,1,NOW+60000));cancelDisk.store.failPhase="cancel_pending";cancelDisk.store.afterWrite=after;
            check(cancelDisk.update(cancelDisk.request("cancel",ID,2)).getString("status").equals("uncertain"),"unconfirmed cancellation journal is never a success");cancelDisk.other();
            cancelDisk.store.failPhase="";check(cancelDisk.update(cancelDisk.request("cancel",ID,2)).getBoolean("ok"),"cancellation receipt recovers without touching another module");cancelDisk.other();
            check(cancelDisk.device.alarms.size()==1,"only the other module remains after confirmed recovery");
        }
        Fixture expiry=new Fixture();expiry.update(expiry.replace(ID,1,NOW+60000));old=expiry.key(ID);expiry.device.now=NOW+180001;check(!expiry.ledger.claim(old,expiry.owner.context,NOW+60000),"120001ms late is still rejected");
        Fixture unavailable=new Fixture();unavailable.owner.context="";check(!new JSONObject(unavailable.ledger.state()).getBoolean("available"),"unknown owner/boot unavailable");check(!unavailable.update(unavailable.replace(ID,1,NOW+60000)).getBoolean("ok"),"no available context no arm");unavailable.other();
        System.out.println("PASS "+checks+" actual Life ledger assertions; idempotence, replacement, scoped cancellation, partial/disk/receipt faults, account/boot/process fences, invalid IDs, expiry, other-module preservation; synthetic OS/storage, no delivery proof");
    }
}
