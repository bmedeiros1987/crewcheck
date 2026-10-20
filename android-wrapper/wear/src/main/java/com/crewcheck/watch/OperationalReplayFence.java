package com.crewcheck.watch;

import java.security.SecureRandom;
import java.util.Set;

/** Operational transport state only. The adapter must durably commit state AND cache
 * in one transaction before exposing any result. This class never authenticates an account. */
final class OperationalReplayFence {
    enum Result { ACCEPTED, DUPLICATE, REJECTED }
    record Binding(String node, String request, String lease, String challenge) {
        Binding {
            if (node == null || node.isBlank() || !hex(request) || !hex(lease) || !hex(challenge))
                throw new IllegalArgumentException("Invalid binding");
        }
    }
    enum RevokeResult { CLEARED, NOT_CURRENT, REJECTED }
    record Revocation(String node,String lease,long revision,String request) {
        Revocation {
            if(node==null || node.isBlank() || !hex(lease) || revision<=0 || !hex(request))
                throw new IllegalArgumentException("Invalid revoke");
        }
    }
    record State(Binding active, Binding pending, long revision, String digest, boolean revoked, Revocation lastRevoke) {
        State {
            if (revision < 0 || (revision > 0 && (active == null || !hex(digest))))
                throw new IllegalArgumentException("Invalid journal");
            if (revision == 0 && !"".equals(digest)) throw new IllegalArgumentException("Invalid digest");
        }
        static State empty() { return new State(null, null, 0, "", true, null); }
    }
    interface Commit {
        /** snapshot is null for admission/clear, exact raw bytes for accepted data.
         * An exception MUST leave both journal and cache unchanged. */
        void persist(State next, String snapshot) throws Exception;
    }
    private State state;
    private final Commit commit;
    private final SecureRandom random;

    OperationalReplayFence(State recovered, Commit commit, SecureRandom random) {
        this.state = recovered;
        this.commit = commit;
        this.random = random;
    }
    synchronized State state() { return state; }
    static boolean hex(String s) { return s != null && s.matches("[0-9a-f]{64}"); }
    static boolean sole(String node, Set<String> connected) {
        return node != null && connected != null && connected.size() == 1 && connected.contains(node);
    }
    private void replace(State next, String snapshot) throws Exception {
        commit.persist(next, snapshot);
        state = next;
    }
    synchronized Binding challenge(String node, String request, String lease, Set<String> connected)
            throws Exception {
        if (!sole(node, connected) || !hex(request) || !hex(lease)) {
            invalidatePending();
            return null;
        }
        Binding pending = state.pending();
        if (pending != null && pending.node().equals(node) && pending.request().equals(request)
                && pending.lease().equals(lease)) return pending;
        // Do not let a consumed request recreate admission authority.
        Binding active = state.active();
        if (active != null && active.lease().equals(lease)) return null;
        byte[] nonce = new byte[32]; random.nextBytes(nonce);
        StringBuilder hex = new StringBuilder(64);
        for (byte b : nonce) hex.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        Binding next = new Binding(node, request, lease, hex.toString());
        // Preserve existing accepted data during challenge issuance.
        // Adapter persist must distinguish an unchanged active/revision from a clear.
        replace(new State(active, next, state.revision(), state.digest(), state.revoked(), state.lastRevoke()), KEEP_CACHE);
        return next;
    }
    static final String KEEP_CACHE = ""; // Never a valid snapshot; adapter-only transaction marker.
    synchronized void connectionChanged(Set<String> connected) throws Exception {
        if (state.pending() != null && !sole(state.pending().node(), connected)) invalidatePending();
    }
    synchronized void invalidatePending() throws Exception {
        if (state.pending() != null)
            replace(new State(state.active(), null, state.revision(), state.digest(), state.revoked(), state.lastRevoke()), KEEP_CACHE);
    }
    synchronized Result admit(Binding incoming, Set<String> connected) throws Exception {
        if (!sole(incoming.node(), connected)) { invalidatePending(); return Result.REJECTED; }
        if (incoming.equals(state.active()) && !state.revoked()) return Result.DUPLICATE;
        if (!incoming.equals(state.pending())) return Result.REJECTED;
        replace(new State(incoming, null, 0, "", false, null), null);
        return Result.ACCEPTED;
    }
    synchronized Result snapshot(String node, String lease, long revision, String digest,
                                 String raw, long generatedAt, long validUntil, long now) throws Exception {
        Binding active = state.active();
        if (state.revoked() || active == null || !active.node().equals(node) || !active.lease().equals(lease)
                || revision <= 0 || !hex(digest) || raw == null || raw.isEmpty()
                || generatedAt <= 0 || generatedAt > now || validUntil < generatedAt || validUntil <= now)
            return Result.REJECTED;
        if (revision < state.revision()) return Result.REJECTED;
        if (revision == state.revision())
            return state.digest().equals(digest) ? Result.DUPLICATE : Result.REJECTED;
        replace(new State(active, state.pending(), revision, digest, false, null), raw);
        return Result.ACCEPTED;
    }
    synchronized RevokeResult revoke(Revocation incoming,String digest) throws Exception {
        Binding active=state.active();
        if(active==null || !active.node().equals(incoming.node()) || !active.lease().equals(incoming.lease())) {
            Binding pending=state.pending();
            if(pending!=null && pending.node().equals(incoming.node()) && pending.lease().equals(incoming.lease()))
                replace(new State(active,null,state.revision(),state.digest(),state.revoked(),state.lastRevoke()),KEEP_CACHE);
            return RevokeResult.NOT_CURRENT;
        }
        if(incoming.equals(state.lastRevoke())) return RevokeResult.CLEARED;
        if(state.revoked() || incoming.revision()<=state.revision() || !hex(digest)) return RevokeResult.REJECTED;
        replace(new State(active,null,incoming.revision(),digest,true,incoming),null);
        return RevokeResult.CLEARED;
    }
    synchronized void clear() throws Exception {
        // Keep consumed admission and high-water even after visible content is removed.
        replace(new State(state.active(), null, state.revision(), state.digest(), true, state.lastRevoke()), null);
    }
}
