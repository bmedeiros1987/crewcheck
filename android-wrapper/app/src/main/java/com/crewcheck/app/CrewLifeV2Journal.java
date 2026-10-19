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
        UUID.fromString(data.getString("streamId"));
        if (CrewLifeV2Protocol.integer(data.opt("revision"), 0) <= 0) throw new IllegalArgumentException("Invalid journal");
        JSONObject storedNodes = data.getJSONObject("nodes");
        for (Iterator<String> i = storedNodes.keys(); i.hasNext();) {
            JSONObject record = storedNodes.getJSONObject(i.next());
            // Unpublished pre-challenge checkpoints cannot migrate readiness by inference.
            if (!validChallenge(record.optString("wearChallenge"))) record.put("ready", false).put("cleared", false);
        }
    }
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
            String node = i.next(); nodes.put(node, new JSONObject().put("ready", false).put("cleared", false));
        }
    }
    boolean revoked() { return data.optBoolean("revoked", true); }
    void invalidate() throws Exception {
        advance(); data.put("revoked", true);
        JSONObject nodes = data.getJSONObject("nodes");
        for (Iterator<String> i = nodes.keys(); i.hasNext();) {
            String node = i.next(); nodes.put(node, new JSONObject().put("ready", false).put("cleared", false));
        }
    }
    JSONObject request(String node, String op) throws Exception {
        JSONObject nodes = data.getJSONObject("nodes");
        JSONObject current = nodes.optJSONObject(node);
        if (current != null && current.optString("op").equals(op)
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
        if (request == null || CrewLifeV2Protocol.integer(message.opt("schemaVersion"), -1) != 2
                || !message.optString("streamId").equals(stream())
                || CrewLifeV2Protocol.integer(message.opt("revision"), -1) != request.optLong("revision")
                || !message.optString("requestId").equals(request.optString("requestId"))) return null;
        return request;
    }
    boolean challenge(String node, JSONObject message) throws Exception {
        CrewLifeV2Protocol.keys(message, Set.of("schemaVersion", "op", "action", "streamId", "revision", "requestId", "wearChallenge"));
        JSONObject request = matching(node, message);
        if (request == null || request.optBoolean("cleared") || !"challenge".equals(message.optString("op"))
                || !message.optString("action").equals(request.optString("op"))
                || !validChallenge(message.optString("wearChallenge"))) return false;
        request.put("wearChallenge", message.getString("wearChallenge"));
        return true;
    }
    boolean ack(String node, JSONObject ack) throws Exception {
        CrewLifeV2Protocol.keys(ack, Set.of("schemaVersion", "op", "streamId", "revision", "requestId", "wearChallenge", "status"));
        JSONObject request = matching(node, ack);
        if (request == null || !"cleared".equals(ack.optString("status"))
                || !validChallenge(request.optString("wearChallenge"))
                || !request.optString("wearChallenge").equals(ack.optString("wearChallenge"))
                || !ack.optString("op").equals(request.optString("op") + "_ack")) return false;
        request.put("cleared", true).put("ready", !revoked() && request.optString("op").equals("reset"));
        return true;
    }
    boolean ready(Set<String> connected) throws Exception {
        if (revoked() || connected.isEmpty()) return false;
        JSONObject nodes = data.getJSONObject("nodes");
        for (String node : connected) if (!nodes.has(node) || !nodes.getJSONObject(node).optBoolean("ready")) return false;
        // Offline previously seen nodes must not be silently considered migrated/cleared.
        for (Iterator<String> i = nodes.keys(); i.hasNext();) {
            if (!nodes.getJSONObject(i.next()).optBoolean("cleared")) return false;
        }
        return true;
    }
    boolean allCleared() throws Exception {
        JSONObject nodes = data.getJSONObject("nodes");
        if (nodes.length() == 0) return false; // no remote evidence
        for (Iterator<String> i = nodes.keys(); i.hasNext();) if (!nodes.getJSONObject(i.next()).optBoolean("cleared")) return false;
        return true;
    }
    JSONObject tombstone() throws Exception {
        return new JSONObject().put("schemaVersion", 2).put("kind", "revoked").put("streamId", stream())
                .put("revision", revision()).put("generatedAtEpochMs", 0).put("validUntilEpochMs", 0).put("metrics", new JSONObject());
    }
}
