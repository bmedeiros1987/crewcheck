package com.crewcheck.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import org.json.JSONObject;
import org.junit.Test;

import java.util.Set;

/** Sanitização do que sai do celular para o canal de saúde do relógio. */
public final class CrewLifeWatchPublisherTest {
    private static final long NOW = 1_700_000_000_000L;
    private static final Set<String> ALL = WatchHealthConsent.CATEGORIES;

    private static JSONObject crewLife() throws Exception {
        return new JSONObject()
                .put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 6 * 60 * 60 * 1000L)
                .put("recoveryScore", 78)
                .put("recoveryLabel", "boa")
                .put("sleepMinutes", 412)
                .put("sleepLabel", "6h52")
                .put("steps", 6430)
                .put("activeMinutes", 31)
                .put("restingHeartRate", 58)
                .put("hrvMs", 44)
                .put("recommendation", "RECUPERAÇÃO BOA");
    }

    private static JSONObject routine() throws Exception {
        return new JSONObject()
                .put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 18 * 60 * 60 * 1000L)
                .put("title", "TREINO LEVE")
                .put("durationMinutes", 25)
                .put("reason", "Apresentação em 8h")
                .put("nextAction", "Caminhada 25 min")
                .put("priority", "recuperação");
    }

    // --- consentimento granular ----------------------------------------------------------

    @Test
    public void everyGrantedCategoryTravels() throws Exception {
        JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeCrewLife(crewLife().toString(), ALL));
        assertEquals(1, out.getInt("schemaVersion"));
        assertEquals(78, out.getInt("recoveryScore"));
        assertEquals("BOA", out.getString("recoveryLabel"));
        assertEquals(412, out.getInt("sleepMinutes"));
        assertEquals(6430, out.getInt("steps"));
        assertEquals(58, out.getInt("restingHeartRate"));
    }

    @Test
    public void ungrantedCategoriesAreRemovedAndNotZeroed() throws Exception {
        String payload = CrewLifeWatchPublisher.sanitizeCrewLife(
                crewLife().toString(),
                Set.of(WatchHealthConsent.CATEGORY_SLEEP)
        );
        JSONObject out = new JSONObject(payload);
        assertEquals(412, out.getInt("sleepMinutes"));
        assertFalse("recuperação não concedida", out.has("recoveryScore"));
        assertFalse("batimento não concedido", out.has("restingHeartRate"));
        assertFalse("HRV não concedida", out.has("hrvMs"));
        assertFalse("passos não concedidos", out.has("steps"));
    }

    // --- vazamento entre categorias por texto livre -------------------------------------

    @Test
    public void narrativeDoesNotTravelWithPartialHealthConsent() throws Exception {
        JSONObject json = crewLife().put("detail", "Dormiu 4h10 e FC de repouso 78");
        JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeCrewLife(
                json.toString(),
                Set.of(WatchHealthConsent.CATEGORY_RECOVERY)
        ));
        assertEquals(78, out.getInt("recoveryScore"));
        assertFalse("recommendation narra o quadro inteiro", out.has("recommendation"));
        assertFalse("detail entregaria sono e batimento", out.has("detail"));
    }

    @Test
    public void narrativeTravelsOnlyWithCompleteHealthConsent() throws Exception {
        JSONObject json = crewLife().put("detail", "Treino leve");
        JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeCrewLife(json.toString(), ALL));
        assertEquals("RECUPERAÇÃO BOA", out.getString("recommendation"));
        assertEquals("Treino leve", out.getString("detail"));
    }

    @Test
    public void routineNarrativeIsGatedByHealthConsentToo() throws Exception {
        JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeRoutine(
                routine().toString(),
                Set.of(WatchHealthConsent.CATEGORY_ROUTINE)
        ));
        assertEquals("TREINO LEVE", out.getString("title"));
        assertEquals(25, out.getInt("durationMinutes"));
        assertFalse("reason justifica citando saúde", out.has("reason"));
        assertFalse("nextAction idem", out.has("nextAction"));
    }

    @Test
    public void routineNarrativeTravelsWithCompleteHealthConsent() throws Exception {
        JSONObject out = new JSONObject(
                CrewLifeWatchPublisher.sanitizeRoutine(routine().toString(), ALL));
        assertEquals("Apresentação em 8h", out.getString("reason"));
        assertEquals("Caminhada 25 min", out.getString("nextAction"));
    }

    // --- diacríticos ----------------------------------------------------------------------

    @Test
    public void accentedLabelsNormalizeInsteadOfDegrading() throws Exception {
        for (String written : new String[]{"ótima", "ÓTIMA", "Ótima", "OTIMA"}) {
            JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeCrewLife(
                    crewLife().put("recoveryLabel", written).toString(), ALL));
            assertEquals(written, "OTIMA", out.getString("recoveryLabel"));
        }
    }

    @Test
    public void accentedPrioritiesNormalizeInsteadOfDegrading() throws Exception {
        for (String written : new String[]{"recuperação", "RECUPERAÇÃO", "Recuperacao"}) {
            JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeRoutine(
                    routine().put("priority", written).toString(), ALL));
            assertEquals(written, "RECUPERACAO", out.getString("priority"));
        }
    }

    // --- categorias de saúde reais --------------------------------------------------------

    @Test
    public void routineAloneIsNotHealthConsent() {
        assertFalse(
                "rotina é agenda, não medição do corpo",
                WatchHealthConsent.HEALTH_CATEGORIES.contains(WatchHealthConsent.CATEGORY_ROUTINE)
        );
        for (String category : WatchHealthConsent.HEALTH_CATEGORIES) {
            assertTrue(category, WatchHealthConsent.CATEGORIES.contains(category));
        }
    }

    @Test
    public void grantingHeartDoesNotLeakSleepOrSteps() throws Exception {
        JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeCrewLife(
                crewLife().toString(),
                Set.of(WatchHealthConsent.CATEGORY_HEART)
        ));
        assertEquals(58, out.getInt("restingHeartRate"));
        assertEquals(44, out.getInt("hrvMs"));
        assertFalse(out.has("sleepMinutes"));
        assertFalse(out.has("sleepLabel"));
        assertFalse(out.has("steps"));
    }

    @Test
    public void noCategoryLeavesOnlyTheEnvelope() throws Exception {
        JSONObject out = new JSONObject(
                CrewLifeWatchPublisher.sanitizeCrewLife(crewLife().toString(), Set.of()));
        assertEquals(3, out.length());
        assertTrue(out.has("schemaVersion"));
        assertTrue(out.has("generatedAtEpochMs"));
        assertTrue(out.has("validUntilEpochMs"));
    }

    // --- nada bruto atravessa -------------------------------------------------------------

    @Test
    public void rawSeriesIsRefusedBeforeTheDataLayer() throws Exception {
        String[] prohibited = {"heartRateSeries", "sleepStages", "samples", "hrvSeries", "spo2Series"};
        for (String key : prohibited) {
            JSONObject json = crewLife().put(key, "qualquer coisa");
            try {
                CrewLifeWatchPublisher.sanitizeCrewLife(json.toString(), ALL);
                fail("deveria recusar " + key);
            } catch (IllegalArgumentException expected) {
                assertTrue(expected.getMessage().contains(key));
            }
        }
    }

    @Test
    public void locationIsRefused() throws Exception {
        for (String key : new String[]{"latitude", "longitude", "gps", "location", "route"}) {
            try {
                CrewLifeWatchPublisher.sanitizeCrewLife(crewLife().put(key, 1).toString(), ALL);
                fail("deveria recusar " + key);
            } catch (IllegalArgumentException expected) {
                assertTrue(expected.getMessage().contains(key));
            }
        }
    }

    @Test
    public void identityIsRefused() throws Exception {
        for (String key : new String[]{"cpf", "email", "crewName", "crewId", "accessToken"}) {
            try {
                CrewLifeWatchPublisher.sanitizeCrewLife(crewLife().put(key, "x").toString(), ALL);
                fail("deveria recusar " + key);
            } catch (IllegalArgumentException expected) {
                assertTrue(expected.getMessage().contains(key));
            }
        }
    }

    // --- fail-closed ----------------------------------------------------------------------

    @Test
    public void implausibleValuesAreRefusedWithoutSilentClamping() throws Exception {
        try {
            CrewLifeWatchPublisher.sanitizeCrewLife(crewLife().put("restingHeartRate", 400).toString(), ALL);
            fail("deveria recusar batimento implausível");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("restingHeartRate"));
        }

        try {
            CrewLifeWatchPublisher.sanitizeCrewLife(crewLife().put("sleepMinutes", -1).toString(), ALL);
            fail("deveria recusar sono negativo");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("sleepMinutes"));
        }
    }

    @Test
    public void expiryIsMandatory() throws Exception {
        JSONObject json = crewLife();
        json.remove("validUntilEpochMs");
        try {
            CrewLifeWatchPublisher.sanitizeCrewLife(json.toString(), ALL);
            fail("deveria exigir validUntilEpochMs");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("temporal"));
        }
    }

    @Test
    public void expiryBeforeGenerationIsRefused() throws Exception {
        try {
            CrewLifeWatchPublisher.sanitizeCrewLife(
                    crewLife().put("validUntilEpochMs", NOW - 1).toString(), ALL);
            fail("deveria recusar janela invertida");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("temporal"));
        }
    }

    @Test
    public void oversizedPayloadIsRefused() throws Exception {
        StringBuilder padding = new StringBuilder();
        for (int i = 0; i < 5000; i++) padding.append('x');
        try {
            CrewLifeWatchPublisher.sanitizeCrewLife(
                    crewLife().put("detail", padding.toString()).toString(), ALL);
            fail("deveria recusar payload acima de 4 KiB");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("4 KiB"));
        }
    }

    @Test
    public void unknownRecoveryLabelDegradesInsteadOfTravelling() throws Exception {
        JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeCrewLife(
                crewLife().put("recoveryLabel", "EXCELENTÍSSIMA").toString(), ALL));
        assertEquals("DESCONHECIDA", out.getString("recoveryLabel"));
    }

    // --- rotina ---------------------------------------------------------------------------

    @Test
    public void routineNormalizesPriority() throws Exception {
        JSONObject out = new JSONObject(CrewLifeWatchPublisher.sanitizeRoutine(routine().toString(), ALL));
        assertEquals("RECUPERACAO", out.getString("priority"));
        assertEquals("TREINO LEVE", out.getString("title"));
        assertEquals(25, out.getInt("durationMinutes"));
    }

    @Test
    public void routineWithUnknownPriorityDegrades() throws Exception {
        JSONObject out = new JSONObject(
                CrewLifeWatchPublisher.sanitizeRoutine(routine().put("priority", "HIIT").toString(), ALL));
        assertEquals("DESCONHECIDA", out.getString("priority"));
    }

    @Test
    public void routineRefusesImplausibleDuration() throws Exception {
        try {
            CrewLifeWatchPublisher.sanitizeRoutine(routine().put("durationMinutes", 5000).toString(), ALL);
            fail("deveria recusar duração implausível");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("durationMinutes"));
        }
    }

    @Test
    public void routineRefusesIdentity() throws Exception {
        try {
            CrewLifeWatchPublisher.sanitizeRoutine(routine().put("crewId", "123").toString(), ALL);
            fail("deveria recusar identidade");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("crewId"));
        }
    }
}
