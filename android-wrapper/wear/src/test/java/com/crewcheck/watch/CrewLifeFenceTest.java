package com.crewcheck.watch;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.crewcheck.watch.CrewLifeSnapshotTest.*;

public final class CrewLifeFenceTest {
    static final String NODE="synthetic-phone";
    static String control(String op,String stream,long rev,String request) throws Exception {
        return new JSONObject().put("schemaVersion",2).put("op",op).put("streamId",stream).put("revision",rev).put("requestId",request).toString();
    }
    static CrewLifeFence reset() throws Exception { return CrewLifeFence.control(new JSONObject(),control("reset",STREAM,1,STREAM),NODE); }
    static String data(long rev,int value) throws Exception {
        JSONObject j=base().put("revision",rev);j.getJSONObject("metrics").put("recoveryScore",metric(value,NOW+1000));return j.toString();
    }
    @Test public void dataRequiresDirectedResetAndMatchingNodeStream() throws Exception {
        assertNull(CrewLifeFence.data(new JSONObject(),data(2,78),NODE,NOW).snapshot);
        CrewLifeFence r=reset();assertNotNull(r.ack);assertTrue(r.clearValues);
        assertNull(CrewLifeFence.data(r.state,data(2,78),"other",NOW).snapshot);
        assertNotNull(CrewLifeFence.data(r.state,data(2,0),NODE,NOW).snapshot);
    }
    @Test public void replayDuplicateAndConflictingRevisionCannotRestoreValues() throws Exception {
        CrewLifeFence d=CrewLifeFence.data(reset().state,data(3,78),NODE,NOW);
        assertFalse(CrewLifeFence.data(d.state,data(2,51),NODE,NOW).clearValues);
        assertFalse(CrewLifeFence.data(d.state,data(3,78),NODE,NOW).clearValues);
        CrewLifeFence conflict=CrewLifeFence.data(d.state,data(3,51),NODE,NOW);assertTrue(conflict.clearValues);
        assertNull(CrewLifeFence.data(conflict.state,data(3,78),NODE,NOW).snapshot);
    }
    @Test public void structuralFailureClearsButKeepsHighWatermark() throws Exception {
        CrewLifeFence d=CrewLifeFence.data(reset().state,data(3,78),NODE,NOW);
        CrewLifeFence bad=CrewLifeFence.data(d.state,"{}",NODE,NOW);assertTrue(bad.clearValues);assertEquals(3,bad.state.getLong("revision"));
        assertNull(CrewLifeFence.data(bad.state,data(3,78),NODE,NOW).snapshot);
    }
    @Test public void revokeAndTombstoneFenceLaterValuesUntilNewStreamReset() throws Exception {
        CrewLifeFence d=CrewLifeFence.data(reset().state,data(2,78),NODE,NOW);
        String challenge="00000000-0000-4000-8000-000000000002";
        CrewLifeFence r=CrewLifeFence.control(d.state,control("revoke",STREAM,3,challenge),NODE);
        assertEquals("revoke_ack",new JSONObject(r.ack).getString("op"));assertTrue(r.clearValues);
        assertNull(CrewLifeFence.data(r.state,data(4,51),NODE,NOW).snapshot);
        assertNull(CrewLifeFence.control(r.state,control("reset",STREAM,4,challenge),NODE).ack);
        CrewLifeFence next=CrewLifeFence.control(r.state,control("reset",challenge,1,challenge),NODE);assertNotNull(next.ack);
        assertNull(CrewLifeFence.control(next.state,control("reset",STREAM,9,STREAM),NODE).ack);
    }
    @Test public void durableTombstoneBeforeControlStillAllowsCleanupAck() throws Exception {
        JSONObject j=base().put("revision",3).put("kind","revoked").put("validUntilEpochMs",0);
        CrewLifeFence t=CrewLifeFence.data(reset().state,j.toString(),NODE,NOW);assertTrue(t.clearValues);assertNull(t.snapshot);
        CrewLifeFence c=CrewLifeFence.control(t.state,control("revoke",STREAM,3,STREAM),NODE);assertNotNull(c.ack);
        assertEquals(c.ack,CrewLifeFence.control(c.state,control("revoke",STREAM,3,STREAM),NODE).ack);
    }
    @Test public void resetRetryIsIdempotentAndStaleResetHasNoAck() throws Exception {
        CrewLifeFence r=reset();assertEquals(r.ack,CrewLifeFence.control(r.state,control("reset",STREAM,1,STREAM),NODE).ack);
        CrewLifeFence d=CrewLifeFence.data(r.state,data(2,78),NODE,NOW);
        assertNull(CrewLifeFence.control(d.state,control("reset",STREAM,1,STREAM),NODE).ack);
    }
    @Test public void malformedControlHasNoAckAndClearsOnlyValues() throws Exception {
        CrewLifeFence r=reset();CrewLifeFence bad=CrewLifeFence.control(r.state,"{}",NODE);
        assertNull(bad.ack);assertTrue(bad.clearValues);assertEquals(r.state.toString(),bad.state.toString());
    }
}
