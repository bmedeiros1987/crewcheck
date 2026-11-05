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
            try { validateJournal(state); }
            catch(IllegalArgumentException corrupt) { return new CrewLifeFence(new JSONObject(),true,null,null); }
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
                    state.put("journalVersion",1).put("journalPhase",state.has("streamId")?"active":"pending").put("pendingChallenge",pending);
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
                // After journal loss, challenged revoke may install only a revoked fence.
                // A revoke for another active stream cannot replace its generation.
                if((!"reset".equals(op) && !current.isEmpty()) || stream.equals(current)) return unchanged(previous);
                for(int i=0;i<retired.length();i++) if(stream.equals(retired.optString(i))) return unchanged(previous);
                if(!current.isEmpty()) { if(retired.length()>=256) throw new IllegalArgumentException(); retired.put(current); }
            }
            // One transaction in WellbeingStore clears ciphertext and installs this consumed receipt/fence.
            state.put("streamId",stream).put("node",node).put("revision",revision).put("requestId",request)
                    .put("op",op).put("revoked","revoke".equals(op)).put("fingerprint","").put("retiredStreams",retired)
                    .put("appliedReceipt",new JSONObject(pending.toString())).put("lastKind",op).put("journalPhase","active");
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
        try { validateJournal(state); }
        catch(IllegalArgumentException corrupt) { return new CrewLifeFence(new JSONObject(),true,null,null); }
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
                    .put("revoked",s.kind.equals("revoked")).put("lastKind",s.kind);
            return new CrewLifeFence(state,true,s.kind.equals("revoked")?null:s,null);
        } catch(Exception invalid) {
            // Preserve high water but poison the duplicate fingerprint: rejected data cannot resurrect cached values.
            try { state.put("fingerprint",""); } catch(Exception ignored) { }
            return new CrewLifeFence(state,true,null,null);
        }
    }
    private static final Set<String> JOURNAL_FIELDS=Set.of("journalVersion","journalPhase","node","streamId","revision",
            "requestId","op","revoked","fingerprint","retiredStreams","appliedReceipt","pendingChallenge","lastKind");
    private static final Set<String> TUPLE_FIELDS=Set.of("node","action","streamId","revision","requestId","wearChallenge");
    /** Persisted security state is a closed schema; missing fields never imply false/zero. */
    static void validateJournal(JSONObject state) {
        try {
            if(state.length()==0) return;
            CrewLifeSnapshot.only(state,JOURNAL_FIELDS);
            if(CrewLifeSnapshot.integer(state.opt("journalVersion"))!=1) throw new IllegalArgumentException();
            if(state.has("pendingChallenge")) validateTuple(state.getJSONObject("pendingChallenge"));
            String phase=journalText(state,"journalPhase");
            if(phase.equals("pending")) {
                if(state.length()!=3 || !state.has("pendingChallenge")) throw new IllegalArgumentException();
                return;
            }
            if(!phase.equals("active")) throw new IllegalArgumentException();
            String stream=CrewLifeSnapshot.nonce(state.opt("streamId"));
            String node=journalNode(state.opt("node"));
            long revision=CrewLifeSnapshot.positive(state.opt("revision"));
            Object revoked=state.opt("revoked");
            if(!(revoked instanceof Boolean)) throw new IllegalArgumentException();
            String op=journalText(state,"op"),kind=journalText(state,"lastKind");
            String fingerprint=journalText(state,"fingerprint");
            if(!fingerprint.matches("(?:|[0-9a-f]{64})")) throw new IllegalArgumentException();
            String request=journalText(state,"requestId");
            JSONObject receipt=state.getJSONObject("appliedReceipt");validateTuple(receipt);
            if(!stream.equals(receipt.getString("streamId"))||!node.equals(receipt.getString("node"))) throw new IllegalArgumentException();
            long applied=CrewLifeSnapshot.positive(receipt.opt("revision"));
            if(applied>revision) throw new IllegalArgumentException();
            if(op.equals("data")) {
                if(!request.isEmpty() || applied>=revision || !(kind.equals("snapshot")||kind.equals("revoked"))
                        || ((Boolean)revoked)!=kind.equals("revoked")) throw new IllegalArgumentException();
            } else if(op.equals("reset")||op.equals("revoke")) {
                CrewLifeSnapshot.nonce(request);
                if(applied!=revision || !request.equals(receipt.getString("requestId")) || !op.equals(receipt.getString("action"))
                        || !kind.equals(op) || !fingerprint.isEmpty() || ((Boolean)revoked)!=op.equals("revoke"))
                    throw new IllegalArgumentException();
            } else throw new IllegalArgumentException();
            if(receipt.getString("action").equals("revoke")&&!((Boolean)revoked)) throw new IllegalArgumentException();
            JSONArray retired=state.getJSONArray("retiredStreams");
            if(retired.length()>256) throw new IllegalArgumentException();
            java.util.Set<String> seen=new java.util.HashSet<>();
            for(int i=0;i<retired.length();i++) {
                String old=CrewLifeSnapshot.nonce(retired.opt(i));
                if(old.equals(stream)||!seen.add(old)) throw new IllegalArgumentException();
            }
        } catch(Exception invalid) { throw new IllegalArgumentException("Corrupt CrewLife receiver journal.",invalid); }
    }
    static boolean canReadCiphertext(JSONObject state) {
        validateJournal(state);
        return state.has("streamId") && state.optString("op").equals("data")
                && state.optString("lastKind").equals("snapshot") && !state.optString("fingerprint").isEmpty();
    }
    private static String journalText(JSONObject json,String key) {
        Object value=json.opt(key);if(!(value instanceof String))throw new IllegalArgumentException();return (String)value;
    }
    private static String journalNode(Object value) {
        if(!(value instanceof String)||((String)value).isBlank()||((String)value).length()>256) throw new IllegalArgumentException();
        return (String)value;
    }
    private static void validateTuple(JSONObject tuple) {
        CrewLifeSnapshot.only(tuple,TUPLE_FIELDS);
        journalNode(tuple.opt("node"));CrewLifeSnapshot.nonce(tuple.opt("streamId"));
        CrewLifeSnapshot.positive(tuple.opt("revision"));CrewLifeSnapshot.nonce(tuple.opt("requestId"));
        challenge(tuple.opt("wearChallenge"));
        String action=journalText(tuple,"action");if(!(action.equals("reset")||action.equals("revoke")))throw new IllegalArgumentException();
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
