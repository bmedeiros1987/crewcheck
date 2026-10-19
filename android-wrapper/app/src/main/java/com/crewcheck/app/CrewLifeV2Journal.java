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
        data.getJSONObject("nodes");
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
    JSONObject control(JSONObject request) throws Exception {
        JSONObject out = new JSONObject();
        for (String k : new String[]{"schemaVersion", "op", "streamId", "revision", "requestId"}) out.put(k, request.get(k));
        return out;
    }
    boolean ack(String node, JSONObject ack) throws Exception {
        CrewLifeV2Protocol.keys(ack, Set.of("schemaVersion", "op", "streamId", "revision", "requestId", "status"));
        JSONObject request = data.getJSONObject("nodes").optJSONObject(node);
        if (request == null || !"cleared".equals(ack.optString("status"))
                || CrewLifeV2Protocol.integer(ack.opt("schemaVersion"), -1) != 2
                || !ack.optString("streamId").equals(stream())
                || CrewLifeV2Protocol.integer(ack.opt("revision"), -1) != request.optLong("revision")
                || !ack.optString("requestId").equals(request.optString("requestId"))
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
