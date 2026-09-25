package com.crewcheck.auto;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

/** A data refresh must not invalidate an unchanged selection, but changes must. */
public final class DriveDestinationContinuityTest {
    private static final long NOW = 1_790_300_000_000L;
    private JSONObject fixture() throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("source", "canonical-roster")
                .put("contextId", "journey-test").put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 3_600_000).put("state", "REPORTING")
                .put("presentationPlace", "BSB").put("presentationTime", "08:10")
                .put("currentFlight", "LA0000");
    }
    private DriveSnapshot.Destination target(JSONObject json, long now) throws Exception {
        return DriveSnapshot.parse(json.toString(), now).destinations(now).get(0);
    }
    @Test public void timestampOnlyRefreshPreservesSelectedDestination() throws Exception {
        DriveSnapshot.Destination selected = target(fixture(), NOW);
        DriveSnapshot.Destination fresh = target(fixture().put("generatedAtEpochMs", NOW + 30_000), NOW + 30_000);
        assertTrue(selected.sameTarget(fresh));
    }
    @Test public void changedPresentationInvalidatesOldSelection() throws Exception {
        assertFalse(target(fixture(), NOW).sameTarget(target(fixture().put("presentationTime", "08:40"), NOW)));
    }
    @Test public void changedJourneyInvalidatesSameAirportSelection() throws Exception {
        assertFalse(target(fixture(), NOW).sameTarget(target(fixture().put("contextId", "another-journey"), NOW)));
    }
    @Test public void changedHotelInvalidatesOldSelection() throws Exception {
        DriveSnapshot.Destination first = target(fixture().put("state", "OVERNIGHT").put("detail", "Hotel A"), NOW);
        DriveSnapshot.Destination next = target(fixture().put("state", "OVERNIGHT").put("detail", "Hotel B"), NOW);
        assertFalse(first.sameTarget(next));
    }
}
