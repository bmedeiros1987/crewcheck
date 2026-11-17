package com.crewcheck.watch;

import org.json.JSONObject;

/** Actual pinned receiver logic; persistence is an explicit isolated test transaction. */
public final class CrewLifeLoopTestPeer {
    private JSONObject state = new JSONObject();
    private CrewLifeSnapshot snapshot;
    public String control(String raw) throws Exception {
        CrewLifeFence result = CrewLifeFence.control(state, raw, "phone-node");
        state = new JSONObject(result.state.toString());
        if (result.clearValues) snapshot = null;
        return result.ack;
    }
    public void data(String raw, long now) throws Exception {
        CrewLifeFence result = CrewLifeFence.data(state, raw, "phone-node", now);
        state = new JSONObject(result.state.toString());
        if (result.clearValues) snapshot = result.snapshot;
    }
    public Integer value(String key, long now) { return snapshot == null ? null : snapshot.value(key, now); }
}
