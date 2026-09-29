package com.crewcheck.watch;

/** Compares received values only; never infers a gate or flight identity. */
final class WatchGateChange {
    private WatchGateChange() {}

    static String describe(WatchContextSnapshot previous, WatchContextSnapshot next, long now) {
        if (previous == null || next == null || previous.isStale(now) || next.isStale(now)
                || previous.generatedAtEpochMs > now || next.generatedAtEpochMs > now
                || next.generatedAtEpochMs < previous.generatedAtEpochMs
                || next.contextId.isBlank() || !next.contextId.equals(previous.contextId)
                || next.currentFlight.isBlank() || !next.currentFlight.equals(previous.currentFlight)
                || !next.currentRoute.equals(previous.currentRoute)) return "";
        String before = gate(previous), after = gate(next);
        if (before.isBlank() || after.isBlank() || before.equals(after)) return "";
        return next.currentFlight + ": " + before + " → " + after;
    }

    private static String gate(WatchContextSnapshot s) {
        if (s.remoteStand) return "REMOTA";
        String value = s.gate.trim();
        return value.equals("--") || value.equals("—") || value.equalsIgnoreCase("A confirmar")
                ? "" : value;
    }
}
