package com.crewcheck.watch;

/** Navigation fence only; never grants snapshot admission or transport authority. */
final class StayDetailsTarget {
    final String contextId;
    final long generatedAt;
    StayDetailsTarget(String contextId, long generatedAt) {
        this.contextId = contextId == null ? "" : contextId;
        this.generatedAt = generatedAt;
    }
    boolean matches(WatchContextSnapshot snapshot, long now) {
        return snapshot != null && !snapshot.isStale(now) && "OVERNIGHT".equals(snapshot.state)
                && !contextId.isBlank() && generatedAt > 0
                && contextId.equals(snapshot.contextId) && generatedAt == snapshot.generatedAtEpochMs;
    }
}
