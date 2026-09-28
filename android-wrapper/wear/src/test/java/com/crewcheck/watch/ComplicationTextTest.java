package com.crewcheck.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

/** Decisão de texto de cada provider, sem Android. */
public final class ComplicationTextTest {
    private static final long NOW = 1_700_000_000_000L;

    // --- próximo passo -------------------------------------------------------------------

    @Test
    public void nextStepWithoutCacheAsksToOpenThePhone() {
        ComplicationRendering rendering = ComplicationText.nextStep(null, NOW);
        assertEquals("ABRIR", rendering.shortText);
        assertEquals("CREWCHECK", rendering.title);
    }

    @Test
    public void nextStepUsesTheSnapshotProjection() {
        WatchContextSnapshot snapshot = WatchContextSnapshot.demo(NOW);
        ComplicationRendering rendering = ComplicationText.nextStep(snapshot, NOW);
        assertEquals(snapshot.complicationShortText(NOW), rendering.shortText);
        assertEquals(snapshot.complicationLongText(NOW), rendering.longText);
        assertEquals(snapshot.complicationTitle(NOW), rendering.title);
    }

    // --- portão --------------------------------------------------------------------------

    @Test
    public void gateShowsTheGateNumber() {
        ComplicationRendering rendering = ComplicationText.gate(WatchContextSnapshot.demo(NOW), NOW);
        assertEquals("PORTÃO", rendering.title);
        assertEquals("P24", rendering.shortText);
        assertTrue(rendering.longText.startsWith("PORTÃO 24"));
    }

    @Test
    public void gateReportsRemoteStandInsteadOfAFakeGate() {
        ComplicationRendering rendering = ComplicationText.gate(snapshot(json -> {
            json.put("gate", "REMOTA");
            json.put("boardingTime", "13:45");
        }), NOW);
        assertEquals("REMOTA", rendering.shortText);
        assertEquals("REMOTA · Embarque 13:45", rendering.longText);
    }

    @Test
    public void gateDegradesWhenNotPublishedYet() {
        ComplicationRendering rendering = ComplicationText.gate(snapshot(json -> {
            json.put("gate", "");
            json.put("remoteStand", false);
        }), NOW);
        assertEquals("--", rendering.shortText);
        assertEquals("Portão não publicado", rendering.longText);
    }

    @Test
    public void gateDegradesWhenSnapshotIsStale() {
        WatchContextSnapshot snapshot = WatchContextSnapshot.demo(NOW);
        ComplicationRendering rendering = ComplicationText.gate(snapshot, snapshot.validUntilEpochMs + 1L);
        assertEquals("--", rendering.shortText);
        assertEquals("Portão desatualizado", rendering.longText);
    }

    @Test
    public void gateWithoutCacheNeverFallsBackToAnotherDomain() {
        ComplicationRendering rendering = ComplicationText.gate(null, NOW);
        assertEquals("--", rendering.shortText);
        assertEquals("PORTÃO", rendering.title);
    }

    // --- CrewLife ------------------------------------------------------------------------

    @Test
    public void crewLifeWithoutOptInStaysEmpty() {
        ComplicationRendering rendering = ComplicationText.crewLife(null, NOW);
        assertEquals("--", rendering.shortText);
        assertEquals("Ative o CrewLife no celular", rendering.longText);
        assertEquals("CREWLIFE", rendering.title);
    }

    @Test
    public void crewLifeShowsDerivedRecoveryAndSleep() {
        ComplicationRendering rendering = ComplicationText.crewLife(CrewLifeSnapshot.demo(NOW), NOW);
        assertEquals("78%", rendering.shortText);
        assertTrue(rendering.longText.startsWith("78% · 6h52"));
        assertTrue(rendering.longText.length() <= 48);
    }

    @Test
    public void crewLifeDegradesWhenStale() {
        CrewLifeSnapshot snapshot = CrewLifeSnapshot.demo(NOW);
        long later = snapshot.validUntilEpochMs + 1L;
        ComplicationRendering rendering = ComplicationText.crewLife(snapshot, later);
        assertEquals("--", rendering.shortText);
        assertEquals("Bem-estar desatualizado", rendering.longText);
    }

    // --- Rotina --------------------------------------------------------------------------

