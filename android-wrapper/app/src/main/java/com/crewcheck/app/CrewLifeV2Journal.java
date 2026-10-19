package com.crewcheck.app;

import org.json.JSONObject;
import java.util.Iterator;
import java.util.Set;
import java.util.UUID;

/** Durable protocol authority only: never stores health values or account identifiers. */
final class CrewLifeV2Journal {
    final JSONObject data;
    CrewLifeV2Journal(String raw) throws Exception {
        data = raw.isEmpty() ? new JSONObject().put("schemaVersion", 2).put("streamId", UUID.randomUUID().toString()).put("revision", 1)
                .put("revoked", true).put("nodes", new JSONObject()) : new JSONObject(raw);
        CrewLifeV2Protocol.keys(data, Set.of("schemaVersion", "streamId", "revision", "revoked", "nodes"));
        if (CrewLifeV2Protocol.integer(data.opt("schemaVersion"), 0) != 2 || !(data.opt("revoked") instanceof Boolean))
            throw new IllegalArgumentException("Invalid journal schema");
        if (!uuid(data.opt("streamId"))) throw new IllegalArgumentException("Invalid stream UUID");
        if (CrewLifeV2Protocol.integer(data.opt("revision"), 0) <= 0) throw new IllegalArgumentException("Invalid journal");
        JSONObject storedNodes = data.getJSONObject("nodes");
        for (Iterator<String> i = storedNodes.keys(); i.hasNext();) {
            String node = i.next();
            JSONObject record = storedNodes.optJSONObject(node);
            if (!validRecord(record)) storedNodes.put(node, pending());
            // Keep the node as pending: dropping it could falsely certify an offline peer.
        }
    }
    private static JSONObject pending() throws Exception { return new JSONObject().put("ready", false).put("cleared", false); }
    private static boolean uuid(Object value) {
        try { return value instanceof String && UUID.fromString((String)value).toString().equals(value); }
        catch (Exception invalid) { return false; }
    }
    private boolean validRecord(JSONObject r) {
        try {
            if (r == null) return false;
            CrewLifeV2Protocol.keys(r, Set.of("schemaVersion", "op", "streamId", "revision", "requestId", "wearChallenge", "ready", "cleared", "receipt"));
            if (!(r.opt("ready") instanceof Boolean) || !(r.opt("cleared") instanceof Boolean)) return false;
            if (r.length() == 2) return !r.getBoolean("ready") && !r.getBoolean("cleared");
            if (CrewLifeV2Protocol.integer(r.opt("schemaVersion"), -1) != 2 || !uuid(r.opt("streamId"))
                    || !stream().equals(r.opt("streamId")) || !uuid(r.opt("requestId"))) return false;
            long revision = CrewLifeV2Protocol.integer(r.opt("revision"), 0);
            if (revision <= 0 || revision > revision()) return false;
            Object op = r.opt("op");
            if (!("reset".equals(op) || "revoke".equals(op)) || revoked() != "revoke".equals(op)) return false;
            if (r.has("wearChallenge") && (!(r.opt("wearChallenge") instanceof String) || !validChallenge(r.optString("wearChallenge")))) return false;
            boolean ready = r.getBoolean("ready"), cleared = r.getBoolean("cleared");
            if (!cleared) return !ready && !r.has("receipt");
            JSONObject receipt = r.optJSONObject("receipt");
            if (receipt == null) return false;
            CrewLifeV2Protocol.keys(receipt, Set.of("schemaVersion", "op", "streamId", "revision", "requestId", "wearChallenge", "status"));
            if (receipt.length() != 7 || CrewLifeV2Protocol.integer(receipt.opt("schemaVersion"), -1) != 2
                    || !(op + "_ack").equals(receipt.opt("op")) || !"cleared".equals(receipt.opt("status"))
                    || !r.opt("streamId").equals(receipt.opt("streamId"))
                    || revision != CrewLifeV2Protocol.integer(receipt.opt("revision"), -1)
                    || !r.opt("requestId").equals(receipt.opt("requestId"))
                    || !r.opt("wearChallenge").equals(receipt.opt("wearChallenge"))) return false;
            if (!validChallenge(r.optString("wearChallenge"))) return false;
            if (revoked()) return "revoke".equals(op) && !ready && revision == revision();
            return "reset".equals(op); // ready=false is an already consumed one-publication permit
        } catch (Exception invalid) { return false; }
    }
    private boolean cleared(JSONObject r) { return validRecord(r) && Boolean.TRUE.equals(r.opt("cleared")); }
    private boolean permitted(JSONObject r) { return cleared(r) && Boolean.TRUE.equals(r.opt("ready")); }

