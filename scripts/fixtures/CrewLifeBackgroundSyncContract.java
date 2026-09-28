package com.crewcheck.app;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/** Deterministic synthetic inputs, unrelated to any installed device or personal record. */
public final class CrewLifeBackgroundSyncContract {
    static int passed;
    static final long NOW = 1_790_000_000_000L;
    static final class Fake implements CrewLifeBackgroundSync.Port {
        String grant = "grant-1";
        String grantAfterRead;
        Set<String> allowed = Set.of("recovery", "sleep", "activity");
        long now = NOW;
        Map<String, Object> input = new LinkedHashMap<>(Map.of(
            "automatic", true, "generatedAtEpochMs", NOW - 60_000L,
            "energyScore", 80, "sleepMinutes", 480, "steps", 1234, "activeMinutes", 30));
        Map<String, Object> output;
        int reads;
        RuntimeException failure;
        @Override public String authorization() { return grant; }
        @Override public Set<String> categories() { return allowed; }
        @Override public long nowEpochMs() { return now; }
        @Override public Map<String, ?> readSummary() {
            reads++;
            if (failure != null) throw failure;
            if (grantAfterRead != null) grant = grantAfterRead;
            return input;
        }
        @Override public void submit(Map<String, Object> value) { output = value; }
    }
    static void expect(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        passed++;
    }
    static CrewLifeBackgroundSync.Outcome run(Fake f) { return CrewLifeBackgroundSync.run(f); }
    public static void main(String[] args) {
        Fake f = new Fake();
        expect(run(f) == CrewLifeBackgroundSync.Outcome.SUBMITTED, "No Activity needed for submission");
        expect(f.output.get("steps").equals(1234), "Source steps preserved");
        expect(f.output.get("generatedAtEpochMs").equals(NOW - 60_000L), "Do not redate source");
        expect(f.output.get("validUntilEpochMs").equals(NOW - 60_000L + CrewLifeBackgroundSync.MAX_AGE_MS), "Original TTL");
        expect(f.output.get("scoreKind").equals("ENERGY"), "Energy is not an invented recovery score");
        f = new Fake(); f.grant = "";
        expect(run(f) == CrewLifeBackgroundSync.Outcome.CONSENT_REQUIRED && f.reads == 0, "No consent: no read");
        f = new Fake(); f.allowed = Set.of("routine");
        expect(run(f) == CrewLifeBackgroundSync.Outcome.CONSENT_REQUIRED && f.reads == 0, "Routine cannot authorize health");
        f = new Fake(); f.grantAfterRead = "";
        expect(run(f) == CrewLifeBackgroundSync.Outcome.CONSENT_REQUIRED && f.output == null, "Revocation during read");
        f = new Fake(); f.grantAfterRead = "grant-2";
        expect(run(f) == CrewLifeBackgroundSync.Outcome.CONSENT_REQUIRED && f.output == null, "Regrant invalidates old read");
        f = new Fake(); f.allowed = Set.of("activity");
        expect(run(f) == CrewLifeBackgroundSync.Outcome.SUBMITTED && !f.output.containsKey("sleepMinutes")
            && !f.output.containsKey("recoveryScore"), "Categories filtered independently");
        f = new Fake(); f.input.put("steps", 0); f.input.remove("sleepMinutes");
        expect(run(f) == CrewLifeBackgroundSync.Outcome.SUBMITTED && f.output.get("steps").equals(0)
            && !f.output.containsKey("sleepMinutes"), "Absent differs from zero");
        f = new Fake(); f.input.put("heartRateSeries", java.util.List.of(70, 71)); f.input.put("email", "synthetic@example.invalid");
        expect(run(f) == CrewLifeBackgroundSync.Outcome.SUBMITTED && !f.output.containsKey("heartRateSeries")
            && !f.output.containsKey("email"), "Allowlist excludes raw series and identity");
        f = new Fake(); f.input.put("generatedAtEpochMs", NOW - CrewLifeBackgroundSync.MAX_AGE_MS);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.STALE && f.output == null, "Expired at boundary rejected");
        f = new Fake(); f.input.put("generatedAtEpochMs", NOW + 1);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.INVALID && f.output == null, "Future date rejected");
        f = new Fake(); f.input.put("validUntilEpochMs", NOW + 2_000L);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.SUBMITTED && f.output.get("validUntilEpochMs").equals(NOW + 2_000L), "Short TTL preserved");
        f = new Fake(); f.input.put("validUntilEpochMs", NOW + 100_000_000L);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.SUBMITTED
            && f.output.get("validUntilEpochMs").equals(NOW - 60_000L + CrewLifeBackgroundSync.MAX_AGE_MS), "TTL not extended");
        f = new Fake(); f.input.put("steps", 1.5d);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.INVALID, "Fraction rejected");
        f = new Fake(); f.input.put("steps", "17");
        expect(run(f) == CrewLifeBackgroundSync.Outcome.INVALID, "String coercion rejected");
        f = new Fake(); f.input.put("energyScore", 101);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.INVALID, "Out of range rejected");
        f = new Fake(); f.input.put("steps", Double.NaN);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.INVALID, "NaN rejected");
        f = new Fake(); f.input.put("automatic", false);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.INVALID, "No synthetic automatic status");
        f = new Fake(); f.input.clear();
        expect(run(f) == CrewLifeBackgroundSync.Outcome.NO_SUMMARY, "Empty summary is not zero");
        f = new Fake(); f.failure = new SecurityException();
        expect(run(f) == CrewLifeBackgroundSync.Outcome.PROVIDER_BLOCKED && f.output == null, "Provider denial not bypassed");
        f = new Fake(); f.input.put("activityMinutes", f.input.remove("activeMinutes"));
        expect(run(f) == CrewLifeBackgroundSync.Outcome.SUBMITTED && f.output.get("activeMinutes").equals(30), "Activity alias normalized");
        f = new Fake(); f.input.put("activityMinutes", 12);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.INVALID, "Conflicting aliases rejected");
        f = new Fake(); f.input.put("generatedAtEpochMs", Long.MAX_VALUE);
        expect(run(f) == CrewLifeBackgroundSync.Outcome.INVALID, "Unsafe integer/overflow rejected");
        System.out.println("Background engine: " + passed + " assertions PASS; submission is not device ACK");
    }
}
