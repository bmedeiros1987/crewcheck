package com.crewcheck.watch;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

/** Pure replay state machine. Caller must atomically persist state + cache before sending ack. */
final class CrewLifeFence {
    private static final Set<String> CONTROL = Set.of("schemaVersion", "op", "streamId", "revision", "requestId");
    final JSONObject state;
    final boolean clearValues;
    final CrewLifeSnapshot snapshot;
    final String ack;
    private CrewLifeFence(JSONObject state, boolean clear, CrewLifeSnapshot snapshot, String ack) {
        this.state=state; this.clearValues=clear; this.snapshot=snapshot; this.ack=ack;
    }
    static CrewLifeFence control(JSONObject previous, String raw, String node) {
        JSONObject state = copy(previous);
        try {
            if (node == null || node.isBlank() || node.length()>256 || raw == null || raw.getBytes(StandardCharsets.UTF_8).length>4096)
                throw new IllegalArgumentException();
            JSONObject c = new JSONObject(raw);
            CrewLifeSnapshot.only(c, CONTROL);
            if (CrewLifeSnapshot.integer(c.opt("schemaVersion")) != 2) throw new IllegalArgumentException();
            String stream=CrewLifeSnapshot.nonce(c.opt("streamId"));
            String request=CrewLifeSnapshot.nonce(c.opt("requestId"));
            long revision=CrewLifeSnapshot.positive(c.opt("revision"));
            Object op=c.opt("op");
            if (!("reset".equals(op)||"revoke".equals(op))) throw new IllegalArgumentException();
            String current=state.optString("streamId");
            boolean same=stream.equals(current) && node.equals(state.optString("node"));
            long high=state.optLong("revision");
            if (same && revision==high && request.equals(state.optString("requestId")) && op.equals(state.optString("op")))
                return new CrewLifeFence(state, false, null, ack((String)op,stream,revision,request));
            JSONArray retired=state.optJSONArray("retiredStreams");
            if (retired==null) retired=new JSONArray();
            if (same) {
                boolean confirmTombstone = "revoke".equals(op) && revision == high && state.optBoolean("revoked")
                        && "data".equals(state.optString("op"));
                if ((!confirmTombstone && revision<=high) || ("reset".equals(op) && state.optBoolean("revoked"))) return unchanged(previous);
            } else {
                if (!"reset".equals(op) || stream.equals(current)) return unchanged(previous);
                for(int i=0;i<retired.length();i++) if(stream.equals(retired.optString(i))) return unchanged(previous);
                // Never prune replay history. Exhaustion fails closed instead of permitting old streams.
                if (!current.isEmpty()) { if(retired.length()>=256) throw new IllegalArgumentException(); retired.put(current); }
            }
            state.put("streamId",stream).put("node",node).put("revision",revision).put("requestId",request)
                    .put("op",op).put("revoked","revoke".equals(op)).put("fingerprint","").put("retiredStreams",retired);
            return new CrewLifeFence(state,true,null,ack((String)op,stream,revision,request));
        } catch(Exception invalid) { return new CrewLifeFence(state,true,null,null); }
    }
    static CrewLifeFence data(JSONObject previous, String raw, String node, long now) {
        JSONObject state=copy(previous);
        if(node==null || !node.equals(state.optString("node")) || state.optString("streamId").isEmpty()) return unchanged(previous);
        try {
            CrewLifeSnapshot s=CrewLifeSnapshot.fromJson(raw,now);
            if(!s.streamId.equals(state.optString("streamId"))) return unchanged(previous);
            long high=state.optLong("revision");
            if(s.revision<high) return unchanged(previous);
            String fingerprint=digest(raw);
            if(s.revision==high) {
                if(fingerprint.equals(state.optString("fingerprint"))) return unchanged(previous);
                state.put("fingerprint","");
                return new CrewLifeFence(state,true,null,null);
            }
            if(state.optBoolean("revoked") && !s.kind.equals("revoked")) return unchanged(previous);
            state.put("revision",s.revision).put("fingerprint",fingerprint).put("requestId","").put("op","data")
                    .put("revoked",s.kind.equals("revoked"));
            return new CrewLifeFence(state,true,s.kind.equals("revoked")?null:s,null);
        } catch(Exception invalid) {
            // Preserve high water but poison the duplicate fingerprint: rejected data cannot resurrect cached values.
            try { state.put("fingerprint",""); } catch(Exception ignored) { }
            return new CrewLifeFence(state,true,null,null);
        }
    }
    private static CrewLifeFence unchanged(JSONObject previous) { return new CrewLifeFence(copy(previous),false,null,null); }
    private static JSONObject copy(JSONObject state) {
        try { return state==null?new JSONObject():new JSONObject(state.toString()); }
        catch(Exception invalid) { throw new IllegalStateException(invalid); }
    }
    private static String digest(String raw) throws Exception {
        byte[] hash=MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
        StringBuilder text=new StringBuilder(); for(byte b:hash) text.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        return text.toString();
    }
    private static String ack(String op,String stream,long revision,String request) throws Exception {
        return new JSONObject().put("schemaVersion",2).put("op",op+"_ack").put("streamId",stream)
                .put("revision",revision).put("requestId",request).put("status","cleared").toString();
    }
}
