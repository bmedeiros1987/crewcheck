package com.crewcheck.auto;

import org.json.JSONObject;
import org.junit.Test;
import java.net.URI;
import static org.junit.Assert.*;

public class DriveSnapshotTest {
    private static final long NOW = 1_790_300_000_000L;
    private JSONObject fixture() throws Exception {
        return new JSONObject().put("schemaVersion", 1).put("source", "canonical-roster")
                .put("contextId", "test-context").put("generatedAtEpochMs", NOW)
                .put("validUntilEpochMs", NOW + 3_600_000).put("state", "REPORTING")
                .put("presentationPlace", "BSB").put("presentationTime", "08:10").put("currentFlight", "LA0000");
    }
    private DriveSnapshot parse(JSONObject j) throws Exception { return DriveSnapshot.parse(j.toString(), NOW); }
    private void invalid(JSONObject j) throws Exception {
        try { parse(j); fail("Expected rejection"); } catch (IllegalArgumentException expected) { }
    }
    @Test public void reportingOffersAirportWithoutCalculatingApz() throws Exception {
        DriveSnapshot value = parse(fixture());
        assertEquals("08:10", value.presentationTime);
        assertEquals("Aeroporto BSB", value.destinations(NOW).get(0).query);
    }
    @Test public void onlyGroundFlightStatesOfferAirport() throws Exception {
        for (String state : new String[]{"REPORTING", "LEAVE_SOON", "BOARDING"}) {
            assertEquals(1, parse(fixture().put("state", state)).destinations(NOW).size());
        }
    }
    @Test public void noDrivingSuggestionsInAirConnectionOffDutyOrUnknown() throws Exception {
        for (String state : new String[]{"IN_FLIGHT", "CONNECTION", "OFF_DUTY", "UNKNOWN", "CHANGED", "BOGUS"}) {
            assertTrue(parse(fixture().put("state", state)).destinations(NOW).isEmpty());
        }
    }
    @Test public void standbyWithoutFlightNeverBecomesAirportTrip() throws Exception {
        assertTrue(parse(fixture().put("currentFlight", "")).destinations(NOW).isEmpty());
    }
    @Test public void absentAirportCodeIsNotGuessedFromRoute() throws Exception {
        assertTrue(parse(fixture().put("presentationPlace", "").put("currentRoute", "BSB → GRU"))
                .destinations(NOW).isEmpty());
    }
    @Test public void invalidAirportCodeIsNotRouted() throws Exception {
        assertTrue(parse(fixture().put("presentationPlace", "Cidade desconhecida")).destinations(NOW).isEmpty());
    }
    @Test public void overnightUsesCurrentHotelNotFutureStay() throws Exception {
        DriveSnapshot value = parse(fixture().put("state", "OVERNIGHT").put("detail", "Hotel de Teste"));
        assertEquals("Hotel de Teste, BSB", value.destinations(NOW).get(0).query);
        assertTrue(parse(fixture().put("state", "OVERNIGHT").put("overnight", "Hotel futuro"))
                .destinations(NOW).isEmpty());
    }
    @Test public void airportCodeAloneIsNotAHotel() throws Exception {
        assertTrue(parse(fixture().put("state", "OVERNIGHT").put("detail", "BSB")).destinations(NOW).isEmpty());
    }
    @Test public void exactFreshnessBoundaryBlocksNavigation() throws Exception {
        DriveSnapshot value = parse(fixture());
        assertTrue(value.isFresh(NOW + DriveSnapshot.MAX_AGE_MS - 1));
        assertFalse(value.isFresh(NOW + DriveSnapshot.MAX_AGE_MS));
        assertTrue(value.destinations(NOW + DriveSnapshot.MAX_AGE_MS).isEmpty());
    }
    @Test public void upstreamExpiryWins() throws Exception {
        DriveSnapshot value = parse(fixture().put("validUntilEpochMs", NOW + 1000));
        assertFalse(value.isFresh(NOW + 1000));
    }
    @Test public void clockRollbackFailsClosed() throws Exception { assertFalse(parse(fixture()).isFresh(NOW - 1)); }
    @Test public void futureSnapshotRejected() throws Exception { invalid(fixture().put("generatedAtEpochMs", NOW + 120_000)); }
    @Test public void reversedWindowRejected() throws Exception { invalid(fixture().put("validUntilEpochMs", NOW - 1)); }
    @Test public void excessiveWindowRejected() throws Exception { invalid(fixture().put("validUntilEpochMs", NOW + 90_000_000)); }
    @Test public void wrongSchemaRejected() throws Exception { invalid(fixture().put("schemaVersion", 2)); }
    @Test public void stringSchemaRejected() throws Exception { invalid(fixture().put("schemaVersion", "1")); }
    @Test public void fractionalEpochRejected() throws Exception { invalid(fixture().put("generatedAtEpochMs", NOW + 0.5)); }
    @Test public void unknownSourceRejected() throws Exception { invalid(fixture().put("source", "manual-roster")); }
    @Test public void emptyContextRejected() throws Exception { invalid(fixture().put("contextId", "")); }
    @Test public void invalidClockNotDisplayed() throws Exception {
        assertEquals("", parse(fixture().put("presentationTime", "28:77")).presentationTime);
    }
    @Test public void safeProjectionDropsSensitiveAndUnneededFields() throws Exception {
        String safe = parse(fixture().put("token", "SECRET").put("cpf", "PRIVATE")
                .put("hotelRoom", "ROOM").put("detail", "irrelevant").put("schedule", "unneeded")).toSafeJson();
        assertFalse(safe.contains("SECRET")); assertFalse(safe.contains("PRIVATE"));
        assertFalse(safe.contains("ROOM")); assertFalse(safe.contains("unneeded")); assertFalse(safe.contains("irrelevant"));
        assertEquals("08:10", DriveSnapshot.parse(safe, NOW).presentationTime);
    }
    @Test public void malformedAndOversizedInputRejected() throws Exception {
        for (String raw : new String[]{"", "{}", "not json", "x".repeat(DriveSnapshot.MAX_BYTES + 1)}) {
            try { DriveSnapshot.parse(raw, NOW); fail("Expected rejection"); } catch (Exception expected) { }
        }
    }
    @Test public void navigationUriEncodesQueryRatherThanExecutingIt() throws Exception {
        DriveSnapshot.Destination destination = new DriveSnapshot.Destination("id", "Hotel",
                "Hotel & Spa #1, São Paulo?x=y", "Salvo", false);
        URI uri = new URI(destination.geoUri());
        assertEquals("geo", uri.getScheme()); assertNull(uri.getFragment());
        assertTrue(destination.geoUri().contains("%26")); assertTrue(destination.geoUri().contains("%23"));
    }
    @Test public void emptyManualDestinationRejected() {
        try { new DriveSnapshot.Destination("id", " ", "Rua", "", false); fail(); }
        catch (IllegalArgumentException expected) { }
    }
    @Test public void changedDestinationCannotReuseOldNavigationTarget() {
        DriveSnapshot.Destination old = new DriveSnapshot.Destination("id", "Hotel", "Rua A", "", true);
        DriveSnapshot.Destination next = new DriveSnapshot.Destination("id", "Hotel", "Rua B", "", true);
        assertFalse(old.sameTarget(next));
    }
    @Test public void stripsControlAndDirectionFormatting() {
        assertEquals("A B C", DriveSnapshot.clean("A\nB\u202eC", 60));
    }
}
