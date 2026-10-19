package com.crewcheck.watch;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;
import static com.crewcheck.watch.CrewLifeSnapshotTest.*;

public final class CrewLifeFenceTest {
    static final String NODE="synthetic-phone",B="00000000-0000-4000-8000-000000000002";
    static String control(String op,String stream,long rev,String request) throws Exception {
        return new JSONObject().put("schemaVersion",2).put("op",op).put("streamId",stream).put("revision",rev).put("requestId",request).toString();
    }
    static String request(String action,String stream,long rev,String id) throws Exception {
        return new JSONObject(control("challenge_request",stream,rev,id)).put("action",action).toString();
    }
    static String echo(String action,String stream,long rev,String id,String challenge) throws Exception {
        return new JSONObject(control(action,stream,rev,id)).put("wearChallenge",challenge).toString();
    }
    static String echoFrom(String action,CrewLifeFence challenge) throws Exception {
        JSONObject c=new JSONObject(challenge.ack);
        return echo(action,c.getString("streamId"),c.getLong("revision"),c.getString("requestId"),c.getString("wearChallenge"));
    }
    static CrewLifeFence apply(JSONObject state,String action,String stream,long rev,String id) throws Exception {
        CrewLifeFence challenge=CrewLifeFence.control(state,request(action,stream,rev,id),NODE);
        return CrewLifeFence.control(challenge.state,echoFrom(action,challenge),NODE);
    }
    static CrewLifeFence reset() throws Exception { return apply(new JSONObject(),"reset",STREAM,1,STREAM); }
    static String data(long rev,int value) throws Exception {
        JSONObject j=base().put("revision",rev);j.getJSONObject("metrics").put("recoveryScore",metric(value,NOW+1000));return j.toString();
    }
    @Test public void dataRequiresChallengedResetAndMatchingNodeStream() throws Exception {
        assertNull(CrewLifeFence.data(new JSONObject(),data(2,78),NODE,NOW).snapshot);
        assertNull(CrewLifeFence.control(new JSONObject(),control("reset",STREAM,1,STREAM),NODE).ack);
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
        CrewLifeFence r=apply(d.state,"revoke",STREAM,3,B);
        assertEquals("revoke_ack",new JSONObject(r.ack).getString("op"));assertTrue(r.clearValues);
        assertNull(CrewLifeFence.data(r.state,data(4,51),NODE,NOW).snapshot);
        assertNull(apply(r.state,"reset",STREAM,4,B).ack);
        CrewLifeFence next=apply(r.state,"reset",B,1,B);assertNotNull(next.ack);
        assertNull(apply(next.state,"reset",STREAM,9,STREAM).ack);
    }
    @Test public void durableTombstoneBeforeControlStillAllowsCleanupAck() throws Exception {
        JSONObject j=base().put("revision",3).put("kind","revoked").put("validUntilEpochMs",0);
        CrewLifeFence t=CrewLifeFence.data(reset().state,j.toString(),NODE,NOW);assertTrue(t.clearValues);assertNull(t.snapshot);
        CrewLifeFence c=apply(t.state,"revoke",STREAM,3,STREAM);assertNotNull(c.ack);
    }
    @Test public void exactCompletedResetRetryAcksWithoutClearingNewerDataOrLoweringRevision() throws Exception {
        CrewLifeFence challenge=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        String wire=echoFrom("reset",challenge);
        CrewLifeFence reset=CrewLifeFence.control(challenge.state,wire,NODE);
        CrewLifeFence d=CrewLifeFence.data(reset.state,data(2,78),NODE,NOW);
        CrewLifeFence retry=CrewLifeFence.control(new JSONObject(d.state.toString()),wire,NODE);
        assertEquals(reset.ack,retry.ack);assertFalse(retry.clearValues);assertEquals(2,retry.state.getLong("revision"));
    }
    @Test public void malformedControlHasNoAckAndPreservesReplayFence() throws Exception {
        CrewLifeFence r=reset();CrewLifeFence bad=CrewLifeFence.control(r.state,"{}",NODE);
        assertNull(bad.ack);assertTrue(bad.clearValues);assertEquals(r.state.toString(),bad.state.toString());
    }
    @Test public void journalLossCounterexampleNowRejectsDelayedResetAndOldData() throws Exception {
        CrewLifeFence oldChallenge=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        String oldReset=echoFrom("reset",oldChallenge);
        CrewLifeFence old=CrewLifeFence.control(oldChallenge.state,oldReset,NODE);assertNotNull(old.ack);
        // Journal A is lost. Fresh B is established without any retired history of A.
        CrewLifeFence fresh=apply(new JSONObject(),"reset",B,1,B);
        assertNull(CrewLifeFence.control(fresh.state,oldReset,NODE).ack);
        CrewLifeFence delayed=CrewLifeFence.data(fresh.state,data(2,12),NODE,NOW);
        assertNull(delayed.snapshot);assertEquals(B,delayed.state.getString("streamId"));
        assertNull(CrewLifeFence.control(new JSONObject(),oldReset,NODE).ack);
    }
    @Test public void delayedHelloAfterJournalLossGetsDifferentNonceAndCannotActivateOldReset() throws Exception {
        CrewLifeFence old=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        CrewLifeFence fresh=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        assertNotEquals(new JSONObject(old.ack).getString("wearChallenge"),new JSONObject(fresh.ack).getString("wearChallenge"));
        assertNull(CrewLifeFence.control(fresh.state,echoFrom("reset",old),NODE).ack);
        assertFalse(fresh.state.has("streamId"));
    }
    @Test public void losingPendingJournalAfterChallengeRejectsEchoUntilNewExchange() throws Exception {
        CrewLifeFence challenge=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        assertNull(CrewLifeFence.control(new JSONObject(),echoFrom("reset",challenge),NODE).ack);
        assertNotNull(apply(new JSONObject(),"reset",STREAM,1,STREAM).ack);
    }
    @Test public void latestPendingTupleWinsAcrossNodeActionStreamRevisionRequestAndNonce() throws Exception {
        CrewLifeFence a=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        String wire=echoFrom("reset",a);
        assertNull(CrewLifeFence.control(a.state,wire,"foreign-node").ack);
        for(String field:new String[]{"op","streamId","revision","requestId","wearChallenge"}) {
            JSONObject changed=new JSONObject(wire);
            changed.put(field,field.equals("revision")?2:field.equals("op")?"revoke":field.equals("wearChallenge")?"0".repeat(64):B);
            assertNull(field,CrewLifeFence.control(a.state,changed.toString(),NODE).ack);
        }
        CrewLifeFence b=CrewLifeFence.control(a.state,request("reset",B,1,B),"other-phone");
        assertNull(CrewLifeFence.control(b.state,wire,NODE).ack);
        assertNotNull(CrewLifeFence.control(b.state,echoFrom("reset",b),"other-phone").ack);
    }
    @Test public void nonceRandomFailureCannotEmitChallengeOrMutateFence() throws Exception {
        JSONObject state=reset().state;
        CrewLifeFence failure=CrewLifeFence.control(state,request("reset",B,1,B),NODE,()->{throw new IllegalStateException("synthetic RNG failure");});
        assertNull(failure.ack);assertEquals(state.toString(),failure.state.toString());assertTrue(failure.clearValues);
    }
    @Test public void challengeRetryIsIdempotentWhileNewRequestUsesFreshNonce() throws Exception {
        CrewLifeFence c=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        assertEquals(c.ack,CrewLifeFence.control(c.state,request("reset",STREAM,1,STREAM),NODE).ack);
        CrewLifeFence d=CrewLifeFence.control(c.state,request("reset",STREAM,1,B),NODE);
        assertNotEquals(c.state.getJSONObject("pendingChallenge").getString("wearChallenge"),d.state.getJSONObject("pendingChallenge").getString("wearChallenge"));
    }
    @Test public void consumedNonceCannotReactivateAfterDifferentStreamReset() throws Exception {
        CrewLifeFence c=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        String old=echoFrom("reset",c);
        CrewLifeFence a=CrewLifeFence.control(c.state,old,NODE);
        CrewLifeFence b=apply(a.state,"reset",B,1,B);
        assertNull(CrewLifeFence.control(b.state,old,NODE).ack);
        assertEquals(B,b.state.getString("streamId"));
    }
    @Test public void twoWearReceiversRequireTheirOwnChallengeAndCannotExchangeNonces() throws Exception {
        CrewLifeFence first=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        CrewLifeFence second=CrewLifeFence.control(new JSONObject(),request("reset",STREAM,1,STREAM),NODE);
        assertNotEquals(first.ack,second.ack);
        assertNull(CrewLifeFence.control(first.state,echoFrom("reset",second),NODE).ack);
        assertNull(CrewLifeFence.control(second.state,echoFrom("reset",first),NODE).ack);
        assertNotNull(CrewLifeFence.control(first.state,echoFrom("reset",first),NODE).ack);
        assertNotNull(CrewLifeFence.control(second.state,echoFrom("reset",second),NODE).ack);
    }
    @Test public void challengedRevokeAfterJournalLossOnlyInstallsRevokedFenceAndCannotEnableValues() throws Exception {
        CrewLifeFence lost=apply(new JSONObject(),"revoke",STREAM,3,STREAM);
        assertNotNull(lost.ack);assertTrue(lost.state.getBoolean("revoked"));assertTrue(lost.clearValues);assertNull(lost.snapshot);
        assertNull(CrewLifeFence.data(lost.state,data(4,78),NODE,NOW).snapshot);
        assertNull(apply(lost.state,"reset",STREAM,4,B).ack);
        assertNotNull(apply(lost.state,"reset",B,1,B).ack);
        CrewLifeFence active=apply(new JSONObject(),"reset",B,1,B);
        assertNull(apply(active.state,"revoke",STREAM,3,STREAM).ack);
        JSONObject tombstone=base().put("kind","revoked").put("validUntilEpochMs",0).put("revision",3);
        assertFalse(CrewLifeFence.data(new JSONObject(),tombstone.toString(),NODE,NOW).state.has("streamId"));
    }
    @Test public void pendingReplacementNeverActivatesStreamOrClearsExistingValues() throws Exception {
        CrewLifeFence r=reset();CrewLifeFence data=CrewLifeFence.data(r.state,data(2,78),NODE,NOW);
        CrewLifeFence hello=CrewLifeFence.control(data.state,request("reset",B,1,B),NODE);
        assertFalse(hello.clearValues);assertNull(hello.snapshot);assertEquals(STREAM,hello.state.getString("streamId"));assertEquals(2,hello.state.getLong("revision"));
    }
}
