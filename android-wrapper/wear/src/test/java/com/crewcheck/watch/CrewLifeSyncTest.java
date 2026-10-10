package com.crewcheck.watch;

import org.json.JSONObject;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** Sincronização por canal: escala e CrewLife nunca confirmam um ao outro. */
public final class CrewLifeSyncTest {
    private static final long NOW = 1_800_000_000_000L;
    private static final long HOUR = 60 * 60 * 1000L;

    @Test
    public void freshRosterWithoutCrewLifeIsNotCrewLifeSuccess() throws Exception {
        List<DataItemTriage.Item> first = items(roster(NOW - HOUR, NOW + HOUR, 100L));
        List<DataItemTriage.Item> later = items(roster(NOW, NOW + HOUR, 200L));

        DataItemTriage.Decision rosterBase = DataItemTriage.baseline(DataItemTriage.Channel.ROSTER, first, NOW);
        DataItemTriage.Decision lifeBase = DataItemTriage.baseline(DataItemTriage.Channel.CREWLIFE, first, NOW);
        DataItemTriage.Decision rosterNew = DataItemTriage.followUp(
                DataItemTriage.Channel.ROSTER, later, rosterBase.sentAtEpochMs, NOW);
        DataItemTriage.Decision lifeNew = DataItemTriage.followUp(
                DataItemTriage.Channel.CREWLIFE, later, lifeBase.sentAtEpochMs, NOW);

        assertEquals(DataItemTriage.Outcome.FRESH, rosterNew.outcome);
        assertEquals(DataItemTriage.Outcome.ABSENT, lifeBase.outcome);
        assertEquals(DataItemTriage.Outcome.UNCHANGED, lifeNew.outcome);

        SyncReport report = new SyncReport(SyncReport.Phone.CONNECTED, rosterNew, lifeBase);
        assertEquals("Sincronizado agora", report.operationalStatus());
        assertFalse(report.crewLifeConfirmed());
        assertFalse(report.crewLifeStatus().contains("atualizado agora"));
    }

    @Test
    public void staleCrewLifeIsStaleNotConsentDenied() throws Exception {
        List<DataItemTriage.Item> list = items(crewLife(NOW - 30 * HOUR, NOW - 6 * HOUR, 100L));
        DataItemTriage.Decision life = DataItemTriage.baseline(DataItemTriage.Channel.CREWLIFE, list, NOW);

        assertEquals(DataItemTriage.Outcome.RESTORED, life.outcome);
        assertTrue(life.stale);

        SyncReport report = new SyncReport(SyncReport.Phone.CONNECTED, absent(DataItemTriage.Channel.ROSTER), life);
        String status = report.crewLifeStatus().toLowerCase(Locale.ROOT);
        assertFalse(report.crewLifeConfirmed());
        assertTrue(status.contains("desatualizado"));
        assertFalse(status.contains("autoriz"));
        assertFalse(status.contains("negad"));
    }

    @Test
    public void existingHealthItemIsRestoredWithOriginalTimestamps() throws Exception {
        long generated = NOW - 2 * HOUR;
        long validUntil = NOW + 4 * HOUR;
        List<DataItemTriage.Item> list = items(
                crewLife(generated, validUntil, 100L),
                routine(generated, NOW + 10 * HOUR, 90L));

        DataItemTriage.Decision life = DataItemTriage.baseline(DataItemTriage.Channel.CREWLIFE, list, NOW);
        DataItemTriage.Decision routine = DataItemTriage.baseline(DataItemTriage.Channel.ROUTINE, list, NOW);

        assertEquals(DataItemTriage.Outcome.RESTORED, life.outcome);
        assertEquals(DataItemTriage.Outcome.RESTORED, routine.outcome);
        CrewLifeSnapshot restored = CrewLifeSnapshot.fromJson(life.payload);
        assertEquals("refresh não renova frescor", generated, restored.generatedAtEpochMs);
        assertEquals(validUntil, restored.validUntilEpochMs);
        assertFalse(life.stale);
    }

    @Test
    public void onlyANewerHealthItemCountsAsFresh() throws Exception {
        List<DataItemTriage.Item> first = items(crewLife(NOW - HOUR, NOW + HOUR, 100L));
        List<DataItemTriage.Item> same = items(crewLife(NOW - HOUR, NOW + HOUR, 100L));
        List<DataItemTriage.Item> newer = items(crewLife(NOW, NOW + 6 * HOUR, 300L));

        long base = DataItemTriage.baseline(DataItemTriage.Channel.CREWLIFE, first, NOW).sentAtEpochMs;
        assertEquals(DataItemTriage.Outcome.UNCHANGED,
                DataItemTriage.followUp(DataItemTriage.Channel.CREWLIFE, same, base, NOW).outcome);

        DataItemTriage.Decision fresh = DataItemTriage.followUp(DataItemTriage.Channel.CREWLIFE, newer, base, NOW);
        assertEquals(DataItemTriage.Outcome.FRESH, fresh.outcome);
        SyncReport report = new SyncReport(SyncReport.Phone.CONNECTED, absent(DataItemTriage.Channel.ROSTER), fresh);
        assertTrue(report.crewLifeConfirmed());
        assertEquals("CrewLife atualizado agora", report.crewLifeStatus());
    }