    @Test
    public void routineWithoutDataStaysEmpty() {
        ComplicationRendering rendering = ComplicationText.routine(null, NOW);
        assertEquals("--", rendering.shortText);
        assertEquals("ROTINA", rendering.title);
    }

    @Test
    public void routineShowsTheSuggestionAndDuration() {
        ComplicationRendering rendering = ComplicationText.routine(RoutineSnapshot.demo(NOW), NOW);
        assertEquals("25 min", rendering.shortText);
        assertEquals("TREINO LEVE · 25 min", rendering.longText);
    }

    @Test
    public void routineDegradesWhenStale() {
        RoutineSnapshot snapshot = RoutineSnapshot.demo(NOW);
        ComplicationRendering rendering =
                ComplicationText.routine(snapshot, snapshot.validUntilEpochMs + 1L);
        assertEquals("--", rendering.shortText);
        assertEquals("Rotina desatualizada", rendering.longText);
    }

    // --- limites -------------------------------------------------------------------------

    @Test
    public void everyRenderingRespectsTheComplicationLimits() {
        ComplicationRendering[] renderings = {
                ComplicationText.nextStep(WatchContextSnapshot.demo(NOW), NOW),
                ComplicationText.gate(WatchContextSnapshot.demo(NOW), NOW),
                ComplicationText.crewLife(CrewLifeSnapshot.demo(NOW), NOW),
                ComplicationText.routine(RoutineSnapshot.demo(NOW), NOW)
        };
        for (ComplicationRendering rendering : renderings) {
            assertTrue(rendering.shortText, rendering.shortText.length() <= 7);
            assertTrue(rendering.longText, rendering.longText.length() <= 48);
            assertTrue(rendering.description, rendering.description.length() <= 120);
        }
    }

    private interface Mutation {
        void apply(JSONObject json) throws Exception;
    }

    private static WatchContextSnapshot snapshot(Mutation mutation) {
        try {
            JSONObject json = WatchContextSnapshot.demo(NOW).toJson();
            mutation.apply(json);
            return WatchContextSnapshot.fromJson(json);
        } catch (Exception error) {
            throw new IllegalStateException(error);
        }
    }

    // --- valor de anel (RANGED_VALUE) ----------------------------------------------------

    @Test
    public void crewLifeExposesTheRecoveryScoreAsRingValue() {
        CrewLifeSnapshot snapshot = CrewLifeSnapshot.demo(NOW);
        ComplicationRendering rendering = ComplicationText.crewLife(snapshot, NOW);
        assertEquals(Integer.valueOf(snapshot.recoveryScore), rendering.rangedValue);
        assertTrue("faixa do anel é 0–100", snapshot.recoveryScore >= 0 && snapshot.recoveryScore <= 100);
    }

    @Test
    public void staleCrewLifeHasNoRingValue() {
        CrewLifeSnapshot snapshot = CrewLifeSnapshot.demo(NOW);
        long afterValidity = NOW + 7 * 60 * 60 * 1000L;
        assertTrue("fixture precisa estar desatualizada", snapshot.isStale(afterValidity));
        assertNull(ComplicationText.crewLife(snapshot, afterValidity).rangedValue);
    }

    @Test
    public void crewLifeWithoutScoreHasNoRingValue() throws Exception {
        JSONObject withoutScore = new JSONObject()
                .put("schemaVersion", WatchContract.CREWLIFE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 3_600_000L)
                .put("sleepLabel", "6h52");
        // Anel só existe com medida: silêncio não vira zero desenhado no pulso.
        assertNull(ComplicationText.crewLife(CrewLifeSnapshot.fromJson(withoutScore), NOW).rangedValue);
    }

    @Test
    public void crewLifeWithoutCacheHasNoRingValue() {
        assertNull(ComplicationText.crewLife(null, NOW).rangedValue);
    }

    @Test
    public void providersWithoutAMeasurementHaveNoRingValue() {
        assertNull(ComplicationText.nextStep(WatchContextSnapshot.demo(NOW), NOW).rangedValue);
        assertNull(ComplicationText.gate(WatchContextSnapshot.demo(NOW), NOW).rangedValue);
        assertNull(ComplicationText.routine(RoutineSnapshot.demo(NOW), NOW).rangedValue);
    }
}