    String stream() throws Exception { return data.getString("streamId"); }
    long revision() throws Exception { return data.getLong("revision"); }
    void advance() throws Exception {
        if (revision() >= 9007199254740990L) throw new IllegalStateException("Revision exhausted");
        data.put("revision", revision() + 1);
    }
    void newStream() throws Exception {
        data.put("streamId", UUID.randomUUID().toString()); data.put("revision", 1); data.put("revoked", false);
        JSONObject nodes = data.getJSONObject("nodes");
        for (Iterator<String> i = nodes.keys(); i.hasNext();) {
            String node = i.next(); nodes.put(node, pending());
        }
    }
    boolean revoked() { return data.optBoolean("revoked", true); }
    void invalidate() throws Exception {
        advance(); data.put("revoked", true);
        JSONObject nodes = data.getJSONObject("nodes");
        for (Iterator<String> i = nodes.keys(); i.hasNext();) {
            String node = i.next(); nodes.put(node, pending());
        }
    }
    void reopenProof() throws Exception {
        advance();
        JSONObject nodes = data.getJSONObject("nodes");
        for (Iterator<String> i = nodes.keys(); i.hasNext();) nodes.put(i.next(), pending());
    }
    boolean consumed(String node) throws Exception {
        JSONObject r = data.getJSONObject("nodes").optJSONObject(node);
        return !revoked() && cleared(r) && !permitted(r);
    }
    void consumePublication(Set<String> connected) throws Exception {
        if (!ready(connected)) throw new IllegalStateException("Fresh peer proof required");
        for (String node : connected) data.getJSONObject("nodes").getJSONObject(node).put("ready", false);
    }
    JSONObject request(String node, String op) throws Exception {
        JSONObject nodes = data.getJSONObject("nodes");
        JSONObject current = nodes.optJSONObject(node);
        if (validRecord(current) && current.optString("op").equals(op)
                && current.optLong("revision") == revision() && current.optString("streamId").equals(stream())) return current;
        JSONObject request = new JSONObject().put("schemaVersion", 2).put("op", op).put("streamId", stream())
                .put("revision", revision()).put("requestId", UUID.randomUUID().toString())
                .put("ready", false).put("cleared", false);
        nodes.put(node, request);
        return request;
    }
    static boolean validChallenge(String value) { return value != null && value.matches("[0-9a-f]{64}"); }
    JSONObject control(JSONObject request) throws Exception {
        JSONObject out = new JSONObject();
        for (String k : new String[]{"schemaVersion", "streamId", "revision", "requestId"}) out.put(k, request.get(k));
        String challenge = request.optString("wearChallenge");
        if (validChallenge(challenge)) {
            out.put("op", request.getString("op")).put("wearChallenge", challenge);
        } else {
            out.put("op", "challenge_request").put("action", request.getString("op"));
        }
        return out;
    }
    private JSONObject matching(String node, JSONObject message) throws Exception {
        JSONObject request = data.getJSONObject("nodes").optJSONObject(node);
        if (!validRecord(request) || CrewLifeV2Protocol.integer(message.opt("schemaVersion"), -1) != 2
                || !message.optString("streamId").equals(stream())
                || CrewLifeV2Protocol.integer(message.opt("revision"), -1) != request.optLong("revision")
                || !message.optString("requestId").equals(request.optString("requestId"))) return null;
        return request;
    }
    boolean challenge(String node, JSONObject message) throws Exception {
        CrewLifeV2Protocol.keys(message, Set.of("schemaVersion", "op", "action", "streamId", "revision", "requestId", "wearChallenge"));
        JSONObject request = matching(node, message);
        if (request == null || Boolean.TRUE.equals(request.opt("cleared")) || !"challenge".equals(message.optString("op"))
                || !message.optString("action").equals(request.optString("op"))
                || !(message.opt("wearChallenge") instanceof String) || !validChallenge(message.optString("wearChallenge"))) return false;
        request.put("wearChallenge", message.getString("wearChallenge"));
        return true;
    }
    boolean ack(String node, JSONObject ack) throws Exception {
        CrewLifeV2Protocol.keys(ack, Set.of("schemaVersion", "op", "streamId", "revision", "requestId", "wearChallenge", "status"));
        JSONObject request = matching(node, ack);
        if (request == null || Boolean.TRUE.equals(request.opt("cleared")) || !"cleared".equals(ack.optString("status"))
                || !validChallenge(request.optString("wearChallenge"))
                || !(ack.opt("wearChallenge") instanceof String) || !request.optString("wearChallenge").equals(ack.optString("wearChallenge"))
                || !ack.optString("op").equals(request.optString("op") + "_ack")) return false;
        request.put("receipt", new JSONObject(ack.toString())).put("cleared", true).put("ready", !revoked() && request.optString("op").equals("reset"));
        return true;
    }
    boolean ready(Set<String> connected) throws Exception {
        if (revoked() || connected.isEmpty()) return false;
        JSONObject nodes = data.getJSONObject("nodes");
        for (String node : connected) if (!nodes.has(node) || !permitted(nodes.optJSONObject(node))) return false;
        // Offline previously seen nodes must not be silently considered migrated/cleared.
        for (Iterator<String> i = nodes.keys(); i.hasNext();) {
            if (!cleared(nodes.optJSONObject(i.next()))) return false;
        }
        return true;
    }
    boolean allCleared() throws Exception {
        JSONObject nodes = data.getJSONObject("nodes");
        if (nodes.length() == 0) return false; // no remote evidence
        for (Iterator<String> i = nodes.keys(); i.hasNext();) if (!cleared(nodes.optJSONObject(i.next()))) return false;
        return true;
    }
    JSONObject tombstone() throws Exception {
        return new JSONObject().put("schemaVersion", 2).put("kind", "revoked").put("streamId", stream())
                .put("revision", revision()).put("generatedAtEpochMs", 0).put("validUntilEpochMs", 0).put("metrics", new JSONObject());
    }
}
