package com.crewcheck.watch;
import org.junit.Test;
import static org.junit.Assert.*;
public class StaySummaryTest {
    private static final long NOW = 1800000000000L;
    private WatchContextSnapshot snapshot(String label) throws Exception {
        return WatchContextSnapshot.fromJson(WatchContextSnapshot.demo(NOW).toJson()
                .put("state", "OVERNIGHT").put("contextId", "synthetic-stay")
                .put("presentationPlace", "CWB • escala BRT").put("overnight", "Synthetic Hotel")
                .put("presentationTime", "11:45").put("hotelPickup", label).toString());
    }
    @Test public void formatsOnlyHotelTimeAndKeepsCivilDate() throws Exception {
        var s = snapshot("APZ hotel 22/10 04:20 America/Sao_Paulo");
        assertEquals("Pernoite · CWB · APZ 04:20 · 22/10", s.complicationLongText(NOW));
        assertEquals("America/Sao_Paulo", StaySummary.from(s).zone);
        assertFalse(s.complicationLongText(NOW).contains("Synthetic Hotel"));
        assertFalse(s.complicationLongText(NOW).contains("11:45"));
        assertEquals("04:20", StaySummary.from(snapshot("APZ hotel 22/10 04:20 UTC")).time);
    }
    @Test public void absentInvalidAndLegacyPickupNeverInventHotelApz() throws Exception {
        for (String label : new String[]{"", "APZ hotel não informada", "Pickup 04:20", "APZ hotel 31/02 04:20 UTC", "APZ hotel 22/10 25:20 UTC", "APZ hotel 22/10 04:20 Wrong/Zone"}) {
            assertEquals("—", StaySummary.from(snapshot(label)).time);
        }
    }
    @Test public void targetRejectsChangedRemovedExpiredAndNewGeneration() throws Exception {
        var s = snapshot("APZ hotel 22/10 04:20 UTC");
        var target = new StayDetailsTarget(s.contextId, s.generatedAtEpochMs);
        assertTrue(target.matches(s, NOW));
        assertFalse(target.matches(null, NOW));
        assertFalse(target.matches(s, s.validUntilEpochMs + 1));
        assertFalse(new StayDetailsTarget("other", s.generatedAtEpochMs).matches(s, NOW));
        assertFalse(new StayDetailsTarget(s.contextId, s.generatedAtEpochMs - 1).matches(s, NOW));
        var other = WatchContextSnapshot.fromJson(s.toJson().put("state", "REPORTING").toString());
        assertFalse(target.matches(other, NOW));
    }
}
