package com.crewcheck.watch;

import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Set;

/** Pure replay state machine. Caller must atomically persist state + cache before sending ack. */
final class CrewLifeFence {
    private static final Set<String> CONTROL = Set.of("schemaVersion", "op", "streamId", "revision", "requestId", "wearChallenge");
    private static final Set<String> REQUEST = Set.of("schemaVersion", "op", "action", "streamId", "revision", "requestId");
    interface NonceSource { String next(); }
    final JSONObject state;
    final boolean clearValues;
    final CrewLifeSnapshot snapshot;
    /** Challenge or cleanup ACK. Caller sends only after durable commit. */
    final String ack;
    private CrewLifeFence(JSONObject state, boolean clear, CrewLifeSnapshot snapshot, String ack) {
        this.state=state; this.clearValues=clear; this.snapshot=snapshot; this.ack=ack;
    }
    static CrewLifeFence control(JSONObject previous, String raw, String node) {
        return control(previous,raw,node,CrewLifeFence::secureNonce);
    }
    static CrewLifeFence control(JSONObject previous, String raw, String node, NonceSource random) {
        JSONObject state = copy(previous);
        try {
            if (node == null || node.isBlank() || node.length()>256 || raw == null || raw.getBytes(StandardCharsets.UTF_8).length>4096)
                throw new IllegalArgumentException();
            JSONObject c = new JSONObject(raw);
            boolean requesting = "challenge_request".equals(c.opt("op"));
            CrewLifeSnapshot.only(c, requesting ? REQUEST : CONTROL);
            if (CrewLifeSnapshot.integer(c.opt("schemaVersion")) != 2) throw new IllegalArgumentException();
            String stream=CrewLifeSnapshot.nonce(c.opt("streamId"));
            String request=CrewLifeSnapshot.nonce(c.opt("requestId"));
            long revision=CrewLifeSnapshot.positive(c.opt("revision"));
            Object action=requesting ? c.opt("action") : c.opt("op");
            if (!("reset".equals(action)||"revoke".equals(action))) throw new IllegalArgumentException();
            String op=(String)action;
            JSONObject pending=state.optJSONObject("pendingChallenge");
            if(requesting) {
                if(!tuple(pending,node,op,stream,revision,request)) {
                    String nonce=challenge(random.next());
                    JSONObject receipt=state.optJSONObject("appliedReceipt");
                    if ((pending!=null && nonce.equals(pending.optString("wearChallenge")))
                            || (receipt!=null && nonce.equals(receipt.optString("wearChallenge"))))
                        throw new IllegalArgumentException("Nonce collision.");
                    pending=new JSONObject().put("node",node).put("action",op).put("streamId",stream)
                            .put("revision",revision).put("requestId",request).put("wearChallenge",nonce);
                    state.put("pendingChallenge",pending);
                }
                return new CrewLifeFence(state,false,null,response("challenge",op,stream,revision,request,
                        challenge(pending.opt("wearChallenge")),false));
            }
            String nonce=challenge(c.opt("wearChallenge"));
            String current=state.optString("streamId");
            boolean same=stream.equals(current) && node.equals(state.optString("node"));
            long high=state.optLong("revision");
            JSONObject receipt=state.optJSONObject("appliedReceipt");
            if(same && high>=revision && tuple(receipt,node,op,stream,revision,request)
                    && nonce.equals(receipt.optString("wearChallenge"))
                    && state.optBoolean("revoked")=="revoke".equals(op))
                return new CrewLifeFence(state,false,null,response(op+"_ack",op,stream,revision,request,nonce,true));
            if(!tuple(pending,node,op,stream,revision,request) || !nonce.equals(pending.optString("wearChallenge")))
                return unchanged(previous);
            JSONArray retired=state.optJSONArray("retiredStreams");
            if(retired==null) retired=new JSONArray();
            if(same) {
                boolean confirmTombstone="revoke".equals(op) && revision==high && state.optBoolean("revoked")
                        && "data".equals(state.optString("op"));
                if((!confirmTombstone && revision<=high) || ("reset".equals(op) && state.optBoolean("revoked"))) return unchanged(previous);
            } else {
                if(!"reset".equals(op) || stream.equals(current)) return unchanged(previous);
                for(int i=0;i<retired.length();i++) if(stream.equals(retired.optString(i))) return unchanged(previous);
                if(!current.isEmpty()) { if(retired.length()>=256) throw new IllegalArgumentException(); retired.put(current); }
            }
            // One transaction in WellbeingStore clears ciphertext and installs this consumed receipt/fence.
            state.put("streamId",stream).put("node",node).put("revision",revision).put("requestId",request)
                    .put("op",op).put("revoked","revoke".equals(op)).put("fingerprint","").put("retiredStreams",retired)
                    .put("appliedReceipt",new JSONObject(pending.toString()));
            state.remove("pendingChallenge");
            return new CrewLifeFence(state,true,null,response(op+"_ack",op,stream,revision,request,nonce,true));
        } catch(Exception invalid) { return new CrewLifeFence(state,true,null,null); }
    }
    private static boolean tuple(JSONObject tuple,String node,String action,String stream,long revision,String request) {
        return tuple!=null && node.equals(tuple.optString("node")) && action.equals(tuple.optString("action"))
                && stream.equals(tuple.optString("streamId")) && revision==tuple.optLong("revision")
                && request.equals(tuple.optString("requestId"));
    }
    private static String challenge(Object value) {
        if(!(value instanceof String) || !((String)value).matches("[0-9a-f]{64}"))
            throw new IllegalArgumentException("256-bit Wear challenge required.");
        return (String)value;
    }
    private static String secureNonce() {
        byte[] bytes=new byte[32];new java.security.SecureRandom().nextBytes(bytes);
        StringBuilder out=new StringBuilder();for(byte b:bytes)out.append(String.format(java.util.Locale.ROOT,"%02x",b&255));
        return out.toString();
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
    private static String response(String op,String action,String stream,long revision,String request,String nonce,boolean cleared) throws Exception {
        JSONObject out=new JSONObject().put("schemaVersion",2).put("op",op).put("streamId",stream)
                .put("revision",revision).put("requestId",request).put("wearChallenge",nonce);
        if(cleared) out.put("status","cleared"); else out.put("action",action);
        return out.toString();
    }
}
