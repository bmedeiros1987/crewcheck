package com.crewcheck.app;

/** Token enrollment only. An owner hint/registration ACK never authorizes display. */
public final class NativePushSession {
    public interface Store { State read(); boolean commit(State next); }
    public static final class State {
        public final String installationId, ownerId, token;
        public final long generation, tokenRevision;
        public State(String installationId, String ownerId, String token, long generation, long tokenRevision) {
            this.installationId = installationId; this.ownerId = ownerId; this.token = token;
            this.generation = generation; this.tokenRevision = tokenRevision;
        }
    }
    private final Store store;
    private final boolean enabled;
    public NativePushSession(Store store, boolean enabled) { this.store = store; this.enabled = enabled; }
    public synchronized State read() { return enabled ? store.read() : null; }
    public synchronized boolean scope(String ownerId) {
        if (!enabled || ownerId == null || !ownerId.matches("[A-Za-z0-9_-]{0,160}")) return false;
        State old = store.read();
        if (old == null) return false;
        if (old.ownerId.equals(ownerId)) return true; // Same-account JWT renewal.
        // Tombstone BEFORE any asynchronous work; never persist session credentials.
        return old.generation < Long.MAX_VALUE && store.commit(new State(old.installationId, ownerId, "", old.generation + 1, 0));
    }
    public synchronized boolean token(long expectedGeneration, String value) {
        if (!enabled || value == null || value.length() < 16 || value.length() > 4096 || value.chars().anyMatch(Character::isWhitespace)) return false;
        State old = store.read();
        if (old == null || old.ownerId.isEmpty() || old.generation != expectedGeneration) return false;
        if (old.token.equals(value)) return true;
        return old.tokenRevision < Long.MAX_VALUE && store.commit(new State(old.installationId, old.ownerId, value, old.generation, old.tokenRevision + 1));
    }
    public synchronized boolean current(State captured) {
        State now = read();
        return now != null && captured != null && !now.ownerId.isEmpty() && !now.token.isEmpty()
            && now.installationId.equals(captured.installationId) && now.ownerId.equals(captured.ownerId)
            && now.generation == captured.generation && now.tokenRevision == captured.tokenRevision && now.token.equals(captured.token);
    }
    public synchronized boolean requested(State captured, String value) {
        State now = read();
        if (now == null || captured == null || !now.ownerId.equals(captured.ownerId)
                || !now.installationId.equals(captured.installationId) || now.generation != captured.generation
                || now.tokenRevision != captured.tokenRevision) return false;
        return token(captured.generation, value);
    }
}