    @Test
    public void newButAlreadyExpiredHealthItemIsNotConfirmed() throws Exception {
        List<DataItemTriage.Item> newer = items(crewLife(NOW - 30 * HOUR, NOW - HOUR, 300L));
        DataItemTriage.Decision fresh = DataItemTriage.followUp(DataItemTriage.Channel.CREWLIFE, newer, 100L, NOW);

        assertEquals(DataItemTriage.Outcome.FRESH, fresh.outcome);
        assertTrue(fresh.stale);
        assertFalse(new SyncReport(SyncReport.Phone.CONNECTED, null, fresh).crewLifeConfirmed());
    }

    @Test
    public void offlineTransportNeverConfirmsDelivery() throws Exception {
        DataItemTriage.Decision restored = DataItemTriage.baseline(
                DataItemTriage.Channel.CREWLIFE, items(crewLife(NOW - HOUR, NOW + HOUR, 100L)), NOW);

        SyncReport offline = new SyncReport(SyncReport.Phone.NOT_CONNECTED, null, restored);
        assertFalse(offline.crewLifeConfirmed());
        assertTrue(offline.crewLifeStatus().contains("fora de alcance"));

        SyncReport nothing = new SyncReport(SyncReport.Phone.NOT_CONNECTED, null, absent(DataItemTriage.Channel.CREWLIFE));
        assertFalse(nothing.crewLifeConfirmed());
        assertEquals("Celular não conectado", nothing.operationalStatus());
    }

    @Test
    public void revokedHealthIsAbsentAndNeverTakenFromRoster() throws Exception {
        // Revogação apaga o DataItem de saúde no celular; a escala continua lá.
        List<DataItemTriage.Item> list = items(roster(NOW - HOUR, NOW + HOUR, 100L));

        DataItemTriage.Decision life = DataItemTriage.baseline(DataItemTriage.Channel.CREWLIFE, list, NOW);
        DataItemTriage.Decision routine = DataItemTriage.baseline(DataItemTriage.Channel.ROUTINE, list, NOW);
        DataItemTriage.Decision roster = DataItemTriage.baseline(DataItemTriage.Channel.ROSTER, list, NOW);

        assertEquals(DataItemTriage.Outcome.ABSENT, life.outcome);
        assertEquals(DataItemTriage.Outcome.ABSENT, routine.outcome);
        assertNull(life.payload);
        assertEquals("escala não é afetada pela ausência de saúde",
                DataItemTriage.Outcome.RESTORED, roster.outcome);
    }

    @Test
    public void invalidHealthPayloadIsRejectedWithoutTouchingOtherChannels() throws Exception {
        List<DataItemTriage.Item> list = items(
                roster(NOW - HOUR, NOW + HOUR, 100L),
                new DataItemTriage.Item(WatchContract.CREWLIFE_PATH, "{\"schemaVersion\":99}", 100L));

        DataItemTriage.Decision life = DataItemTriage.baseline(DataItemTriage.Channel.CREWLIFE, list, NOW);
        DataItemTriage.Decision roster = DataItemTriage.baseline(DataItemTriage.Channel.ROSTER, list, NOW);

        assertEquals(DataItemTriage.Outcome.INVALID, life.outcome);
        assertNull(life.payload);
        assertEquals(DataItemTriage.Outcome.RESTORED, roster.outcome);
        assertTrue(new SyncReport(SyncReport.Phone.CONNECTED, roster, life)
                .crewLifeStatus().contains("inválido"));
    }

    private static DataItemTriage.Decision absent(DataItemTriage.Channel channel) {
        return DataItemTriage.baseline(channel, new ArrayList<>(), NOW);
    }

    private static List<DataItemTriage.Item> items(DataItemTriage.Item... items) {
        return new ArrayList<>(Arrays.asList(items));
    }

    private static DataItemTriage.Item roster(long generated, long validUntil, long sentAt) throws Exception {
        String json = new JSONObject()
                .put("schemaVersion", WatchContract.SCHEMA_VERSION)
                .put("generatedAtEpochMs", generated)
                .put("validUntilEpochMs", validUntil)
                .put("state", "REPORTING")
                .put("headline", "APRESENTAÇÃO")
                .toString();
        return new DataItemTriage.Item(WatchContract.SNAPSHOT_PATH, json, sentAt);
    }

    private static DataItemTriage.Item crewLife(long generated, long validUntil, long sentAt) throws Exception {
        String json = new JSONObject()
                .put("schemaVersion", WatchContract.CREWLIFE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", generated)
                .put("validUntilEpochMs", validUntil)
                .put("recoveryScore", 78)
                .put("recoveryLabel", "BOA")
                .toString();
        return new DataItemTriage.Item(WatchContract.CREWLIFE_PATH, json, sentAt);
    }

    private static DataItemTriage.Item routine(long generated, long validUntil, long sentAt) throws Exception {
        String json = new JSONObject()
                .put("schemaVersion", WatchContract.ROUTINE_SCHEMA_VERSION)
                .put("generatedAtEpochMs", generated)
                .put("validUntilEpochMs", validUntil)
                .put("title", "Alongamento")
                .put("durationMinutes", 10)
                .toString();
        return new DataItemTriage.Item(WatchContract.ROUTINE_PATH, json, sentAt);
    }
}
