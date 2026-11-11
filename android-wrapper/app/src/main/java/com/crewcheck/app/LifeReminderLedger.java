package com.crewcheck.app;

import org.json.JSONObject;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.Set;
import java.util.UUID;
import java.util.Arrays;
import java.util.HashSet;

/** Local cancellation fence, not an authenticated lease or reboot restoration authority. */
public final class LifeReminderLedger {
    public static final String PREFIX = "life1-";
    static final int LIMIT = 64;
    public interface Store { String read() throws Exception; void write(String json) throws Exception; }
    public interface Owner { String context() throws Exception; }
    public interface Device {
        long now();
        void cancel(String key) throws Exception;
        void arm(String key, String context, long at, String title, String body) throws Exception;
    }
    private final Store store; private final Owner owner; private final Device device;
    public LifeReminderLedger(Store store, Owner owner, Device device) { this.store=store; this.owner=owner; this.device=device; }
    public static boolean lifeKey(String key) {
        try { return key!=null && key.startsWith(PREFIX) && key.length()==42 && UUID.fromString(key.substring(PREFIX.length())).toString().equals(key.substring(PREFIX.length())); }
        catch (Exception invalid) { return false; }
    }
    static boolean validId(String id) {
        if (id == null || !id.matches("(hydration|movement|study):[0-9]{4}-[0-9]{2}-[0-9]{2}:[a-z0-9_-]{1,24}")) return false;
        try { LocalDate.parse(id.split(":")[1]); return true; } catch (Exception invalid) { return false; }
    }
    private static long integer(Object value) {
        if (!(value instanceof Number)) throw new IllegalArgumentException("integer required");
        double n=((Number)value).doubleValue(); long result=((Number)value).longValue();
        if (!Double.isFinite(n) || n != result || result < 0 || result > 9_007_199_254_740_991L) throw new IllegalArgumentException("invalid integer");
        return result;
    }
    private static void keys(JSONObject object, Set<String> allowed) {
        for (Iterator<String> i=object.keys();i.hasNext();) if (!allowed.contains(i.next())) throw new IllegalArgumentException("unknown field");
    }
    private static Set<String> set(String... values) { return new HashSet<>(Arrays.asList(values)); }
    private static ArrayList<String> names(JSONObject object) {
        ArrayList<String> result=new ArrayList<>(); for (Iterator<String> i=object.keys();i.hasNext();) result.add(i.next()); return result;
    }
    private JSONObject load(String context) throws Exception {
        String raw=store.read();
        if (raw == null || raw.isEmpty()) return new JSONObject().put("schemaVersion",1).put("context",context).put("records",new JSONObject());
        if (raw.length()>65_536) throw new IllegalStateException("journal size");
        JSONObject journal=new JSONObject(raw);
        keys(journal,set("schemaVersion","context","records"));
        if (integer(journal.get("schemaVersion"))!=1 || !(journal.get("context") instanceof String)) throw new IllegalStateException("journal schema");
        JSONObject records=journal.getJSONObject("records");
        if (records.length()>LIMIT) throw new IllegalStateException("journal limit");
        for (Iterator<String> i=records.keys();i.hasNext();) {
            String id=i.next(); JSONObject r=records.getJSONObject(id);
            keys(r,set("revision","fingerprint","at","phase","key","cleanup"));
            if (!validId(id) || integer(r.get("revision"))<1 || !(r.get("fingerprint") instanceof String)
                    || !r.getString("fingerprint").matches("[0-9a-f]{64}") || integer(r.get("at"))<1
                    || !set("cancel_pending","arm_pending","armed","cancelled","consumed","failed").contains(r.getString("phase"))
                    || !(r.get("key") instanceof String) || (!r.getString("key").isEmpty() && !lifeKey(r.getString("key")))) throw new IllegalStateException("journal record");
            JSONObject cleanup=r.getJSONObject("cleanup");
            if (cleanup.length()>8) throw new IllegalStateException("cleanup limit");
            for (Iterator<String> c=cleanup.keys();c.hasNext();) { String key=c.next(); if (!lifeKey(key) || integer(cleanup.get(key))<1) throw new IllegalStateException("cleanup record"); }
        }
        // Account generation or boot changed: old tickets cannot display or be restored.
        if (!context.equals(journal.getString("context"))) return new JSONObject().put("schemaVersion",1).put("context",context).put("records",new JSONObject());
        for (String id:names(records)) {
            JSONObject record=records.getJSONObject(id);
            // A failed OS cancellation remains recoverable regardless of the replacement time.
            if (record.getJSONObject("cleanup").length()==0 && record.getLong("at")+120_000<device.now()) records.remove(id);
        }
        return journal;
    }
    private void save(JSONObject journal) throws Exception {
        String json=journal.toString(); store.write(json);
        if (!json.equals(store.read())) throw new IllegalStateException("journal receipt not confirmed");
    }
    private static String receipt(String status, String id, long revision) {
        try { return new JSONObject().put("schemaVersion",1).put("module","life").put("ok",set("accepted","cancelled").contains(status))
                .put("status",status).put("id",id).put("revision",revision).put("deliveryConfirmed",false).toString(); }
        catch (Exception impossible) { return "{\"ok\":false,\"status\":\"unavailable\",\"deliveryConfirmed\":false}"; }
    }
    static String unavailableUpdate() { return receipt("uncertain","",0); }
    public String state() {
        synchronized (NotificationLedger.LOCK) {
            try {
                String context=owner.context(); if (context==null || context.isEmpty()) return "{\"schemaVersion\":1,\"module\":\"life\",\"available\":false}";
                JSONObject records=load(context).getJSONObject("records"), result=new JSONObject();
                for (Iterator<String> i=records.keys();i.hasNext();) { String id=i.next(); JSONObject r=records.getJSONObject(id);
                    result.put(id,new JSONObject().put("revision",r.getLong("revision")).put("phase",r.getString("phase")).put("at",r.getLong("at"))); }
                return new JSONObject().put("schemaVersion",1).put("module","life").put("available",true).put("context",context).put("records",result).toString();
            } catch (Exception unavailable) { return "{\"schemaVersion\":1,\"module\":\"life\",\"available\":false}"; }
        }
    }
    public String update(String raw) {
        synchronized (NotificationLedger.LOCK) {
            String id=""; long revision=0;
            try {
                if (raw==null || raw.length()>8192) return receipt("rejected",id,revision);
                JSONObject request=new JSONObject(raw);
                for (String field:set("op","context","id")) if (!(request.opt(field) instanceof String)) return receipt("rejected",id,revision);
                String op=request.getString("op");
                keys(request,op.equals("replace")?set("schemaVersion","op","context","id","revision","at","title","body"):
                        set("schemaVersion","op","context","id","revision"));
                id=request.getString("id"); revision=integer(request.get("revision"));
                if (integer(request.get("schemaVersion"))!=1 || !validId(id) || revision<1 || !set("replace","cancel").contains(op)) return receipt("rejected",id,revision);
                String context=owner.context();
                if (context==null || context.isEmpty() || !context.equals(request.getString("context"))) return receipt("wrong_context",id,revision);
                long at=op.equals("replace")?integer(request.get("at")):device.now();
                if (op.equals("replace") && (!(request.opt("title") instanceof String) || !(request.opt("body") instanceof String))) return receipt("rejected",id,revision);
                String title=op.equals("replace")?request.getString("title"):"", body=op.equals("replace")?request.getString("body"):"";
                if (op.equals("replace") && (at<1 || at>Long.MAX_VALUE-120_000 || title.trim().isEmpty() || title.length()>120 || body.length()>500)) return receipt("rejected",id,revision);
                String payloadHash=NotificationIdentity.key(title,body,op.equals("replace")?at:0);
                String fingerprint=NotificationIdentity.key(op+":"+revision+":"+id,payloadHash,0);
                JSONObject journal=load(context), records=journal.getJSONObject("records"), previous=records.optJSONObject(id);
                if (previous!=null && revision<previous.getLong("revision")) return receipt("stale_revision",id,revision);
                if (previous!=null && revision==previous.getLong("revision")) {
                    if (!fingerprint.equals(previous.getString("fingerprint"))) return receipt("revision_conflict",id,revision);
                    String phase=previous.getString("phase");
                    if (phase.equals("armed") || phase.equals("consumed")) return receipt("accepted",id,revision);
                    if (phase.equals("cancelled")) return receipt("cancelled",id,revision);
                    if (phase.equals("arm_pending")) return receipt("uncertain",id,revision); // Never replay an uncertain OS arm.
                    if (phase.equals("failed")) return receipt("failed",id,revision);
                } else {
                    // Existing receipts reconcile even after their scheduled time; only a new arm requires the future.
                    if (op.equals("replace") && at<=device.now()) return receipt("rejected",id,revision);
                    if (previous==null && op.equals("cancel")) return receipt("not_found",id,revision);
                    if (previous==null && records.length()>=LIMIT) return receipt("limit",id,revision);
                    JSONObject cleanup=previous==null?new JSONObject():new JSONObject(previous.getJSONObject("cleanup").toString());
                    if (previous!=null && !previous.getString("key").isEmpty()) cleanup.put(previous.getString("key"),previous.getLong("at"));
                    if (cleanup.length()>8) return receipt("limit",id,revision);
                    previous=new JSONObject().put("revision",revision).put("fingerprint",fingerprint).put("phase","cancel_pending")
                            .put("at",op.equals("replace")?at:previous.getLong("at")).put("key","").put("cleanup",cleanup);
                    records.put(id,previous); save(journal); // Old receiver eligibility removed BEFORE OS cancellation.
                }
                JSONObject cleanup=previous.getJSONObject("cleanup"); boolean partial=false;
                for (String key:names(cleanup)) {
                    try { device.cancel(key); cleanup.remove(key); } catch (Exception failure) { partial=true; }
                }
                save(journal);
                if (partial) return receipt("partial",id,revision);
                if (!context.equals(owner.context())) return receipt("wrong_context",id,revision);
                if (op.equals("cancel")) { previous.put("phase","cancelled"); save(journal); return receipt("cancelled",id,revision); }
                if (at<=device.now()) { previous.put("phase","failed"); save(journal); return receipt("expired",id,revision); }
                String key=PREFIX+UUID.randomUUID(); previous.put("key",key).put("phase","arm_pending"); save(journal);
                try { device.arm(key,context,at,title,body); }
                catch (Exception failed) {
                    try { device.cancel(key); previous.put("key","").put("phase","failed"); save(journal); } catch (Exception uncertain) { return receipt("uncertain",id,revision); }
                    return receipt("failed",id,revision);
                }
                if (!context.equals(owner.context())) { try { device.cancel(key); } catch (Exception ignored) {} return receipt("wrong_context",id,revision); }
                previous.put("phase","armed"); save(journal); return receipt("accepted",id,revision);
            } catch (Exception uncertain) { return receipt("uncertain",id,revision); }
        }
    }
    public boolean claim(String key,String context,long at) {
        synchronized (NotificationLedger.LOCK) {
            try {
                if (!lifeKey(key) || context==null || !context.equals(owner.context()) || !NotificationTiming.shouldAttempt(at,device.now(),true)) return false;
                JSONObject journal=load(context), records=journal.getJSONObject("records");
                for (Iterator<String> i=records.keys();i.hasNext();) {
                    JSONObject r=records.getJSONObject(i.next());
                    if (key.equals(r.getString("key")) && r.getString("phase").equals("armed") && at==r.getLong("at")) {
                        r.put("phase","consumed"); save(journal); return true;
                    }
                }
            } catch (Exception unavailable) { /* no display receipt */ }
            return false;
        }
    }
}
