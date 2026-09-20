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
                .put("title", "TREINO_LEVE")
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
                .put("title", "TREINO_LEVE")
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

    // --- título é código, não frase ----------------------------------------------------

    @Test
    public void freeTextTitleNeverBecomesScreenText() throws Exception {
        JSONObject json = RoutineSnapshot.demo(NOW).toJson()
                .put("title", "TREINO LEVE — FC ALTA / DORMIU 4H");
        RoutineSnapshot snapshot = RoutineSnapshot.fromJson(json);

        assertEquals("SEM_SUGESTAO", snapshot.title);
        assertEquals("SEM SUGESTÃO", snapshot.titleLabel());
        assertFalse(snapshot.complicationLongText(NOW).contains("FC"));
        assertFalse(snapshot.complicationLongText(NOW).contains("DORMIU"));
        assertFalse(snapshot.accessibilityDescription(NOW).contains("FC"));
    }

    @Test
    public void allowListedTitleCodesRenderTheirLabel() throws Exception {
        JSONObject json = RoutineSnapshot.demo(NOW).toJson().put("title", "sono extra");
        RoutineSnapshot snapshot = RoutineSnapshot.fromJson(json);
        assertEquals("SONO_EXTRA", snapshot.title);
        assertEquals("DORMIR MAIS", snapshot.titleLabel());
    }

    @Test
    public void absentRoutineFieldsAreNotResurrectedOnRoundTrip() throws Exception {
        JSONObject minimal = new JSONObject()
                .put("schemaVersion", WatchContract.ROUTINE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 3_600_000L)
                .put("title", "CAMINHADA");

        JSONObject cached = RoutineSnapshot.fromJson(minimal).toJson();
        assertEquals("CAMINHADA", cached.getString("title"));
        for (String absent : new String[]{"durationMinutes", "reason", "priority", "nextAction"}) {
            assertFalse("ausência virou valor: " + absent, cached.has(absent));
        }
    }
}
