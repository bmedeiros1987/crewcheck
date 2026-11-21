package com.crewcheck.app;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Grouped local alarms (in-flight rest, validity, report reminders). Pure: the
 * Android adapter supplies storage, the account fence epoch, the boot id and the OS.
 * A group is replaced or cancelled as a whole, so a revised plan never leaves an old
 * alarm armed. Entries are bound to the existing account cancellation epoch and to
 * the boot they were armed in: logout/account change or a reboot invalidates them,
 * and nothing is restored after a reboot (the caller reschedules with the app open).
 * Titles and bodies are never journaled. */
public final class LocalAlarmLedger {
    public static final int MAX_GROUP_JOBS = 16, MAX_JOBS = 128;
    /** Inexact alarms can be deferred by Doze; a late wake-up is still delivered within this window. */
    public static final long LATE_WINDOW = 20 * 60_000L;
    static final long MAX_AHEAD = 400L * 24 * 3_600_000L;
    private static final String GROUP = "(?:inflight-rest|validity|report|roster-change):[A-Za-z0-9._:-]{1,96}";
    private static final String ID = "[A-Za-z0-9._:-]{1,160}";
    private static boolean uncertain;

    public static final class Entry {
        public final String key, group, id, epoch, boot, channel; public final long at;
        public Entry(String key,String group,String id,String epoch,String boot,String channel,long at){
            this.key=key;this.group=group;this.id=id;this.epoch=epoch;this.boot=boot;this.channel=channel;this.at=at;
        }
    }
    public static final class Job {
        public final String id, channel, title, body; public final long at;
        public Job(String id,long at,String channel,String title,String body){this.id=id;this.at=at;this.channel=channel;this.title=title;this.body=body;}
    }
    public interface Store {
        Map<String,Entry> entries() throws Exception;
        void commit(Map<String,Entry> entries) throws Exception;
    }
    public interface Device {
        long now();
        /** Current account cancellation epoch; empty while signed out or uncertain. */
        String epoch();
        String boot();
        boolean permitted();
        void arm(Entry entry,Job job) throws Exception;
        void cancel(String key) throws Exception;
    }
    public static final class Result {
        public final boolean ok; public final String reason; public final List<Entry> armed;
        Result(boolean ok,String reason,List<Entry> armed){this.ok=ok;this.reason=reason;this.armed=armed;}
    }
    private final Store store; private final Device device;
    public LocalAlarmLedger(Store store,Device device){this.store=store;this.device=device;}

    public static boolean validGroup(String group){return group!=null&&group.matches(GROUP);}
    static boolean validChannel(String channel){return "alarm".equals(channel)||"vibrate".equals(channel)||"default".equals(channel);}
    static String key(String group,String id,long at,String epoch){return NotificationIdentity.key("local-alarm:"+group+":"+id,epoch,at);}
    private static Result fail(String reason){return new Result(false,reason,new ArrayList<>());}

    private boolean current(Entry e,String epoch,String boot){return e!=null&&!epoch.isEmpty()&&epoch.equals(e.epoch)&&boot.equals(e.boot);}

