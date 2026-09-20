package com.crewcheck.watch;

import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public final class CrewLifeSnapshotTest {
    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void exposesDerivedGlanceWithoutRawSeries() throws Exception {
        CrewLifeSnapshot snapshot = CrewLifeSnapshot.fromJson(base()
                .put("recoveryScore", 78)
                .put("recoveryLabel", "BOA")
                .put("sleepLabel", "6h52"));

        assertEquals("CREWLIFE", snapshot.complicationTitle());
        assertEquals("78%", snapshot.complicationText(NOW));
        assertFalse(snapshot.isStale(NOW));
    }

    @Test
    public void rejectsRawHeartRateSeries() throws Exception {
        JSONObject withSeries = base().put("heartRateSeries", "[58,60,62]");
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(withSeries));
    }

    @Test
    public void rejectsSleepStagesAndLocation() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(base().put("sleepStages", "[]")));
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(base().put("latitude", -23.5)));
    }

    @Test
    public void rejectsIdentityFields() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(base().put("crewId", "12345")));
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(base().put("cpf", "000")));
    }

    @Test
    public void implausibleValuesFailClosedInsteadOfShowingWrongGlance() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(base().put("recoveryScore", 140)));
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(base().put("restingHeartRate", 400)));
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(base().put("sleepMinutes", 5000)));
    }

    @Test
    public void unknownRecoveryLabelDegradesInsteadOfFailing() throws Exception {
        CrewLifeSnapshot snapshot = CrewLifeSnapshot.fromJson(base().put("recoveryLabel", "TURBINADA"));
        assertEquals("DESCONHECIDA", snapshot.recoveryLabel);
    }

    @Test
    public void expiryIsMandatorySoStaleWellbeingNeverLingers() throws Exception {
        JSONObject missingExpiry = base();
        missingExpiry.remove("validUntilEpochMs");
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(missingExpiry));
    }

    @Test
    public void staleSnapshotShowsPlaceholderNotOldNumber() throws Exception {
        CrewLifeSnapshot snapshot = CrewLifeSnapshot.fromJson(base().put("recoveryScore", 78));
        assertTrue(snapshot.isStale(NOW + 7 * 60 * 60 * 1000L));
        assertEquals("--", snapshot.complicationText(NOW + 7 * 60 * 60 * 1000L));
    }

    @Test
    public void wrongSchemaVersionIsRefused() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(base().put("schemaVersion", 99)));
    }

    @Test
    public void oversizedPayloadIsRefused() {
        StringBuilder padding = new StringBuilder();
        while (padding.length() < WatchContract.MAX_WELLBEING_BYTES + 64) padding.append('x');
        assertThrows(IllegalArgumentException.class, () -> CrewLifeSnapshot.fromJson(
                "{\"schemaVersion\":1,\"detail\":\"" + padding + "\"}"));
    }

    @Test
    public void demoRoundTripsThroughJson() throws Exception {
        CrewLifeSnapshot demo = CrewLifeSnapshot.demo(NOW);
        CrewLifeSnapshot again = CrewLifeSnapshot.fromJson(demo.toJson().toString());
        assertEquals(demo.recoveryScore, again.recoveryScore);
        assertEquals(demo.recoveryLabel, again.recoveryLabel);
    }

    private static JSONObject base() throws JSONException {
        return new JSONObject()
                .put("schemaVersion", WatchContract.CREWLIFE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", NOW - 60_000L)
                .put("validUntilEpochMs", NOW + 6 * 60 * 60 * 1000L);
    }

    @Test
    public void accentedRecoveryLabelNormalizesInsteadOfDegrading() throws Exception {
        for (String written : new String[]{"ótima", "ÓTIMA", "Ótima", "OTIMA"}) {
            JSONObject json = CrewLifeSnapshot.demo(NOW).toJson().put("recoveryLabel", written);
            assertEquals(written, "OTIMA", CrewLifeSnapshot.fromJson(json).recoveryLabel);
        }
    }

    // --- ausência não pode virar zero no cache do relógio -------------------------------

    @Test
    public void absentCategoriesAreNotResurrectedAsZeroOnRoundTrip() throws Exception {
        JSONObject onlySleep = new JSONObject()
                .put("schemaVersion", WatchContract.CREWLIFE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 3_600_000L)
                .put("sleepMinutes", 412)
                .put("sleepLabel", "6h52");

        // É isto que o WellbeingStore grava: fromJson -> toJson.
        JSONObject cached = CrewLifeSnapshot.fromJson(onlySleep).toJson();

        assertEquals(412, cached.getInt("sleepMinutes"));
        assertEquals("6h52", cached.getString("sleepLabel"));
        for (String absent : new String[]{
                "steps", "activeMinutes", "restingHeartRate", "hrvMs",
                "recoveryScore", "recoveryLabel", "recommendation", "detail"}) {
            assertFalse("ausência virou valor: " + absent, cached.has(absent));
        }
    }

    @Test
    public void aRealZeroStillTravelsAndIsDistinctFromAbsence() throws Exception {
        JSONObject withZero = new JSONObject()
                .put("schemaVersion", WatchContract.CREWLIFE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 3_600_000L)
                .put("steps", 0);

        CrewLifeSnapshot snapshot = CrewLifeSnapshot.fromJson(withZero);
        assertTrue("zero medido é dado", snapshot.has("steps"));
        assertFalse("sono não veio", snapshot.has("sleepMinutes"));

        JSONObject cached = snapshot.toJson();
        assertTrue(cached.has("steps"));
        assertEquals(0, cached.getInt("steps"));
        assertFalse(cached.has("sleepMinutes"));
    }

    @Test
    public void severalRoundTripsDoNotAccumulateFields() throws Exception {
        JSONObject onlyHeart = new JSONObject()
                .put("schemaVersion", WatchContract.CREWLIFE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 3_600_000L)
                .put("restingHeartRate", 58);

        JSONObject once = CrewLifeSnapshot.fromJson(onlyHeart).toJson();
        JSONObject twice = CrewLifeSnapshot.fromJson(once).toJson();
        assertEquals(once.length(), twice.length());
        assertFalse(twice.has("steps"));
        assertFalse(twice.has("sleepMinutes"));
    }
}
