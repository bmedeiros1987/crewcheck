package com.crewcheck.watch;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class WatchGateChangeTest {
    private static final long NOW = 1000000L;
    private WatchContextSnapshot sample(String gate, String context, long generated, long until) throws Exception {
        return WatchContextSnapshot.fromJson(new JSONObject()
                .put("schemaVersion", 1).put("contextId", context)
                .put("generatedAtEpochMs", generated).put("validUntilEpochMs", until)
                .put("state", "REPORTING").put("currentFlight", "LA9001")
                .put("currentRoute", "BSB → GRU").put("gate", gate));
    }

    @Test public void firstAndRepeatedSyncAreSilent() throws Exception {
        WatchContextSnapshot s = sample("9", "flight-1", NOW - 1000, NOW + 60000);
        assertEquals("", WatchGateChange.describe(null, s, NOW));
        assertEquals("", WatchGateChange.describe(s, s, NOW));
    }

    @Test public void changeAndReversalAreReportedBeforeBoarding() throws Exception {
        WatchContextSnapshot a = sample("9", "flight-1", NOW - 1000, NOW + 60000);
        WatchContextSnapshot b = sample("12", "flight-1", NOW, NOW + 60000);
        assertEquals("LA9001: 9 → 12", WatchGateChange.describe(a, b, NOW));
        assertEquals("LA9001: 12 → 9", WatchGateChange.describe(b,
                sample("9", "flight-1", NOW + 1, NOW + 60000), NOW + 1));
    }

    @Test public void staleUnknownOtherFlightAndOutOfOrderAreSilent() throws Exception {
        WatchContextSnapshot a = sample("9", "flight-1", NOW - 1000, NOW + 60000);
        assertEquals("", WatchGateChange.describe(a, sample("", "flight-1", NOW, NOW + 60000), NOW));
        assertEquals("", WatchGateChange.describe(a, sample("12", "flight-2", NOW, NOW + 60000), NOW));
        assertEquals("", WatchGateChange.describe(a, sample("12", "flight-1", NOW - 2000, NOW + 60000), NOW));
        assertEquals("", WatchGateChange.describe(sample("9", "flight-1", NOW - 2000, NOW - 1),
                sample("12", "flight-1", NOW, NOW + 60000), NOW));
        assertEquals("", WatchGateChange.describe(a, sample("12", "flight-1", NOW + 1, NOW + 60000), NOW));
    }

    @Test public void remoteStandIsARealChange() throws Exception {
        assertEquals("LA9001: 9 → REMOTA", WatchGateChange.describe(
                sample("9", "flight-1", NOW - 1000, NOW + 60000),
                sample("REMOTA", "flight-1", NOW, NOW + 60000), NOW));
    }
}