    /** Atomically replaces every alarm of the group. All-or-nothing: on any failure the group ends empty. */
    public Result replace(String group,List<Job> jobs) {
        synchronized(NotificationLedger.LOCK) {
            String epoch=device.epoch(),boot=device.boot();long now=device.now();
            if(!validGroup(group))return fail("invalid-group");
            if(jobs==null||jobs.size()>MAX_GROUP_JOBS)return fail("invalid-jobs");
            Set<String> ids=new HashSet<>();
            for(Job job:jobs){
                if(job==null||job.id==null||!job.id.matches(ID)||!ids.add(job.id)||!validChannel(job.channel)
                    ||job.at<=now||job.at>now+MAX_AHEAD||job.title==null||job.title.length()>120||job.body==null||job.body.length()>400)
                    return fail("invalid-jobs");
            }
            if(epoch==null||epoch.isEmpty())return fail("signed-out");
            if(!jobs.isEmpty()&&!device.permitted())return fail("notifications-not-permitted");
            try {
                // Invalidate first: a failed OS cancel can never make an old intent claimable.
                Map<String,Entry> entries=new HashMap<>(store.entries());
                List<String> old=new ArrayList<>();
                entries.values().removeIf(e->{boolean drop=group.equals(e.group)||!current(e,epoch,boot)||e.at+LATE_WINDOW<now;if(drop)old.add(e.key);return drop;});
                if(entries.size()+jobs.size()>MAX_JOBS){commitChecked(entries);cancelAll(old);return fail("too-many-alarms");}
                commitChecked(entries);
                // A failed OS cancel only leaves an intent the receiver can no longer claim.
                cancelAll(old);
                List<Entry> armed=new ArrayList<>();
                for(Job job:jobs){
                    Entry entry=new Entry(key(group,job.id,job.at,epoch),group,job.id,epoch,boot,job.channel,job.at);
                    entries.put(entry.key,entry);commitChecked(entries);
                    try { device.arm(entry,job); armed.add(entry); }
                    catch(Exception error){ rollback(group); return fail("arm-failed"); }
                    // The account fence may move while the OS call is in flight.
                    if(!epoch.equals(device.epoch())){ rollback(group); return fail("account-changed"); }
                }
                uncertain=false;
                return new Result(true,jobs.isEmpty()?"cleared":"scheduled",armed);
            } catch(Exception error) { uncertain=true; try{rollback(group);}catch(Exception ignored){} return fail("journal-incomplete"); }
        }
    }
    public Result cancel(String group){return replace(group,new ArrayList<>());}

    private void rollback(String group) throws Exception {
        Map<String,Entry> entries=new HashMap<>(store.entries());List<String> keys=new ArrayList<>();
        entries.values().removeIf(e->{boolean drop=group.equals(e.group);if(drop)keys.add(e.key);return drop;});
        commitChecked(entries);cancelAll(keys);
    }
    private boolean cancelAll(List<String> keys){boolean ok=true;for(String key:keys)try{device.cancel(key);}catch(Exception error){ok=false;}return ok;}
    private void commitChecked(Map<String,Entry> entries) throws Exception {
        store.commit(entries);
        if(!entries.keySet().equals(store.entries().keySet()))throw new IllegalStateException("local alarm journal readback failed");
    }

    /** Called after every account fence change: drops alarms armed under another epoch or boot. */
    public boolean fence() {
        synchronized(NotificationLedger.LOCK) {
            try {
                String epoch=device.epoch(),boot=device.boot();
                Map<String,Entry> entries=new HashMap<>(store.entries());List<String> stale=new ArrayList<>();
                entries.values().removeIf(e->{boolean drop=!current(e,epoch==null?"":epoch,boot);if(drop)stale.add(e.key);return drop;});
                commitChecked(entries);uncertain=false;
                return cancelAll(stale);
            } catch(Exception error){uncertain=true;return false;}
        }
    }

    /** Receiver side. Consumes the entry once; caller holds NotificationLedger.LOCK through notify. */
    public Entry claim(String key,String epoch,long at) {
        synchronized(NotificationLedger.LOCK) {
            try {
                if(uncertain||key==null||epoch==null)return null;
                String currentEpoch=device.epoch(),boot=device.boot();long now=device.now();
                Map<String,Entry> entries=new HashMap<>(store.entries());Entry e=entries.get(key);
                if(!current(e,currentEpoch==null?"":currentEpoch,boot)||!epoch.equals(e.epoch)||e.at!=at)return null;
                entries.remove(key);commitChecked(entries);
                return device.permitted()&&now>=e.at&&now-e.at<=LATE_WINDOW?e:null;
            } catch(Exception error){uncertain=true;return null;}
        }
    }

    /** Entries still eligible to ring for this group, in time order. Reboot or account change leaves none. */
    public List<Entry> group(String group) throws Exception {
        synchronized(NotificationLedger.LOCK) {
            List<Entry> out=new ArrayList<>();if(!validGroup(group))return out;
            String epoch=device.epoch();String boot=device.boot();long now=device.now();
            for(Entry e:store.entries().values())if(group.equals(e.group)&&current(e,epoch==null?"":epoch,boot)&&e.at+LATE_WINDOW>=now)out.add(e);
            out.sort((a,b)->Long.compare(a.at,b.at));return out;
        }
    }
    static boolean uncertain(){synchronized(NotificationLedger.LOCK){return uncertain;}}
}
