package com.crewcheck.app;

import java.net.URLEncoder;
import java.util.List;
import java.util.Objects;
import java.time.OffsetDateTime;

/** Native operation journal. No Android, network, timer or permission requests.
 * Android's same-PendingIntent replacement is atomic; the journal and OS are not
 * one transaction. Any incomplete boundary remains unknown until reconciliation. */
public final class StayAlarmEngine {
    private static final Object LOCK = new Object();
    public interface Store {
        Record read(String key) throws Exception;
        void commit(Record record) throws Exception;
        List<Record> all() throws Exception;
    }
    public interface Device {
        long now();
        boolean permitted();
        void replace(Record record) throws Exception;
        void cancel(String key) throws Exception;
        void notify(Record record) throws Exception;
    }
    /** Supplied by a trusted native session owner, never by a bridge request. */
    public interface Owner {
        boolean enabled();
        String activeOwner();
        String epoch();
    }
    public static final class Record {
        public final String key, owner, ownerEpoch, event, operation, alarmAt, mode, state;
        public final long revision, alarm, apz;
        public Record(String key, String owner, String ownerEpoch, String event, String operation, long revision,
                      String alarmAt, long alarm, long apz, String mode, String state) {
            this.key=key; this.owner=owner; this.ownerEpoch=ownerEpoch; this.event=event; this.operation=operation;
            this.revision=revision; this.alarmAt=alarmAt; this.alarm=alarm;
            this.apz=apz; this.mode=mode; this.state=state;
        }
        Record state(String value) { return new Record(key,owner,ownerEpoch,event,operation,revision,alarmAt,alarm,apz,mode,value); }
        boolean same(Record r) { return r != null && revision==r.revision && alarm==r.alarm && apz==r.apz
            && Objects.equals(key,r.key) && Objects.equals(owner,r.owner) && Objects.equals(ownerEpoch,r.ownerEpoch) && Objects.equals(event,r.event)
            && Objects.equals(operation,r.operation) && Objects.equals(alarmAt,r.alarmAt)
            && Objects.equals(mode,r.mode) && Objects.equals(state,r.state); }
    }
    public static final class Result {
        public final String key, operation, state, reason, alarmAt;
        public final long revision;
        Result(String key,String operation,String state,String reason,String alarmAt,long revision) {
            this.key=key;this.operation=operation;this.state=state;this.reason=reason;this.alarmAt=alarmAt;this.revision=revision;
        }
    }
    private final Store store;
    private final Device device;
    private final Owner owner;
    public StayAlarmEngine(Store store,Device device,Owner owner) { this.store=store;this.device=device;this.owner=owner; }
    private static String encode(String value) {
        try { return URLEncoder.encode(value,"UTF-8").replace("+","%20").replace("%21","!")
            .replace("%27","'").replace("%28","(").replace("%29",")").replace("%7E","~"); } catch(java.io.UnsupportedEncodingException error) {throw new IllegalStateException(error);}
    }
    public static String identity(String owner,String event) { return "stay-hotel-apz:"+encode(owner)+":"+encode(event); }
    private boolean owned(String value) { return owner.enabled() && value!=null && !value.trim().isEmpty() && value.equals(owner.activeOwner()); }
    private boolean owned(Record r) { return r!=null && owned(r.owner) && r.ownerEpoch!=null && r.ownerEpoch.equals(owner.epoch()); }
    public static long instant(String value) {
        if(value==null||!value.matches("\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,3})?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)"))throw new IllegalArgumentException("instant");
        return OffsetDateTime.parse(value).toInstant().toEpochMilli();
    }
    private boolean valid(Record r) {
        boolean fields=r!=null && r.owner!=null && !r.owner.trim().isEmpty() && r.event!=null && !r.event.trim().isEmpty()
            && r.ownerEpoch!=null && !r.ownerEpoch.trim().isEmpty() && r.owner.length()<=512 && r.event.length()<=512 && identity(r.owner,r.event).equals(r.key)
            && r.operation!=null && !r.operation.trim().isEmpty() && r.operation.length()<=128 && r.revision>0
            && r.alarmAt!=null && r.alarm>0 && r.apz>r.alarm && ("relative".equals(r.mode)||"absolute".equals(r.mode));
        if(!fields)return false;
        try { return instant(r.alarmAt)==r.alarm; }
        catch(Exception error){return false;}
    }
    private Result result(Record r,String state,String reason) { return r==null
        ? new Result("","",state,reason,"",0) : new Result(r.key,r.operation,state,reason,r.alarmAt,r.revision); }
    private void commit(Record r) throws Exception {
        store.commit(r);
        if (!r.same(store.read(r.key))) throw new IllegalStateException("journal readback failed");
    }
    private Result finish(Record pending) throws Exception {
        if ("pending-cancel".equals(pending.state)) {
            device.cancel(pending.key);
            Record done=pending.state("cancelled");commit(done);
            return result(done,"cancelled","native-api-and-journal-completed");
        }
        if (!valid(pending) || !owned(pending) || !device.permitted()) {
            device.cancel(pending.key);
            Record blocked=pending.state("blocked");commit(blocked);
            return result(blocked,"not-programmed","owner-or-permission-reconfirmation-required");
        }
        if (pending.alarm<=device.now()) {
            device.cancel(pending.key);Record expired=pending.state("expired");commit(expired);
            return result(expired,"not-programmed","expired");
        }
        device.replace(pending);
        // Permission/owner may change while the OS call is in flight.
        if (!owned(pending)||!device.permitted()) {
            device.cancel(pending.key);Record blocked=pending.state("blocked");commit(blocked);
            return result(blocked,"not-programmed","owner-or-permission-reconfirmation-required");
        }
        Record done=pending.state("scheduled");commit(done);
        return result(done,"scheduled","native-api-and-journal-completed");
    }
    public Result replace(Record request,long expectedRevision,boolean confirmed,boolean apzConfirmed) {
        synchronized(LOCK) {
            if (!valid(request)||!owned(request)||!confirmed||!apzConfirmed||!device.permitted()
                ||request.alarm<=device.now()) return result(request,"not-programmed","confirmation-owner-permission-or-time");
            try {
                Record old=store.read(request.key);long revision=old==null?0:old.revision;
                boolean replay=old!=null && old.operation.equals(request.operation);
                if (replay) {
                    if (old.alarm!=request.alarm||old.apz!=request.apz||!old.mode.equals(request.mode)||!old.alarmAt.equals(request.alarmAt))
                        return result(old,"not-programmed","operation-id-conflict");
                    // Never resurrect terminal preferences through retries.
                    if (!"scheduled".equals(old.state)&&!"pending-schedule".equals(old.state))
                        return result(old,"not-programmed","terminal-requires-new-confirmation");
                    return finish(old.state("pending-schedule"));
                }
                if (revision!=expectedRevision) return result(request,"not-programmed","stale-revision");
                Record pending=new Record(request.key,request.owner,request.ownerEpoch,request.event,request.operation,revision+1,
                    request.alarmAt,request.alarm,request.apz,request.mode,"pending-schedule");
                commit(pending);return finish(pending);
            } catch(Exception error) { return result(request,"unknown","native-or-journal-incomplete"); }
        }
    }
    public Result cancel(String key,String account,String event,String operation,long expectedRevision,String ownerEpoch) {
        synchronized(LOCK) {
            Record request=new Record(key,account,ownerEpoch,event,operation,expectedRevision+1,"",0,0,"relative","pending-cancel");
            if (!owned(request)||event==null||event.trim().isEmpty()||!identity(account,event).equals(key)
                ||operation==null||operation.trim().isEmpty()||operation.length()>128)
                return result(request,"not-programmed","owner-or-identity");
            try {
                Record old=store.read(key);long revision=old==null?0:old.revision;
                if (old!=null&&old.operation.equals(operation)) {
                    if ("cancelled".equals(old.state)) return result(old,"cancelled","native-api-and-journal-completed");
                    if ("pending-cancel".equals(old.state)) return finish(old);
                    return result(old,"not-programmed","operation-id-conflict");
                }
                if(revision!=expectedRevision) return result(request,"not-programmed","stale-revision");
                commit(request);return finish(request);
            } catch(Exception error) { return result(request,"unknown","native-or-journal-incomplete"); }
        }
    }
    /** Native host invokes on boot/package update/resume. No network is needed.
     * A permission-grant event quarantines previous jobs; it never re-arms them. */
    public void recover(boolean permissionGrant) throws Exception {
        synchronized(LOCK) {
            for(Record r:store.all()) {
                if("pending-cancel".equals(r.state)) { finish(r);continue; }
                if(!"scheduled".equals(r.state)&&!"pending-schedule".equals(r.state)) continue;
                if(permissionGrant||!owned(r)||!device.permitted()) {
                    device.cancel(r.key);commit(r.state("blocked"));continue;
                }
                finish(r.state("pending-schedule"));
            }
        }
    }
    /** Inspection quarantines detected revocation/expiry, without scheduling. Persisted 'scheduled' cannot survive a
     * detected revocation as a successful response. It is not an OS alarm query. */
    public Record inspect(String key,String account) throws Exception {
        synchronized(LOCK) { if(!owned(account)) throw new SecurityException("owner unavailable");
            Record r=store.read(key);if(r!=null&&!account.equals(r.owner))throw new SecurityException("foreign record");
            if(r!=null&&("scheduled".equals(r.state)||"pending-schedule".equals(r.state))
                &&(!owned(r)||!device.permitted()||r.alarm<=device.now())) {
                device.cancel(r.key);commit(r.state(r.alarm<=device.now()?"expired":"blocked"));r=store.read(key);
            } return r;
        }
    }
    /** A stale envelope, cancelled/blocked job, another account, missing journal,
     * clock jump or delayed delivery cannot create a notification. */
    public boolean receive(String key,long revision,long scheduledAt) {
        synchronized(LOCK) {
            try {
                Record r=store.read(key);
                if(!valid(r)||!owned(r)||!device.permitted()||!"scheduled".equals(r.state)
                    ||r.revision!=revision||r.alarm!=scheduledAt) return false;
                if(!NotificationTiming.shouldAttempt(r.alarm,device.now(),true)||device.now()>=r.apz) {
                    if(device.now()>=r.alarm)commit(r.state("expired"));return false;
                }
                // Claim durably BEFORE invoking notification API: no duplicate
                // attempt after crash; uncertain delivery is never retried.
                commit(r.state("delivery-unknown"));device.notify(r);commit(r.state("attempted"));return true;
            } catch(Exception error) { return false; }
        }
    }
}
