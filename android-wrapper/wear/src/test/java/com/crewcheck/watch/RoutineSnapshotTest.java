package com.crewcheck.watch;

import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

public final class RoutineSnapshotTest {
    private static final long NOW = 1_800_000_000_000L;

    @Test
    public void exposesDecidedSuggestionWithoutRecalculating() throws Exception {
        RoutineSnapshot snapshot = RoutineSnapshot.fromJson(base()
                .put("title", "TREINO LEVE")
                .put("durationMinutes", 25)
                .put("reason", "Apresentação em 8h")
                .put("priority", "RECUPERACAO"));

        assertEquals("ROTINA", snapshot.complicationTitle());
        assertEquals("25 min", snapshot.complicationText(NOW));
        assertEquals("TREINO LEVE · 25 min", snapshot.complicationLongText(NOW));
        assertFalse(snapshot.isStale(NOW));
    }

    @Test
    public void unknownPriorityDegradesInsteadOfFailing() throws Exception {
        RoutineSnapshot snapshot = RoutineSnapshot.fromJson(base().put("priority", "HIPERTROFIA"));
        assertEquals("DESCONHECIDA", snapshot.priority);
    }

    @Test
    public void implausibleDurationFailsClosed() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> RoutineSnapshot.fromJson(base().put("durationMinutes", 5000)));
        assertThrows(IllegalArgumentException.class, () -> RoutineSnapshot.fromJson(base().put("durationMinutes", -5)));
    }

    @Test
    public void rejectsIdentityFields() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> RoutineSnapshot.fromJson(base().put("crewName", "Bruno")));
    }

    @Test
    public void expiryIsMandatory() throws Exception {
        JSONObject missingExpiry = base();
        missingExpiry.remove("validUntilEpochMs");
        assertThrows(IllegalArgumentException.class, () -> RoutineSnapshot.fromJson(missingExpiry));
    }

    @Test
    public void yesterdaySuggestionIsNotShownToday() throws Exception {
        RoutineSnapshot snapshot = RoutineSnapshot.fromJson(base()
                .put("title", "TREINO LEVE")
                .put("durationMinutes", 25));
        long tomorrow = NOW + 19 * 60 * 60 * 1000L;
        assertTrue(snapshot.isStale(tomorrow));
        assertEquals("--", snapshot.complicationText(tomorrow));
        assertEquals("Rotina desatualizada", snapshot.complicationLongText(tomorrow));
    }

    @Test
    public void wrongSchemaVersionIsRefused() throws Exception {
        assertThrows(IllegalArgumentException.class, () -> RoutineSnapshot.fromJson(base().put("schemaVersion", 7)));
    }

    @Test
    public void demoRoundTripsThroughJson() throws Exception {
        RoutineSnapshot demo = RoutineSnapshot.demo(NOW);
        RoutineSnapshot again = RoutineSnapshot.fromJson(demo.toJson().toString());
        assertEquals(demo.title, again.title);
        assertEquals(demo.durationMinutes, again.durationMinutes);
    }

    private static JSONObject base() throws JSONException {
        return new JSONObject()
                .put("schemaVersion", WatchContract.ROUTINE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", NOW - 60_000L)
                .put("validUntilEpochMs", NOW + 18 * 60 * 60 * 1000L);
    }

    @Test
    public void accentedPriorityNormalizesInsteadOfDegrading() throws Exception {
        for (String written : new String[]{"recuperação", "RECUPERAÇÃO", "Recuperacao"}) {
            JSONObject json = RoutineSnapshot.demo(NOW).toJson().put("priority", written);
            assertEquals(written, "RECUPERACAO", RoutineSnapshot.fromJson(json).priority);
        }
    }
}
