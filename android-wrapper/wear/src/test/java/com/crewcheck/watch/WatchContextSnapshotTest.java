package com.crewcheck.watch;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public final class WatchContextSnapshotTest {
    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void parsesCanonicalProjectionWithoutOperationalRecalculation() throws Exception {
        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(base()
                .put("state", "LEAVE_SOON")
                .put("headline", "SAIR EM 18 MIN")
                .put("presentationTime", "13:30")
                .put("currentFlight", "LA3721"));

        assertEquals("SAIR18", snapshot.complicationShortText(NOW));
        assertEquals("LA3721", snapshot.currentFlight);
        assertFalse(snapshot.isStale(NOW));
    }

    @Test
    public void remoteGateIsAlwaysExplicit() throws Exception {
        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(base()
                .put("gate", "Remota")
                .put("headline", "EMBARQUE"));

        assertTrue(snapshot.remoteStand);
        assertEquals("REMOTA", snapshot.gateLabel());
        assertEquals("REMOTA", snapshot.complicationShortText(NOW));
    }

    @Test
    public void carriesCompactRosterScheduleWithoutChangingOperationalMeaning() throws Exception {
        JSONArray schedule = new JSONArray()
                .put(new JSONObject()
                        .put("id", "f1")
                        .put("kind", "flight")
                        .put("time", "13:45")
                        .put("title", "LA3721")
                        .put("route", "BSB → GRU")
                        .put("presentation", "13:30")
                        .put("gate", "24"));

        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(base()
                .put("state", "REPORTING")
                .put("presentationTime", "13:30")
                .put("schedule", schedule));

        assertEquals(1, snapshot.schedule.size());
        assertEquals("LA3721", snapshot.schedule.get(0).title);
        assertEquals("BSB → GRU", snapshot.schedule.get(0).route);
        assertEquals("APRESENTAÇÃO", snapshot.complicationTitle(NOW));
    }

    @Test
    public void rejectsUnknownSchemaAndSensitiveFields() throws Exception {
        assertThrows(IllegalArgumentException.class, () ->
                WatchContextSnapshot.fromJson(base().put("schemaVersion", 2)));
        assertThrows(IllegalArgumentException.class, () ->
                WatchContextSnapshot.fromJson(base().put("cpf", "00000000000")));
    }

    @Test
    public void rejectsMissingExpiryAndMarksExpiredSnapshotAsStale() throws Exception {
        JSONObject missingExpiry = base();
        missingExpiry.remove("validUntilEpochMs");
        assertThrows(IllegalArgumentException.class, () ->
                WatchContextSnapshot.fromJson(missingExpiry));

        WatchContextSnapshot snapshot = WatchContextSnapshot.fromJson(base()
                .put("validUntilEpochMs", NOW - 1));

        assertTrue(snapshot.isStale(NOW));
        assertEquals("ABRIR", snapshot.complicationShortText(NOW));
    }

    private static JSONObject base() throws JSONException {
        return new JSONObject()
                .put("schemaVersion", 1)
                .put("contextId", "test")
                .put("generatedAtEpochMs", NOW - 60_000L)
                .put("validUntilEpochMs", NOW + 60_000L)
                .put("state", "UNKNOWN")
                .put("headline", "PRÓXIMO PASSO")
                .put("source", "canonical-roster");
    }
}
